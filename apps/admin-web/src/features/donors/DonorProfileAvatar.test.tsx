import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Donor } from './donor'
import { DonorProfileAvatar } from './DonorProfileAvatar'

const donor = {
  id: 'donor-1', donorNumber: '1000', geneticCarrierStatus: 'חיובי', occupation: '', origin: '',
  religion: '', skinColor: 'בהיר', eyeColor: 'כחול', hairColor: 'חום', heightMeters: 1.8,
  weightKg: 80, cmvIgg: 'שלילי',
} as Donor

describe('DonorProfileAvatar', () => {
  it('loads the immutable Storage object only when a path is available', async () => {
    const repository = { getImageUrl: vi.fn().mockResolvedValue('blob:profile') }
    render(<DonorProfileAvatar donor={{
      ...donor,
      profileImage: { status: 'ready', inputHash: 'a'.repeat(64), storagePath: 'profiles/image.jpg' },
    }} repository={repository} />)

    await waitFor(() => expect(repository.getImageUrl).toHaveBeenCalledWith('profiles/image.jpg'))
    expect(document.querySelector('img')).toHaveAttribute('src', 'blob:profile')
  })

  it('exposes an accessible background-processing status without fetching', () => {
    const repository = { getImageUrl: vi.fn() }
    render(<DonorProfileAvatar donor={{
      ...donor,
      profileImage: { status: 'pending', inputHash: 'b'.repeat(64) },
    }} repository={repository} />)

    expect(screen.getByLabelText('תמונת הפרופיל נוצרת ברקע')).toBeInTheDocument()
    expect(repository.getImageUrl).not.toHaveBeenCalled()
  })

  it('opens the original image in a dismissible full-resolution preview without refetching', async () => {
    const repository = { getImageUrl: vi.fn().mockResolvedValue('blob:full-resolution-profile') }
    render(<DonorProfileAvatar donor={{
      ...donor,
      profileImage: { status: 'ready', inputHash: 'c'.repeat(64), storagePath: 'profiles/full.jpg' },
    }} repository={repository} />)

    fireEvent.click(await screen.findByRole('button', { name: 'הגדלת תמונת הפרופיל של תורם 1000' }))
    const dialog = screen.getByRole('dialog', { name: 'תמונת פרופיל של תורם 1000' })
    expect(dialog.querySelector('img')).toHaveAttribute('src', 'blob:full-resolution-profile')
    expect(repository.getImageUrl).toHaveBeenCalledOnce()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
