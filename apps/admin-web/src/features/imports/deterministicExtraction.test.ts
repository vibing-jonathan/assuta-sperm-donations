import { describe, expect, it } from 'vitest'

import {
  DeterministicExtractionFailure,
  parseDeterministicTablePages,
  type PositionedPdfPage,
  type PositionedPdfText,
} from './deterministicExtraction'

const anchorX = {
  donorNumber: 900,
  occupation: 790,
  origin: 680,
  religion: 590,
  skinColor: 500,
  eyeColor: 410,
  hairColor: 320,
  heightMeters: 235,
  weightKg: 140,
  cmvIgg: 55,
} as const

function item(text: string, x: number, y: number, width = 40): PositionedPdfText {
  return { text, x: x - width / 2, y, width, height: 18 }
}

function fixturePage(): PositionedPdfPage {
  const items = [
    item('מס תורם', anchorX.donorNumber, 900, 80),
    item('עיסוק', anchorX.occupation, 900),
    item('מוצא', anchorX.origin, 900),
    item('דת', anchorX.religion, 900),
    item('צבע עור', anchorX.skinColor, 900, 65),
    item('עיניים', anchorX.eyeColor, 900),
    item('שיער', anchorX.hairColor, 900),
    item('גובה', anchorX.heightMeters, 900),
    item('משקל', anchorX.weightKg, 912),
    item('CMV IgG', anchorX.cmvIgg, 888, 70),
  ]
  const rows = [
    ['כינוי', 'D-100***', 'רופא', 'ספרדי', 'יהודי', 'בהיר', 'חום', 'שחור', '180', '75', '+'],
    ['D-101', 'מהנדס', 'אירופי', 'יהודי', 'בהיר', 'ירוק', 'חום', '1.76', '82', 'שלילי'],
  ]
  items.push(
    item(rows[0][0]!, anchorX.donorNumber, 820),
    item(rows[0][1]!, anchorX.donorNumber, 795),
    ...Object.keys(anchorX).slice(1).map((key, index) => item(rows[0][index + 2]!, anchorX[key as keyof typeof anchorX], 810)),
    item(rows[1][0]!, anchorX.donorNumber, 695),
    ...Object.keys(anchorX).slice(1).map((key, index) => item(rows[1][index + 1]!, anchorX[key as keyof typeof anchorX], 705)),
  )
  return { pageNumber: 2, items }
}

describe('deterministic donor table extraction', () => {
  it('maps fixed PDF coordinates into editable donor rows and normalizes clinical values', () => {
    const result = parseDeterministicTablePages([fixturePage()])

    expect(result.warnings).toEqual([])
    expect(result.donors).toEqual([
      expect.objectContaining({
        donorNumber: 'כינוי D-100', geneticCarrierStatus: 'שלילי', occupation: 'רופא',
        heightMeters: 1.8, weightKg: 75, cmvIgg: 'חיובי',
      }),
      expect.objectContaining({
        donorNumber: 'D-101', geneticCarrierStatus: 'חיובי', occupation: 'מהנדס', heightMeters: 1.76,
        weightKg: 82, cmvIgg: 'שלילי',
      }),
    ])
  })

  it('fails closed when a known header is missing so the caller can use Gemini', () => {
    const page = fixturePage()
    page.items = page.items.filter((entry) => entry.text !== 'מוצא')

    expect(() => parseDeterministicTablePages([page])).toThrowError(
      expect.objectContaining<Partial<DeterministicExtractionFailure>>({ reason: 'headers_missing' }),
    )
  })

  it('does not treat business-field validation as structural confidence', () => {
    const page = fixturePage()
    const cmvValue = page.items.find((entry) => entry.text === '+')
    if (cmvValue) cmvValue.text = 'לא ידוע'

    const result = parseDeterministicTablePages([page])
    expect(result.donors[0]?.cmvIgg).toBe('')
    expect(result.warnings).toContain('עמוד 2, שורה 1: תוצאת CMV IgG לא זוהתה.')
  })

  it('preserves separate PDF lines as delimiters for multi-value fields', () => {
    const page = fixturePage()
    page.items = page.items.filter((entry) => entry.text !== 'ספרדי')
    page.items.push(
      item('רוסיה, רומניה', anchorX.origin, 820),
      item('בלרוס, רוסי', anchorX.origin, 800),
    )

    const result = parseDeterministicTablePages([page])
    expect(result.donors[0]?.origin).toBe('רוסיה, רומניה, בלרוס, רוסי')
  })
})
