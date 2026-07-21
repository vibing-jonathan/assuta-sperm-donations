import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DonorInput } from '../donors/donor'
import type { ImportRepository } from './importRepository'
import type { ExtractionResult, HybridExtractionOptions } from './extractDonors'
import { PdfImport } from './PdfImport'
import type { PdfScanResult } from './scanDonorPdf'

const scanResult = { startPage: 2, endPage: 4, pageCount: 3, totalPages: 8, scannedPages: 5 }
const deterministicMetadata = {
  model: 'donor-table-v2', extractionMethod: 'deterministic' as const,
  parserVersion: 'donor-table-v2', extractionDurationMs: 320, fallbackReason: null,
}
const fallbackMetadata = {
  model: 'gemini-test', extractionMethod: 'gemini-fallback' as const,
  parserVersion: 'donor-table-v2', extractionDurationMs: 1450,
  fallbackReason: 'columns_ambiguous' as const,
}
const validDonor = (donorNumber: string, overrides: Partial<DonorInput> = {}): DonorInput => ({
  donorNumber, geneticCarrierStatus: 'חיובי', occupation: 'רופא', origin: 'ספרדי', religion: 'יהודי', skinColor: 'בהיר',
  eyeColor: 'חום', hairColor: 'שחור', heightMeters: 1.8, weightKg: 75, cmvIgg: 'שלילי',
  ...overrides,
})

function upload(container: HTMLElement) {
  const file = new File(['safe test fixture'], 'fixture.pdf', { type: 'application/pdf' })
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
}

function repository(overrides: Partial<ImportRepository> = {}): ImportRepository {
  return {
    listNormalizedDonorNumbers: vi.fn().mockResolvedValue(new Set()),
    importApproved: vi.fn().mockResolvedValue({
      importId: 'import-1', importedCount: 1, replacedCount: 0, skippedCount: 0,
      replacedDonorNumbers: [], skippedDuplicateNumbers: [],
    }),
    ...overrides,
  }
}

afterEach(() => vi.useRealTimers())

describe('PDF import approval workflow', () => {
  it('shows elapsed extraction status and guards browser/in-app navigation while active', async () => {
    vi.useFakeTimers()
    const activeChanged = vi.fn()
    const scanPdf = vi.fn().mockResolvedValue(scanResult)
    const extractPdf = vi.fn((_file: File, _range: PdfScanResult): Promise<ExtractionResult> => new Promise(() => undefined))
    const { container } = render(
      <PdfImport
        adminEmail="jgabbayj@gmail.com"
        repository={repository()}
        scanPdf={scanPdf}
        extractPdf={extractPdf}
        onActiveOperationChange={activeChanged}
      />,
    )

    upload(container)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: 'חילוץ נתונים' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: 'קורא את טבלת התורמים באופן מקומי' })).toBeInTheDocument()
    expect(screen.getByText(/יש להשאיר את העמוד פתוח עד לסיום/)).toBeInTheDocument()
    expect(activeChanged).toHaveBeenCalledWith(true)

    act(() => { vi.advanceTimersByTime(2100) })
    expect(screen.getByText('00:02')).toBeInTheDocument()
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
  })

  it('announces when structural confidence triggers the slower Gemini fallback', async () => {
    const extractPdf = vi.fn((
      _file: File,
      _range: PdfScanResult,
      options?: HybridExtractionOptions,
    ): Promise<ExtractionResult> => {
      options?.onFallback?.('columns_ambiguous')
      return new Promise(() => undefined)
    })
    const { container } = render(
      <PdfImport
        adminEmail="jgabbayj@gmail.com"
        repository={repository()}
        scanPdf={vi.fn().mockResolvedValue(scanResult)}
        extractPdf={extractPdf}
      />,
    )

    upload(container)
    fireEvent.click(await screen.findByRole('button', { name: 'חילוץ נתונים' }))
    expect(await screen.findByRole('heading', { name: 'מבנה הטבלה השתנה — עוברים לחילוץ עם Gemini' })).toBeInTheDocument()
    expect(screen.getByText(/Gemini נמשך בדרך כלל 1–2 דקות/)).toBeInTheDocument()
  })

  it('lets an administrator force Gemini and skip the local extraction phase', async () => {
    const extractPdf = vi.fn((_file: File, _range: PdfScanResult): Promise<ExtractionResult> => new Promise(() => undefined))
    const { container } = render(
      <PdfImport
        adminEmail="jgabbayj@gmail.com"
        repository={repository()}
        scanPdf={vi.fn().mockResolvedValue(scanResult)}
        extractPdf={extractPdf}
      />,
    )

    upload(container)
    const forceGemini = await screen.findByRole('checkbox', { name: /חילוץ ישירות עם Gemini/ })
    expect(forceGemini).not.toBeChecked()
    fireEvent.click(forceGemini)
    fireEvent.click(screen.getByRole('button', { name: 'חילוץ נתונים' }))

    expect(extractPdf).toHaveBeenCalledWith(
      expect.any(File),
      scanResult,
      expect.objectContaining({ forceGemini: true }),
    )
    expect(await screen.findByRole('heading', { name: 'מחלץ את הנתונים ישירות עם Gemini' })).toBeInTheDocument()
    expect(screen.getByText(/Gemini נמשך בדרך כלל 1–2 דקות/)).toBeInTheDocument()
  })

  it('supports editing, selection, row validation, duplicate skipping, audit input, and success state', async () => {
    const storePages = vi.fn().mockResolvedValue({ uploadedDonorCount: 2, uploadedPdfCount: 2 })
    const importApproved = vi.fn().mockResolvedValue({
      importId: 'import-1', importedCount: 1, replacedCount: 1, skippedCount: 1,
      replacedDonorNumbers: ['B-2'], skippedDuplicateNumbers: [' A-1 '],
    })
    const importRepository = repository({
      listNormalizedDonorNumbers: vi.fn().mockResolvedValue(new Set(['b-2'])),
      importApproved,
    })
    const { container } = render(
      <PdfImport
        adminEmail="jgabbayj@gmail.com"
        repository={importRepository}
        scanPdf={vi.fn().mockResolvedValue(scanResult)}
        extractPdf={vi.fn().mockResolvedValue({
          ...fallbackMetadata, warnings: ['גובה בשורה האחרונה לא היה קריא'],
          donors: [
            validDonor('A-1', { geneticCarrierStatus: 'שלילי' }), validDonor(' A-1 '), validDonor('B-2'),
            validDonor('', { heightMeters: null, weightKg: 400, cmvIgg: '' }),
          ],
        })}
        storePages={storePages}
      />,
    )

    upload(container)
    await screen.findByRole('button', { name: 'חילוץ נתונים' })
    fireEvent.click(screen.getByRole('button', { name: 'חילוץ נתונים' }))
    expect(await screen.findByRole('heading', { name: 'נמצאו 4 שורות תורמים' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'נשאויות גנטיות' })).toBeInTheDocument()
    expect(container.querySelector('.genetic-carrier-alert')).toHaveTextContent('חיובי')
    expect(container.querySelectorAll('.negative-carrier-highlight')).toHaveLength(2)
    expect(screen.getByText(/אזהרות חילוץ/)).toBeInTheDocument()
    expect(screen.getAllByText('כפול בקובץ')).toHaveLength(2)
    expect(screen.getAllByText(/יחליף/)).toHaveLength(2)
    expect(screen.getAllByText('נדרש תיקון')).toHaveLength(1)
    expect(container.querySelector('.mobile-review-list')).toBeInTheDocument()
    expect(container.querySelectorAll('.mobile-review-card')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /אישור ושמירת/ })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('ייבוא שורה 1'))
    fireEvent.change(screen.getByLabelText('מס׳ תורם, שורה 4'), { target: { value: 'C-3' } })
    fireEvent.change(screen.getByLabelText('גובה, שורה 4'), { target: { value: '1.77' } })
    fireEvent.change(screen.getByLabelText('משקל, שורה 4'), { target: { value: '72' } })
    fireEvent.change(screen.getByLabelText('CMV IgG, שורה 4'), { target: { value: 'חיובי' } })

    const approve = screen.getByRole('button', { name: 'אישור ושמירת 2 תורמים' })
    expect(approve).toBeEnabled()
    fireEvent.click(approve)

    await waitFor(() => expect(importApproved).toHaveBeenCalledWith(expect.objectContaining({
      sourceFileName: 'fixture.pdf', startPage: 2, endPage: 4, pageCount: 3,
      model: 'gemini-test', extractionMethod: 'gemini-fallback',
      parserVersion: 'donor-table-v2', extractionDurationMs: 1450,
      fallbackReason: 'columns_ambiguous', adminEmail: 'jgabbayj@gmail.com',
      warnings: ['גובה בשורה האחרונה לא היה קריא'],
      donors: [
        expect.objectContaining({ donorNumber: 'B-2' }),
        expect.objectContaining({ donorNumber: 'C-3', heightMeters: 1.77, weightKg: 72, cmvIgg: 'חיובי' }),
      ],
      skippedDuplicateNumbers: [' A-1 '],
    })))
    await waitFor(() => expect(storePages).toHaveBeenCalledWith(
      expect.any(File),
      4,
      [
        { sourceIndex: 2, sourceDonorNumber: 'B-2', donorNumber: 'B-2' },
        { sourceIndex: 3, sourceDonorNumber: 'C-3', donorNumber: 'C-3' },
      ],
      expect.objectContaining({ onProgress: expect.any(Function) }),
    ))
    expect(await screen.findByRole('heading', { name: 'הייבוא הושלם בהצלחה' })).toBeInTheDocument()
    expect(screen.getByRole('status').querySelector('p')).toHaveTextContent('1 תורמים חדשים יובאו, 1 תורמים קיימים הוחלפו, 1 כפילויות בקובץ דולגו')
    expect(container.querySelector('.page-upload-success')).toHaveTextContent('2 קובצי PDF נשמרו עבור 2 תורמים')
  })

  it('keeps a retry path when PDF upload fails after the atomic donor import', async () => {
    const storePages = vi.fn()
      .mockRejectedValueOnce(new Error('private storage error'))
      .mockResolvedValueOnce({ uploadedDonorCount: 1, uploadedPdfCount: 1 })
    const { container } = render(
      <PdfImport
        adminEmail="jgabbayj@gmail.com"
        repository={repository()}
        scanPdf={vi.fn().mockResolvedValue(scanResult)}
        extractPdf={vi.fn().mockResolvedValue({
          ...deterministicMetadata, warnings: [], donors: [validDonor('A-1')],
        })}
        storePages={storePages}
      />,
    )

    upload(container)
    fireEvent.click(await screen.findByRole('button', { name: 'חילוץ נתונים' }))
    fireEvent.click(await screen.findByRole('button', { name: 'אישור ושמירת 1 תורמים' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('רשומות התורמים נשמרו, אך העלאת עמודי המידע נכשלה')
    expect(screen.queryByText('private storage error')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ניסיון חוזר להעלאת קובצי ה-PDF' }))
    await waitFor(() => expect(container.querySelector('.page-upload-success')).toHaveTextContent('1 קובצי PDF נשמרו עבור 1 תורמים'))
    expect(storePages).toHaveBeenCalledTimes(2)
  })

  it('accepts arbitrary semantic values and keeps structural normalization on blur', async () => {
    const { container } = render(
      <PdfImport
        adminEmail="jgabbayj@gmail.com"
        repository={repository()}
        scanPdf={vi.fn().mockResolvedValue(scanResult)}
        extractPdf={vi.fn().mockResolvedValue({
          ...deterministicMetadata,
          warnings: [],
          donors: [validDonor('A-1', { origin: 'רוסיה, אטלנטיס' })],
        })}
      />,
    )

    upload(container)
    fireEvent.click(await screen.findByRole('button', { name: 'חילוץ נתונים' }))

    const origin = await screen.findByLabelText('מוצא, שורה 1')
    expect(origin).toHaveAttribute('aria-invalid', 'false')
    expect(origin).not.toHaveAttribute('title')
    expect(screen.getByRole('button', { name: 'אישור ושמירת 1 תורמים' })).toBeEnabled()

    fireEvent.change(origin, { target: { value: 'רוסיה ,רומניה' } })
    fireEvent.blur(origin)
    expect(origin).toHaveValue('רוסיה, רומניה')
    expect(origin).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('button', { name: 'אישור ושמירת 1 תורמים' })).toBeEnabled()
  })

  it('reports an atomic save failure and keeps the review available for retry', async () => {
    const { container } = render(
      <PdfImport
        adminEmail="jgabbayj@gmail.com"
        repository={repository({ importApproved: vi.fn().mockRejectedValue(new Error('private diagnostics')) })}
        scanPdf={vi.fn().mockResolvedValue(scanResult)}
        extractPdf={vi.fn().mockResolvedValue({ ...deterministicMetadata, warnings: [], donors: [validDonor('A-1')] })}
      />,
    )
    upload(container)
    fireEvent.click(await screen.findByRole('button', { name: 'חילוץ נתונים' }))
    fireEvent.click(await screen.findByRole('button', { name: 'אישור ושמירת 1 תורמים' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('לא נשמרו שינויים')
    expect(screen.getByRole('button', { name: 'אישור ושמירת 1 תורמים' })).toBeEnabled()
    expect(screen.queryByText('private diagnostics')).not.toBeInTheDocument()
  })
})
