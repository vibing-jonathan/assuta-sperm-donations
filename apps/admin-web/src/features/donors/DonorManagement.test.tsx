import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DonorRepository } from './donorRepository'
import { DonorManagement } from './DonorManagement'

function createRepository(): DonorRepository {
  return {
    subscribe: async (onData) => {
      onData([])
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
    fireEvent.change(screen.getByLabelText('מס׳ תורם'), { target: { value: '1024' } })
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
})
