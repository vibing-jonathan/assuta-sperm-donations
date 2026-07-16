import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AdminDashboard } from './App'
import type { DonorRepository } from './features/donors/donorRepository'
import type { ExtractionResult } from './features/imports/extractDonors'
import type { PdfScanResult } from './features/imports/scanDonorPdf'

const repository: DonorRepository = {
  subscribe: async (onData) => {
    onData([])
    return () => undefined
  },
  add: vi.fn(),
  remove: vi.fn(),
}

describe('App', () => {
  it('renders the Hebrew administration foundation and mobile navigation shell', () => {
    const { container } = render(
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
    expect(container.querySelector('.mobile-topbar')).toBeInTheDocument()
    expect(container.querySelector('.mobile-bottom-nav')).toHaveAttribute('aria-label', 'ניווט ראשי לנייד')
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
    expect(screen.getByText('המערכת מנסה תחילה חילוץ מקומי מהיר.')).toBeInTheDocument()
  })

  it('prevents in-app navigation and sign-out during extraction', async () => {
    const scanPdf = vi.fn().mockResolvedValue({ startPage: 2, endPage: 3, pageCount: 2, totalPages: 5, scannedPages: 4 })
    const extractPdf = vi.fn((_file: File, _range: PdfScanResult): Promise<ExtractionResult> => new Promise(() => undefined))
    const { container } = render(
      <AdminDashboard
        email="jgabbayj@gmail.com"
        onSignOut={() => undefined}
        donorRepository={repository}
        pdfImportProps={{ scanPdf, extractPdf }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ייבוא קבצים' }))
    const file = new File(['safe fixture'], 'fixture.pdf', { type: 'application/pdf' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: 'חילוץ נתונים' }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'תורמים' }).every((button) => button.hasAttribute('disabled'))).toBe(true)
      expect(screen.getByRole('button', { name: 'יציאה' })).toBeDisabled()
    })
    expect(screen.getByRole('heading', { name: 'קורא את טבלת התורמים באופן מקומי' })).toBeInTheDocument()
  })
})
