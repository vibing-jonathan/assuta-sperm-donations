import { isCarrierFree, isCmvNegative, type Donor } from '../donors/donor'

export const ANY_OPTION = 'לא משנה לי'
export const LIGHT_EYES_OPTION = 'עיניים בהירות'
export const DARK_EYES_OPTION = 'עיניים כהות'

type EyeShade = typeof LIGHT_EYES_OPTION | typeof DARK_EYES_OPTION

const DARK_EYE_COLORS = /(?:חום|חומה|חומים|חומות|שחור|שחורה|שחורים|שחורות|כהה|כהים|כהות|brown|black|dark|hazel)/i
const LIGHT_EYE_COLORS = /(?:כחול|כחולה|כחולים|כחולות|ירוק|ירוקה|ירוקים|ירוקות|אפור|אפורה|אפורים|אפורות|תכלת|בהיר|בהירה|בהירים|בהירות|דבש|ענבר|blue|green|grey|gray|light|amber)/i

export type PreferenceKey =
  | 'religion'
  | 'carrierFree'
  | 'cmvNegative'
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
  religion: 1.1,
  carrierFree: 1.4,
  cmvNegative: 1.3,
  skinColor: 0.8,
  eyeColor: 0.9,
}

function clean(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function splitListValues(value: string) {
  return value.split(',').map(clean).filter(Boolean)
}

/** Maps detailed donor eye colors into the two choices exposed by the user app. */
export function eyeShade(value: string): EyeShade | null {
  const normalized = clean(value).toLocaleLowerCase('he')
  if (!normalized) return null
  if (normalized === DARK_EYES_OPTION || DARK_EYE_COLORS.test(normalized)) return DARK_EYES_OPTION
  if (normalized === LIGHT_EYES_OPTION || LIGHT_EYE_COLORS.test(normalized)) return LIGHT_EYES_OPTION
  return null
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
  if (key === 'carrierFree') {
    const expectedValue = expected[0] === 'כן'
    return { weight: WEIGHTS[key], similarity: isCarrierFree(donor) === expectedValue ? 1 : 0, label: 'נשאויות' }
  }
  if (key === 'cmvNegative') {
    const expectedValue = expected[0] === 'כן'
    return { weight: WEIGHTS[key], similarity: donor.cmvIgg ? (isCmvNegative(donor) === expectedValue ? 1 : 0) : 0.25, label: 'CMV' }
  }
  if (key === 'eyeColor') {
    const actual = eyeShade(donor.eyeColor)
    return { weight: WEIGHTS[key], similarity: actual ? (actual === expected[0] ? 1 : 0) : 0.25, label: 'גוון עיניים' }
  }
  const field = key === 'skinColor' ? donor.skinColor : donor.religion
  const labels = { religion: 'דת', skinColor: 'גוון עור' }
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
