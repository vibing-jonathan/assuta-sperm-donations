import { describe, expect, it } from 'vitest'

import {
  InvalidAdminProfileImageError,
  MAX_ADMIN_PROFILE_IMAGE_BYTES,
  readAdminProfileImageUpload,
} from './uploadDonorProfileImage.js'

function jpeg(payload = 'image') {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(payload), Buffer.from([0xff, 0xd9])])
}

describe('administrator profile image uploads', () => {
  it('validates JPEG data and creates a content-addressed private path', () => {
    const first = readAdminProfileImageUpload('donor_1', 'image/jpeg', jpeg())
    const second = readAdminProfileImageUpload('donor_1', 'image/jpeg', jpeg())
    expect(first.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.storagePath).toBe(`donor-profile-images/donor_1/${first.inputHash}.jpg`)
    expect(second.storagePath).toBe(first.storagePath)
  })

  it('rejects invalid identifiers, formats, and disguised content', () => {
    expect(() => readAdminProfileImageUpload('../donor', 'image/jpeg', jpeg()))
      .toThrow(InvalidAdminProfileImageError)
    expect(() => readAdminProfileImageUpload('donor-1', 'image/png', jpeg()))
      .toThrow('Only JPEG')
    expect(() => readAdminProfileImageUpload('donor-1', 'image/jpeg', Buffer.from('not an image')))
      .toThrow('Invalid JPEG')
  })

  it('rejects oversized images', () => {
    const bytes = Buffer.alloc(MAX_ADMIN_PROFILE_IMAGE_BYTES + 1, 0xff)
    expect(() => readAdminProfileImageUpload('donor-1', 'image/jpeg', bytes)).toThrow('Invalid image size')
  })
})
