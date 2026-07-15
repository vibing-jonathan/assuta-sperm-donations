import { describe, expect, it } from 'vitest'

import { detectDonorTableRange, isDonorTablePage } from './donorTableRange'

const donorHeader = `
  התורמים שלנו מס׳ תורם עיסוק מוצא דת צבע עור עיניים שיער
  גובה (מ׳) משקל (ק״ג) CMV IgG
`

describe('donor table range detection', () => {
  it('recognizes the repeated donor table header', () => {
    expect(isDonorTablePage(donorHeader)).toBe(true)
  })

  it('accepts PDF.js splitting the CMV header into separate text runs', () => {
    expect(isDonorTablePage(donorHeader.replace('CMV', 'CM V'))).toBe(true)
  })

  it('does not confuse an extended donor profile with the table', () => {
    expect(isDonorTablePage('עובדות ומספרים גובה משקל צבע שיער צבע עיניים דת CMV IgG')).toBe(false)
  })

  it('detects catalog pages 2 through 8 and stops at the first non-table page', () => {
    const pages = [
      { pageNumber: 1, text: 'קטלוג 2026 בחירת תורם היא החלטה גדולה' },
      ...Array.from({ length: 7 }, (_, index) => ({ pageNumber: index + 2, text: donorHeader })),
      { pageNumber: 9, text: 'עובדות ומספרים גובה משקל מבנה גוף' },
      { pageNumber: 10, text: donorHeader },
    ]

    expect(detectDonorTableRange(pages)).toEqual({ startPage: 2, endPage: 8, pageCount: 7 })
  })

  it('returns null when no donor table is found', () => {
    expect(detectDonorTableRange([{ pageNumber: 1, text: 'מסמך ללא טבלה' }])).toBeNull()
  })
})
