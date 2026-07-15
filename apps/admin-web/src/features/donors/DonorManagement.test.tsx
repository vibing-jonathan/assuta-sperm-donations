import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DonorRepository } from './donorRepository'
import { DonorManagement } from './DonorManagement'
import type { Donor } from './donor'

function createRepository(donors: Donor[] = []): DonorRepository {
  return {
    subscribe: async (onData) => {
      onData(donors)
      return () => undefined
    },
    add: vi.fn(),
    remove: vi.fn(),
  }
}

describe('DonorManagement', () => {
  it('adds a donor with the signed-in administrator identity', async () => {
    const repository = createRepository()
    render(<DonorManagement adminEmail="admin@example.com" repository={repository} />)

    fireEvent.click(screen.getByRole('button', { name: 'הוספת תורם' }))
    fireEvent.change(screen.getByLabelText(/מס׳ תורם/), { target: { value: '1024' } })
    fireEvent.change(screen.getByLabelText('עיסוק'), { target: { value: 'רופא' } })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת תורם' }))

    await waitFor(() => {
      expect(repository.add).toHaveBeenCalledWith(
        expect.objectContaining({ donorNumber: '1024', occupation: 'רופא' }),
        'admin@example.com',
      )
    })
  })

  it('shows the empty database state', async () => {
    render(<DonorManagement adminEmail="admin@example.com" repository={createRepository()} />)
    expect(await screen.findByText('עדיין אין תורמים במאגר')).toBeInTheDocument()
  })

  it('requires explicit confirmation before deleting a donor', async () => {
    const repository = createRepository([{
      id: 'donor-1',
      donorNumber: 'D-4922',
      occupation: 'רופא',
      origin: 'ספרדי',
      religion: 'יהודי',
      skinColor: 'בהיר',
      eyeColor: 'חום',
      hairColor: 'שחור',
      heightMeters: 1.8,
      weightKg: 75,
      cmvIgg: 'שלילי',
    }])
    render(<DonorManagement adminEmail="admin@example.com" repository={repository} />)

    fireEvent.click(await screen.findByLabelText('פעולות עבור תורם D-4922'))
    fireEvent.click(screen.getByRole('button', { name: 'מחיקת תורם' }))

    const dialog = screen.getByRole('alertdialog', { name: 'מחיקת תורם' })
    expect(dialog).toBeInTheDocument()
    expect(repository.remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /מחיקת תורם/ }))

    await waitFor(() => expect(repository.remove).toHaveBeenCalledWith('donor-1'))
  })
})
