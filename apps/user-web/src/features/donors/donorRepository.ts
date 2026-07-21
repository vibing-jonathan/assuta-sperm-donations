import { firebaseApp } from '../../lib/firebase'
import type { Donor, DonorProfileImage } from './donor'

export interface DonorRepository {
  subscribe(onData: (donors: Donor[]) => void, onError: (error: Error) => void): Promise<() => void>
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function donorFromData(id: string, rawData: unknown): Donor {
  const data = rawData && typeof rawData === 'object' ? rawData as Record<string, unknown> : {}
  const profile = data.profileImage && typeof data.profileImage === 'object'
    ? data.profileImage as Record<string, unknown>
    : null
  const status = profile?.status
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
    ...(profile && ['pending', 'generating', 'ready', 'failed'].includes(String(status))
      && typeof profile.inputHash === 'string' ? { profileImage: {
        status: status as DonorProfileImage['status'],
        inputHash: profile.inputHash,
        ...(typeof profile.storagePath === 'string' ? { storagePath: profile.storagePath } : {}),
      } } : {}),
  }
}

export const firebaseDonorRepository: DonorRepository = {
  async subscribe(onData, onError) {
    const { getFunctions, httpsCallable } = await import('firebase/functions')
    const loadDonors = httpsCallable<void, { donors: unknown[] }>(
      getFunctions(firebaseApp, 'europe-west1'),
      'listUserDonors',
    )
    try {
      const response = await loadDonors()
      onData(Array.isArray(response.data.donors)
        ? response.data.donors.map((item) => {
            const id = item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
              ? (item as { id: string }).id
              : ''
            return donorFromData(id, item)
          }).filter((donor) => donor.id && donor.donorNumber)
        : [])
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Donors could not be loaded.'))
    }
    return () => undefined
  },
}
