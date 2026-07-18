import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { detectDonorTableRange, isDonorTablePage, type DonorTableRange, type PdfPageText } from './donorTableRange'

export const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_PAGES_BEFORE_TABLE = 30

export interface PdfScanResult extends DonorTableRange {
  totalPages: number
  scannedPages: number
}

interface ScanOptions {
  onProgress?: (pageNumber: number, totalPages: number) => void
}

export async function scanDonorPdf(file: File, options: ScanOptions = {}): Promise<PdfScanResult> {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('יש לבחור קובץ PDF.')
  }
  if (file.size > MAX_PDF_BYTES) throw new Error('גודל הקובץ חייב להיות עד 20MB.')

  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await loadingTask.promise
  const pages: PdfPageText[] = []
  let tableStarted = false

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (!tableStarted && pageNumber > MAX_PAGES_BEFORE_TABLE) break

      options.onProgress?.(pageNumber, document.numPages)
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      const isTable = isDonorTablePage(text)

      pages.push({ pageNumber, text })
      if (isTable) tableStarted = true
      else if (tableStarted) break
    }

    const range = detectDonorTableRange(pages)
    if (!range) throw new Error('לא נמצאו עמודי טבלת תורמים ב-30 העמודים הראשונים.')

    return {
      ...range,
      totalPages: document.numPages,
      scannedPages: pages.length,
    }
  } finally {
    await loadingTask.destroy()
  }
}
