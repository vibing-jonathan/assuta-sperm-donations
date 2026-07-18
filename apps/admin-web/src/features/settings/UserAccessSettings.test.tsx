import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserAccessSettings } from './UserAccessSettings'
import type { UserAccessRepository } from './userAccessRepository'

function createRepository(overrides: Partial<UserAccessRepository> = {}): UserAccessRepository {
  return {
    get: vi.fn().mockResolvedValue({ username: 'Clinic', password: 'shared-pass' }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('UserAccessSettings', () => {
  it('loads the stored shared credential and keeps the password concealed by default', async () => {
    const repository = createRepository()
    render(<UserAccessSettings adminEmail="jgabbayj@gmail.com" repository={repository} />)

    expect(screen.getByRole('status')).toHaveTextContent('טוען פרטים…')
    expect(await screen.findByDisplayValue('Clinic')).toBeInTheDocument()
    const password = screen.getByLabelText('סיסמה משותפת')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveValue('shared-pass')

    fireEvent.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }))
    expect(password).toHaveAttribute('type', 'text')
  })

  it('does not expose fallback credentials when the Firestore document does not exist', async () => {
    render(
      <UserAccessSettings
        adminEmail="jgabbayj@gmail.com"
        repository={createRepository({ get: vi.fn().mockResolvedValue(null) })}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('פרטי הגישה טרם הוגדרו. הזינו ושמרו פרטים חדשים.')
    expect(screen.getByLabelText('שם משתמש משותף')).toHaveValue('')
    expect(screen.getByLabelText('סיסמה משותפת')).toHaveValue('')
  })

  it('validates both fields before saving', async () => {
    const repository = createRepository()
    render(<UserAccessSettings adminEmail="jgabbayj@gmail.com" repository={repository} />)
    await screen.findByDisplayValue('Clinic')

    fireEvent.change(screen.getByLabelText('שם משתמש משותף'), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText('סיסמה משותפת'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת פרטי גישה' }))

    expect(screen.getByText('יש להזין שם משתמש משותף.')).toBeInTheDocument()
    expect(screen.getByText('יש להזין סיסמה משותפת.')).toBeInTheDocument()
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('saves the edited credential with the importing administrator email', async () => {
    const repository = createRepository()
    render(<UserAccessSettings adminEmail="robieis153@gmail.com" repository={repository} />)
    await screen.findByDisplayValue('Clinic')

    fireEvent.change(screen.getByLabelText('שם משתמש משותף'), { target: { value: '  Assuta Users  ' } })
    fireEvent.change(screen.getByLabelText('סיסמה משותפת'), { target: { value: 'new shared password' } })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת פרטי גישה' }))

    await waitFor(() => expect(repository.save).toHaveBeenCalledWith(
      { username: 'Assuta Users', password: 'new shared password' },
      'robieis153@gmail.com',
    ))
    expect(screen.getByRole('status')).toHaveTextContent('פרטי הגישה נשמרו בהצלחה.')
  })

  it('shows a safe error when Firestore rejects the update', async () => {
    const repository = createRepository({ save: vi.fn().mockRejectedValue(new Error('sensitive diagnostics')) })
    render(<UserAccessSettings adminEmail="jgabbayj@gmail.com" repository={repository} />)
    await screen.findByDisplayValue('Clinic')

    fireEvent.click(screen.getByRole('button', { name: 'שמירת פרטי גישה' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('שמירת פרטי הגישה נכשלה. לא בוצע שינוי, נסו שוב.')
    expect(screen.queryByText('sensitive diagnostics')).not.toBeInTheDocument()
  })
})
