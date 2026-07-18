import { PDFDocument } from 'pdf-lib'

import type { DonorTableRange } from './donorTableRange'

export const MAX_RELEVANT_PDF_BYTES = 8 * 1024 * 1024

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 32_768
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function prepareRelevantPdf(file: File, range: DonorTableRange) {
  const source = await PDFDocument.load(await file.arrayBuffer())
  if (range.startPage < 1 || range.endPage > source.getPageCount() || range.endPage < range.startPage) {
    throw new Error('טווח עמודי הטבלה אינו תקין.')
  }

  const relevant = await PDFDocument.create()
  const pageIndexes = Array.from(
    { length: range.pageCount },
    (_, index) => range.startPage - 1 + index,
  )
  const pages = await relevant.copyPages(source, pageIndexes)
  pages.forEach((page) => relevant.addPage(page))
  const bytes = await relevant.save({ useObjectStreams: true })

  if (bytes.byteLength > MAX_RELEVANT_PDF_BYTES) {
    throw new Error('עמודי הטבלה גדולים מדי לחילוץ. יש לפצל את הקובץ ולנסות שוב.')
  }

  return {
    pdfBase64: bytesToBase64(bytes),
    byteSize: bytes.byteLength,
  }
}
