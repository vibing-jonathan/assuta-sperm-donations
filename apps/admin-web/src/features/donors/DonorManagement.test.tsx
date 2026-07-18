import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DonorRepository } from './donorRepository'
import { DonorManagement } from './DonorManagement'
import type { Donor } from './donor'
import type { DonorPageRepository } from './donorPageImages'

function createRepository(donors: Donor[] = []): DonorRepository {
  return {
    subscribe: async (onData) => {
      onData(donors)
      return () => undefined
    },
    add: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn().mockResolvedValue({ deletedDonorCount: donors.length, deletedClaimCount: donors.length }),
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
    expect(screen.getByRole('button', { name: 'מחיקת כל התורמים' })).toBeDisabled()
  })

  it('requires confirmation before removing all donors', async () => {
    const donors = [
      { id: 'donor-1', donorNumber: '1314', occupation: '', origin: '', religion: '', skinColor: '', eyeColor: '', hairColor: '', heightMeters: null, weightKg: null, cmvIgg: '', geneticCarrierStatus: 'חיובי' },
      { id: 'donor-2', donorNumber: '1341', occupation: '', origin: '', religion: '', skinColor: '', eyeColor: '', hairColor: '', heightMeters: null, weightKg: null, cmvIgg: '', geneticCarrierStatus: 'חיובי' },
    ] as Donor[]
    const repository = createRepository(donors)
    render(<DonorManagement adminEmail="admin@example.com" repository={repository} />)

    fireEvent.click(await screen.findByRole('button', { name: 'מחיקת כל התורמים' }))
    const dialog = screen.getByRole('alertdialog', { name: 'מחיקת כל התורמים' })
    expect(within(dialog).getByText('2')).toBeInTheDocument()
    expect(repository.removeAll).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'כן, למחוק את כולם' }))
    await waitFor(() => expect(repository.removeAll).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'מחיקת כל התורמים' })).not.toBeInTheDocument())
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
    expect(donorRow).toHaveClass('negative-carrier-highlight')
    expect(mobileList?.querySelector('.mobile-donor-card')).toHaveClass('negative-carrier-highlight')
    const carrierStatus = within(within(donorRow).getAllByRole('cell')[1]!).getByText('שלילי')
    expect(carrierStatus).toHaveClass('genetic-carrier-safe')
    fireEvent.click(within(desktopTable as HTMLElement).getByRole('button', { name: 'מחיקת תורם' }))

    const dialog = screen.getByRole('alertdialog', { name: 'מחיקת תורם' })
    expect(dialog).toBeInTheDocument()
    expect(repository.remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /מחיקת תורם/ }))

    await waitFor(() => expect(repository.remove).toHaveBeenCalledWith('donor-1', 'D-4922***'))
  })

  it('loads, displays, and opens the stored three-page donor PDF', async () => {
    const donor = {
      id: 'donor-pages', donorNumber: '1314', geneticCarrierStatus: 'חיובי', occupation: 'שף',
      origin: 'בריטניה', religion: 'יהודי', skinColor: 'בהיר-משתזף', eyeColor: 'חום',
      hairColor: 'חום', heightMeters: 1.8, weightKg: 72, cmvIgg: 'שלילי',
    } as Donor
    const pageRepository: DonorPageRepository = {
      getPdfUrl: vi.fn().mockResolvedValue('https://storage.test/details.pdf'),
    }
    render(
      <DonorManagement
        adminEmail="admin@example.com"
        repository={createRepository([donor])}
        pageRepository={pageRepository}
      />,
    )

    const rowActions = await screen.findByLabelText('פעולות עבור תורם 1314')
    fireEvent.click(rowActions)
    expect(rowActions.closest('details')).toHaveAttribute('open')
    fireEvent.click(within(rowActions.closest('.desktop-donor-table') as HTMLElement)
      .getByRole('button', { name: 'צפייה בקובץ המידע' }))
    expect(rowActions.closest('details')).not.toHaveAttribute('open')

    expect(await screen.findByRole('dialog', { name: /קובץ מידע — תורם 1314/ })).toBeInTheDocument()
    expect(pageRepository.getPdfUrl).toHaveBeenCalledWith('1314')
    expect(screen.getByTitle('קובץ מידע של תורם 1314')).toHaveAttribute('src', 'https://storage.test/details.pdf')
    const pdfLink = screen.getByRole('link', { name: /פתיחת קובץ ה-PDF בחלון חדש/ })
    expect(pdfLink).toHaveAttribute('href', 'https://storage.test/details.pdf')
    expect(pdfLink).toHaveAttribute('target', '_blank')
  })

  it('closes an open row action menu when clicking elsewhere', async () => {
    const donor = {
      id: 'donor-actions', donorNumber: '1314', geneticCarrierStatus: 'חיובי', occupation: 'שף',
      origin: 'בריטניה', religion: 'יהודי', skinColor: 'בהיר-משתזף', eyeColor: 'חום',
      hairColor: 'חום', heightMeters: 1.8, weightKg: 72, cmvIgg: 'שלילי',
    } as Donor
    render(<DonorManagement adminEmail="admin@example.com" repository={createRepository([donor])} />)

    const rowActions = await screen.findByLabelText('פעולות עבור תורם 1314')
    fireEvent.click(rowActions)
    expect(rowActions.closest('details')).toHaveAttribute('open')

    fireEvent.click(screen.getByRole('heading', { name: 'ניהול תורמים' }))
    expect(rowActions.closest('details')).not.toHaveAttribute('open')
  })

  it('shows a retryable message when the donor PDF has not been uploaded', async () => {
    const donor = {
      id: 'donor-no-pages', donorNumber: '5006', geneticCarrierStatus: 'חיובי', occupation: '',
      origin: '', religion: '', skinColor: '', eyeColor: '', hairColor: '',
      heightMeters: 1.8, weightKg: 72, cmvIgg: 'שלילי',
    } as Donor
    const pageRepository: DonorPageRepository = {
      getPdfUrl: vi.fn().mockRejectedValue(new Error('private storage error')),
    }
    render(
      <DonorManagement
        adminEmail="admin@example.com"
        repository={createRepository([donor])}
        pageRepository={pageRepository}
      />,
    )

    const rowActions = await screen.findByLabelText('פעולות עבור תורם 5006')
    fireEvent.click(rowActions)
    fireEvent.click(within(rowActions.closest('.desktop-donor-table') as HTMLElement)
      .getByRole('button', { name: 'צפייה בקובץ המידע' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ייתכן שהוא טרם הועלה')
    expect(screen.queryByText('private storage error')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ניסיון חוזר' }))
    await waitFor(() => expect(pageRepository.getPdfUrl).toHaveBeenCalledTimes(2))
  })
})
