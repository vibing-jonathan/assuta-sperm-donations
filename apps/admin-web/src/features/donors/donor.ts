export interface DonorInput {
  donorNumber: string
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
}

export const emptyDonorInput: DonorInput = {
  donorNumber: '',
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
  if (input.heightMeters !== null && (input.heightMeters < 1 || input.heightMeters > 2.5)) {
    return 'הגובה חייב להיות בין 1 ל-2.5 מטר.'
  }
  if (input.weightKg !== null && (input.weightKg < 30 || input.weightKg > 300)) {
    return 'המשקל חייב להיות בין 30 ל-300 ק״ג.'
  }
  return null
}
