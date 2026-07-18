import { getStorage } from 'firebase-admin/storage'
import { PDFDocument } from 'pdf-lib'

import { donorStorageKey } from './donorPages.js'
import { readDonorProfileImageInput, type DonorProfileImageInput } from './donorProfileImages.js'

const DONOR_DETAIL_PAGE_COUNT = 3
const MAX_DONORS_PER_REQUEST = 249
const MAX_METADATA_BYTES = 512 * 1024
const MAX_SOURCE_PDF_BYTES = 20 * 1024 * 1024
const MAX_GENERATED_PDF_BYTES = 10 * 1024 * 1024
const UPLOAD_CONCURRENCY = 8

export interface DonorPdfSource {
  sourceIndex: number
  sourceDonorNumber: string
  donorNumber: string
  profileImageInput?: DonorProfileImageInput
}

export interface DonorPdfGenerationRequest {
  summaryEndPage: number
  sources: DonorPdfSource[]
  sourcePdf: Buffer
}

export interface DonorPdfGenerationResult {
  uploadedDonorCount: number
  uploadedPdfCount: number
  sourcePdfBytes: number
  generatedPdfBytes: number
}

export class InvalidDonorPdfRequestError extends Error {}

function readMetadata(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new InvalidDonorPdfRequestError('Invalid PDF generation metadata.')
  }
  const metadata = value as Record<string, unknown>
  if (!Number.isSafeInteger(metadata.summaryEndPage) || (metadata.summaryEndPage as number) < 1) {
    throw new InvalidDonorPdfRequestError('Invalid summary end page.')
  }
  if (!Array.isArray(metadata.sources) || metadata.sources.length === 0 || metadata.sources.length > MAX_DONORS_PER_REQUEST) {
    throw new InvalidDonorPdfRequestError('Invalid donor source count.')
  }

  const storageKeys = new Set<string>()
  const sources = metadata.sources.map((value) => {
    if (!value || typeof value !== 'object') {
      throw new InvalidDonorPdfRequestError('Invalid donor source.')
    }
    const source = value as Record<string, unknown>
    const donorNumber = typeof source.donorNumber === 'string' ? source.donorNumber.trim() : ''
    const sourceDonorNumber = typeof source.sourceDonorNumber === 'string' ? source.sourceDonorNumber.trim() : ''
    if (!Number.isSafeInteger(source.sourceIndex) || (source.sourceIndex as number) < 0) {
      throw new InvalidDonorPdfRequestError('Invalid donor source index.')
    }
    if (!donorNumber || donorNumber.length > 100 || !sourceDonorNumber || sourceDonorNumber.length > 100) {
      throw new InvalidDonorPdfRequestError('Invalid donor number.')
    }
    const storageKey = donorStorageKey(donorNumber)
    if (storageKeys.has(storageKey)) {
      throw new InvalidDonorPdfRequestError('Duplicate donor target.')
    }
    storageKeys.add(storageKey)
    let profileImageInput: DonorProfileImageInput | undefined
    if (source.profileImageInput !== undefined) {
      try {
        profileImageInput = readDonorProfileImageInput(source.profileImageInput)
      } catch {
        throw new InvalidDonorPdfRequestError('Invalid donor profile input.')
      }
    }
    return {
      sourceIndex: source.sourceIndex as number,
      sourceDonorNumber,
      donorNumber,
      ...(profileImageInput ? { profileImageInput } : {}),
    }
  })

  return { summaryEndPage: metadata.summaryEndPage as number, sources }
}

export function readDonorPdfGenerationRequest(rawBody: Buffer): DonorPdfGenerationRequest {
  if (rawBody.byteLength < 5) throw new InvalidDonorPdfRequestError('Missing request payload.')
  const metadataLength = rawBody.readUInt32BE(0)
  if (metadataLength === 0 || metadataLength > MAX_METADATA_BYTES || rawBody.byteLength <= 4 + metadataLength) {
    throw new InvalidDonorPdfRequestError('Invalid metadata length.')
  }

  let parsedMetadata: unknown
  try {
    parsedMetadata = JSON.parse(rawBody.subarray(4, 4 + metadataLength).toString('utf8'))
  } catch {
    throw new InvalidDonorPdfRequestError('Invalid metadata JSON.')
  }
  const metadata = readMetadata(parsedMetadata)
  const sourcePdf = rawBody.subarray(4 + metadataLength)
  if (sourcePdf.byteLength === 0 || sourcePdf.byteLength > MAX_SOURCE_PDF_BYTES) {
    throw new InvalidDonorPdfRequestError('Invalid source PDF size.')
  }
  if (sourcePdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new InvalidDonorPdfRequestError('The supplied document is not a PDF.')
  }

  return { ...metadata, sourcePdf }
}

function detailPageIndexes(summaryEndPage: number, sourceIndex: number, totalPages: number) {
  const firstPageIndex = summaryEndPage + sourceIndex * DONOR_DETAIL_PAGE_COUNT
  const indexes = Array.from({ length: DONOR_DETAIL_PAGE_COUNT }, (_, index) => firstPageIndex + index)
  if (indexes.some((pageIndex) => pageIndex >= totalPages)) {
    throw new InvalidDonorPdfRequestError('A donor detail page group is incomplete.')
  }
  return indexes
}

type SavePdf = (objectName: string, bytes: Buffer) => Promise<unknown>

export async function generateAndStoreDonorPdfs(
  request: DonorPdfGenerationRequest,
  savePdf: SavePdf = (objectName, bytes) => getStorage().bucket().file(objectName).save(bytes, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: { cacheControl: 'private,max-age=3600' },
  }),
): Promise<DonorPdfGenerationResult> {
  let source: PDFDocument
  try {
    source = await PDFDocument.load(request.sourcePdf)
  } catch {
    throw new InvalidDonorPdfRequestError('The supplied PDF could not be opened.')
  }
  request.sources.forEach((donor) => {
    detailPageIndexes(request.summaryEndPage, donor.sourceIndex, source.getPageCount())
  })

  let generatedPdfBytes = 0
  let uploadedPdfCount = 0
  for (let offset = 0; offset < request.sources.length; offset += UPLOAD_CONCURRENCY) {
    const donors = request.sources.slice(offset, offset + UPLOAD_CONCURRENCY)
    const generated = [] as Array<{ objectName: string; bytes: Buffer }>
    for (const donor of donors) {
      const pageIndexes = detailPageIndexes(request.summaryEndPage, donor.sourceIndex, source.getPageCount())
      const output = await PDFDocument.create()
      const pages = await output.copyPages(source, pageIndexes)
      pages.forEach((page) => output.addPage(page))
      const bytes = Buffer.from(await output.save({ useObjectStreams: true }))
      if (bytes.byteLength > MAX_GENERATED_PDF_BYTES) {
        throw new InvalidDonorPdfRequestError('A generated donor PDF exceeds the size limit.')
      }
      generated.push({
        objectName: `donor-pages/${donorStorageKey(donor.donorNumber)}/details.pdf`,
        bytes,
      })
    }

    await Promise.all(generated.map(({ objectName, bytes }) => savePdf(objectName, bytes)))
    uploadedPdfCount += generated.length
    generatedPdfBytes += generated.reduce((total, item) => total + item.bytes.byteLength, 0)
  }

  return {
    uploadedDonorCount: uploadedPdfCount,
    uploadedPdfCount,
    sourcePdfBytes: request.sourcePdf.byteLength,
    generatedPdfBytes,
  }
}
