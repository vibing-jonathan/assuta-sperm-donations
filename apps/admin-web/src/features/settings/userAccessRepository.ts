import { getDatabase } from '../../lib/firebase'

export const USER_ACCESS_SETTINGS_PATH = 'appSettings/userAccess'

export interface UserAccessCredential {
  username: string
  password: string
}

export interface UserAccessSettings extends UserAccessCredential {
  updatedAt?: unknown
  updatedBy?: string
}

export interface UserAccessRepository {
  get(): Promise<UserAccessSettings | null>
  save(credential: UserAccessCredential, adminEmail: string): Promise<void>
}

export interface UserAccessValidationErrors {
  username?: string
  password?: string
}

export function validateUserAccessCredential(credential: UserAccessCredential): UserAccessValidationErrors {
  const errors: UserAccessValidationErrors = {}
  const username = credential.username.trim()

  if (!username) errors.username = 'יש להזין שם משתמש משותף.'
  else if (username.length > 100) errors.username = 'שם המשתמש יכול להכיל עד 100 תווים.'

  if (!credential.password.trim()) errors.password = 'יש להזין סיסמה משותפת.'
  else if (credential.password.length > 200) errors.password = 'הסיסמה יכולה להכיל עד 200 תווים.'

  return errors
}

export const firestoreUserAccessRepository: UserAccessRepository = {
  async get() {
    const { doc, getDoc } = await import('firebase/firestore')
    const database = await getDatabase()
    const snapshot = await getDoc(doc(database, USER_ACCESS_SETTINGS_PATH))
    if (!snapshot.exists()) return null

    const data = snapshot.data()
    return {
      username: typeof data.username === 'string' ? data.username : '',
      password: typeof data.password === 'string' ? data.password : '',
      updatedAt: data.updatedAt,
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    }
  },

  async save(credential, adminEmail) {
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore')
    const database = await getDatabase()
    await setDoc(doc(database, USER_ACCESS_SETTINGS_PATH), {
      username: credential.username.trim(),
      password: credential.password,
      updatedAt: serverTimestamp(),
      updatedBy: adminEmail,
    })
  },
}
