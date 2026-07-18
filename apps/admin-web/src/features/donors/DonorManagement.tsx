import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { emptyDonorInput, validateDonor, type Donor, type DonorInput } from './donor'
import {
  normalizeEditableTextField,
  normalizeExtractedDonor,
  type DonorListField,
} from './donorFieldRules'
import { displayedDonorMetadata } from './donorNumberMetadata'
import { DonorPageViewer } from './DonorPageViewer'
import type { DonorPageRepository } from './donorPageImages'
import { DuplicateDonorNumberError, firestoreDonorRepository, type DonorRepository } from './donorRepository'

interface DonorManagementProps {
  adminEmail: string
  repository?: DonorRepository
  pageRepository?: DonorPageRepository
}

type EditableTextField = 'donorNumber' | 'occupation' | DonorListField

const textFields: Array<{ key: EditableTextField; label: string; placeholder?: string }> = [
  { key: 'donorNumber', label: 'מס׳ תורם', placeholder: 'לדוגמה: D-5000' },
  { key: 'occupation', label: 'עיסוק' },
  { key: 'origin', label: 'מוצא' },
  { key: 'religion', label: 'דת' },
  { key: 'skinColor', label: 'צבע עור' },
  { key: 'eyeColor', label: 'עיניים' },
  { key: 'hairColor', label: 'שיער', placeholder: 'לדוגמה: חום חלק' },
]

function isPositiveCmv(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'חיובי' || normalized === 'positive' || normalized === '+'
}

export function DonorManagement({
  adminEmail,
  repository = firestoreDonorRepository,
  pageRepository,
}: DonorManagementProps) {
  const [donors, setDonors] = useState<Donor[]>([])
  const [form, setForm] = useState<DonorInput>(emptyDonorInput)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [donorPendingDelete, setDonorPendingDelete] = useState<Donor | null>(null)
  const [donorPendingView, setDonorPendingView] = useState<Donor | null>(null)

  const visibleDonors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return donors
    return donors.filter((donor) =>
      [donor.donorNumber, donor.occupation, donor.origin].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [donors, searchQuery])

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

  useEffect(() => {
    if (!isFormOpen && !donorPendingDelete && !donorPendingView) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsFormOpen(false)
      setDonorPendingDelete(null)
      setDonorPendingView(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [donorPendingDelete, donorPendingView, isFormOpen])

  useEffect(() => {
    function closeRowActionsOnOutsideClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      document.querySelectorAll<HTMLDetailsElement>('.row-actions[open]').forEach((details) => {
        if (!details.contains(target)) details.removeAttribute('open')
      })
    }

    document.addEventListener('click', closeRowActionsOnOutsideClick)
    return () => document.removeEventListener('click', closeRowActionsOnOutsideClick)
  }, [])

  function updateTextField(key: keyof DonorInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateNumberField(key: 'heightMeters' | 'weightKg', value: string) {
    setForm((current) => ({ ...current, [key]: value === '' ? null : Number(value) }))
  }

  function closeForm() {
    if (isSaving) return
    setForm(emptyDonorInput)
    setError(null)
    setIsFormOpen(false)
  }

  async function submitDonor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedForm = normalizeExtractedDonor(form)
    const validationError = validateDonor(normalizedForm)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await repository.add(normalizedForm, adminEmail)
      setForm(emptyDonorInput)
      setIsFormOpen(false)
    } catch (reason) {
      setError(reason instanceof DuplicateDonorNumberError
        ? 'מספר התורם כבר קיים במאגר.'
        : 'שמירת התורם נכשלה. בדקו את החיבור ונסו שוב.')
    } finally {
      setIsSaving(false)
    }
  }

  async function removeDonor(donor: Donor) {
    setIsDeleting(true)
    setError(null)
    try {
      await repository.remove(donor.id, donor.donorNumber)
      setDonorPendingDelete(null)
    } catch {
      setError('מחיקת התורם נכשלה. נסו שוב.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="donor-workspace">
      <header className="workspace-header">
        <div>
          <p className="workspace-kicker">מאגר תורמים</p>
          <h1>ניהול תורמים</h1>
          <p>מאגר תורמי הזרע של המרכז הרפואי</p>
        </div>
        <button className="primary-button add-donor-button" type="button" onClick={() => setIsFormOpen(true)}>
          <span aria-hidden="true">＋</span>
          הוספת תורם
        </button>
      </header>

      <section className="summary-grid" aria-label="סיכום מאגר התורמים">
        <article className="summary-item">
          <span>סה״כ תורמים</span>
          <strong>{donors.length}</strong>
        </article>
        <article className="summary-item">
          <span>מוצגים כעת</span>
          <strong>{visibleDonors.length}</strong>
        </article>
        <article className="summary-item summary-connected">
          <span>מצב מערכת</span>
          <strong><i aria-hidden="true" /> מחובר</strong>
        </article>
      </section>

      {error && <p className="inline-alert" role="alert">{error}</p>}

      <section className="database-panel" aria-labelledby="donors-title">
        <div className="database-toolbar">
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <label className="sr-only" htmlFor="donor-search">חיפוש תורמים</label>
            <input
              id="donor-search"
              type="search"
              value={searchQuery}
              placeholder="חיפוש לפי מספר תורם, עיסוק או מוצא"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="toolbar-meta">
            <span>{isLoading ? 'טוען…' : `מציג ${visibleDonors.length} מתוך ${donors.length}`}</span>
            <button className="filter-button" type="button" disabled title="סינון מתקדם יתווסף בהמשך">
              <span aria-hidden="true">≡</span> סינון
            </button>
          </div>
        </div>

        <h2 className="sr-only" id="donors-title">רשימת תורמים</h2>
        {isLoading ? (
          <p className="empty-state">טוען תורמים…</p>
        ) : visibleDonors.length === 0 ? (
          <div className="empty-state">
            <h3>{donors.length === 0 ? 'עדיין אין תורמים במאגר' : 'לא נמצאו תורמים'}</h3>
            <p>{donors.length === 0 ? 'הוסיפו את התורם הראשון כדי להתחיל.' : 'נסו לשנות את מילות החיפוש.'}</p>
          </div>
        ) : (
          <>
          <div className="table-scroll desktop-donor-table">
            <table>
              <thead>
                <tr>
                  <th>מס׳ תורם</th><th>נשאויות גנטיות</th><th>עיסוק</th><th>מוצא</th><th>דת</th><th>צבע עור</th>
                  <th>עיניים</th><th>שיער</th><th>גובה (מ׳)</th><th>משקל (ק״ג)</th><th>CMV IgG</th><th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {visibleDonors.map((donor) => (
                  <tr className={displayedDonorMetadata(donor).geneticCarrierStatus === 'שלילי' ? 'negative-carrier-highlight' : undefined} key={donor.id}>
                    <th scope="row">{displayedDonorMetadata(donor).donorNumber}</th>
                    <td><span className={`cmv-chip ${displayedDonorMetadata(donor).geneticCarrierStatus === 'שלילי' ? 'genetic-carrier-safe' : 'genetic-carrier-alert'}`}>{displayedDonorMetadata(donor).geneticCarrierStatus}</span></td>
                    <td>{donor.occupation || '—'}</td><td>{donor.origin || '—'}</td><td>{donor.religion || '—'}</td>
                    <td>{donor.skinColor || '—'}</td><td>{donor.eyeColor || '—'}</td><td>{donor.hairColor || '—'}</td>
                    <td className="numeric-cell">{donor.heightMeters ?? '—'}</td><td className="numeric-cell">{donor.weightKg ?? '—'}</td>
                    <td>
                      {donor.cmvIgg ? (
                        <span className={`cmv-chip ${isPositiveCmv(donor.cmvIgg) ? 'cmv-positive' : 'cmv-negative'}`}>
                          {donor.cmvIgg}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="actions-cell">
                      <details className="row-actions">
                        <summary aria-label={`פעולות עבור תורם ${displayedDonorMetadata(donor).donorNumber}`}>•••</summary>
                        <div className="action-menu">
                          <button type="button" onClick={(event) => {
                            event.currentTarget.closest('details')?.removeAttribute('open')
                            setDonorPendingView(donor)
                          }}>צפייה בעמודי מידע</button>
                          <button type="button" onClick={(event) => {
                            event.currentTarget.closest('details')?.removeAttribute('open')
                            setDonorPendingDelete(donor)
                          }}>מחיקת תורם</button>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-donor-list" aria-label="כרטיסי תורמים">
            {visibleDonors.map((donor) => (
              <article className={`mobile-donor-card ${displayedDonorMetadata(donor).geneticCarrierStatus === 'שלילי' ? 'negative-carrier-highlight' : ''}`} key={`mobile-${donor.id}`}>
                <details>
                  <summary>
                    <div className="mobile-donor-card-heading">
                      <div>
                        <strong dir="ltr">{displayedDonorMetadata(donor).donorNumber}</strong>
                        <span>{donor.occupation || 'עיסוק לא צוין'}</span>
                      </div>
                      {donor.cmvIgg ? (
                        <span className={`cmv-chip ${isPositiveCmv(donor.cmvIgg) ? 'cmv-positive' : 'cmv-negative'}`}>
                          CMV {isPositiveCmv(donor.cmvIgg) ? 'Pos' : 'Neg'}
                        </span>
                      ) : <span className="cmv-chip cmv-unknown">CMV Unk</span>}
                    </div>
                    <div className="mobile-donor-summary">
                      <span>{donor.origin || 'מוצא לא צוין'}</span>
                      <span>{donor.religion || 'דת לא צוינה'}</span>
                      <i aria-hidden="true">⌄</i>
                    </div>
                  </summary>
                  <div className="mobile-donor-details">
                    <dl>
                      <div><dt>צבע עור</dt><dd>{donor.skinColor || '—'}</dd></div>
                      <div><dt>עיניים</dt><dd>{donor.eyeColor || '—'}</dd></div>
                      <div><dt>שיער</dt><dd>{donor.hairColor || '—'}</dd></div>
                      <div><dt>נשאויות גנטיות</dt><dd><span className={`cmv-chip ${displayedDonorMetadata(donor).geneticCarrierStatus === 'שלילי' ? 'genetic-carrier-safe' : 'genetic-carrier-alert'}`}>{displayedDonorMetadata(donor).geneticCarrierStatus}</span></dd></div>
                      <div><dt>גובה</dt><dd>{donor.heightMeters ? `${donor.heightMeters} מ׳` : '—'}</dd></div>
                      <div><dt>משקל</dt><dd>{donor.weightKg ? `${donor.weightKg} ק״ג` : '—'}</dd></div>
                    </dl>
                    <button className="mobile-pages-button" type="button" onClick={() => setDonorPendingView(donor)}>צפייה בשלושת עמודי המידע</button>
                    <button className="mobile-delete-button" type="button" onClick={() => setDonorPendingDelete(donor)}>מחיקת תורם</button>
                  </div>
                </details>
              </article>
            ))}
          </div>
          </>
        )}
      </section>

      {donorPendingView && (
        <DonorPageViewer
          donor={donorPendingView}
          repository={pageRepository}
          onClose={() => setDonorPendingView(null)}
        />
      )}

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeForm}>
          <form
            className="donor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="donor-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => void submitDonor(event)}
          >
            <header className="dialog-header">
              <h2 id="donor-dialog-title">הוספת תורם חדש</h2>
              <button className="dialog-close" type="button" aria-label="סגירת החלון" onClick={closeForm}>×</button>
            </header>
            <div className="dialog-body">
              <div className="form-grid">
                {textFields.map(({ key, label, placeholder }) => (
                  <label className={key === 'donorNumber' ? 'full-field' : undefined} key={key}>
                    <span>{label}{key === 'donorNumber' && <b aria-hidden="true"> *</b>}</span>
                    <input
                      autoFocus={key === 'donorNumber'}
                      required={key === 'donorNumber'}
                      value={String(form[key] ?? '')}
                      placeholder={placeholder}
                      onChange={(event) => updateTextField(key, event.target.value)}
                      onBlur={(event) => updateTextField(key, normalizeEditableTextField(key, event.target.value))}
                    />
                  </label>
                ))}
                <label>
                  <span>גובה (מ׳)</span>
                  <input inputMode="decimal" min="1" max="2.5" step="0.01" type="number" value={form.heightMeters ?? ''} onChange={(event) => updateNumberField('heightMeters', event.target.value)} />
                </label>
                <label>
                  <span>משקל (ק״ג)</span>
                  <input inputMode="decimal" min="30" max="300" step="0.1" type="number" value={form.weightKg ?? ''} onChange={(event) => updateNumberField('weightKg', event.target.value)} />
                </label>
                <fieldset className="full-field cmv-field">
                  <legend>סטטוס CMV IgG</legend>
                  <label><input type="radio" name="cmv" checked={form.cmvIgg === 'חיובי'} onChange={() => updateTextField('cmvIgg', 'חיובי')} /> חיובי</label>
                  <label><input type="radio" name="cmv" checked={form.cmvIgg === 'שלילי'} onChange={() => updateTextField('cmvIgg', 'שלילי')} /> שלילי</label>
                </fieldset>
              </div>
              {error && <p className="dialog-error" role="alert">{error}</p>}
            </div>
            <footer className="dialog-footer">
              <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? 'שומר…' : 'שמירת תורם'}</button>
              <button className="secondary-button" disabled={isSaving} type="button" onClick={closeForm}>ביטול</button>
            </footer>
          </form>
        </div>
      )}

      {donorPendingDelete && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !isDeleting && setDonorPendingDelete(null)}>
          <section
            className="donor-dialog delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog-header">
              <h2 id="delete-dialog-title">מחיקת תורם</h2>
              <button className="dialog-close" type="button" aria-label="סגירת החלון" disabled={isDeleting} onClick={() => setDonorPendingDelete(null)}>×</button>
            </header>
            <div className="delete-dialog-body">
              <p id="delete-dialog-description">האם למחוק את תורם <strong dir="ltr">{displayedDonorMetadata(donorPendingDelete).donorNumber}</strong>?</p>
              <p className="delete-warning"><span aria-hidden="true">⚠</span> לא ניתן לבטל פעולה זו.</p>
            </div>
            <footer className="dialog-footer">
              <button className="danger-button" disabled={isDeleting} type="button" onClick={() => void removeDonor(donorPendingDelete)}>
                <span aria-hidden="true">⌫</span> {isDeleting ? 'מוחק…' : 'מחיקת תורם'}
              </button>
              <button className="secondary-button" autoFocus disabled={isDeleting} type="button" onClick={() => setDonorPendingDelete(null)}>ביטול</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
