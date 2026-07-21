import { describe, expect, it } from 'vitest'

import { userDonorRecord } from './userDonors.js'

describe('user donor projection', () => {
  it('returns only fields intended for the user app', () => {
    const result = userDonorRecord('donor-1', {
      donorNumber: 'Donor 1001',
      geneticCarrierStatus: 'שלילי',
      occupation: 'מהנדס',
      origin: 'ישראל',
      religion: 'יהודי',
      skinColor: 'בהיר',
      eyeColor: 'כחול',
      hairColor: 'חום, גלי',
      heightMeters: 1.8,
      weightKg: 80,
      cmvIgg: 'שלילי',
      createdBy: 'admin@example.com',
      importId: 'private-import',
      profileImageInput: { prompt: 'private' },
      profileImage: { status: 'ready', inputHash: 'hash', storagePath: 'donor-profile-images/donor-1/hash.jpg' },
    })

    expect(result).toEqual({
      id: 'donor-1',
      donorNumber: 'Donor 1001',
      geneticCarrierStatus: 'שלילי',
      occupation: 'מהנדס',
      origin: 'ישראל',
      religion: 'יהודי',
      skinColor: 'בהיר',
      eyeColor: 'כחול',
      hairColor: 'חום, גלי',
      heightMeters: 1.8,
      weightKg: 80,
      cmvIgg: 'שלילי',
      profileImage: { status: 'ready', inputHash: 'hash', storagePath: 'donor-profile-images/donor-1/hash.jpg' },
    })
    expect(result).not.toHaveProperty('createdBy')
    expect(result).not.toHaveProperty('profileImageInput')
  })

  it('does not expose incomplete or non-ready profile image metadata', () => {
    expect(userDonorRecord('donor-1', {
      profileImage: { status: 'generating', inputHash: 'hash' },
    })).not.toHaveProperty('profileImage')
  })
})
