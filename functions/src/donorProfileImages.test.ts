import { describe, expect, it } from 'vitest'

import {
  canonicalProfileInput,
  isTransientProfileError,
  profileImageStoragePath,
  profileInputHash,
  profileJobId,
  readDonorProfileImageInput,
  summaryProfileInput,
} from './donorProfileImages.js'

const input = {
  sourceVersion: 'catalog-detail-v1',
  build: 'athletic',
  skin: 'fair',
  hair: 'brown, wavy',
  eyes: 'green',
  facialDetails: ['long eyelashes'],
  maternalAppearance: 'blue eyes',
  paternalAppearance: 'brown hair',
}

describe('donor profile image jobs', () => {
  it('uses stable content-addressed IDs and immutable object paths', () => {
    const firstHash = profileInputHash(input)
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/)
    expect(profileInputHash({ ...input })).toBe(firstHash)
    expect(profileJobId('donor-1', firstHash)).toMatch(/^[a-f0-9]{64}$/)
    expect(profileImageStoragePath('donor-1', firstHash))
      .toBe(`donor-profile-images/donor-1/${firstHash}.jpg`)
    expect(canonicalProfileInput(input)).toContain('profile-v1')
  })

  it('changes the hash when a generation-relevant trait changes', () => {
    expect(profileInputHash({ ...input, eyes: 'blue' })).not.toBe(profileInputHash(input))
  })

  it('validates bounded structured inputs without donor identifiers', () => {
    expect(readDonorProfileImageInput(input)).toEqual(input)
    expect(() => readDonorProfileImageInput({ ...input, hair: '' })).toThrow('Required profile fields')
    expect(() => readDonorProfileImageInput({ ...input, skin: 'x'.repeat(501) })).toThrow('Invalid skin')
  })

  it('creates a summary fallback only when all visible traits exist', () => {
    expect(summaryProfileInput({ skinColor: 'fair', hairColor: 'brown', eyeColor: 'blue' }))
      .toEqual(expect.objectContaining({ sourceVersion: 'manual-summary-v1', skin: 'fair' }))
    expect(summaryProfileInput({ skinColor: 'fair', hairColor: '', eyeColor: 'blue' })).toBeNull()
  })

  it('retries only transient provider and network-class statuses', () => {
    expect(isTransientProfileError({ status: 429 })).toBe(true)
    expect(isTransientProfileError({ code: 503 })).toBe(true)
    expect(isTransientProfileError(new TypeError('fetch failed'))).toBe(true)
    expect(isTransientProfileError({ code: 'ECONNRESET' })).toBe(true)
    expect(isTransientProfileError({ status: 400 })).toBe(false)
  })
})
