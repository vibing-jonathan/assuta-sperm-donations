import { describe, expect, it, vi } from 'vitest'

import {
  createUserAppSession,
  InvalidUserAppCredentialError,
  InvalidUserAppLoginRequestError,
  readStoredUserAppCredential,
  readUserAppLoginRequest,
  userAppCredentialsMatch,
} from './userAppAccess.js'

describe('user app access', () => {
  it('normalizes the username but preserves the password', () => {
    expect(readUserAppLoginRequest({ username: '  clinic  ', password: ' secret ' }))
      .toEqual({ username: 'clinic', password: ' secret ' })
  })

  it('rejects malformed requests without exposing credential details', () => {
    expect(() => readUserAppLoginRequest({ username: '', password: '' }))
      .toThrow(InvalidUserAppLoginRequestError)
    expect(() => readUserAppLoginRequest(null)).toThrow(InvalidUserAppLoginRequestError)
  })

  it('reads only valid stored credentials', () => {
    expect(readStoredUserAppCredential({ username: ' clinic ', password: 'secret' }))
      .toEqual({ username: 'clinic', password: 'secret' })
    expect(readStoredUserAppCredential({ username: 'clinic' })).toBeNull()
  })

  it('compares the complete credential pair', () => {
    const stored = { username: 'clinic', password: 'secret' }
    expect(userAppCredentialsMatch(stored, stored)).toBe(true)
    expect(userAppCredentialsMatch({ ...stored, password: 'wrong' }, stored)).toBe(false)
    expect(userAppCredentialsMatch({ ...stored, username: 'other' }, stored)).toBe(false)
  })

  it('creates a restricted custom token only for a valid credential', async () => {
    const createToken = vi.fn(async () => 'custom-token')
    await expect(createUserAppSession(
      { username: 'clinic', password: 'secret' },
      async () => ({ username: 'clinic', password: 'secret' }),
      createToken,
    )).resolves.toBe('custom-token')
    expect(createToken).toHaveBeenCalledWith('shared-user-app', { userApp: true })

    await expect(createUserAppSession(
      { username: 'clinic', password: 'wrong' },
      async () => ({ username: 'clinic', password: 'secret' }),
      createToken,
    )).rejects.toBeInstanceOf(InvalidUserAppCredentialError)
  })
})
