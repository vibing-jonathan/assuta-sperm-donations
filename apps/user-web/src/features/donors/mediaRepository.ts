import { auth } from '../../lib/firebase'
import { donorDisplayNumber } from './donor'

export const MEDIA_LOAD_TIMEOUT_MS = 45_000
export const DONOR_MEDIA_ENDPOINT = 'https://europe-west1-assuta-sperm-donations.cloudfunctions.net/getDonorMedia'

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

const mediaBlobCache = new Map<string, Promise<Blob>>()

async function downloadMediaBlob(path: string) {
  const user = auth.currentUser
  if (!user) throw new Error('User authentication is required.')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MEDIA_LOAD_TIMEOUT_MS)
  try {
    const response = await fetch(`${DONOR_MEDIA_ENDPOINT}?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Media download failed (${response.status}).`)
    return response.blob()
  } finally {
    clearTimeout(timeoutId)
  }
}

function storageBlob(path: string) {
  const cached = mediaBlobCache.get(path)
  if (cached) return cached
  const request = downloadMediaBlob(path)
  mediaBlobCache.set(path, request)
  request.catch(() => mediaBlobCache.delete(path))
  return request
}

export const firebaseDonorMediaRepository: DonorMediaRepository = {
  getProfileImage: storageBlob,
  getDetailPdf(donorNumber) {
    return storageBlob(donorDetailPdfPath(donorNumber))
  },
}
