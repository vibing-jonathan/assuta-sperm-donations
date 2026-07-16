import { describe, expect, it } from 'vitest'

import {
  normalizeCommaSpacing,
  normalizeExtractedDonor,
  normalizeListField,
  verifyListField,
} from './donorFieldRules'

describe('donor field normalization rules', () => {
  it('preserves arbitrary values and removes only exact normalized duplicates', () => {
    expect(normalizeListField('origin', 'רוסיה, רומניה בלרוס, רוסי, רוסיה')).toBe('רוסיה, רומניה בלרוס, רוסי')
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
      donorNumber: 'D-1', occupation: 'מנהל פרויקטים', origin: 'רומניה בלרוס',
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

  it('preserves a negative carrier status when an extracted donor is normalized again', () => {
    const normalized = normalizeExtractedDonor({
      donorNumber: 'D-302***', occupation: '', origin: '', religion: '', skinColor: '',
      eyeColor: '', hairColor: '', cmvIgg: '',
    })

    expect(normalizeExtractedDonor(normalized)).toMatchObject({
      donorNumber: 'D-302', geneticCarrierStatus: 'שלילי',
    })
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

  it('accepts arbitrary semantic values without an allow-list', () => {
    expect(verifyListField('origin', 'רוסיה, אטלנטיס')).toBeNull()
    expect(verifyListField('religion', 'ערך לא מוכר')).toBeNull()
    expect(verifyListField('skinColor', 'סגול-מנצנץ')).toBeNull()
    expect(verifyListField('eyeColor', 'טורקיז')).toBeNull()
  })
})
