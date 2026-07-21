import { createHash, timingSafeEqual } from 'node:crypto'

export const USER_ACCESS_SETTINGS_PATH = 'appSettings/userAccess'
export const USER_APP_AUTH_UID = 'shared-user-app'

export interface UserAppCredential {
  username: string
  password: string
}

export class InvalidUserAppLoginRequestError extends Error {}
export class InvalidUserAppCredentialError extends Error {}

export function readUserAppLoginRequest(value: unknown): UserAppCredential {
  if (!value || typeof value !== 'object') throw new InvalidUserAppLoginRequestError()
  const input = value as Record<string, unknown>
  if (typeof input.username !== 'string' || typeof input.password !== 'string') {
    throw new InvalidUserAppLoginRequestError()
  }
  const username = input.username.normalize('NFKC').trim()
  const password = input.password
  if (!username || username.length > 100 || !password.trim() || password.length > 200) {
    throw new InvalidUserAppLoginRequestError()
  }
  return { username, password }
}

export function readStoredUserAppCredential(value: unknown): UserAppCredential | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.username !== 'string' || typeof input.password !== 'string') return null
  const username = input.username.normalize('NFKC').trim()
  if (!username || !input.password) return null
  return { username, password: input.password }
}

function credentialDigest(credential: UserAppCredential) {
  return createHash('sha256')
    .update(credential.username.normalize('NFKC').trim(), 'utf8')
    .update('\0', 'utf8')
    .update(credential.password, 'utf8')
    .digest()
}

export function userAppCredentialsMatch(candidate: UserAppCredential, stored: UserAppCredential) {
  return timingSafeEqual(credentialDigest(candidate), credentialDigest(stored))
}

export async function createUserAppSession(
  rawRequest: unknown,
  loadCredential: () => Promise<unknown>,
  createToken: (uid: string, claims: Record<string, unknown>) => Promise<string>,
) {
  const candidate = readUserAppLoginRequest(rawRequest)
  const stored = readStoredUserAppCredential(await loadCredential())
  if (!stored || !userAppCredentialsMatch(candidate, stored)) {
    throw new InvalidUserAppCredentialError()
  }
  return createToken(USER_APP_AUTH_UID, { userApp: true })
}
