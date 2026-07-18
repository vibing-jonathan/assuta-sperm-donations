import { describe, expect, it } from 'vitest'

import {
  createDonorPdfGenerationHeader,
  detailPageNumbers,
  donorDetailPdfStoragePath,
  mapDonorPdfGenerationError,
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

  it('prefixes the single catalog upload with bounded generation metadata', () => {
    const sources = [{ sourceIndex: 2, sourceDonorNumber: '1314***', donorNumber: '1314' }]
    const header = createDonorPdfGenerationHeader(8, sources)
    const metadataLength = new DataView(header.buffer).getUint32(0)
    const metadata = JSON.parse(new TextDecoder().decode(header.subarray(4)))

    expect(metadataLength).toBe(header.byteLength - 4)
    expect(metadata).toEqual({ summaryEndPage: 8, sources })
  })

  it('uses a stable non-identifying Storage folder key', () => {
    expect(donorDetailPdfStoragePath('D-5000')).toMatch(/^donor-pages\/[a-f0-9]+\/details\.pdf$/)
  })

  it('maps safe generation errors without exposing server diagnostics', () => {
    expect(mapDonorPdfGenerationError(401, 'INVALID_AUTHENTICATION')).toContain('להתחבר מחדש')
    expect(mapDonorPdfGenerationError(400, 'INVALID_PDF_GENERATION_REQUEST')).toContain('עמודי המידע')
    expect(mapDonorPdfGenerationError(500, 'PDF_GENERATION_FAILED')).toContain('רשומות התורמים נשמרו')
  })
})
