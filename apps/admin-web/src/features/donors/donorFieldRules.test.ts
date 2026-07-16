import { describe, expect, it } from 'vitest'

import {
  normalizeCommaSpacing,
  normalizeExtractedDonor,
  normalizeListField,
  verifyListField,
} from './donorFieldRules'

describe('donor field normalization rules', () => {
  it('repairs missing origin delimiters, canonicalizes aliases, and removes semantic duplicates', () => {
    expect(normalizeListField('origin', 'רוסיה, רומניה בלרוס, רוסי')).toBe('רוסיה, רומניה, בלרוס')
  })

  it('normalizes Hebrew quotation spacing and comma spacing', () => {
    expect(normalizeListField('origin', 'ארה " ב,פולין, מצרים')).toBe('ארה"ב, פולין, מצרים')
    expect(normalizeCommaSpacing('רוסיה ,רומניה ,  בלרוס')).toBe('רוסיה, רומניה, בלרוס')
  })

  it('drops empty list values and repeated delimiters', () => {
    expect(normalizeListField('religion', ',,יהודי')).toBe('יהודי')
  })

  it('normalizes every extracted list field while leaving occupation semantics intact', () => {
    const normalized = normalizeExtractedDonor({
      donorNumber: '  D-1  ', occupation: 'מנהל  פרויקטים',
      origin: 'רומניה בלרוס', religion: ',יהודי', skinColor: 'בהיר משתזף',
      eyeColor: 'חום', hairColor: 'חום', cmvIgg: 'negative',
    })
    expect(normalized).toMatchObject({
      donorNumber: 'D-1', occupation: 'מנהל פרויקטים', origin: 'רומניה, בלרוס',
      geneticCarrierStatus: 'חיובי', religion: 'יהודי', skinColor: 'בהיר-משתזף', cmvIgg: 'שלילי',
    })
  })

  it('moves a trailing three-asterisk donor marker into genetic carrier status', () => {
    expect(normalizeExtractedDonor({
      donorNumber: 'D-300 ***', occupation: '', origin: '', religion: '', skinColor: '',
      eyeColor: '', hairColor: '', cmvIgg: '',
    })).toMatchObject({ donorNumber: 'D-300', geneticCarrierStatus: 'שלילי' })

    expect(normalizeExtractedDonor({
      donorNumber: 'D-301', occupation: '', origin: '', religion: '', skinColor: '',
      eyeColor: '', hairColor: '', cmvIgg: '',
    })).toMatchObject({ donorNumber: 'D-301', geneticCarrierStatus: 'חיובי' })
  })

  it('returns field-specific review errors for manually entered malformed values', () => {
    expect(verifyListField('origin', 'רוסיה,רומניה')).toBe('יש להוסיף רווח אחד אחרי כל פסיק בשדה מוצא.')
    expect(verifyListField('origin', 'רוסיה , רומניה')).toBe('יש להסיר רווח לפני כל פסיק בשדה מוצא.')
    expect(verifyListField('origin', 'רוסיה,  רומניה')).toBe('יש להשאיר רווח אחד בלבד אחרי כל פסיק בשדה מוצא.')
    expect(verifyListField('religion', 'יהודי, יהודי')).toBe('השדה דת מכיל ערכים כפולים.')
  })

  it('allows one hyphenated eye or skin value and rejects commas or spaces', () => {
    expect(normalizeListField('skinColor', 'בהיר משתזף')).toBe('בהיר-משתזף')
    expect(normalizeListField('eyeColor', 'חום בהיר')).toBe('חום-בהיר')
    expect(verifyListField('skinColor', 'בהיר-משתזף')).toBeNull()
    expect(verifyListField('eyeColor', 'חום-בהיר')).toBeNull()
    expect(verifyListField('skinColor', 'בהיר, משתזף')).toBe(
      'השדה צבע עור מכיל ערך אחד בלבד; אין להשתמש בפסיקים.',
    )
    expect(verifyListField('eyeColor', 'חום בהיר')).toBe(
      'יש להפריד מילים בשדה צבע עיניים באמצעות מקף, ללא רווחים.',
    )
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
