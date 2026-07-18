import { describe, expect, it } from 'vitest'

import { getAllowedAdminEmail } from './admin.js'

describe('admin authorization', () => {
  it('accepts an allowlisted administrator without email verification', () => {
    expect(getAllowedAdminEmail({
      token: { email: 'JGabbayJ@gmail.com', email_verified: false },
    })).toBe('jgabbayj@gmail.com')
  })

  it('rejects non-allowlisted accounts', () => {
    expect(getAllowedAdminEmail({
      token: { email: 'other@example.com', email_verified: true },
    })).toBeNull()
  })
})
