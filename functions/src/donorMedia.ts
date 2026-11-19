import { getAllowedAdminEmail } from './admin.js'

const PROFILE_IMAGE_PATH = /^donor-profile-images\/[A-Za-z0-9_-]{1,128}\/[a-f0-9]{64}(\.thumbnail|\.display-512)?\.jpg$/
const DETAIL_PDF_PATH = /^donor-pages\/[a-f0-9]{2,800}\/details\.pdf$/

export class InvalidDonorMediaPathError extends Error {}

export function readDonorMediaPath(value: unknown) {
  if (typeof value !== 'string') throw new InvalidDonorMediaPathError('Invalid media path.')
  const path = value.normalize('NFKC').trim()
  if (!PROFILE_IMAGE_PATH.test(path) && !DETAIL_PDF_PATH.test(path)) {
    throw new InvalidDonorMediaPathError('Invalid media path.')
  }
  return path
}

export function donorMediaContentType(path: string) {
  return path.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf'
}

export function canReadDonorMedia(token: Record<string, unknown>) {
  return token.userApp === true || getAllowedAdminEmail({ token }) !== null
}
