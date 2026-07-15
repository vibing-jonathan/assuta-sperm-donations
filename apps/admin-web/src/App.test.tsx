import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AdminDashboard } from './App'

describe('App', () => {
  it('renders the Hebrew administration foundation', () => {
    render(<AdminDashboard email="jgabbayj@gmail.com" onSignOut={() => undefined} />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'ניהול תורמי זרע' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText('jgabbayj@gmail.com')).toBeInTheDocument()
  })
})
