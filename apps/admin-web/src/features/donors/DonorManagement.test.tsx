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
        expect.objectContaining({ donorNumber: '1024', geneticCarrierStatus: 'חיובי', occupation: 'רופא' }),
        'admin@example.com',
      )
    })
  })

  it('moves the three-asterisk marker into genetic carrier status when adding manually', async () => {
    const repository = createRepository()
    render(<DonorManagement adminEmail="admin@example.com" repository={repository} />)

    fireEvent.click(screen.getByRole('button', { name: 'הוספת תורם' }))
    fireEvent.change(screen.getByLabelText(/מס׳ תורם/), { target: { value: 'D-300***' } })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת תורם' }))

    await waitFor(() => expect(repository.add).toHaveBeenCalledWith(
      expect.objectContaining({ donorNumber: 'D-300', geneticCarrierStatus: 'שלילי' }),
      'admin@example.com',
    ))
  })

  it('normalizes comma spacing and rejects multiple skin-color values in manual entry', async () => {
    const repository = createRepository()
    render(<DonorManagement adminEmail="admin@example.com" repository={repository} />)

    fireEvent.click(screen.getByRole('button', { name: 'הוספת תורם' }))
    fireEvent.change(screen.getByLabelText(/מס׳ תורם/), { target: { value: 'D-400' } })
    fireEvent.change(screen.getByLabelText('עיסוק'), { target: { value: 'רופא ,חוקר' } })
    fireEvent.change(screen.getByLabelText('מוצא'), { target: { value: 'רוסיה ,רומניה' } })
    fireEvent.change(screen.getByLabelText('צבע עור'), { target: { value: 'בהיר, משתזף' } })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת תורם' }))

    expect(await screen.findAllByText('השדה צבע עור מכיל ערך אחד בלבד; אין להשתמש בפסיקים.')).toHaveLength(2)
    expect(repository.add).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('צבע עור'), { target: { value: 'בהיר משתזף' } })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת תורם' }))

    await waitFor(() => expect(repository.add).toHaveBeenCalledWith(
      expect.objectContaining({
        donorNumber: 'D-400', occupation: 'רופא, חוקר', origin: 'רוסיה, רומניה',
        skinColor: 'בהיר-משתזף',
      }),
      'admin@example.com',
    ))
  })

  it('shows the empty database state', async () => {
    render(<DonorManagement adminEmail="admin@example.com" repository={createRepository()} />)
    expect(await screen.findByText('עדיין אין תורמים במאגר')).toBeInTheDocument()
  })

  it('requires explicit confirmation before deleting a donor', async () => {
    const legacyDonor = {
      id: 'donor-1',
      donorNumber: 'D-4922***',
      occupation: 'רופא',
      origin: 'ספרדי',
      religion: 'יהודי',
      skinColor: 'בהיר',
      eyeColor: 'חום',
      hairColor: 'שחור',
      heightMeters: 1.8,
      weightKg: 75,
      cmvIgg: 'שלילי',
    } as Donor
    const repository = createRepository([legacyDonor])
    const { container } = render(<DonorManagement adminEmail="admin@example.com" repository={repository} />)

    const mobileList = container.querySelector('.mobile-donor-list')
    expect(mobileList).toBeInTheDocument()
    expect(within(mobileList as HTMLElement).getByText('D-4922')).toBeInTheDocument()

    fireEvent.click(await screen.findByLabelText('פעולות עבור תורם D-4922'))
    const desktopTable = container.querySelector('.desktop-donor-table')
    const donorRow = within(desktopTable as HTMLElement).getByRole('row', { name: /D-4922/ })
    expect(within(donorRow).getAllByRole('cell')[0]).toHaveTextContent('שלילי')
    fireEvent.click(within(desktopTable as HTMLElement).getByRole('button', { name: 'מחיקת תורם' }))

    const dialog = screen.getByRole('alertdialog', { name: 'מחיקת תורם' })
    expect(dialog).toBeInTheDocument()
    expect(repository.remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /מחיקת תורם/ }))

    await waitFor(() => expect(repository.remove).toHaveBeenCalledWith('donor-1', 'D-4922***'))
  })
})
