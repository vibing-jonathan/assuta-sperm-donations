import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AdminDashboard } from './App'
import type { DonorRepository } from './features/donors/donorRepository'

const repository: DonorRepository = {
  subscribe: async (onData) => {
    onData([])
    return () => undefined
  },
  add: vi.fn(),
  remove: vi.fn(),
}

describe('App', () => {
  it('renders the Hebrew administration foundation', () => {
    render(
      <AdminDashboard
        email="jgabbayj@gmail.com"
        onSignOut={() => undefined}
        donorRepository={repository}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'ניהול תורמים' }),
    ).toBeInTheDocument()
    expect(screen.getByText('מערכת ניהול תורמים').closest('.admin-layout')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText('jgabbayj@gmail.com')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'רשימת תורמים' })).toBeInTheDocument()
  })

  it('opens the local PDF import workspace', () => {
    render(
      <AdminDashboard
        email="jgabbayj@gmail.com"
        onSignOut={() => undefined}
        donorRepository={repository}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'ייבוא קבצים' }))
    expect(screen.getByRole('heading', { level: 1, name: 'ייבוא תורמים מקובץ' })).toBeInTheDocument()
    expect(screen.getByText('הקובץ נסרק בדפדפן בלבד בשלב זה.')).toBeInTheDocument()
  })
})
