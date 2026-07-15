import { useEffect, useState, type FormEvent } from 'react'

import { emptyDonorInput, validateDonor, type Donor, type DonorInput } from './donor'
import { firestoreDonorRepository, type DonorRepository } from './donorRepository'

interface DonorManagementProps {
  adminEmail: string
  repository?: DonorRepository
}

const textFields: Array<{ key: keyof DonorInput; label: string; placeholder?: string }> = [
  { key: 'donorNumber', label: 'מס׳ תורם', placeholder: 'לדוגמה: 1024' },
  { key: 'occupation', label: 'עיסוק' },
  { key: 'origin', label: 'מוצא' },
  { key: 'religion', label: 'דת' },
  { key: 'skinColor', label: 'צבע עור' },
  { key: 'eyeColor', label: 'עיניים' },
  { key: 'hairColor', label: 'שיער' },
  { key: 'cmvIgg', label: 'CMV IgG' },
]

export function DonorManagement({
  adminEmail,
  repository = firestoreDonorRepository,
}: DonorManagementProps) {
  const [donors, setDonors] = useState<Donor[]>([])
  const [form, setForm] = useState<DonorInput>(emptyDonorInput)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let active = true

    void repository
      .subscribe(
        (nextDonors) => {
          if (!active) return
          setDonors(nextDonors)
          setIsLoading(false)
        },
        () => {
          if (!active) return
          setError('לא ניתן לטעון את רשימת התורמים. נסו שוב מאוחר יותר.')
          setIsLoading(false)
        },
      )
      .then((stop) => {
        if (active) unsubscribe = stop
        else stop()
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [repository])

  function updateTextField(key: keyof DonorInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateNumberField(key: 'heightMeters' | 'weightKg', value: string) {
    setForm((current) => ({ ...current, [key]: value === '' ? null : Number(value) }))
  }

  async function submitDonor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateDonor(form)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await repository.add(form, adminEmail)
      setForm(emptyDonorInput)
      setIsFormOpen(false)
    } catch {
      setError('שמירת התורם נכשלה. בדקו את החיבור ונסו שוב.')
    } finally {
      setIsSaving(false)
    }
  }

  async function removeDonor(donor: Donor) {
    if (!window.confirm(`למחוק את תורם ${donor.donorNumber}? לא ניתן לבטל פעולה זו.`)) return
    setError(null)
    try {
      await repository.remove(donor.id)
    } catch {
      setError('מחיקת התורם נכשלה. נסו שוב.')
    }
  }

  return (
    <section className="donors-section" aria-labelledby="donors-title">
      <div className="section-heading">
        <div>
          <p className="status-label">מאגר התורמים</p>
          <h2 id="donors-title">תורמים</h2>
          <p>{donors.length} תורמים במערכת</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setIsFormOpen(true)}>
          הוספת תורם
        </button>
      </div>

      {error && <p className="inline-alert" role="alert">{error}</p>}

      {isFormOpen && (
        <form className="donor-form" onSubmit={(event) => void submitDonor(event)}>
          <div className="form-heading">
            <h3>תורם חדש</h3>
            <button className="text-button" type="button" onClick={() => setIsFormOpen(false)}>
              סגירה
            </button>
          </div>
          <div className="form-grid">
            {textFields.map(({ key, label, placeholder }) => (
              <label key={key}>
                {label}
                <input
                  required={key === 'donorNumber'}
                  value={String(form[key] ?? '')}
                  placeholder={placeholder}
                  onChange={(event) => updateTextField(key, event.target.value)}
                />
              </label>
            ))}
            <label>
              גובה (מ׳)
              <input
                inputMode="decimal"
                min="1"
                max="2.5"
                step="0.01"
                type="number"
                value={form.heightMeters ?? ''}
                onChange={(event) => updateNumberField('heightMeters', event.target.value)}
              />
            </label>
            <label>
              משקל (ק״ג)
              <input
                inputMode="decimal"
                min="30"
                max="300"
                step="0.1"
                type="number"
                value={form.weightKg ?? ''}
                onChange={(event) => updateNumberField('weightKg', event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? 'שומר…' : 'שמירת תורם'}
            </button>
            <button className="secondary-button" type="button" onClick={() => setIsFormOpen(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}

      <div className="table-card">
        {isLoading ? (
          <p className="empty-state">טוען תורמים…</p>
        ) : donors.length === 0 ? (
          <div className="empty-state">
            <h3>עדיין אין תורמים במאגר</h3>
            <p>הוסיפו את התורם הראשון כדי להתחיל.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>מס׳ תורם</th><th>עיסוק</th><th>מוצא</th><th>דת</th><th>צבע עור</th>
                  <th>עיניים</th><th>שיער</th><th>גובה (מ׳)</th><th>משקל (ק״ג)</th><th>CMV IgG</th><th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {donors.map((donor) => (
                  <tr key={donor.id}>
                    <th scope="row">{donor.donorNumber}</th>
                    <td>{donor.occupation || '—'}</td><td>{donor.origin || '—'}</td><td>{donor.religion || '—'}</td>
                    <td>{donor.skinColor || '—'}</td><td>{donor.eyeColor || '—'}</td><td>{donor.hairColor || '—'}</td>
                    <td>{donor.heightMeters ?? '—'}</td><td>{donor.weightKg ?? '—'}</td><td>{donor.cmvIgg || '—'}</td>
                    <td><button className="danger-button" type="button" onClick={() => void removeDonor(donor)}>מחיקה</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
