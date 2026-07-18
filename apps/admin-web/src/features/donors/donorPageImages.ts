import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocument as PdfLibDocument } from 'pdf-lib'

import { firebaseApp } from '../../lib/firebase'
import { donorNumberClaimId } from './donor'

export const DONOR_DETAIL_PAGE_COUNT = 3

export interface DonorPageSource {
  sourceIndex: number
  sourceDonorNumber: string
  donorNumber: string
}

export interface DonorPageUploadProgress {
  completedDonors: number
  totalDonors: number
  currentDonorNumber: string
}

export interface DonorPageUploadResult {
  uploadedDonorCount: number
  uploadedPdfCount: number
}

export interface StoreDonorPageOptions {
  onProgress?: (progress: DonorPageUploadProgress) => void
}

export type StoreDonorDetailPdfs = (
  file: File,
  summaryEndPage: number,
  sources: DonorPageSource[],
  options?: StoreDonorPageOptions,
) => Promise<DonorPageUploadResult>

export interface DonorPageRepository {
  getPdfUrl(donorNumber: string): Promise<string>
}

export function donorDetailPdfStoragePath(donorNumber: string) {
  return `donor-pages/${donorNumberClaimId(donorNumber)}/details.pdf`
}

export function detailPageNumbers(summaryEndPage: number, sourceIndex: number, totalPages: number) {
  const firstPage = summaryEndPage + 1 + sourceIndex * DONOR_DETAIL_PAGE_COUNT
  const pages = Array.from({ length: DONOR_DETAIL_PAGE_COUNT }, (_, index) => firstPage + index)
  if (sourceIndex < 0 || pages.some((pageNumber) => pageNumber > totalPages)) {
    throw new Error('לא נמצאו שלושת עמודי המידע עבור אחד התורמים.')
  }
  return pages
}

function comparableText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('he').replace(/[^\p{L}\p{N}]/gu, '')
}

export function pageMatchesDonor(pageText: string, donorNumber: string) {
  const normalizedNumber = donorNumber.replace(/\*{3}\s*$/, '')
  const catalogId = normalizedNumber.match(/(?:1[2-9]\d{2}|5\d{3})(?!\d)/)?.[0]
  const expected = catalogId ?? comparableText(normalizedNumber)
  return expected.length > 0 && comparableText(pageText).includes(expected)
}

export async function createDonorDetailPdf(source: PdfLibDocument, pageNumbers: number[]) {
  const { PDFDocument } = await import('pdf-lib')
  const detailPdf = await PDFDocument.create()
  const copiedPages = await detailPdf.copyPages(source, pageNumbers.map((pageNumber) => pageNumber - 1))
  copiedPages.forEach((page) => detailPdf.addPage(page))
  return detailPdf.save({ useObjectStreams: true })
}

export const storeDonorDetailPdfs: StoreDonorDetailPdfs = async (
  file,
  summaryEndPage,
  sources,
  options = {},
) => {
  if (sources.length === 0) return { uploadedDonorCount: 0, uploadedPdfCount: 0 }

  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  const { PDFDocument } = await import('pdf-lib')
  const { getStorage, ref, uploadBytes } = await import('firebase/storage')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const sourceBytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({ data: sourceBytes.slice() })
  const document = await loadingTask.promise
  const sourcePdf = await PDFDocument.load(sourceBytes)
  const storage = getStorage(firebaseApp)

  try {
    for (let donorIndex = 0; donorIndex < sources.length; donorIndex += 1) {
      const source = sources[donorIndex]!
      const pageNumbers = detailPageNumbers(summaryEndPage, source.sourceIndex, document.numPages)
      const pages = await Promise.all(pageNumbers.map((pageNumber) => document.getPage(pageNumber)))

      const pageTexts = await Promise.all(pages.map(async (page) => {
        const content = await page.getTextContent()
        return content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
      }))
      if (pageTexts.some((text) => !pageMatchesDonor(text, source.sourceDonorNumber))) {
        throw new Error(`לא ניתן היה להתאים בבטחה את שלושת העמודים לתורם ${source.donorNumber}.`)
      }

      const detailPdf = await createDonorDetailPdf(sourcePdf, pageNumbers)
      const uploadBytesBuffer = new Uint8Array(detailPdf.byteLength)
      uploadBytesBuffer.set(detailPdf)
      await uploadBytes(
        ref(storage, donorDetailPdfStoragePath(source.donorNumber)),
        new Blob([uploadBytesBuffer.buffer], { type: 'application/pdf' }),
        { contentType: 'application/pdf', cacheControl: 'private,max-age=3600' },
      )
      options.onProgress?.({
        completedDonors: donorIndex + 1,
        totalDonors: sources.length,
        currentDonorNumber: source.donorNumber,
      })
    }

    return {
      uploadedDonorCount: sources.length,
      uploadedPdfCount: sources.length,
    }
  } finally {
    await loadingTask.destroy()
  }
}

export const storageDonorPageRepository: DonorPageRepository = {
  async getPdfUrl(donorNumber) {
    const { getBlob, getStorage, ref } = await import('firebase/storage')
    const storage = getStorage(firebaseApp)
    const blob = await getBlob(ref(storage, donorDetailPdfStoragePath(donorNumber)))
    return URL.createObjectURL(blob)
  },
}
