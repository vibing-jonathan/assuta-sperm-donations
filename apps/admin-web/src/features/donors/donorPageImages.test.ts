import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import {
  createDonorDetailPdf,
  detailPageNumbers,
  donorDetailPdfStoragePath,
  pageMatchesDonor,
} from './donorPageImages'

describe('donor detail PDF', () => {
  it('maps each source row to the next consecutive group of three pages', () => {
    expect(detailPageNumbers(8, 0, 197)).toEqual([9, 10, 11])
    expect(detailPageNumbers(8, 1, 197)).toEqual([12, 13, 14])
    expect(detailPageNumbers(8, 62, 197)).toEqual([195, 196, 197])
  })

  it('rejects an incomplete three-page group', () => {
    expect(() => detailPageNumbers(8, 63, 197)).toThrow('לא נמצאו שלושת עמודי המידע')
  })

  it('matches donor numbers despite PDF spacing, punctuation, and a carrier marker', () => {
    expect(pageMatchesDonor('Carson - 1314 עובדות ומספרים', '1314***')).toBe(true)
    expect(pageMatchesDonor('1314 היסטוריה רפואית', 'Carson 1314')).toBe(true)
    expect(pageMatchesDonor('D - 5000 היסטוריה רפואית', 'D-5000')).toBe(true)
    expect(pageMatchesDonor('Carson - 1314', 'Tommy 1341')).toBe(false)
  })

  it('copies exactly the selected three pages into a standalone PDF', async () => {
    const source = await PDFDocument.create()
    Array.from({ length: 5 }, (_, index) => source.addPage([200 + index, 300 + index]))

    const bytes = await createDonorDetailPdf(source, [2, 3, 4])
    const detail = await PDFDocument.load(bytes)

    expect(detail.getPageCount()).toBe(3)
    expect(detail.getPages().map((page) => page.getWidth())).toEqual([201, 202, 203])
  })

  it('uses a stable non-identifying Storage folder key', () => {
    expect(donorDetailPdfStoragePath('D-5000')).toMatch(/^donor-pages\/[a-f0-9]+\/details\.pdf$/)
  })
})
