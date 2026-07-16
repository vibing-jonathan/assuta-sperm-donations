import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import type { DonorInput } from '../donors/donor'
import { normalizeEditableTextField, type DonorListField } from '../donors/donorFieldRules'
import { extractDonors, type ExtractionResult } from './extractDonors'
import {
  firestoreImportRepository,
  MAX_DONORS_PER_IMPORT,
  type ImportRepository,
  type ImportResult,
} from './importRepository'
import { analyzeReviewRows, createReviewRows, type ReviewRow } from './importReview'
import { MAX_PDF_BYTES, scanDonorPdf, type PdfScanResult } from './scanDonorPdf'

type ExtractionPhase = 'deterministic' | 'gemini-fallback' | 'gemini-forced'

export interface PdfImportProps {
  adminEmail: string
  onNavigateToDonors?: () => void
  onActiveOperationChange?: (active: boolean) => void
  repository?: ImportRepository
  scanPdf?: typeof scanDonorPdf
  extractPdf?: typeof extractDonors
}

type EditableTextField = 'donorNumber' | 'occupation' | DonorListField

const editableTextFields: Array<{ key: EditableTextField; label: string }> = [
  { key: 'donorNumber', label: 'מס׳ תורם' },
  { key: 'occupation', label: 'עיסוק' },
  { key: 'origin', label: 'מוצא' },
  { key: 'religion', label: 'דת' },
  { key: 'skinColor', label: 'צבע עור' },
  { key: 'eyeColor', label: 'עיניים' },
  { key: 'hairColor', label: 'שיער' },
]

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function useElapsedSeconds(active: boolean) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const startedAt = Date.now()
    setElapsed(0)
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return elapsed
}

export function PdfImport({
  adminEmail,
  onNavigateToDonors,
  onActiveOperationChange,
  repository = firestoreImportRepository,
  scanPdf = scanDonorPdf,
  extractPdf = extractDonors,
}: PdfImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<PdfScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionPhase, setExtractionPhase] = useState<ExtractionPhase>('deterministic')
  const [forceGemini, setForceGemini] = useState(true)
  const [isImporting, setIsImporting] = useState(false)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [existingNumbers, setExistingNumbers] = useState<Set<string> | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const activeOperation = isExtracting || isImporting
  const elapsedSeconds = useElapsedSeconds(activeOperation)

  useEffect(() => {
    onActiveOperationChange?.(activeOperation)
    return () => {
      if (activeOperation) onActiveOperationChange?.(false)
    }
  }, [activeOperation, onActiveOperationChange])

  useEffect(() => {
    if (!activeOperation) return
    function guardNavigation(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guardNavigation)
    return () => window.removeEventListener('beforeunload', guardNavigation)
  }, [activeOperation])

  const reviewedRows = useMemo(
    () => analyzeReviewRows(rows, existingNumbers ?? new Set()),
    [existingNumbers, rows],
  )
  const duplicateRows = reviewedRows.filter((row) => row.duplicateKind !== null)
  const selectedRows = reviewedRows.filter((row) => row.selected && row.duplicateKind === null)
  const invalidSelectedRows = selectedRows.filter((row) => Object.keys(row.errors).length > 0)
  const importableRows = selectedRows.filter((row) => Object.keys(row.errors).length === 0)
  const selectableRows = reviewedRows.filter((row) => row.duplicateKind === null)
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => row.selected)
  const excludedCount = selectableRows.filter((row) => !row.selected).length

  async function inspectFile(nextFile: File) {
    if (activeOperation) return
    setFile(nextFile)
    setResult(null)
    discardReview()
    setError(null)
    setIsScanning(true)
    try {
      const nextResult = await scanPdf(nextFile, {
        onProgress: (current, total) => setProgress({ current, total }),
      })
      setResult(nextResult)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'בדיקת הקובץ נכשלה.')
    } finally {
      setIsScanning(false)
      setProgress(null)
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0]
    if (nextFile) void inspectFile(nextFile)
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (activeOperation || isScanning) return
    const nextFile = event.dataTransfer.files[0]
    if (nextFile) void inspectFile(nextFile)
  }

  function discardReview() {
    if (activeOperation) return
    setExtraction(null)
    setRows([])
    setExistingNumbers(null)
    setImportResult(null)
  }

  function clearFile() {
    if (activeOperation) return
    setFile(null)
    setResult(null)
    discardReview()
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function runExtraction() {
    if (!file || !result || activeOperation) return
    setIsExtracting(true)
    setExtraction(null)
    setRows([])
    setExistingNumbers(null)
    setImportResult(null)
    setError(null)
    setExtractionPhase(forceGemini ? 'gemini-forced' : 'deterministic')
    try {
      const nextExtraction = await extractPdf(file, result, {
        forceGemini,
        onFallback: () => setExtractionPhase('gemini-fallback'),
      })
      setExtraction(nextExtraction)
      setRows(createReviewRows(nextExtraction.donors))
      try {
        setExistingNumbers(await repository.listNormalizedDonorNumbers())
      } catch {
        setError('לא ניתן לבדוק כפילויות מול מאגר התורמים. אף רשומה לא תישמר עד שהבדיקה תצליח.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'חילוץ הנתונים נכשל. נסו שוב.')
    } finally {
      setIsExtracting(false)
    }
  }

  async function retryDuplicateCheck() {
    setError(null)
    try {
      setExistingNumbers(await repository.listNormalizedDonorNumbers())
    } catch {
      setError('לא ניתן לבדוק כפילויות מול מאגר התורמים. בדקו את החיבור ונסו שוב.')
    }
  }

  function updateRow(index: number, key: keyof DonorInput, value: string | number | null) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, donor: { ...row.donor, [key]: value } }
      : row))
  }

  function toggleRow(index: number) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, selected: !row.selected }
      : row))
  }

  function toggleAll() {
    const nextSelected = !allSelected
    setRows((current) => current.map((row, index) => reviewedRows[index]?.duplicateKind
      ? row
      : { ...row, selected: nextSelected }))
  }

  async function approveImport() {
    if (!file || !result || !extraction || !existingNumbers || activeOperation) return
    if (invalidSelectedRows.length > 0 || (importableRows.length === 0 && duplicateRows.length === 0) || importableRows.length > MAX_DONORS_PER_IMPORT) return
    setIsImporting(true)
    setError(null)
    try {
      const nextResult = await repository.importApproved({
        sourceFileName: file.name,
        startPage: result.startPage,
        endPage: result.endPage,
        pageCount: result.pageCount,
        model: extraction.model,
        extractionMethod: extraction.extractionMethod,
        parserVersion: extraction.parserVersion,
        extractionDurationMs: extraction.extractionDurationMs,
        fallbackReason: extraction.fallbackReason,
        adminEmail,
        warnings: extraction.warnings,
        donors: importableRows.map((row) => row.donor),
        skippedDuplicateNumbers: duplicateRows.map((row) => row.donor.donorNumber),
      })
      setImportResult(nextResult)
    } catch {
      setError('שמירת הייבוא נכשלה. אף תורם לא נוסף. בדקו את החיבור ונסו שוב.')
    } finally {
      setIsImporting(false)
    }
  }

  const approvalDisabled = existingNumbers === null
    || invalidSelectedRows.length > 0
    || (importableRows.length === 0 && duplicateRows.length === 0)
    || importableRows.length > MAX_DONORS_PER_IMPORT
    || activeOperation

  return (
    <div className="import-workspace">
      <header className="workspace-header">
        <div>
          <p className="workspace-kicker">ייבוא קבצים</p>
          <h1>ייבוא תורמים מקובץ</h1>
          <p>איתור מקומי, חילוץ מאובטח, בדיקה ואישור לפני שמירה</p>
        </div>
      </header>

      <aside className="import-notice">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>חילוץ עם Gemini מסומן כברירת מחדל.</strong>
          <p>אפשר לבטל את הסימון כדי לנסות תחילה חילוץ מקומי מהיר; אם מבנה הטבלה אינו מזוהה בביטחון, המערכת עדיין תעבור אוטומטית ל-Gemini.</p>
        </div>
      </aside>

      {!extraction && !importResult && !isExtracting && (
        <section className="upload-grid" aria-label="בחירת קובץ PDF">
          <div
            className={`pdf-dropzone ${activeOperation ? 'disabled' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropFile}
            aria-disabled={activeOperation || isScanning}
          >
            <span className="upload-icon" aria-hidden="true">⇧</span>
            <h2>גררו לכאן קובץ PDF</h2>
            <p>או בחרו קובץ מהמחשב</p>
            <button className="secondary-button" type="button" disabled={activeOperation || isScanning} onClick={() => inputRef.current?.click()}>
              בחירת קובץ
            </button>
            <small>קבצי PDF בלבד, עד {MAX_PDF_BYTES / 1024 / 1024}MB</small>
            <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" disabled={activeOperation || isScanning} onChange={selectFile} />
          </div>

          <div className="selected-file-panel">
            <h2>קובץ נבחר</h2>
            {file ? (
              <>
                <div className="selected-file">
                  <span aria-hidden="true">PDF</span>
                  <div><strong dir="ltr">{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)}MB</small></div>
                  <button type="button" aria-label="הסרת הקובץ" disabled={isScanning || activeOperation} onClick={clearFile}>×</button>
                </div>
                {isScanning && progress && (
                  <div className="scan-progress" role="status">
                    <span>בודק עמוד {progress.current} מתוך {progress.total}…</span>
                    <progress max={Math.min(progress.total, 30)} value={Math.min(progress.current, 30)} />
                  </div>
                )}
                {result && (
                  <div className="range-result" role="status">
                    <strong>עמודי הטבלה אותרו</strong>
                    <span>עמודים {result.startPage}–{result.endPage}</span>
                    <small>{result.pageCount} עמודים מתוך {result.totalPages} יועברו לחילוץ</small>
                    <p className="extraction-duration">{forceGemini
                      ? 'Gemini מסומן כעת ומשך החילוץ הוא בדרך כלל 1–2 דקות.'
                      : 'חילוץ מקומי נמשך בדרך כלל מספר שניות. אם המבנה השתנה, Gemini יופעל והתהליך עשוי להימשך 1–2 דקות.'}</p>
                    <label className="force-gemini-option">
                      <input
                        type="checkbox"
                        checked={forceGemini}
                        disabled={activeOperation}
                        onChange={(event) => setForceGemini(event.target.checked)}
                      />
                      <span>
                        <strong>חילוץ ישירות עם Gemini</strong>
                        <small>דלגו על החילוץ המקומי. התהליך נמשך בדרך כלל 1–2 דקות.</small>
                      </span>
                    </label>
                    <button className="primary-button" type="button" disabled={activeOperation} onClick={() => void runExtraction()}>
                      חילוץ נתונים
                    </button>
                  </div>
                )}
                {error && <p className="inline-alert" role="alert">{error}</p>}
              </>
            ) : <p className="no-file">לא נבחר קובץ.</p>}
          </div>
        </section>
      )}

      {isExtracting && (
        <section className="processing-panel" role="status" aria-live="polite" aria-busy="true">
          <span className="processing-spinner" aria-hidden="true" />
          <div>
            <h2>{extractionPhase === 'deterministic'
              ? 'קורא את טבלת התורמים באופן מקומי'
              : extractionPhase === 'gemini-forced'
                ? 'מחלץ את הנתונים ישירות עם Gemini'
                : 'מבנה הטבלה השתנה — עוברים לחילוץ עם Gemini'}</h2>
            <p>{extractionPhase === 'deterministic'
              ? 'החילוץ המקומי נמשך בדרך כלל מספר שניות. יש להשאיר את העמוד פתוח עד לסיום.'
              : 'Gemini נמשך בדרך כלל 1–2 דקות. יש להשאיר את העמוד פתוח ולא להחליף את הקובץ.'}</p>
            <strong className="elapsed-time">זמן שחלף: <span dir="ltr">{formatElapsed(elapsedSeconds)}</span></strong>
          </div>
        </section>
      )}

      {extraction && !importResult && (
        <section className="extraction-review" aria-labelledby="extraction-title">
          <div className="extraction-preview-header">
            <div>
              <p className="workspace-kicker">בדיקה ואישור</p>
              <h2 id="extraction-title">נמצאו {extraction.donors.length} שורות תורמים</h2>
              <p>ערכו שדות שדורשים תיקון, הסירו סימון משורות שלא לייבא ואשרו רק לאחר בדיקה.</p>
            </div>
            <div className="extraction-method">
              <strong>{extraction.extractionMethod === 'deterministic'
                ? 'חילוץ מקומי'
                : extraction.extractionMethod === 'gemini-forced' ? 'חילוץ ישיר עם Gemini' : 'Gemini הופעל כגיבוי'}</strong>
              <small dir="ltr">{extraction.extractionMethod === 'deterministic' ? extraction.parserVersion : extraction.model}</small>
            </div>
          </div>

          {extraction.warnings.length > 0 && (
            <div className="extraction-warnings" role="alert">
              <strong>⚠ אזהרות חילוץ — יש לבדוק לפני אישור</strong>
              <ul>{extraction.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
            </div>
          )}

          <div className="review-summary" aria-live="polite">
            <span><strong>{importableRows.length}</strong> מוכנים לייבוא</span>
            <span><strong>{invalidSelectedRows.length}</strong> דורשים תיקון</span>
            <span><strong>{duplicateRows.length}</strong> כפולים שיידלגו</span>
            <span><strong>{excludedCount}</strong> הוחרגו ידנית</span>
          </div>

          {duplicateRows.length > 0 && (
            <div className="duplicate-notice" role="status">
              <strong>כפילויות לא ייובאו</strong>
              <p>{duplicateRows.map((row) => row.donor.donorNumber || `שורה ${Number(row.id.replace('row-', ''))}`).join('، ')}</p>
              <small>המערכת מדלגת כברירת מחדל על מספרים כפולים בקובץ ועל מספרים שכבר קיימים במאגר.</small>
            </div>
          )}

          {importableRows.length > MAX_DONORS_PER_IMPORT && (
            <p className="inline-alert" role="alert">ניתן לייבא עד {MAX_DONORS_PER_IMPORT} תורמים חדשים בפעולה אחת. הסירו סימון משורות נוספות.</p>
          )}
          {error && <p className="inline-alert" role="alert">{error}</p>}
          {existingNumbers === null && (
            <button className="secondary-button duplicate-retry" type="button" onClick={() => void retryDuplicateCheck()}>בדיקה חוזרת מול המאגר</button>
          )}

          <div className="review-table-scroll">
            <table className="review-table">
              <thead>
                <tr>
                  <th className="selection-cell">
                    <input type="checkbox" checked={allSelected} aria-label="בחירת כל השורות שאינן כפולות" onChange={toggleAll} />
                  </th>
                  <th>שורה</th>
                  {editableTextFields.map((field) => <th key={field.key}>{field.label}</th>)}
                  <th>נשאויות גנטיות</th><th>גובה (מ׳)</th><th>משקל (ק״ג)</th><th>CMV IgG</th><th>מצב</th>
                </tr>
              </thead>
              <tbody>
                {reviewedRows.map((row, index) => {
                  const duplicateLabel = row.duplicateKind === 'existing' ? 'כבר קיים במאגר' : row.duplicateKind === 'within-file' ? 'כפול בקובץ' : null
                  const rowErrors = Object.values(row.errors)
                  return (
                    <tr key={row.id} className={`${duplicateLabel ? 'duplicate-row' : ''} ${rowErrors.length > 0 && row.selected ? 'invalid-row' : ''}`}>
                      <td className="selection-cell">
                        <input
                          type="checkbox"
                          aria-label={`ייבוא שורה ${index + 1}`}
                          checked={row.selected && !duplicateLabel}
                          disabled={Boolean(duplicateLabel)}
                          onChange={() => toggleRow(index)}
                        />
                      </td>
                      <th scope="row">{index + 1}</th>
                      {editableTextFields.map(({ key, label }) => {
                        const fieldError = row.errors[key as keyof typeof row.errors]
                        return (
                          <td key={key}>
                            <label className="sr-only" htmlFor={`${row.id}-${key}`}>{label}, שורה {index + 1}</label>
                            <input
                              id={`${row.id}-${key}`}
                              value={String(row.donor[key] ?? '')}
                              aria-invalid={Boolean(fieldError)}
                              title={fieldError}
                              onChange={(event) => updateRow(index, key, event.target.value)}
                              onBlur={(event) => updateRow(index, key, normalizeEditableTextField(key, event.target.value))}
                            />
                          </td>
                        )
                      })}
                      <td><span className={`cmv-chip ${row.donor.geneticCarrierStatus === 'שלילי' ? 'genetic-carrier-safe' : 'genetic-carrier-alert'}`}>{row.donor.geneticCarrierStatus}</span></td>
                      <td>
                        <label className="sr-only" htmlFor={`${row.id}-height`}>גובה, שורה {index + 1}</label>
                        <input id={`${row.id}-height`} type="number" inputMode="decimal" min="1" max="2.5" step="0.01" value={row.donor.heightMeters ?? ''} aria-invalid={Boolean(row.errors.heightMeters)} title={row.errors.heightMeters} onChange={(event) => updateRow(index, 'heightMeters', event.target.value === '' ? null : Number(event.target.value))} />
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`${row.id}-weight`}>משקל, שורה {index + 1}</label>
                        <input id={`${row.id}-weight`} type="number" inputMode="decimal" min="30" max="300" step="0.1" value={row.donor.weightKg ?? ''} aria-invalid={Boolean(row.errors.weightKg)} title={row.errors.weightKg} onChange={(event) => updateRow(index, 'weightKg', event.target.value === '' ? null : Number(event.target.value))} />
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`${row.id}-cmv`}>CMV IgG, שורה {index + 1}</label>
                        <select id={`${row.id}-cmv`} value={row.donor.cmvIgg} aria-invalid={Boolean(row.errors.cmvIgg)} title={row.errors.cmvIgg} onChange={(event) => updateRow(index, 'cmvIgg', event.target.value)}>
                          <option value="">לא ידוע</option><option value="חיובי">חיובי</option><option value="שלילי">שלילי</option>
                        </select>
                      </td>
                      <td className="row-status-cell">
                        {duplicateLabel ? <span className="status-chip duplicate-chip">{duplicateLabel}</span>
                          : rowErrors.length > 0 && row.selected ? (
                            <div className="row-errors" role="alert"><strong>נדרש תיקון</strong><ul>{rowErrors.map((message) => <li key={message}>{message}</li>)}</ul></div>
                          ) : row.selected ? <span className="status-chip valid-chip">תקין</span>
                            : <span className="status-chip excluded-chip">לא ייובא</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-review-list" aria-label="שורות תורמים לבדיקה">
            {reviewedRows.map((row, index) => {
              const duplicateLabel = row.duplicateKind === 'existing' ? 'כבר קיים' : row.duplicateKind === 'within-file' ? 'כפול בקובץ' : null
              const rowErrors = Object.values(row.errors)
              return (
                <article className={`mobile-review-card ${duplicateLabel ? 'duplicate-row' : ''} ${rowErrors.length > 0 && row.selected ? 'invalid-row' : ''}`} key={`mobile-${row.id}`}>
                  <div className="mobile-review-card-header">
                    <input
                      type="checkbox"
                      aria-label={`ייבוא שורה ${index + 1} בנייד`}
                      checked={row.selected && !duplicateLabel}
                      disabled={Boolean(duplicateLabel)}
                      onChange={() => toggleRow(index)}
                    />
                    <div>
                      <strong>{row.donor.donorNumber || `שורה ${index + 1}`}</strong>
                      <span>{row.donor.occupation || 'עיסוק לא צוין'} · {row.donor.origin || 'מוצא לא צוין'}</span>
                    </div>
                    {duplicateLabel ? <span className="status-chip duplicate-chip">{duplicateLabel}</span>
                      : rowErrors.length > 0 && row.selected ? <span className="status-chip error-chip">{rowErrors.length} שגיאות</span>
                        : row.selected ? <span className="status-chip valid-chip">תקין</span>
                          : <span className="status-chip excluded-chip">מוחרג</span>}
                  </div>
                  <details>
                    <summary>פרטים ועריכה <span aria-hidden="true">⌄</span></summary>
                    <div className="mobile-review-fields">
                      {editableTextFields.map(({ key, label }) => {
                        const fieldError = row.errors[key as keyof typeof row.errors]
                        return (
                          <label className={key === 'donorNumber' ? 'full-mobile-field' : undefined} key={key}>
                            <span>{label}</span>
                            <input value={String(row.donor[key] ?? '')} aria-invalid={Boolean(fieldError)} onChange={(event) => updateRow(index, key, event.target.value)} onBlur={(event) => updateRow(index, key, normalizeEditableTextField(key, event.target.value))} />
                            {fieldError && <small>{fieldError}</small>}
                          </label>
                        )
                      })}
                      <div className="full-mobile-field derived-review-field"><span>נשאויות גנטיות</span><strong className={`cmv-chip ${row.donor.geneticCarrierStatus === 'שלילי' ? 'genetic-carrier-safe' : 'genetic-carrier-alert'}`}>{row.donor.geneticCarrierStatus}</strong></div>
                      <label><span>גובה (מ׳)</span><input type="number" inputMode="decimal" min="1" max="2.5" step="0.01" value={row.donor.heightMeters ?? ''} aria-invalid={Boolean(row.errors.heightMeters)} onChange={(event) => updateRow(index, 'heightMeters', event.target.value === '' ? null : Number(event.target.value))} />{row.errors.heightMeters && <small>{row.errors.heightMeters}</small>}</label>
                      <label><span>משקל (ק״ג)</span><input type="number" inputMode="decimal" min="30" max="300" step="0.1" value={row.donor.weightKg ?? ''} aria-invalid={Boolean(row.errors.weightKg)} onChange={(event) => updateRow(index, 'weightKg', event.target.value === '' ? null : Number(event.target.value))} />{row.errors.weightKg && <small>{row.errors.weightKg}</small>}</label>
                      <label className="full-mobile-field"><span>CMV IgG</span><select value={row.donor.cmvIgg} aria-invalid={Boolean(row.errors.cmvIgg)} onChange={(event) => updateRow(index, 'cmvIgg', event.target.value)}><option value="">לא ידוע</option><option value="חיובי">חיובי</option><option value="שלילי">שלילי</option></select>{row.errors.cmvIgg && <small>{row.errors.cmvIgg}</small>}</label>
                    </div>
                  </details>
                </article>
              )
            })}
          </div>

          <footer className="review-actions">
            <div>
              <button className="primary-button" type="button" disabled={approvalDisabled} onClick={() => void approveImport()}>
                {isImporting ? 'שומר את הייבוא…' : importableRows.length > 0
                  ? `אישור וייבוא ${importableRows.length} תורמים`
                  : 'אישור וסיום — אין תורמים חדשים'}
              </button>
              <button className="secondary-button" type="button" disabled={activeOperation} onClick={discardReview}>ביטול והשלכת החילוץ</button>
            </div>
            <button className="text-button" type="button" disabled={activeOperation} onClick={() => void runExtraction()}>חילוץ מחדש</button>
          </footer>
        </section>
      )}

      {isImporting && (
        <div className="saving-overlay" role="status" aria-live="polite" aria-busy="true">
          <span className="processing-spinner" aria-hidden="true" />
          <strong>שומר את כל הרשומות באופן אטומי…</strong>
          <span>זמן שחלף: <b dir="ltr">{formatElapsed(elapsedSeconds)}</b></span>
        </div>
      )}

      {importResult && (
        <section className="import-success" role="status" aria-labelledby="import-success-title">
          <span className="success-mark" aria-hidden="true">✓</span>
          <h2 id="import-success-title">הייבוא הושלם בהצלחה</h2>
          <p><strong>{importResult.importedCount}</strong> תורמים יובאו, <strong>{importResult.skippedCount}</strong> כפילויות דולגו.</p>
          {importResult.skippedDuplicateNumbers.length > 0 && (
            <details><summary>הצגת מספרי התורמים שדולגו</summary><p dir="ltr">{importResult.skippedDuplicateNumbers.join(', ')}</p></details>
          )}
          <button className="primary-button" type="button" onClick={onNavigateToDonors}>מעבר למאגר התורמים</button>
        </section>
      )}
    </div>
  )
}
