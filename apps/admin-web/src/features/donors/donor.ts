import { verifyListField, type DonorListField } from './donorFieldRules'
import type { GeneticCarrierStatus } from './donorNumberMetadata'

export interface DonorInput {
  donorNumber: string
  geneticCarrierStatus: GeneticCarrierStatus
  occupation: string
  origin: string
  religion: string
  skinColor: string
  eyeColor: string
  hairColor: string
  heightMeters: number | null
  weightKg: number | null
  cmvIgg: string
}

export interface Donor extends DonorInput {
  id: string
  importId?: string
  profileImage?: {
    status: 'pending' | 'generating' | 'ready' | 'failed'
    inputHash: string
    storagePath?: string
    errorCode?: string
  }
}

export const emptyDonorInput: DonorInput = {
  donorNumber: '',
  geneticCarrierStatus: 'חיובי',
  occupation: '',
  origin: '',
  religion: '',
  skinColor: '',
  eyeColor: '',
  hairColor: '',
  heightMeters: null,
  weightKg: null,
  cmvIgg: '',
}

export function validateDonor(input: DonorInput) {
  if (!input.donorNumber.trim()) return 'יש להזין מספר תורם.'
  const listFields: DonorListField[] = ['origin', 'religion', 'skinColor', 'eyeColor', 'hairColor']
  for (const field of listFields) {
    const fieldError = verifyListField(field, input[field])
    if (fieldError) return fieldError
  }
  if (input.heightMeters !== null && (input.heightMeters < 1 || input.heightMeters > 2.5)) {
    return 'הגובה חייב להיות בין 1 ל-2.5 מטר.'
  }
  if (input.weightKg !== null && (input.weightKg < 30 || input.weightKg > 300)) {
    return 'המשקל חייב להיות בין 30 ל-300 ק״ג.'
  }
  return null
}

export type DonorValidationField =
  | 'donorNumber'
  | 'occupation'
  | DonorListField
  | 'heightMeters'
  | 'weightKg'
  | 'cmvIgg'

export type DonorValidationErrors = Partial<Record<DonorValidationField, string>>

export function normalizeDonorNumber(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('he')
}

export function donorNumberClaimId(value: string) {
  return Array.from(new TextEncoder().encode(normalizeDonorNumber(value)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function validateImportDonor(input: DonorInput): DonorValidationErrors {
  const errors: DonorValidationErrors = {}
  const donorNumber = input.donorNumber.trim()
  if (!donorNumber) errors.donorNumber = 'חובה להזין מספר תורם.'
  else if (donorNumber.length > 100) errors.donorNumber = 'מספר התורם ארוך מדי (עד 100 תווים).'

  if (input.occupation.length > 200) errors.occupation = 'שדה העיסוק ארוך מדי (עד 200 תווים).'
  const importListFields: DonorListField[] = ['origin', 'religion', 'skinColor', 'eyeColor', 'hairColor']
  for (const field of importListFields) {
    const fieldError = verifyListField(field, input[field])
    if (fieldError) errors[field] = fieldError
  }

  if (input.heightMeters === null || !Number.isFinite(input.heightMeters)) {
    errors.heightMeters = 'חובה להזין גובה.'
  } else if (input.heightMeters < 1 || input.heightMeters > 2.5) {
    errors.heightMeters = 'הגובה חייב להיות בין 1 ל-2.5 מטר.'
  }

  if (input.weightKg === null || !Number.isFinite(input.weightKg)) {
    errors.weightKg = 'חובה להזין משקל.'
  } else if (input.weightKg < 30 || input.weightKg > 300) {
    errors.weightKg = 'המשקל חייב להיות בין 30 ל-300 ק״ג.'
  }

  if (!['חיובי', 'שלילי'].includes(input.cmvIgg.trim())) {
    errors.cmvIgg = 'יש לבחור תוצאת CMV IgG: חיובי או שלילי.'
  }
  return errors
}
