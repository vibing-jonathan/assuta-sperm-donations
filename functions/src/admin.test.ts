import { describe, expect, it } from 'vitest'

import { getVerifiedAdminEmail } from './admin.js'

describe('verified admin authorization', () => {
  it('accepts a verified allowlisted administrator', () => {
    expect(getVerifiedAdminEmail({
      token: { email: 'JGabbayJ@gmail.com', email_verified: true },
    })).toBe('jgabbayj@gmail.com')
  })

  it('rejects unverified and non-allowlisted accounts', () => {
    expect(getVerifiedAdminEmail({
      token: { email: 'robieis153@gmail.com', email_verified: false },
    })).toBeNull()
    expect(getVerifiedAdminEmail({
      token: { email: 'other@example.com', email_verified: true },
    })).toBeNull()
  })
})
