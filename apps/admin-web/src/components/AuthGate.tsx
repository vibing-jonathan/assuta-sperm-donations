import { useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
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
