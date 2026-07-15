import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { isAllowedAdmin } from '../config/admin'
import { ApiError, type AdminPrincipal, verifyAdminAccess } from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { LoginForm } from './LoginForm'

type AuthState =
  | { status: 'loading' | 'signed-out' | 'checking' | 'configuration-error' }
  | { status: 'authorized'; principal: AdminPrincipal }
  | { status: 'forbidden'; email: string }
  | { status: 'error'; message: string }

interface AuthGateProps {
  children: (principal: AdminPrincipal) => ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setState({ status: 'configuration-error' })
      return
    }

    let validationId = 0
    let disposed = false
    let controller: AbortController | null = null

    async function validateSession(session: Session | null) {
      const currentValidationId = ++validationId
      controller?.abort()
      controller = new AbortController()

      if (!session) {
        setState({ status: 'signed-out' })
        return
      }

      const email = session.user.email ?? ''
      if (!isAllowedAdmin(email)) {
        setState({ status: 'forbidden', email })
        return
      }

      setState({ status: 'checking' })
      try {
        const principal = await verifyAdminAccess(session.access_token, controller.signal)
        if (!disposed && currentValidationId === validationId) {
          setState({ status: 'authorized', principal })
        }
      } catch (error) {
        if (disposed || currentValidationId !== validationId) return
        if (error instanceof DOMException && error.name === 'AbortError') return

        if (error instanceof ApiError && error.status === 403) {
          setState({ status: 'forbidden', email })
          return
        }
        setState({
          status: 'error',
          message: 'לא ניתן לאמת את ההרשאה כרגע. ודאו ששירות ה-API פועל ונסו שוב.',
        })
      }
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => void validateSession(session))
    })

    return () => {
      disposed = true
      controller?.abort()
      data.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase?.auth.signOut()
  }

  if (state.status === 'configuration-error') {
    return (
      <SystemMessage
        title="החיבור ל-Supabase אינו מוגדר"
        description="חסרים כתובת הפרויקט או המפתח הציבורי בסביבת ההרצה."
      />
    )
  }

  if (state.status === 'loading' || state.status === 'checking') {
    return (
      <SystemMessage
        title="מאמתים הרשאה…"
        description="המערכת בודקת את חשבון המנהל."
      />
    )
  }

  if (state.status === 'signed-out') {
    return supabase ? <LoginForm client={supabase} /> : null
  }

  if (state.status === 'forbidden') {
    return (
      <SystemMessage
        title="אין הרשאת מנהל לחשבון זה"
        description={state.email || 'החשבון המחובר אינו מורשה לגשת למערכת.'}
        actionLabel="יציאה"
        onAction={signOut}
      />
    )
  }

  if (state.status === 'error') {
    return (
      <SystemMessage
        title="שגיאה באימות"
        description={state.message}
        actionLabel="יציאה וכניסה מחדש"
        onAction={signOut}
      />
    )
  }

  if (state.status !== 'authorized') return null

  return children(state.principal)
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
