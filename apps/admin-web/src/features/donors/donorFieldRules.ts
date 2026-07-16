export type DonorListField = 'origin' | 'religion' | 'skinColor' | 'eyeColor' | 'hairColor'

import { parseDonorNumberMetadata, type GeneticCarrierStatus } from './donorNumberMetadata'

interface NormalizableDonorFields {
  donorNumber: string
  geneticCarrierStatus?: GeneticCarrierStatus
  occupation: string
  origin: string
  religion: string
  skinColor: string
  eyeColor: string
  hairColor: string
  cmvIgg: string
}

const listFields: DonorListField[] = ['origin', 'religion', 'skinColor', 'eyeColor', 'hairColor']
const singleValueFields = new Set<DonorListField>(['skinColor', 'eyeColor'])

const labels: Record<DonorListField, string> = {
  origin: 'מוצא',
  religion: 'דת',
  skinColor: 'צבע עור',
  eyeColor: 'צבע עיניים',
  hairColor: 'צבע שיער',
}

function normalizeQuotes(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[“”״]/g, '"')
    .replace(/[‘’׳]/g, "'")
    .replace(/\s*"\s*/g, '"')
    .replace(/\s*'\s*/g, "'")
}

export function normalizeCommaSpacing(value: string) {
  return value.split(',').map((part) => part.trim()).join(', ')
}

function comparisonKey(value: string) {
  return normalizeQuotes(value).toLocaleLowerCase('he').replace(/[\s"'.,;:()-]/g, '')
}

export function normalizeListField(field: DonorListField, value: string) {
  const punctuationNormalized = normalizeCommaSpacing(normalizeQuotes(value)
    .replace(/[;|\n]+/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '')
    .replace(/\s+/g, ' ')
    .trim())
  if (!punctuationNormalized) return ''

  if (singleValueFields.has(field)) {
    const hyphenNormalized = punctuationNormalized.replace(/\s*-\s*/g, '-')
    if (hyphenNormalized.includes(',')) return hyphenNormalized
    const words = hyphenNormalized.split(/\s+/).filter(Boolean)
    return words.length === 2 ? words.join('-') : hyphenNormalized
  }

  const tokens = punctuationNormalized.split(',').map((token) => token.trim()).filter(Boolean)
  const unique = new Map<string, string>()
  for (const token of tokens) {
    const key = comparisonKey(token)
    if (key && !unique.has(key)) unique.set(key, token)
  }
  return [...unique.values()].join(', ')
}

export function normalizeExtractedDonor<T extends NormalizableDonorFields>(input: T): T & { geneticCarrierStatus: GeneticCarrierStatus } {
  const normalized = { ...input } as T & { geneticCarrierStatus: GeneticCarrierStatus }
  const donorMetadata = parseDonorNumberMetadata(normalizeCommaSpacing(normalizeQuotes(input.donorNumber)))
  normalized.donorNumber = donorMetadata.donorNumber
  normalized.geneticCarrierStatus = donorMetadata.geneticCarrierStatus
  normalized.occupation = normalizeCommaSpacing(normalizeQuotes(input.occupation).replace(/\s+/g, ' ').trim())
  for (const field of listFields) normalized[field] = normalizeListField(field, input[field])
  const cmv = normalizeQuotes(input.cmvIgg).toLowerCase().trim()
  normalized.cmvIgg = /חיובי|positive|\bpos\b|\+/.test(cmv)
    ? 'חיובי'
    : /שלילי|negative|\bneg\b|−|-/.test(cmv) ? 'שלילי' : input.cmvIgg.trim()
  return normalized
}

export function verifyListField(field: DonorListField, value: string) {
  if (!value.trim()) return null
  if (value.length > 200) return `השדה ${labels[field]} ארוך מדי (עד 200 תווים).`
  if (singleValueFields.has(field)) {
    if (value.includes(',')) return `השדה ${labels[field]} מכיל ערך אחד בלבד; אין להשתמש בפסיקים.`
    if (/\s/.test(value.trim())) return `יש להפריד מילים בשדה ${labels[field]} באמצעות מקף, ללא רווחים.`
  } else {
    if (/^\s*,|,\s*$|,\s*,|;|\|/.test(value)) return `יש לתקן את המפרידים בשדה ${labels[field]}.`
    if (/\s+,/.test(value)) return `יש להסיר רווח לפני כל פסיק בשדה ${labels[field]}.`
    if (/,\S/.test(value)) return `יש להוסיף רווח אחד אחרי כל פסיק בשדה ${labels[field]}.`
    if (/,\s{2,}/.test(value)) return `יש להשאיר רווח אחד בלבד אחרי כל פסיק בשדה ${labels[field]}.`
  }

  const tokens = value.split(',').map((token) => token.trim()).filter(Boolean)
  if (tokens.length > 12) return `השדה ${labels[field]} מכיל יותר מדי ערכים.`
  const seen = new Set<string>()
  for (const token of tokens) {
    const key = comparisonKey(token)
    if (seen.has(key)) return `השדה ${labels[field]} מכיל ערכים כפולים.`
    seen.add(key)
  }

  const normalized = normalizeListField(field, value)
  if (normalized !== value.trim()) return `יש לאשר את הניסוח התקין בשדה ${labels[field]}.`
  return null
}

export function normalizeEditableTextField(
  field: 'donorNumber' | 'occupation' | DonorListField,
  value: string,
) {
  if (listFields.includes(field as DonorListField)) {
    return normalizeListField(field as DonorListField, value)
  }
  return normalizeCommaSpacing(normalizeQuotes(value).replace(/\s+/g, ' ').trim())
}
