import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { auth, firebaseApp } from '../../lib/firebase'
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
  sourcePdfBytes: number
  generatedPdfBytes: number
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

export function createDonorPdfGenerationHeader(summaryEndPage: number, sources: DonorPageSource[]) {
  const metadata = new TextEncoder().encode(JSON.stringify({ summaryEndPage, sources }))
  const header = new Uint8Array(4 + metadata.byteLength)
  new DataView(header.buffer).setUint32(0, metadata.byteLength)
  header.set(metadata, 4)
  return header
}

const generationErrorMessages = {
  authentication: 'החיבור למערכת פג. יש להתחבר מחדש ולנסות שוב.',
  authorization: 'אין לחשבון זה הרשאה ליצור קובצי מידע לתורמים.',
  request: 'לא ניתן להתאים את עמודי המידע לקובץ שנבחר. בדקו את הקובץ ונסו שוב.',
  tooLarge: 'קובץ הקטלוג גדול מדי לעיבוד. יש לבחור קובץ עד 20MB.',
  server: 'שירות יצירת קובצי המידע נכשל. רשומות התורמים נשמרו וניתן לנסות שוב.',
  connection: 'לא ניתן להתחבר לשירות יצירת קובצי המידע. בדקו את החיבור ונסו שוב.',
  response: 'התקבלה תשובה לא תקינה משירות יצירת קובצי המידע. נסו שוב.',
} as const

export function mapDonorPdfGenerationError(status: number, safeCode?: string) {
  if (safeCode === 'AUTHENTICATION_REQUIRED' || safeCode === 'INVALID_AUTHENTICATION' || status === 401) {
    return generationErrorMessages.authentication
  }
  if (safeCode === 'ADMIN_ACCESS_REQUIRED' || status === 403) return generationErrorMessages.authorization
  if (safeCode === 'INVALID_PDF_GENERATION_REQUEST' || safeCode === 'METHOD_NOT_ALLOWED'
    || status === 400 || status === 405 || status === 422) return generationErrorMessages.request
  if (status === 413) return generationErrorMessages.tooLarge
  if (safeCode === 'PDF_GENERATION_FAILED' || status >= 500) return generationErrorMessages.server
  return generationErrorMessages.connection
}

export const storeDonorDetailPdfs: StoreDonorDetailPdfs = async (
  file,
  summaryEndPage,
  sources,
  options = {},
) => {
  if (sources.length === 0) {
    return { uploadedDonorCount: 0, uploadedPdfCount: 0, sourcePdfBytes: 0, generatedPdfBytes: 0 }
  }

  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const sourceBytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({ data: sourceBytes.slice() })
  const document = await loadingTask.promise

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

      options.onProgress?.({
        completedDonors: donorIndex + 1,
        totalDonors: sources.length,
        currentDonorNumber: source.donorNumber,
      })
    }

    const user = auth.currentUser
    if (!user) throw new Error(generationErrorMessages.authentication)
    let idToken: string
    try {
      idToken = await user.getIdToken()
    } catch {
      throw new Error(generationErrorMessages.authentication)
    }

    let response: Response
    try {
      response = await fetch('https://europe-west1-assuta-sperm-donations.cloudfunctions.net/generateDonorDetailPdfs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Blob([createDonorPdfGenerationHeader(summaryEndPage, sources), file], {
          type: 'application/octet-stream',
        }),
      })
    } catch {
      throw new Error(generationErrorMessages.connection)
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: unknown } | null
      const safeCode = typeof payload?.error === 'string' ? payload.error : undefined
      throw new Error(mapDonorPdfGenerationError(response.status, safeCode))
    }
    try {
      const result = await response.json() as DonorPageUploadResult
      if (result.uploadedDonorCount !== sources.length || result.uploadedPdfCount !== sources.length
        || !Number.isFinite(result.sourcePdfBytes) || !Number.isFinite(result.generatedPdfBytes)) {
        throw new Error(generationErrorMessages.response)
      }
      return result
    } catch (error) {
      if (error instanceof Error && error.message === generationErrorMessages.response) throw error
      throw new Error(generationErrorMessages.response)
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
