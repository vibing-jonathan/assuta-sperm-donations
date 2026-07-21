export type GeneticCarrierStatus = 'חיובי' | 'שלילי'

export interface DonorProfileImage {
  status: 'pending' | 'generating' | 'ready' | 'failed'
  inputHash: string
  storagePath?: string
}

export interface Donor {
  id: string
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
  profileImage?: DonorProfileImage
}

export function donorDisplayNumber(value: string) {
  return value.normalize('NFKC').replace(/[﹡＊∗]/g, '*').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

export function isCarrierFree(donor: Donor) {
  return donor.geneticCarrierStatus === 'שלילי'
}

export function isCmvNegative(donor: Donor) {
  return donor.cmvIgg.normalize('NFKC').trim() === 'שלילי'
}
