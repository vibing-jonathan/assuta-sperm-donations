import { describe, expect, it } from 'vitest'

import { normalizeExtractedDonor, normalizeListField, verifyListField } from './donorFieldRules'

describe('donor field normalization rules', () => {
  it('repairs missing origin delimiters, canonicalizes aliases, and removes semantic duplicates', () => {
    expect(normalizeListField('origin', 'רוסיה, רומניה בלרוס, רוסי')).toBe('רוסיה, רומניה, בלרוס')
  })

  it('normalizes Hebrew quotation spacing and comma spacing', () => {
    expect(normalizeListField('origin', 'ארה " ב,פולין, מצרים')).toBe('ארה"ב, פולין, מצרים')
  })

  it('drops empty list values and repeated delimiters', () => {
    expect(normalizeListField('religion', ',,יהודי')).toBe('יהודי')
  })

  it('normalizes every extracted list field while leaving occupation semantics intact', () => {
    const normalized = normalizeExtractedDonor({
      donorNumber: '  D-1  ', occupation: 'מנהל  פרויקטים',
      origin: 'רומניה בלרוס', religion: ',יהודי', skinColor: 'בהיר,בהיר',
      eyeColor: 'חום', hairColor: 'חום', cmvIgg: 'negative',
    })
    expect(normalized).toMatchObject({
      donorNumber: 'D-1', occupation: 'מנהל פרויקטים', origin: 'רומניה, בלרוס',
      religion: 'יהודי', skinColor: 'בהיר', cmvIgg: 'שלילי',
    })
  })

  it('returns field-specific review errors for manually entered malformed values', () => {
    expect(verifyListField('origin', 'רוסיה,רומניה')).toBe('יש להוסיף רווח אחרי כל פסיק בשדה מוצא.')
    expect(verifyListField('religion', 'יהודי, יהודי')).toBe('השדה דת מכיל ערכים כפולים.')
  })

  it('requires manual review for semantic values outside the controlled vocabulary', () => {
    expect(verifyListField('origin', 'רוסיה, אטלנטיס')).toBe(
      'ערך לא מוכר בשדה מוצא: אטלנטיס. יש לתקן ידנית.',
    )
    expect(verifyListField('religion', 'ערך לא מוכר')).toBe(
      'ערך לא מוכר בשדה דת: ערך לא מוכר. יש לתקן ידנית.',
    )
  })
})
