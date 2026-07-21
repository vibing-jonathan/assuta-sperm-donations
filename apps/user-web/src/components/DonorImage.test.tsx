import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Donor } from '../features/donors/donor'
import type { DonorMediaRepository } from '../features/donors/mediaRepository'
import { DonorImage } from './DonorImage'

const donor: Donor = {
  id: 'donor-1',
  donorNumber: '1000',
  geneticCarrierStatus: 'שלילי',
  occupation: '',
  origin: '',
  religion: '',
  skinColor: '',
  eyeColor: '',
  hairColor: '',
  heightMeters: null,
  weightKg: null,
  cmvIgg: '',
}

const mediaRepository: DonorMediaRepository = {
  getProfileImage: vi.fn().mockResolvedValue(new Blob(['profile'])),
  getDetailPdf: vi.fn(),
}

describe('DonorImage', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:profile') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('labels a rendered generated profile image as AI', async () => {
    render(<DonorImage donor={{
      ...donor,
      profileImage: { status: 'ready', inputHash: 'a'.repeat(64), storagePath: 'profiles/1000.jpg' },
    }} mediaRepository={mediaRepository} />)

    expect(await screen.findByRole('img', { name: 'תמונת פרופיל שנוצרה באמצעות בינה מלאכותית של תורם 1000' })).toHaveAttribute('src', 'blob:profile')
    expect(screen.getByText('AI')).toHaveAttribute('aria-label', 'תמונה שנוצרה באמצעות בינה מלאכותית')
  })

  it('does not label a placeholder as AI', () => {
    render(<DonorImage donor={donor} mediaRepository={mediaRepository} />)

    expect(screen.queryByText('AI')).not.toBeInTheDocument()
  })
})
