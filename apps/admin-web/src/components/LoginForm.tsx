import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

interface LoginFormProps {
  client: SupabaseClient
}

export function LoginForm({ client }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError('פרטי ההתחברות שגויים או שהחשבון אינו זמין.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell" dir="rtl">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="app-eyebrow">כניסת מנהלים</p>
        <h1 id="login-title">ברוכים הבאים</h1>
        <p className="auth-description">התחברו באמצעות חשבון מנהל מורשה.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            כתובת דוא״ל
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            סיסמה
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'מתבצעת התחברות…' : 'התחברות'}
          </button>
        </form>
      </section>
    </main>
  )
}
