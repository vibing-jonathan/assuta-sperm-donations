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

const originValues = [
  'ישראל', 'רוסיה', 'רומניה', 'בלרוס', 'ארה"ב', 'ארצות הברית', 'פולין', 'מצרים',
  'אוקראינה', 'גרמניה', 'צרפת', 'אנגליה', 'בריטניה', 'איטליה', 'ספרד', 'פורטוגל',
  'מרוקו', 'תוניסיה', 'לוב', 'אלג\'יריה', 'עיראק', 'איראן', 'תימן', 'סוריה', 'לבנון',
  'טורקיה', 'יוון', 'בולגריה', 'הונגריה', 'צ\'כיה', 'סלובקיה', 'אוסטריה', 'שווייץ',
  'הולנד', 'בלגיה', 'ליטא', 'לטביה', 'אסטוניה', 'גאורגיה', 'גרוזיה', 'קווקז',
  'ארגנטינה', 'ברזיל', 'מקסיקו', 'קנדה', 'אוסטרליה', 'דרום אפריקה', 'אתיופיה',
  'הודו', 'בוכרה', 'פרס', 'כורדיסטן', 'אשכנזי', 'ספרדי', 'מזרחי', 'ערבי',
]

const religionValues = ['יהודי', 'נוצרי', 'מוסלמי', 'דרוזי', 'בהאי', 'ללא דת', 'אתאיסט', 'אחר']
const skinValues = ['בהיר', 'כהה', 'שחום', 'בינוני', 'לבן', 'שחור', 'זית']
const eyeValues = ['חום', 'כחול', 'ירוק', 'אפור', 'שחור', 'דבש', 'לוז', 'חום בהיר', 'חום כהה', 'כחול-ירוק', 'ירוק-חום']
const hairValues = ['שחור', 'חום', 'בלונדיני', 'ג\'ינג\'י', 'שטני', 'אפור', 'חלק', 'גלי', 'מתולתל', 'קצר', 'ארוך', 'חום בהיר', 'חום כהה']

const valuesByField: Record<DonorListField, string[]> = {
  origin: originValues,
  religion: religionValues,
  skinColor: skinValues,
  eyeColor: eyeValues,
  hairColor: hairValues,
}

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

function comparisonKey(value: string) {
  return normalizeQuotes(value).toLocaleLowerCase('he').replace(/[\s"'.,;:()-]/g, '')
}

function vocabulary(field: DonorListField) {
  const entries = valuesByField[field].map((value) => ({ value, key: comparisonKey(value) }))
  const byKey = new Map(entries.map((entry) => [entry.key, entry.value]))
  if (field === 'origin') {
    byKey.set(comparisonKey('רוסי'), 'רוסיה')
    byKey.set(comparisonKey('רוסייה'), 'רוסיה')
    byKey.set(comparisonKey('ארהב'), 'ארה"ב')
  }
  return { entries, byKey }
}

function splitKnownSequence(field: DonorListField, token: string) {
  const words = token.split(/\s+/).filter(Boolean)
  if (words.length < 2) return [token]
  const { byKey } = vocabulary(field)
  const memo = new Map<number, string[] | null>()
  function segment(start: number): string[] | null {
    if (start === words.length) return []
    if (memo.has(start)) return memo.get(start) ?? null
    for (let end = words.length; end > start; end -= 1) {
      const canonical = byKey.get(comparisonKey(words.slice(start, end).join(' ')))
      if (!canonical) continue
      const remainder = segment(end)
      if (remainder) {
        const result = [canonical, ...remainder]
        memo.set(start, result)
        return result
      }
    }
    memo.set(start, null)
    return null
  }
  const segmented = segment(0)
  return segmented && segmented.length > 1 ? segmented : [token]
}

function mergeKnownPhraseTokens(field: DonorListField, tokens: string[]) {
  const { byKey } = vocabulary(field)
  const merged: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index] ?? ''
    const next = tokens[index + 1]
    const currentKnown = byKey.has(comparisonKey(current))
    const nextKnown = next ? byKey.has(comparisonKey(next)) : false
    const combined = next ? byKey.get(comparisonKey(`${current} ${next}`)) : undefined
    if (combined && !currentKnown && !nextKnown) {
      merged.push(combined)
      index += 1
    } else merged.push(current)
  }
  return merged
}

export function normalizeListField(field: DonorListField, value: string) {
  const punctuationNormalized = normalizeQuotes(value)
    .replace(/[;|\n]+/g, ',')
    .replace(/\s*,\s*/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!punctuationNormalized) return ''

  const { byKey } = vocabulary(field)
  const initialTokens = punctuationNormalized.split(',').map((token) => token.trim()).filter(Boolean)
  const mergedTokens = mergeKnownPhraseTokens(field, initialTokens)
  const canonicalTokens = mergedTokens.flatMap((token) => splitKnownSequence(field, token))
    .map((token) => byKey.get(comparisonKey(token)) ?? token)
  const unique = new Map<string, string>()
  for (const token of canonicalTokens) {
    const key = comparisonKey(token)
    if (key && !unique.has(key)) unique.set(key, token)
  }
  return [...unique.values()].join(', ')
}

export function normalizeExtractedDonor<T extends NormalizableDonorFields>(input: T): T & { geneticCarrierStatus: GeneticCarrierStatus } {
  const normalized = { ...input } as T & { geneticCarrierStatus: GeneticCarrierStatus }
  const donorMetadata = parseDonorNumberMetadata(normalizeQuotes(input.donorNumber))
  normalized.donorNumber = donorMetadata.donorNumber
  normalized.geneticCarrierStatus = donorMetadata.geneticCarrierStatus
  normalized.occupation = normalizeQuotes(input.occupation).replace(/\s+/g, ' ').trim()
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
  if (/^\s*,|,\s*$|,,|;|\|/.test(value)) return `יש לתקן את המפרידים בשדה ${labels[field]}.`
  if (/,\S/.test(value)) return `יש להוסיף רווח אחרי כל פסיק בשדה ${labels[field]}.`

  const tokens = value.split(',').map((token) => token.trim()).filter(Boolean)
  if (tokens.length > 12) return `השדה ${labels[field]} מכיל יותר מדי ערכים.`
  const seen = new Set<string>()
  for (const token of tokens) {
    const key = comparisonKey(token)
    if (seen.has(key)) return `השדה ${labels[field]} מכיל ערכים כפולים.`
    seen.add(key)
  }

  const { byKey } = vocabulary(field)
  const unknown = tokens.filter((token) => !byKey.has(comparisonKey(token)))
  if (unknown.length > 0) {
    return `ערך לא מוכר בשדה ${labels[field]}: ${unknown.join(', ')}. יש לתקן ידנית.`
  }

  const normalized = normalizeListField(field, value)
  if (normalized !== value.trim()) return `יש לאשר את הניסוח התקין בשדה ${labels[field]}.`
  return null
}
