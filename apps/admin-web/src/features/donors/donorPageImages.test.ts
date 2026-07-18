import { describe, expect, it } from 'vitest'

import { detailPageNumbers, donorPageStoragePath, pageMatchesDonor } from './donorPageImages'

describe('donor detail page images', () => {
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

  it('uses a stable non-identifying Storage folder key', () => {
    expect(donorPageStoragePath('D-5000', 2)).toMatch(/^donor-pages\/[a-f0-9]+\/page-3\.jpg$/)
  })
})
