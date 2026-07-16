import { describe, expect, it } from 'vitest'

import type { DonorInput } from '../donors/donor'
import { analyzeReviewRows, createReviewRows, selectedValidDonors } from './importReview'

function donor(donorNumber: string, overrides: Partial<DonorInput> = {}): DonorInput {
  return {
    donorNumber,
    geneticCarrierStatus: 'חיובי',
    occupation: '', origin: '', religion: '', skinColor: '', eyeColor: '', hairColor: '',
    heightMeters: 1.8, weightKg: 75, cmvIgg: 'שלילי',
    ...overrides,
  }
}

describe('import review analysis', () => {
  it('skips duplicates inside the file and keeps Firestore duplicates eligible for replacement', () => {
    const reviewed = analyzeReviewRows(
      createReviewRows([donor('A 1'), donor(' a   1 '), donor('B-2')]),
      new Set(['b-2']),
    )

    expect(reviewed.map((row) => row.duplicateKind)).toEqual([null, 'within-file', 'existing'])
    expect(reviewed[2]?.eligible).toBe(true)
    expect(selectedValidDonors(reviewed).map((row) => row.donorNumber)).toEqual(['A 1', 'B-2'])
  })

  it('returns row-specific errors for required clinical approval fields', () => {
    const [row] = analyzeReviewRows(createReviewRows([
      donor('', { heightMeters: null, weightKg: 301, cmvIgg: 'לא ידוע' }),
    ]), new Set())

    expect(row?.errors).toEqual({
      donorNumber: 'חובה להזין מספר תורם.',
      heightMeters: 'חובה להזין גובה.',
      weightKg: 'המשקל חייב להיות בין 30 ל-300 ק״ג.',
      cmvIgg: 'יש לבחור תוצאת CMV IgG: חיובי או שלילי.',
    })
  })

  it('returns row-specific errors for malformed multi-value fields', () => {
    const [row] = analyzeReviewRows(createReviewRows([
      donor('A-3', { origin: 'רוסיה,רומניה', religion: 'יהודי, יהודי' }),
    ]), new Set())

    expect(row?.errors).toMatchObject({
      origin: 'יש להוסיף רווח אחד אחרי כל פסיק בשדה מוצא.',
      religion: 'השדה דת מכיל ערכים כפולים.',
    })
  })

  it('rejects comma-separated or space-separated eye and skin values', () => {
    const [row] = analyzeReviewRows(createReviewRows([
      donor('A-5', { skinColor: 'בהיר, משתזף', eyeColor: 'חום בהיר' }),
    ]), new Set())

    expect(row?.errors).toMatchObject({
      skinColor: 'השדה צבע עור מכיל ערך אחד בלבד; אין להשתמש בפסיקים.',
      eyeColor: 'יש להפריד מילים בשדה צבע עיניים באמצעות מקף, ללא רווחים.',
    })
    expect(row?.eligible).toBe(false)
  })

  it('accepts arbitrary semantic values without making the row ineligible', () => {
    const [row] = analyzeReviewRows(createReviewRows([
      donor('A-4', { origin: 'רוסיה, אטלנטיס' }),
    ]), new Set())

    expect(row?.errors.origin).toBeUndefined()
    expect(row?.eligible).toBe(true)
    expect(selectedValidDonors(row ? [row] : [])).toHaveLength(1)
  })

  it('excludes manually deselected rows', () => {
    const rows = createReviewRows([donor('1'), donor('2')])
    rows[1]!.selected = false
    expect(selectedValidDonors(analyzeReviewRows(rows, new Set()))).toHaveLength(1)
  })
})
