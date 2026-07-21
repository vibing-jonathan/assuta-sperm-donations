import { useCallback, useEffect, useState } from 'react'

import type { Donor } from './donor'
import {
  storageDonorPageRepository,
  type DonorPageRepository,
} from './donorPageImages'
import { displayedDonorMetadata } from './donorNumberMetadata'

interface DonorPageViewerProps {
  donor: Donor
  onClose: () => void
  repository?: DonorPageRepository
}

export function DonorPageViewer({
  donor,
  onClose,
  repository = storageDonorPageRepository,
}: DonorPageViewerProps) {
  const [pdfUrl, setPdfUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const donorNumber = displayedDonorMetadata(donor).donorNumber

  const loadPdf = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      setPdfUrl(await repository.getPdfUrl(donorNumber))
    } catch {
      setPdfUrl('')
      setError('לא נמצא קובץ המידע של התורם. ייתכן שהוא טרם הועלה.')
    } finally {
      setIsLoading(false)
    }
  }, [donorNumber, repository])

  useEffect(() => {
    void loadPdf()
  }, [loadPdf])

  useEffect(() => () => {
    if (typeof URL.revokeObjectURL !== 'function') return
    if (pdfUrl.startsWith('blob:')) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  return (
    <div className="modal-backdrop donor-pages-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="donor-pages-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="donor-pages-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <h2 id="donor-pages-title">קובץ מידע — תורם <span dir="ltr">{donorNumber}</span></h2>
            <p>קובץ PDF הכולל את שלושת עמודי המקור מתוך קטלוג התורמים</p>
          </div>
          <button className="dialog-close" type="button" aria-label="סגירת קובץ המידע" onClick={onClose}>×</button>
        </header>

        <div className="donor-pages-body">
          {isLoading && (
            <div className="donor-pages-loading" role="status">
              <span className="processing-spinner" aria-hidden="true" />
              <strong>טוען את קובץ המידע…</strong>
            </div>
          )}
          {error && (
            <div className="donor-pages-error">
              <p className="inline-alert" role="alert">{error}</p>
              <button className="secondary-button" type="button" onClick={() => void loadPdf()}>ניסיון חוזר</button>
            </div>
          )}
          {pdfUrl && (
            <div className="donor-pdf-viewer">
              <iframe src={pdfUrl} title={`קובץ מידע של תורם ${donorNumber}`} />
              <a className="primary-button donor-pdf-open" href={pdfUrl} target="_blank" rel="noreferrer">
                פתיחת קובץ ה-PDF בחלון חדש ↗
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
