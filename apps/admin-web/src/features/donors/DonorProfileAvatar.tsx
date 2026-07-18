import { useEffect, useRef, useState } from 'react'

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

  const isProcessing = profile?.status === 'pending' || profile?.status === 'generating'
  const status = isProcessing
    ? 'תמונת הפרופיל נוצרת ברקע'
    : profile?.status === 'failed' || failed ? 'יצירת תמונת הפרופיל נכשלה' : 'תמונת פרופיל'

  return (
    <span ref={host} className={`donor-profile-avatar ${isProcessing ? 'is-processing' : ''}`} title={status} aria-label={status}>
      {url && !failed
        ? <img src={url} alt="" loading="lazy" decoding="async" />
        : <span aria-hidden="true">{isProcessing ? '◌' : '♙'}</span>}
      {isProcessing && <i aria-hidden="true" />}
    </span>
  )
}
