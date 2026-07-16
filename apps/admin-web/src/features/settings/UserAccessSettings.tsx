import { type FormEvent, useEffect, useState } from 'react'

import {
  firestoreUserAccessRepository,
  type UserAccessCredential,
  type UserAccessRepository,
  type UserAccessValidationErrors,
  validateUserAccessCredential,
} from './userAccessRepository'

interface UserAccessSettingsProps {
  adminEmail: string
  repository?: UserAccessRepository
}

export function UserAccessSettings({
  adminEmail,
  repository = firestoreUserAccessRepository,
}: UserAccessSettingsProps) {
  const [credential, setCredential] = useState<UserAccessCredential>({ username: '', password: '' })
  const [validationErrors, setValidationErrors] = useState<UserAccessValidationErrors>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    void repository.get().then((storedCredential) => {
      if (!active) return
      if (storedCredential) {
        setCredential({ username: storedCredential.username, password: storedCredential.password })
      } else {
        setError('פרטי הגישה טרם הוגדרו. הזינו ושמרו פרטים חדשים.')
      }
    }).catch(() => {
      if (active) setError('לא ניתן לטעון את פרטי הגישה. נסו שוב מאוחר יותר.')
    }).finally(() => {
      if (active) setIsLoading(false)
    })

    return () => {
      active = false
    }
  }, [repository])

  function updateField(field: keyof UserAccessCredential, value: string) {
    setCredential((current) => ({ ...current, [field]: value }))
    setValidationErrors((current) => ({ ...current, [field]: undefined }))
    setError('')
    setSuccess('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateUserAccessCredential(credential)
    setValidationErrors(errors)
    setError('')
    setSuccess('')
    if (Object.keys(errors).length > 0) return

    setIsSaving(true)
    try {
      const normalizedCredential = { ...credential, username: credential.username.trim() }
      await repository.save(normalizedCredential, adminEmail)
      setCredential(normalizedCredential)
      setSuccess('פרטי הגישה נשמרו בהצלחה.')
    } catch {
      setError('שמירת פרטי הגישה נכשלה. לא בוצע שינוי, נסו שוב.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="settings-workspace" aria-labelledby="settings-title">
      <header className="workspace-header">
        <div>
          <p className="workspace-kicker">הגדרות מערכת</p>
          <h1 id="settings-title">פרטי גישה לאפליקציית המשתמשים</h1>
          <p>ניהול שם המשתמש והסיסמה המשותפים לכל משתמשי האפליקציה.</p>
        </div>
      </header>

      <aside className="settings-security-note" aria-label="הערת אבטחה">
        <strong>גישה משותפת ברמת אבטחה בסיסית</strong>
        <p>אלו פרטים משותפים ולא חשבונות אישיים. יש להפיץ אותם רק למשתמשים המורשים.</p>
      </aside>

      <form className="settings-card" onSubmit={(event) => void submit(event)} noValidate>
        <div className="settings-card-heading">
          <div>
            <h2>פרטי הגישה המשותפים</h2>
            <p>השינוי יחול על כל משתמשי אפליקציית המשתמשים.</p>
          </div>
          {isLoading && <span className="settings-loading" role="status">טוען פרטים…</span>}
        </div>

        <div className="settings-fields" aria-busy={isLoading || isSaving}>
          <div className="settings-field">
            <label htmlFor="shared-username">שם משתמש משותף</label>
            <input
              id="shared-username"
              autoComplete="username"
              disabled={isLoading || isSaving}
              maxLength={100}
              value={credential.username}
              aria-invalid={Boolean(validationErrors.username)}
              aria-describedby={validationErrors.username ? 'shared-username-error' : undefined}
              onChange={(event) => updateField('username', event.target.value)}
            />
            {validationErrors.username && <small id="shared-username-error" className="field-error">{validationErrors.username}</small>}
          </div>

          <div className="settings-field">
            <label htmlFor="shared-password">סיסמה משותפת</label>
            <span className="password-input-wrap">
              <input
                id="shared-password"
                type={isPasswordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                disabled={isLoading || isSaving}
                maxLength={200}
                value={credential.password}
                dir="ltr"
                aria-invalid={Boolean(validationErrors.password)}
                aria-describedby={validationErrors.password ? 'shared-password-error' : undefined}
                onChange={(event) => updateField('password', event.target.value)}
              />
              <button
                type="button"
                disabled={isLoading || isSaving}
                aria-label={isPasswordVisible ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
              >
                {isPasswordVisible ? 'הסתרה' : 'הצגה'}
              </button>
            </span>
            {validationErrors.password && <small id="shared-password-error" className="field-error">{validationErrors.password}</small>}
          </div>
        </div>

        {error && <p className="inline-alert" role="alert">{error}</p>}
        {success && <p className="settings-success" role="status">{success}</p>}

        <div className="settings-actions">
          <button className="primary-button" type="submit" disabled={isLoading || isSaving}>
            {isSaving ? 'שומר פרטים…' : 'שמירת פרטי גישה'}
          </button>
        </div>
      </form>
    </section>
  )
}
