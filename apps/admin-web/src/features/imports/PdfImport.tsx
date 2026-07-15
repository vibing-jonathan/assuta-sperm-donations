import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { extractDonors, type ExtractionResult } from './extractDonors'
import { MAX_PDF_BYTES, scanDonorPdf, type PdfScanResult } from './scanDonorPdf'

export function PdfImport() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<PdfScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)

  async function inspectFile(nextFile: File) {
    setFile(nextFile)
    setResult(null)
    setExtraction(null)
    setError(null)
    setIsScanning(true)
    try {
      const nextResult = await scanDonorPdf(nextFile, {
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
    const nextFile = event.dataTransfer.files[0]
    if (nextFile) void inspectFile(nextFile)
  }

  function clearFile() {
    setFile(null)
    setResult(null)
    setExtraction(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function runExtraction() {
    if (!file || !result) return
    setIsExtracting(true)
    setExtraction(null)
    setError(null)
    try {
      setExtraction(await extractDonors(file, result))
    } catch {
      setError('חילוץ הנתונים נכשל. בדקו את החיבור ונסו שוב.')
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="import-workspace">
      <header className="workspace-header">
        <div>
          <p className="workspace-kicker">ייבוא קבצים</p>
          <h1>ייבוא תורמים מקובץ</h1>
          <p>איתור מקומי של עמודי טבלת התורמים לפני חילוץ הנתונים</p>
        </div>
      </header>

      <aside className="import-notice">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>הקובץ נסרק בדפדפן בלבד בשלב זה.</strong>
          <p>לא יישלחו ל-Gemini עמודי שער או עמודי מידע מורחב על התורמים.</p>
        </div>
      </aside>

      <section className="upload-grid" aria-label="בחירת קובץ PDF">
        <div
          className="pdf-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropFile}
        >
          <span className="upload-icon" aria-hidden="true">⇧</span>
          <h2>גררו לכאן קובץ PDF</h2>
          <p>או בחרו קובץ מהמחשב</p>
          <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>
            בחירת קובץ
          </button>
          <small>קבצי PDF בלבד, עד {MAX_PDF_BYTES / 1024 / 1024}MB</small>
          <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={selectFile} />
        </div>

        <div className="selected-file-panel">
          <h2>קובץ נבחר</h2>
          {file ? (
            <>
              <div className="selected-file">
                <span aria-hidden="true">PDF</span>
                <div><strong dir="ltr">{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)}MB</small></div>
                <button type="button" aria-label="הסרת הקובץ" disabled={isScanning} onClick={clearFile}>×</button>
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
                  <button className="primary-button" type="button" disabled={isExtracting} onClick={() => void runExtraction()}>
                    {isExtracting ? 'מחלץ נתונים…' : 'חילוץ נתונים עם Gemini'}
                  </button>
                </div>
              )}
              {error && <p className="inline-alert" role="alert">{error}</p>}
            </>
          ) : <p className="no-file">לא נבחר קובץ.</p>}
        </div>
      </section>

      {extraction && (
        <section className="extraction-preview" aria-labelledby="extraction-title">
          <div className="extraction-preview-header">
            <div>
              <p className="workspace-kicker">תצוגה מקדימה</p>
              <h2 id="extraction-title">נמצאו {extraction.donors.length} תורמים</h2>
              <p>הנתונים עדיין לא נשמרו. יש לעבור על הרשומות לפני הייבוא.</p>
            </div>
            <small dir="ltr">{extraction.model}</small>
          </div>
          {extraction.warnings.length > 0 && (
            <div className="extraction-warnings" role="status">
              <strong>נקודות לבדיקה</strong>
              <ul>{extraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead><tr><th>מס׳ תורם</th><th>עיסוק</th><th>מוצא</th><th>דת</th><th>צבע עור</th><th>עיניים</th><th>שיער</th><th>גובה</th><th>משקל</th><th>CMV IgG</th></tr></thead>
              <tbody>
                {extraction.donors.map((donor, index) => (
                  <tr key={`${donor.donorNumber}-${index}`}>
                    <th scope="row">{donor.donorNumber}</th><td>{donor.occupation || '—'}</td><td>{donor.origin || '—'}</td>
                    <td>{donor.religion || '—'}</td><td>{donor.skinColor || '—'}</td><td>{donor.eyeColor || '—'}</td>
                    <td>{donor.hairColor || '—'}</td><td>{donor.heightMeters ?? '—'}</td><td>{donor.weightKg ?? '—'}</td><td>{donor.cmvIgg || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
