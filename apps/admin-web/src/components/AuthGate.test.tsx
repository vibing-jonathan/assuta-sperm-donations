import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  user: null as null | { email: string; emailVerified: boolean },
}))

vi.mock('../lib/firebase', () => ({ auth: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (
    _auth: unknown,
    onUser: (user: typeof authState.user) => void,
  ) => {
    onUser(authState.user)
    return vi.fn()
  },
  reload: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

import { AuthGate } from './AuthGate'

describe('AuthGate', () => {
  beforeEach(() => {
    authState.user = null
  })

  it('shows the login form when signed out', () => {
    render(<AuthGate>{() => <p>private</p>}</AuthGate>)

    expect(screen.getByRole('heading', { name: 'ברוכים הבאים' })).toBeInTheDocument()
  })

  it('allows an approved administrator with a verified email', () => {
    authState.user = { email: 'jgabbayj@gmail.com', emailVerified: true }

    render(<AuthGate>{(user) => <p>{user.email}</p>}</AuthGate>)

    expect(screen.getByText('jgabbayj@gmail.com')).toBeInTheDocument()
  })

  it('requires email verification for an approved administrator', () => {
    authState.user = { email: 'robieis153@gmail.com', emailVerified: false }

    render(<AuthGate>{() => <p>private</p>}</AuthGate>)

    expect(screen.getByRole('heading', { name: 'נדרש אימות דוא״ל' })).toBeInTheDocument()
    expect(screen.queryByText('private')).not.toBeInTheDocument()
  })

  it('blocks every account outside the allowlist', () => {
    authState.user = { email: 'visitor@example.com', emailVerified: true }

    render(<AuthGate>{() => <p>private</p>}</AuthGate>)

    expect(screen.getByRole('heading', { name: 'אין הרשאת מנהל לחשבון זה' })).toBeInTheDocument()
    expect(screen.queryByText('private')).not.toBeInTheDocument()
  })
})
