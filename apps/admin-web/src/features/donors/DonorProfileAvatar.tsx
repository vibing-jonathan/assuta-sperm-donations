import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Donor } from './donor'
import {
  storageDonorProfileImageRepository,
  type DonorProfileImageRepository,
} from './donorProfileImageRepository'

interface DonorProfileAvatarProps {
  donor: Donor
  repository?: DonorProfileImageRepository
}

export function DonorProfileAvatar({
  donor,
  repository = storageDonorProfileImageRepository,
}: DonorProfileAvatarProps) {
  const host = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined')
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const profile = donor.profileImage
  const storagePath = profile?.storagePath

  useEffect(() => {
    if (visible || !host.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '160px' })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    let active = true
    if (!visible || !storagePath) return
    setFailed(false)
    void repository.getImageUrl(storagePath).then(
      (nextUrl) => { if (active) setUrl(nextUrl) },
      () => { if (active) setFailed(true) },
    )
    return () => { active = false }
  }, [repository, storagePath, visible])

  useEffect(() => {
    if (!isPreviewOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsPreviewOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isPreviewOpen])

  const isProcessing = profile?.status === 'pending' || profile?.status === 'generating'
  const status = isProcessing
    ? 'תמונת הפרופיל נוצרת ברקע'
    : profile?.status === 'failed' || failed ? 'יצירת תמונת הפרופיל נכשלה' : 'תמונת פרופיל'

  return (
    <span ref={host} className={`donor-profile-avatar ${isProcessing ? 'is-processing' : ''}`} title={status}>
      {url && !failed
        ? (
            <button
              className="donor-profile-avatar-button"
              type="button"
              aria-label={`הגדלת תמונת הפרופיל של תורם ${donor.donorNumber}`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setIsPreviewOpen(true)
              }}
            >
              <img src={url} alt="" loading="lazy" decoding="async" />
              <span className="donor-profile-ai-tag" aria-hidden="true">AI</span>
            </button>
          )
        : <span aria-label={status}><span aria-hidden="true">{isProcessing ? '◌' : '♙'}</span></span>}
      {isProcessing && <i aria-hidden="true" />}
      {isPreviewOpen && url && createPortal(
        <div className="profile-preview-backdrop" role="presentation" onMouseDown={() => setIsPreviewOpen(false)}>
          <section
            className="profile-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`profile-preview-title-${donor.id}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="sr-only" id={`profile-preview-title-${donor.id}`}>
              תמונת פרופיל של תורם {donor.donorNumber}
            </h2>
            <button
              className="profile-preview-close"
              type="button"
              aria-label="סגירת התמונה"
              autoFocus
              onClick={() => setIsPreviewOpen(false)}
            >×</button>
            <img src={url} alt={`תמונת פרופיל שנוצרה באמצעות בינה מלאכותית של תורם ${donor.donorNumber}`} />
            <span className="profile-preview-ai-tag" aria-hidden="true">AI</span>
          </section>
        </div>,
        document.body,
      )}
    </span>
  )
}
