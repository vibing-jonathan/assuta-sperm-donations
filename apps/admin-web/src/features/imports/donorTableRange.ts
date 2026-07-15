export interface PdfPageText {
  pageNumber: number
  text: string
}

export interface DonorTableRange {
  startPage: number
  endPage: number
  pageCount: number
}

const headerMarkers = [
  'עיסוק',
  'מוצא',
  'דת',
  'צבע עור',
  'עיניים',
  'שיער',
  'גובה',
  'משקל',
]

function normalizeText(text: string) {
  return text
    .normalize('NFKC')
    .replace(/["'׳״]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function isDonorTablePage(text: string) {
  const normalized = normalizeText(text)
  const hasDonorNumber = /מס\s*תורם/.test(normalized)
  const hasCmvIgg = /c\s*m\s*v/.test(normalized) && /i\s*g\s*g/.test(normalized)
  const markerCount = headerMarkers.filter((marker) => normalized.includes(marker)).length

  return hasDonorNumber
    && hasCmvIgg
    && normalized.includes('עיסוק')
    && normalized.includes('מוצא')
    && markerCount >= 7
}

export function detectDonorTableRange(pages: PdfPageText[]): DonorTableRange | null {
  let startPage: number | null = null
  let endPage: number | null = null

  for (const page of pages) {
    if (isDonorTablePage(page.text)) {
      if (startPage === null) startPage = page.pageNumber
      endPage = page.pageNumber
      continue
    }

    if (startPage !== null) break
  }

  if (startPage === null || endPage === null) return null
  return { startPage, endPage, pageCount: endPage - startPage + 1 }
}
