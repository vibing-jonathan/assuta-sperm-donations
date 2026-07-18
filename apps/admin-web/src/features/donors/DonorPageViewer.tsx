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
  const [urls, setUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const donorNumber = displayedDonorMetadata(donor).donorNumber

  const loadPages = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      setUrls(await repository.getPageUrls(donorNumber))
    } catch {
      setUrls([])
      setError('לא נמצאו שלושת עמודי המידע של התורם. ייתכן שהם טרם הועלו.')
    } finally {
      setIsLoading(false)
    }
  }, [donorNumber, repository])

  useEffect(() => {
    void loadPages()
  }, [loadPages])

  useEffect(() => () => {
    if (typeof URL.revokeObjectURL !== 'function') return
    urls.filter((url) => url.startsWith('blob:')).forEach((url) => URL.revokeObjectURL(url))
  }, [urls])

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
            <h2 id="donor-pages-title">עמודי מידע — תורם <span dir="ltr">{donorNumber}</span></h2>
            <p>שלושת עמודי המקור מתוך קטלוג התורמים</p>
          </div>
          <button className="dialog-close" type="button" aria-label="סגירת עמודי המידע" onClick={onClose}>×</button>
        </header>

        <div className="donor-pages-body">
          {isLoading && (
            <div className="donor-pages-loading" role="status">
              <span className="processing-spinner" aria-hidden="true" />
              <strong>טוען את עמודי המידע…</strong>
            </div>
          )}
          {error && (
            <div className="donor-pages-error">
              <p className="inline-alert" role="alert">{error}</p>
              <button className="secondary-button" type="button" onClick={() => void loadPages()}>ניסיון חוזר</button>
            </div>
          )}
          {urls.length === 3 && (
            <div className="donor-page-grid">
              {urls.map((url, index) => (
                <article className="donor-page-card" key={url}>
                  <a href={url} target="_blank" rel="noreferrer" aria-label={`פתיחת עמוד ${index + 1} בחלון חדש`}>
                    <img src={url} alt={`עמוד מידע ${index + 1} של תורם ${donorNumber}`} />
                  </a>
                  <div>
                    <strong>עמוד {index + 1}</strong>
                    <a href={url} target="_blank" rel="noreferrer">פתיחה בגודל מלא ↗</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
