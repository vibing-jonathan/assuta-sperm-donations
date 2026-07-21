import { isCarrierFree, isCmvNegative, type Donor } from '../donors/donor'

export const ANY_OPTION = 'לא משנה לי'
export const HAIR_TEXTURES = ['חלק', 'גלי', 'מתולתל'] as const
const COLOR_SHADE_WORDS = new Set([
  'בהיר', 'בהירה', 'בהירים', 'בהירות',
  'כהה', 'כהים', 'כהות',
  'מאוד', 'בינוני', 'בינונית',
  'light', 'dark', 'very', 'medium',
])

export type PreferenceKey =
  | 'origin'
  | 'religion'
  | 'carrierFree'
  | 'cmvNegative'
  | 'hairColor'
  | 'hairTexture'
  | 'skinColor'
  | 'eyeColor'

export type PreferenceAnswers = Partial<Record<PreferenceKey, string | string[]>>

export interface RankedDonor {
  donor: Donor
  score: number | null
  matchedWeight: number
  totalWeight: number
  matchedLabels: string[]
  activePreferenceCount: number
}

interface CriterionScore {
  weight: number
  similarity: number
  label: string
}

const WEIGHTS: Record<PreferenceKey, number> = {
  origin: 1.2,
  religion: 1.1,
  carrierFree: 1.4,
  cmvNegative: 1.3,
  hairColor: 0.8,
  hairTexture: 0.7,
  skinColor: 0.8,
  eyeColor: 0.9,
}

function clean(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function colorComparisonKey(value: string) {
  return clean(value).toLocaleLowerCase('he')
}

function combineShadeParts(parts: string[]) {
  const colors: string[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!
    const words = part.split(/\s+/)
    if (words.length === 1 && COLOR_SHADE_WORDS.has(colorComparisonKey(part))) {
      if (colors.length > 0) colors[colors.length - 1] = `${colors.at(-1)} ${part}`
      else if (parts[index + 1]) {
        colors.push(`${part} ${parts[index + 1]}`)
        index += 1
      }
      continue
    }
    colors.push(part)
  }
  return colors
}

/** Splits composite colors while preserving shade names such as "חום-בהיר". */
export function colorValues(value: string) {
  const separated = clean(value)
    .split(/\s*(?:,|;|\/|\||\+)\s*/)
    .flatMap((token) => combineShadeParts(token.split(/\s*[-–—]\s*/).map(clean).filter(Boolean)))
    .filter(Boolean)
  const unique = new Map<string, string>()
  for (const color of separated) {
    const key = colorComparisonKey(color)
    if (key && !unique.has(key)) unique.set(key, color)
  }
  return [...unique.values()]
}

export function splitListValues(value: string) {
  return value.split(',').map(clean).filter(Boolean)
}

export function hairAttributes(value: string) {
  const tokens = splitListValues(value)
  const textures = HAIR_TEXTURES.filter((texture) => tokens.some((token) => token.includes(texture)))
  const colors = tokens
    .map((token) => HAIR_TEXTURES.reduce((current, texture) => current.replace(texture, ''), token))
    .map((token) => clean(token.replace(/^[-–—,]+|[-–—,]+$/g, '')))
    .flatMap(colorValues)
  const uniqueColors = new Map(colors.map((color) => [colorComparisonKey(color), color]))
  return {
    colors: [...uniqueColors.values()],
    textures: [...textures],
  }
}

function selectedAnswer(answers: PreferenceAnswers, key: PreferenceKey) {
  const value = answers[key]
  if (!value || value === ANY_OPTION || (Array.isArray(value) && value.includes(ANY_OPTION))) return null
  return value
}

function exactSimilarity(actual: string, expected: string) {
  if (!actual.trim()) return 0.25
  return clean(actual) === clean(expected) ? 1 : 0
}

function scoreCriterion(donor: Donor, key: PreferenceKey, answer: string | string[]): CriterionScore {
  const expected = Array.isArray(answer) ? answer : [answer]
  if (key === 'origin') {
    const actual = new Set(splitListValues(donor.origin))
    const overlap = expected.filter((value) => actual.has(clean(value))).length
    return { weight: WEIGHTS[key], similarity: actual.size ? overlap / expected.length : 0.25, label: 'מוצא' }
  }
  if (key === 'carrierFree') {
    const expectedValue = expected[0] === 'כן'
    return { weight: WEIGHTS[key], similarity: isCarrierFree(donor) === expectedValue ? 1 : 0, label: 'נשאויות' }
  }
  if (key === 'cmvNegative') {
    const expectedValue = expected[0] === 'כן'
    return { weight: WEIGHTS[key], similarity: donor.cmvIgg ? (isCmvNegative(donor) === expectedValue ? 1 : 0) : 0.25, label: 'CMV' }
  }
  if (key === 'hairColor') {
    const actual = hairAttributes(donor.hairColor).colors
    const expectedColor = colorComparisonKey(expected[0]!)
    return { weight: WEIGHTS[key], similarity: actual.length ? (actual.some((color) => colorComparisonKey(color) === expectedColor) ? 1 : 0) : 0.25, label: 'צבע שיער' }
  }
  if (key === 'hairTexture') {
    const actual = hairAttributes(donor.hairColor).textures
    return { weight: WEIGHTS[key], similarity: actual.length ? (actual.includes(expected[0] as typeof HAIR_TEXTURES[number]) ? 1 : 0) : 0.25, label: 'מרקם שיער' }
  }
  if (key === 'eyeColor') {
    const actual = colorValues(donor.eyeColor)
    const expectedColor = colorComparisonKey(expected[0]!)
    return { weight: WEIGHTS[key], similarity: actual.length ? (actual.some((color) => colorComparisonKey(color) === expectedColor) ? 1 : 0) : 0.25, label: 'צבע עיניים' }
  }
  const field = key === 'skinColor' ? donor.skinColor : donor.religion
  const labels = { religion: 'דת', skinColor: 'גוון עור', eyeColor: 'צבע עיניים' }
  return { weight: WEIGHTS[key], similarity: exactSimilarity(field, expected[0]!), label: labels[key] }
}

function dataCompleteness(donor: Donor) {
  return [
    donor.origin, donor.religion, donor.hairColor, donor.skinColor, donor.eyeColor, donor.cmvIgg,
    donor.heightMeters, donor.weightKg,
  ].filter((value) => value !== '' && value !== null).length
}

export function rankClosestDonors(donors: Donor[], answers: PreferenceAnswers): RankedDonor[] {
  const active = (Object.keys(WEIGHTS) as PreferenceKey[])
    .flatMap((key) => {
      const answer = selectedAnswer(answers, key)
      return answer ? [{ key, answer }] : []
    })

  return donors.map((donor) => {
    const criteria = active.map(({ key, answer }) => scoreCriterion(donor, key, answer))
    const totalWeight = criteria.reduce((total, criterion) => total + criterion.weight, 0)
    const matchedWeight = criteria.reduce(
      (total, criterion) => total + criterion.weight * criterion.similarity,
      0,
    )
    return {
      donor,
      score: totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : null,
      matchedWeight,
      totalWeight,
      matchedLabels: criteria.filter((criterion) => criterion.similarity === 1).map((criterion) => criterion.label),
      activePreferenceCount: active.length,
    }
  }).sort((left, right) => {
    if (left.score !== right.score) return (right.score ?? -1) - (left.score ?? -1)
    const completenessDifference = dataCompleteness(right.donor) - dataCompleteness(left.donor)
    if (completenessDifference) return completenessDifference
    return left.donor.donorNumber.localeCompare(right.donor.donorNumber, 'he')
  })
}
