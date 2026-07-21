import { auth, firebaseApp } from '../../lib/firebase'

export interface DonorProfileImageRepository {
  getImageUrl(storagePath: string): Promise<string>
  uploadImage?(donorId: string, file: File): Promise<void>
}

export const MAX_ADMIN_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024

export function validateAdminProfileImage(file: File) {
  if (file.type !== 'image/jpeg') return 'יש לבחור תמונה בפורמט JPEG.'
  if (file.size === 0 || file.size > MAX_ADMIN_PROFILE_IMAGE_BYTES) return 'יש לבחור תמונת JPEG בגודל עד 5MB.'
  return null
}

const uploadErrorMessages = {
  authentication: 'החיבור למערכת פג. יש להתחבר מחדש ולנסות שוב.',
  authorization: 'אין לחשבון זה הרשאה להחליף תמונות פרופיל.',
  invalid: 'קובץ התמונה אינו JPEG תקין או שהוא גדול מ-5MB.',
  missing: 'התורם לא נמצא במאגר.',
  server: 'שמירת תמונת הפרופיל נכשלה. נסו שוב.',
  connection: 'לא ניתן להתחבר לשירות שמירת התמונות. בדקו את החיבור ונסו שוב.',
} as const

export function mapProfileImageUploadError(status: number, safeCode?: string) {
  if (status === 401 || safeCode === 'AUTHENTICATION_REQUIRED' || safeCode === 'INVALID_AUTHENTICATION') {
    return uploadErrorMessages.authentication
  }
  if (status === 403 || safeCode === 'ADMIN_ACCESS_REQUIRED') return uploadErrorMessages.authorization
  if (status === 400 || safeCode === 'INVALID_PROFILE_IMAGE') return uploadErrorMessages.invalid
  if (status === 404 || safeCode === 'DONOR_NOT_FOUND') return uploadErrorMessages.missing
  if (status >= 500 || safeCode === 'PROFILE_IMAGE_UPLOAD_FAILED') return uploadErrorMessages.server
  return uploadErrorMessages.connection
}

const imageUrlCache = new Map<string, Promise<string>>()

export const storageDonorProfileImageRepository: DonorProfileImageRepository = {
  getImageUrl(storagePath) {
    const cached = imageUrlCache.get(storagePath)
    if (cached) return cached
    const request = import('firebase/storage').then(async ({ getBlob, getStorage, ref }) => {
      const blob = await getBlob(ref(getStorage(firebaseApp), storagePath))
      return URL.createObjectURL(blob)
    })
    imageUrlCache.set(storagePath, request)
    request.catch(() => imageUrlCache.delete(storagePath))
    return request
  },
  async uploadImage(donorId, file) {
    const validationError = validateAdminProfileImage(file)
    if (validationError) throw new Error(validationError)
    const user = auth.currentUser
    if (!user) throw new Error(uploadErrorMessages.authentication)
    let response: Response
    try {
      response = await fetch('https://europe-west1-assuta-sperm-donations.cloudfunctions.net/uploadDonorProfileImage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'image/jpeg',
          'X-Donor-Id': donorId,
        },
        body: file,
      })
    } catch {
      throw new Error(uploadErrorMessages.connection)
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: unknown } | null
      throw new Error(mapProfileImageUploadError(
        response.status,
        typeof payload?.error === 'string' ? payload.error : undefined,
      ))
    }
    const payload = await response.json().catch(() => null) as { storagePath?: unknown } | null
    if (typeof payload?.storagePath !== 'string') throw new Error(uploadErrorMessages.server)
  },
}
