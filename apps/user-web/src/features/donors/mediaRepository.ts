import { firebaseApp } from '../../lib/firebase'
import { donorDisplayNumber } from './donor'

export const MEDIA_LOAD_TIMEOUT_MS = 45_000

export interface DonorMediaRepository {
  getProfileImage(storagePath: string): Promise<Blob>
  getDetailPdf(donorNumber: string): Promise<Blob>
}

export function normalizeDonorNumber(value: string) {
  return donorDisplayNumber(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('he')
}

export function donorStorageKey(value: string) {
  return Array.from(new TextEncoder().encode(normalizeDonorNumber(value)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function donorDetailPdfPath(donorNumber: string) {
  return `donor-pages/${donorStorageKey(donorNumber)}/details.pdf`
}

async function storageBlob(path: string) {
  const { getBlob, getStorage, ref } = await import('firebase/storage')
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      getBlob(ref(getStorage(firebaseApp), path)),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Media download timed out.')), MEDIA_LOAD_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export const firebaseDonorMediaRepository: DonorMediaRepository = {
  getProfileImage: storageBlob,
  getDetailPdf(donorNumber) {
    return storageBlob(donorDetailPdfPath(donorNumber))
  },
}
