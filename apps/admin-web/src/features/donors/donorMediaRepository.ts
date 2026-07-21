import { auth } from '../../lib/firebase'

export const DONOR_MEDIA_ENDPOINT = 'https://europe-west1-assuta-sperm-donations.cloudfunctions.net/getDonorMedia'

export function donorMediaUrl(storagePath: string) {
  return `${DONOR_MEDIA_ENDPOINT}?path=${encodeURIComponent(storagePath)}`
}

export async function getDonorMediaBlob(storagePath: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Administrator authentication is required.')
  const response = await fetch(donorMediaUrl(storagePath), {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  })
  if (!response.ok) throw new Error(`Donor media download failed (${response.status}).`)
  return response.blob()
}
