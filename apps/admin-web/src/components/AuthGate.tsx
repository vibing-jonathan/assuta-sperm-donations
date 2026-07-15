import { useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signOut,
  type User,
} from 'firebase/auth'

import { isAllowedAdmin } from '../config/admin'
import { auth } from '../lib/firebase'
import { LoginForm } from './LoginForm'

type AuthState =
  | { status: 'loading' | 'signed-out' }
  | { status: 'authorized'; user: User }
  | { status: 'forbidden'; email: string }
  | { status: 'unverified'; user: User }
  | { status: 'error' }

interface AuthGateProps {
  children: (user: User) => ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(
    () =>
      onAuthStateChanged(
        auth,
        (user) => {
          if (!user) {
            setState({ status: 'signed-out' })
            return
          }

          const email = user.email ?? ''
          if (!isAllowedAdmin(email)) {
            setState({ status: 'forbidden', email })
            return
          }

          if (!user.emailVerified) {
            setState({ status: 'unverified', user })
            return
          }

          setState({ status: 'authorized', user })
        },
        () => setState({ status: 'error' }),
      ),
    [],
  )

  if (state.status === 'loading') {
    return <SystemMessage title="מאמתים הרשאה…" description="המערכת בודקת את חשבון המנהל." />
  }

  if (state.status === 'signed-out') {
    return <LoginForm auth={auth} />
  }

  if (state.status === 'forbidden') {
    return (
      <SystemMessage
        title="אין הרשאת מנהל לחשבון זה"
        description={state.email || 'החשבון המחובר אינו מורשה לגשת למערכת.'}
        actionLabel="יציאה"
        onAction={() => signOut(auth)}
      />
    )
  }

  if (state.status === 'unverified') {
    return <UnverifiedEmail user={state.user} />
  }

  if (state.status === 'error') {
    return (
      <SystemMessage
        title="שגיאה באימות"
        description="לא ניתן לאמת את ההרשאה כרגע. נסו להיכנס מחדש."
        actionLabel="יציאה"
        onAction={() => signOut(auth)}
      />
    )
  }

  if (state.status !== 'authorized') return null

  return children(state.user)
}

function UnverifiedEmail({ user }: { user: User }) {
  const [message, setMessage] = useState('יש לאמת את כתובת הדוא״ל לפני הכניסה למערכת.')
  const [isWorking, setIsWorking] = useState(false)

  async function sendVerification() {
    setIsWorking(true)
    try {
      await sendEmailVerification(user)
      setMessage('קישור אימות נשלח. לאחר האימות לחצו על ״בדיקה מחדש״.')
    } catch {
      setMessage('לא ניתן לשלוח קישור כרגע. נסו שוב מאוחר יותר.')
    } finally {
      setIsWorking(false)
    }
  }

  async function checkAgain() {
    setIsWorking(true)
    try {
      await reload(user)
      if (user.emailVerified) {
        window.location.reload()
      } else {
        setMessage('הכתובת עדיין אינה מאומתת.')
      }
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <main className="auth-shell" dir="rtl" aria-live="polite">
      <section className="auth-card">
        <h1>נדרש אימות דוא״ל</h1>
        <p className="auth-description">{message}</p>
        <div className="message-actions">
          <button
            className="primary-button"
            type="button"
            disabled={isWorking}
            onClick={() => void sendVerification()}
          >
            שליחת קישור אימות
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isWorking}
            onClick={() => void checkAgain()}
          >
            בדיקה מחדש
          </button>
          <button className="text-button" type="button" onClick={() => void signOut(auth)}>
            יציאה
          </button>
        </div>
      </section>
    </main>
  )
}

interface SystemMessageProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void | Promise<void>
}

function SystemMessage({ title, description, actionLabel, onAction }: SystemMessageProps) {
  return (
    <main className="auth-shell" dir="rtl" aria-live="polite">
      <section className="auth-card">
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {actionLabel && onAction && (
          <button className="secondary-button" type="button" onClick={() => void onAction()}>
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  )
}
