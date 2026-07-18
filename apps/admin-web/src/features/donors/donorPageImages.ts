import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { firebaseApp } from '../../lib/firebase'
import { donorNumberClaimId } from './donor'

export const DONOR_DETAIL_PAGE_COUNT = 3
const MAX_RENDER_WIDTH = 1400
const JPEG_QUALITY = 0.86

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
  uploadedImageCount: number
}

export interface StoreDonorPageOptions {
  onProgress?: (progress: DonorPageUploadProgress) => void
}

export type StoreDonorPageImages = (
  file: File,
  summaryEndPage: number,
  sources: DonorPageSource[],
  options?: StoreDonorPageOptions,
) => Promise<DonorPageUploadResult>

export interface DonorPageRepository {
  getPageUrls(donorNumber: string): Promise<string[]>
}

export function donorPageStoragePath(donorNumber: string, pageIndex: number) {
  return `donor-pages/${donorNumberClaimId(donorNumber)}/page-${pageIndex + 1}.jpg`
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

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('יצירת תמונת עמוד נכשלה.')),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export const storeDonorPageImages: StoreDonorPageImages = async (
  file,
  summaryEndPage,
  sources,
  options = {},
) => {
  if (sources.length === 0) return { uploadedDonorCount: 0, uploadedImageCount: 0 }

  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  const { getStorage, ref, uploadBytes } = await import('firebase/storage')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await loadingTask.promise
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

      const blobs: Blob[] = []
      for (const page of pages) {
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(2, MAX_RENDER_WIDTH / baseViewport.width)
        const viewport = page.getViewport({ scale })
        const canvas = window.document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const canvasContext = canvas.getContext('2d')
        if (!canvasContext) throw new Error('הדפדפן אינו תומך בהמרת עמודי PDF לתמונות.')
        await page.render({ canvas, canvasContext, viewport }).promise
        blobs.push(await canvasToJpeg(canvas))
        canvas.width = 0
        canvas.height = 0
      }

      await Promise.all(blobs.map((blob, pageIndex) => uploadBytes(
        ref(storage, donorPageStoragePath(source.donorNumber, pageIndex)),
        blob,
        { contentType: 'image/jpeg', cacheControl: 'private,max-age=3600' },
      )))
      options.onProgress?.({
        completedDonors: donorIndex + 1,
        totalDonors: sources.length,
        currentDonorNumber: source.donorNumber,
      })
    }

    return {
      uploadedDonorCount: sources.length,
      uploadedImageCount: sources.length * DONOR_DETAIL_PAGE_COUNT,
    }
  } finally {
    await loadingTask.destroy()
  }
}

export const storageDonorPageRepository: DonorPageRepository = {
  async getPageUrls(donorNumber) {
    const { getBlob, getStorage, ref } = await import('firebase/storage')
    const storage = getStorage(firebaseApp)
    const blobs = await Promise.all(Array.from(
      { length: DONOR_DETAIL_PAGE_COUNT },
      (_, pageIndex) => getBlob(ref(storage, donorPageStoragePath(donorNumber, pageIndex))),
    ))
    return blobs.map((blob) => URL.createObjectURL(blob))
  },
}
