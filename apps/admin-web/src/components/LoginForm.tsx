import { useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { signInWithEmailAndPassword, type Auth } from 'firebase/auth'

interface LoginFormProps {
  auth: Auth
}

export function LoginForm({ auth }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (signInError) {
      setError(
        signInError instanceof FirebaseError
          ? 'פרטי ההתחברות שגויים או שהחשבון אינו זמין.'
          : 'לא ניתן להתחבר כרגע. נסו שוב מאוחר יותר.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell" dir="rtl">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand" aria-hidden="true"><span>⚕</span></div>
        <p className="app-eyebrow">כניסת מנהלים</p>
        <h1 id="login-title">ברוכים הבאים</h1>
        <p className="auth-description">מערכת ניהול קלינית מאובטחת</p>

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
            {isSubmitting ? 'מתבצעת התחברות…' : 'כניסה למערכת ←'}
          </button>
        </form>
      </section>
      <footer className="auth-footer">מערכת מאובטחת · שימוש מורשה בלבד</footer>
    </main>
  )
}
