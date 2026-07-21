export interface UserDonorRecord {
  id: string
  donorNumber: string
  geneticCarrierStatus: 'חיובי' | 'שלילי'
  occupation: string
  origin: string
  religion: string
  skinColor: string
  eyeColor: string
  hairColor: string
  heightMeters: number | null
  weightKg: number | null
  cmvIgg: string
  profileImage?: {
    status: 'ready'
    inputHash: string
    storagePath: string
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function userDonorRecord(id: string, rawData: unknown): UserDonorRecord {
  const data = rawData && typeof rawData === 'object' ? rawData as Record<string, unknown> : {}
  const profile = data.profileImage && typeof data.profileImage === 'object'
    ? data.profileImage as Record<string, unknown>
    : null
  return {
    id,
    donorNumber: stringValue(data.donorNumber),
    geneticCarrierStatus: data.geneticCarrierStatus === 'שלילי' ? 'שלילי' : 'חיובי',
    occupation: stringValue(data.occupation),
    origin: stringValue(data.origin),
    religion: stringValue(data.religion),
    skinColor: stringValue(data.skinColor),
    eyeColor: stringValue(data.eyeColor),
    hairColor: stringValue(data.hairColor),
    heightMeters: numberValue(data.heightMeters),
    weightKg: numberValue(data.weightKg),
    cmvIgg: stringValue(data.cmvIgg),
    ...(profile?.status === 'ready'
      && typeof profile.inputHash === 'string'
      && typeof profile.storagePath === 'string'
      ? { profileImage: {
          status: 'ready' as const,
          inputHash: profile.inputHash,
          storagePath: profile.storagePath,
        } }
      : {}),
  }
}
