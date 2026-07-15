import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders the Hebrew administration foundation', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'ניהול תורמי זרע' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl')
  })
})
