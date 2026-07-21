import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { emptyDonorInput, validateDonor, type Donor, type DonorInput } from './donor'
import {
  normalizeEditableTextField,
  normalizeExtractedDonor,
  type DonorListField,
} from './donorFieldRules'
import { displayedDonorMetadata } from './donorNumberMetadata'
import { DonorPageViewer } from './DonorPageViewer'
import { DonorProfileAvatar } from './DonorProfileAvatar'
import {
  storageDonorProfileImageRepository,
  validateAdminProfileImage,
  type DonorProfileImageRepository,
} from './donorProfileImageRepository'
import type { DonorPageRepository } from './donorPageImages'
import { DuplicateDonorNumberError, firestoreDonorRepository, type DonorRepository } from './donorRepository'

interface DonorManagementProps {
  adminEmail: string
  repository?: DonorRepository
  pageRepository?: DonorPageRepository
  profileImageRepository?: DonorProfileImageRepository
}

type EditableTextField = 'donorNumber' | 'occupation' | DonorListField

interface OpenActionMenu {
  donor: Donor
  top: number
  left: number
}

const actionMenuWidth = 144
const actionMenuHeight = 132
const actionMenuGap = 4
const viewportMargin = 8

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

function editableDonorInput(donor: Donor): DonorInput {
  return {
    donorNumber: displayedDonorMetadata(donor).donorNumber,
    geneticCarrierStatus: displayedDonorMetadata(donor).geneticCarrierStatus,
    occupation: donor.occupation,
    origin: donor.origin,
    religion: donor.religion,
    skinColor: donor.skinColor,
    eyeColor: donor.eyeColor,
    hairColor: donor.hairColor,
    heightMeters: donor.heightMeters,
    weightKg: donor.weightKg,
    cmvIgg: donor.cmvIgg,
  }
}

export function DonorManagement({
  adminEmail,
  repository = firestoreDonorRepository,
  pageRepository,
  profileImageRepository = storageDonorProfileImageRepository,
}: DonorManagementProps) {
  const [donors, setDonors] = useState<Donor[]>([])
  const [form, setForm] = useState<DonorInput>(emptyDonorInput)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null)
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRemovingAll, setIsRemovingAll] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [donorPendingDelete, setDonorPendingDelete] = useState<Donor | null>(null)
  const [donorPendingView, setDonorPendingView] = useState<Donor | null>(null)
  const [isRemoveAllOpen, setIsRemoveAllOpen] = useState(false)
  const [removeAllError, setRemoveAllError] = useState<string | null>(null)
  const [openActionMenu, setOpenActionMenu] = useState<OpenActionMenu | null>(null)

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
    if (!isFormOpen && !donorPendingDelete && !donorPendingView && !isRemoveAllOpen && !openActionMenu) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (isSaving) return
      setIsFormOpen(false)
      setEditingDonor(null)
      setProfilePhotoFile(null)
      setForm(emptyDonorInput)
      setDonorPendingDelete(null)
      setDonorPendingView(null)
      setOpenActionMenu(null)
      if (!isRemovingAll) setIsRemoveAllOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [donorPendingDelete, donorPendingView, isFormOpen, isRemoveAllOpen, isRemovingAll, isSaving, openActionMenu])

  useEffect(() => {
    if (!openActionMenu) return
    const closeActionMenu = () => setOpenActionMenu(null)
    document.addEventListener('click', closeActionMenu)
    window.addEventListener('resize', closeActionMenu)
    window.addEventListener('scroll', closeActionMenu, true)
    return () => {
      document.removeEventListener('click', closeActionMenu)
      window.removeEventListener('resize', closeActionMenu)
      window.removeEventListener('scroll', closeActionMenu, true)
    }
  }, [openActionMenu])

  function toggleActionMenu(donor: Donor, trigger: HTMLButtonElement) {
    if (openActionMenu?.donor.id === donor.id) {
      setOpenActionMenu(null)
      return
    }
    const rect = trigger.getBoundingClientRect()
    const left = Math.min(
      Math.max(viewportMargin, rect.left),
      Math.max(viewportMargin, window.innerWidth - actionMenuWidth - viewportMargin),
    )
    const fitsBelow = rect.bottom + actionMenuGap + actionMenuHeight <= window.innerHeight - viewportMargin
    setOpenActionMenu({
      donor,
      left,
      top: fitsBelow
        ? rect.bottom + actionMenuGap
        : Math.max(viewportMargin, rect.top - actionMenuHeight - actionMenuGap),
    })
  }

  useEffect(() => {
    if (!profilePhotoFile) {
      setProfilePhotoPreview(null)
      return
    }
    const preview = URL.createObjectURL(profilePhotoFile)
    setProfilePhotoPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [profilePhotoFile])

  function updateTextField(key: keyof DonorInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateNumberField(key: 'heightMeters' | 'weightKg', value: string) {
    setForm((current) => ({ ...current, [key]: value === '' ? null : Number(value) }))
  }

  function closeForm() {
    if (isSaving) return
    setForm(emptyDonorInput)
    setEditingDonor(null)
    setProfilePhotoFile(null)
    setError(null)
    setIsFormOpen(false)
  }

  function openDonorForm(donor?: Donor) {
    setError(null)
    setEditingDonor(donor ?? null)
    setProfilePhotoFile(null)
    setForm(donor ? editableDonorInput(donor) : emptyDonorInput)
    setIsFormOpen(true)
  }

  function selectProfilePhoto(file: File | undefined) {
    if (!file) {
      setProfilePhotoFile(null)
      return
    }
    const validationError = validateAdminProfileImage(file)
    if (validationError) {
      setError(validationError)
      setProfilePhotoFile(null)
      return
    }
    setError(null)
    setProfilePhotoFile(file)
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
    let donorDetailsSaved = false
    try {
      if (editingDonor) {
        await repository.update(editingDonor.id, editingDonor.donorNumber, normalizedForm, adminEmail)
        donorDetailsSaved = true
        if (profilePhotoFile) {
          if (!profileImageRepository.uploadImage) throw new Error('Profile image uploads are unavailable.')
          await profileImageRepository.uploadImage(editingDonor.id, profilePhotoFile)
        }
      } else {
        await repository.add(normalizedForm, adminEmail)
      }
      setForm(emptyDonorInput)
      setEditingDonor(null)
      setProfilePhotoFile(null)
      setIsFormOpen(false)
    } catch (reason) {
      setError(reason instanceof DuplicateDonorNumberError
        ? 'מספר התורם כבר קיים במאגר.'
        : editingDonor && profilePhotoFile && donorDetailsSaved && reason instanceof Error
          ? `פרטי התורם נשמרו, אך ${reason.message}`
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

  async function removeAllDonors() {
    setIsRemovingAll(true)
    setRemoveAllError(null)
    setError(null)
    try {
      await repository.removeAll()
      setIsRemoveAllOpen(false)
    } catch {
      setRemoveAllError('מחיקת כל התורמים לא הושלמה. ניתן לנסות שוב; רשומות שכבר נמחקו לא יימחקו פעמיים.')
    } finally {
      setIsRemovingAll(false)
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
        <div className="workspace-actions">
          <button className="primary-button add-donor-button" type="button" onClick={() => openDonorForm()}>
            <span aria-hidden="true">＋</span>
            הוספת תורם
          </button>
          <button
            className="remove-all-donors-button"
            type="button"
            disabled={isLoading || donors.length === 0}
            onClick={() => {
              setRemoveAllError(null)
              setIsRemoveAllOpen(true)
            }}
          >
            <span aria-hidden="true">⌫</span>
            מחיקת כל התורמים
          </button>
        </div>
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
                  <th><span className="sr-only">תמונה</span></th><th>מס׳ תורם</th><th>נשאויות גנטיות</th><th>עיסוק</th><th>מוצא</th><th>דת</th><th>צבע עור</th>
                  <th>עיניים</th><th>שיער</th><th>גובה (מ׳)</th><th>משקל (ק״ג)</th><th>CMV IgG</th><th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {visibleDonors.map((donor) => (
                  <tr className={displayedDonorMetadata(donor).geneticCarrierStatus === 'שלילי' ? 'negative-carrier-highlight' : undefined} key={donor.id}>
                    <td className="profile-cell"><DonorProfileAvatar donor={donor} repository={profileImageRepository} /></td>
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
                      <div className="row-actions">
                        <button
                          className="row-actions-trigger"
                          type="button"
                          aria-label={`פעולות עבור תורם ${displayedDonorMetadata(donor).donorNumber}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionMenu?.donor.id === donor.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleActionMenu(donor, event.currentTarget)
                          }}
                        >•••</button>
                      </div>
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
                      <DonorProfileAvatar donor={donor} repository={profileImageRepository} />
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
                    <button className="mobile-edit-button" type="button" onClick={() => openDonorForm(donor)}>עריכת תורם</button>
                    <button className="mobile-pages-button" type="button" onClick={() => setDonorPendingView(donor)}>צפייה בקובץ המידע</button>
                    <button className="mobile-delete-button" type="button" onClick={() => setDonorPendingDelete(donor)}>מחיקת תורם</button>
                  </div>
                </details>
              </article>
            ))}
          </div>
          </>
        )}
      </section>

      {openActionMenu && createPortal(
        <div
          className="action-menu action-menu-portal"
          role="menu"
          aria-label={`פעולות עבור תורם ${displayedDonorMetadata(openActionMenu.donor).donorNumber}`}
          style={{ top: openActionMenu.top, left: openActionMenu.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => {
            setOpenActionMenu(null)
            openDonorForm(openActionMenu.donor)
          }}>עריכת תורם</button>
          <button type="button" role="menuitem" onClick={() => {
            setOpenActionMenu(null)
            setDonorPendingView(openActionMenu.donor)
          }}>צפייה בקובץ המידע</button>
          <button type="button" role="menuitem" onClick={() => {
            setOpenActionMenu(null)
            setDonorPendingDelete(openActionMenu.donor)
          }}>מחיקת תורם</button>
        </div>,
        document.body,
      )}

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
              <h2 id="donor-dialog-title">{editingDonor ? `עריכת תורם ${displayedDonorMetadata(editingDonor).donorNumber}` : 'הוספת תורם חדש'}</h2>
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
                      readOnly={Boolean(editingDonor && key === 'donorNumber')}
                      value={String(form[key] ?? '')}
                      placeholder={placeholder}
                      onChange={(event) => updateTextField(key, event.target.value)}
                      onBlur={(event) => updateTextField(key, normalizeEditableTextField(key, event.target.value))}
                    />
                    {editingDonor && key === 'donorNumber' && <small>מספר התורם הוא מזהה קבוע ואינו ניתן לשינוי לאחר השמירה.</small>}
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
                  <legend>נשאויות גנטיות</legend>
                  <label><input type="radio" name="carrier-status" checked={form.geneticCarrierStatus === 'חיובי'} onChange={() => setForm((current) => ({ ...current, geneticCarrierStatus: 'חיובי' }))} /> חיובי</label>
                  <label><input type="radio" name="carrier-status" checked={form.geneticCarrierStatus === 'שלילי'} onChange={() => setForm((current) => ({ ...current, geneticCarrierStatus: 'שלילי' }))} /> שלילי</label>
                </fieldset>
                <fieldset className="full-field cmv-field">
                  <legend>סטטוס CMV IgG</legend>
                  <label><input type="radio" name="cmv" checked={form.cmvIgg === 'חיובי'} onChange={() => updateTextField('cmvIgg', 'חיובי')} /> חיובי</label>
                  <label><input type="radio" name="cmv" checked={form.cmvIgg === 'שלילי'} onChange={() => updateTextField('cmvIgg', 'שלילי')} /> שלילי</label>
                </fieldset>
                {editingDonor && (
                  <section className="full-field profile-photo-editor" aria-labelledby="profile-photo-editor-title">
                    <div>
                      <strong id="profile-photo-editor-title">תמונת פרופיל</strong>
                      <small>החלפה ידנית אינה מפעילה את Gemini ואינה כרוכה בעלות יצירת AI.</small>
                    </div>
                    <div className="profile-photo-editor-controls">
                      {profilePhotoPreview
                        ? <img className="profile-photo-selection" src={profilePhotoPreview} alt="תצוגה מקדימה של התמונה החדשה" />
                        : <DonorProfileAvatar donor={editingDonor} repository={profileImageRepository} />}
                      <label className="secondary-button profile-photo-picker">
                        בחירת תמונת JPEG
                        <input
                          className="sr-only"
                          type="file"
                          accept="image/jpeg,.jpg,.jpeg"
                          disabled={isSaving}
                          onChange={(event) => selectProfilePhoto(event.target.files?.[0])}
                        />
                      </label>
                      {profilePhotoFile && <button className="text-button" type="button" disabled={isSaving} onClick={() => setProfilePhotoFile(null)}>ביטול החלפת התמונה</button>}
                    </div>
                  </section>
                )}
              </div>
              {error && <p className="dialog-error" role="alert">{error}</p>}
            </div>
            <footer className="dialog-footer">
              <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? 'שומר…' : editingDonor ? 'שמירת שינויים' : 'שמירת תורם'}</button>
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

      {isRemoveAllOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !isRemovingAll && setIsRemoveAllOpen(false)}>
          <section
            className="donor-dialog delete-dialog bulk-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-dialog-title"
            aria-describedby="bulk-delete-dialog-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog-header">
              <h2 id="bulk-delete-dialog-title">מחיקת כל התורמים</h2>
              <button className="dialog-close" type="button" aria-label="סגירת החלון" disabled={isRemovingAll} onClick={() => setIsRemoveAllOpen(false)}>×</button>
            </header>
            <div className="delete-dialog-body">
              <p id="bulk-delete-dialog-description">האם למחוק את כל <strong>{donors.length}</strong> התורמים מהמאגר?</p>
              <p className="delete-warning"><span aria-hidden="true">⚠</span> הפעולה תמחק גם את עמודי המידע השמורים ולא ניתן לבטל אותה.</p>
              {removeAllError && <p className="dialog-error" role="alert">{removeAllError}</p>}
            </div>
            <footer className="dialog-footer">
              <button className="danger-button" disabled={isRemovingAll} type="button" onClick={() => void removeAllDonors()}>
                <span aria-hidden="true">⌫</span> {isRemovingAll ? 'מוחק את כל התורמים…' : 'כן, למחוק את כולם'}
              </button>
              <button className="secondary-button" autoFocus disabled={isRemovingAll} type="button" onClick={() => setIsRemoveAllOpen(false)}>ביטול</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
