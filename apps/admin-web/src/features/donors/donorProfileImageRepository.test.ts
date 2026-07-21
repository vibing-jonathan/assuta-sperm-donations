import { describe, expect, it } from 'vitest'

import {
  mapProfileImageUploadError,
  MAX_ADMIN_PROFILE_IMAGE_BYTES,
  validateAdminProfileImage,
} from './donorProfileImageRepository'

describe('profile image editing', () => {
  it('accepts bounded JPEG files', () => {
    expect(validateAdminProfileImage(new File(['jpeg'], 'profile.jpg', { type: 'image/jpeg' }))).toBeNull()
  })

  it('rejects other formats and oversized JPEG files', () => {
    expect(validateAdminProfileImage(new File(['png'], 'profile.png', { type: 'image/png' }))).toContain('JPEG')
    const oversized = new File([new Uint8Array(MAX_ADMIN_PROFILE_IMAGE_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' })
    expect(validateAdminProfileImage(oversized)).toContain('5MB')
  })

  it('maps safe server responses without exposing diagnostics', () => {
    expect(mapProfileImageUploadError(401, 'INVALID_AUTHENTICATION')).toContain('להתחבר מחדש')
    expect(mapProfileImageUploadError(400, 'INVALID_PROFILE_IMAGE')).toContain('JPEG תקין')
    expect(mapProfileImageUploadError(500, 'PROFILE_IMAGE_UPLOAD_FAILED')).toContain('נכשלה')
  })
})
