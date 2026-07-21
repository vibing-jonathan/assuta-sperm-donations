import type { Unsubscribe, User } from 'firebase/auth'

import { auth, firebaseApp } from '../../lib/firebase'

export interface UserAppCredential {
  username: string
  password: string
}

export type UserSessionState = 'loading' | 'anonymous' | 'authenticated'

export interface UserAccessService {
  observe(onChange: (state: UserSessionState) => void): Unsubscribe
  login(credential: UserAppCredential): Promise<void>
  logout(): Promise<void>
}

async function isAuthorizedUser(user: User | null) {
  if (!user) return false
  try {
    return (await user.getIdTokenResult()).claims.userApp === true
  } catch {
    return false
  }
}

export function loginErrorMessage(error: unknown) {
  const code = (error as { code?: unknown })?.code
  if (code === 'functions/invalid-argument') return 'יש למלא שם משתמש וסיסמה.'
  if (code === 'functions/permission-denied') return 'שם המשתמש או הסיסמה אינם נכונים.'
  return 'לא הצלחנו להתחבר כרגע. בדקי את החיבור ונסי שוב.'
}

export const firebaseUserAccessService: UserAccessService = {
  observe(onChange) {
    let active = true
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      const authorized = await isAuthorizedUser(user)
      if (!active) return
      if (user && !authorized) await auth.signOut()
      onChange(authorized ? 'authenticated' : 'anonymous')
    })
    return () => {
      active = false
      unsubscribe()
    }
  },

  async login(credential) {
    const { getFunctions, httpsCallable } = await import('firebase/functions')
    const { browserSessionPersistence, setPersistence, signInWithCustomToken } = await import('firebase/auth')
    const login = httpsCallable<UserAppCredential, { token: string }>(
      getFunctions(firebaseApp, 'europe-west1'),
      'loginUserApp',
    )
    await setPersistence(auth, browserSessionPersistence)
    const response = await login({
      username: credential.username.trim(),
      password: credential.password,
    })
    if (typeof response.data.token !== 'string' || !response.data.token) {
      throw new Error('Invalid login response.')
    }
    await signInWithCustomToken(auth, response.data.token)
  },

  logout() {
    return auth.signOut()
  },
}
