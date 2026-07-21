import { useEffect, useState } from 'react'

import type { Donor } from '../features/donors/donor'
import type { DonorMediaRepository } from '../features/donors/mediaRepository'

interface DonorImageProps {
  donor: Donor
  mediaRepository: DonorMediaRepository
  large?: boolean
}

function donorInitial(donor: Donor) {
  return Array.from(donor.donorNumber.trim())[0]?.toUpperCase() || '•'
}

export function DonorImage({ donor, mediaRepository, large = false }: DonorImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const storagePath = donor.profileImage?.status === 'ready' ? donor.profileImage.storagePath : undefined

  useEffect(() => {
    if (!storagePath) {
      setImageUrl(null)
      setFailed(false)
      return
    }
    let active = true
    let objectUrl: string | null = null
    setImageUrl(null)
    setFailed(false)
    void mediaRepository.getProfileImage(storagePath).then((blob) => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setImageUrl(objectUrl)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaRepository, storagePath])

  return (
    <div className={`donor-image${large ? ' donor-image-large' : ''}${imageUrl && !failed ? ' donor-image-ready' : ''}`}>
      {imageUrl && !failed
        ? <><img src={imageUrl} alt={`תמונת פרופיל שנוצרה באמצעות בינה מלאכותית של תורם ${donor.donorNumber}`} /><span className="ai-image-tag" aria-label="תמונה שנוצרה באמצעות בינה מלאכותית">AI</span></>
        : <span aria-hidden="true">{donorInitial(donor)}</span>}
    </div>
  )
}
