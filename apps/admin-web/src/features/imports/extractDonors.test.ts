import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DeterministicExtractionFailure,
  extractDonorsDeterministically,
} from './deterministicExtraction'
import { extractDonors, extractionErrorMessages, mapExtractionHttpError } from './extractDonors'

vi.mock('../../lib/firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('safe-test-token') } },
}))

vi.mock('./prepareRelevantPdf', () => ({
  prepareRelevantPdf: vi.fn().mockResolvedValue({ pdfBase64: 'JVBERi0=', byteSize: 5 }),
}))

vi.mock('./deterministicExtraction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./deterministicExtraction')>()
  return { ...actual, extractDonorsDeterministically: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('extraction error mapping', () => {
  it.each([
    [400, extractionErrorMessages.request],
    [401, extractionErrorMessages.authentication],
    [403, extractionErrorMessages.authorization],
    [413, extractionErrorMessages.tooLarge],
    [429, extractionErrorMessages.busy],
    [500, extractionErrorMessages.server],
    [503, extractionErrorMessages.server],
  ])('maps HTTP %s to a safe useful Hebrew message', (status, message) => {
    expect(mapExtractionHttpError(status)).toBe(message)
  })

  it('never forwards raw server diagnostics', () => {
    expect(mapExtractionHttpError(418)).toBe(extractionErrorMessages.connection)
    expect(mapExtractionHttpError(418)).not.toContain('418')
  })

  it('parses the Function safe error code without exposing its raw response', () => {
    expect(mapExtractionHttpError(400, 'INVALID_AUTHENTICATION')).toBe(extractionErrorMessages.authentication)
    expect(mapExtractionHttpError(500, 'INVALID_EXTRACTION_REQUEST')).toBe(extractionErrorMessages.request)
    expect(mapExtractionHttpError(500, 'EXTRACTION_FAILED')).toBe(extractionErrorMessages.server)
  })
})

describe('hybrid extraction orchestration', () => {
  const range = { startPage: 2, endPage: 2, pageCount: 1, totalPages: 4, scannedPages: 2 }
  const donor = {
    donorNumber: 'D-1', occupation: '', origin: '', religion: '', skinColor: '',
    eyeColor: '', hairColor: '', heightMeters: 1.8, weightKg: 75, cmvIgg: 'שלילי',
  }

  it('uses the deterministic parser without contacting Gemini when confidence passes', async () => {
    vi.mocked(extractDonorsDeterministically).mockResolvedValue({ donors: [donor], warnings: [] })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await extractDonors(new File(['fixture'], 'fixture.pdf'), range)

    expect(result).toMatchObject({
      extractionMethod: 'deterministic', parserVersion: 'donor-table-v1',
      fallbackReason: null, model: 'donor-table-v1', donors: [donor],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls Gemini once and records the safe structural fallback reason when confidence fails', async () => {
    vi.mocked(extractDonorsDeterministically).mockRejectedValue(
      new DeterministicExtractionFailure('columns_ambiguous'),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ donors: [donor], warnings: [], model: 'gemini-test' }),
    }))
    const onFallback = vi.fn()

    const result = await extractDonors(new File(['fixture'], 'fixture.pdf'), range, { onFallback })

    expect(onFallback).toHaveBeenCalledWith('columns_ambiguous')
    expect(result).toMatchObject({
      extractionMethod: 'gemini-fallback', parserVersion: 'donor-table-v1',
      fallbackReason: 'columns_ambiguous', model: 'gemini-test', donors: [donor],
    })
  })
})
