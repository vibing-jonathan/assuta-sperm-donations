import type { DonorInput } from '../donors/donor'
import { normalizeExtractedDonor } from '../donors/donorFieldRules'
import { auth } from '../../lib/firebase'
import {
  DETERMINISTIC_PARSER_VERSION,
  DeterministicExtractionFailure,
  extractDonorsDeterministically,
  type DeterministicFallbackReason,
} from './deterministicExtraction'
import type { PdfScanResult } from './scanDonorPdf'

interface ExtractionRequest {
  pdfBase64: string
  sourceFileName: string
  startPage: number
  endPage: number
}

export interface ExtractionResult {
  donors: DonorInput[]
  warnings: string[]
  model: string
  extractionMethod: 'deterministic' | 'gemini-fallback' | 'gemini-forced'
  parserVersion: string
  extractionDurationMs: number
  fallbackReason: DeterministicFallbackReason | null
}

interface GeminiExtractionResponse {
  donors: Array<Omit<DonorInput, 'geneticCarrierStatus'> & Partial<Pick<DonorInput, 'geneticCarrierStatus'>>>
  warnings: string[]
  model: string
}

export interface HybridExtractionOptions {
  onFallback?: (reason: DeterministicFallbackReason) => void
  forceGemini?: boolean
}

export const extractionErrorMessages = {
  authentication: 'החיבור למערכת פג. יש להתחבר מחדש ולנסות שוב.',
  authorization: 'אין לחשבון זה הרשאה לבצע חילוץ נתונים.',
  request: 'הקובץ או טווח העמודים אינם תקינים. בדקו את הקובץ ונסו שוב.',
  tooLarge: 'עמודי הטבלה גדולים מדי לחילוץ. נסו קובץ קטן יותר.',
  busy: 'שירות החילוץ עמוס כעת. המתינו מעט ונסו שוב.',
  server: 'שירות החילוץ לא הצליח לעבד את הקובץ. ניתן לנסות שוב בעוד כמה דקות.',
  connection: 'לא ניתן להתחבר לשירות החילוץ. בדקו את החיבור ונסו שוב.',
  response: 'התקבלה תשובה לא תקינה משירות החילוץ. נסו שוב.',
} as const

export function mapExtractionHttpError(status: number, safeCode?: string) {
  if (safeCode === 'AUTHENTICATION_REQUIRED' || safeCode === 'INVALID_AUTHENTICATION') {
    return extractionErrorMessages.authentication
  }
  if (safeCode === 'ADMIN_ACCESS_REQUIRED') return extractionErrorMessages.authorization
  if (safeCode === 'INVALID_EXTRACTION_REQUEST' || safeCode === 'METHOD_NOT_ALLOWED') {
    return extractionErrorMessages.request
  }
  if (safeCode === 'EXTRACTION_FAILED') return extractionErrorMessages.server
  if (status === 401) return extractionErrorMessages.authentication
  if (status === 403) return extractionErrorMessages.authorization
  if (status === 400 || status === 405 || status === 422) return extractionErrorMessages.request
  if (status === 413) return extractionErrorMessages.tooLarge
  if (status === 429) return extractionErrorMessages.busy
  if (status >= 500) return extractionErrorMessages.server
  return extractionErrorMessages.connection
}

export async function extractDonorsWithGemini(file: File, range: PdfScanResult) {
  const { prepareRelevantPdf } = await import('./prepareRelevantPdf')
  const prepared = await prepareRelevantPdf(file, range)
  const user = auth.currentUser
  if (!user) throw new Error(extractionErrorMessages.authentication)
  let idToken: string
  try {
    idToken = await user.getIdToken()
  } catch {
    throw new Error(extractionErrorMessages.authentication)
  }
  const request: ExtractionRequest = {
    pdfBase64: prepared.pdfBase64, sourceFileName: file.name,
    startPage: range.startPage, endPage: range.endPage,
  }
  let response: Response
  try {
    response = await fetch('https://europe-west1-assuta-sperm-donations.cloudfunctions.net/extractDonorsFromPdf', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
  } catch {
    throw new Error(extractionErrorMessages.connection)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null
    const safeCode = typeof payload?.error === 'string' ? payload.error : undefined
    throw new Error(mapExtractionHttpError(response.status, safeCode))
  }
  try {
    return await response.json() as GeminiExtractionResponse
  } catch {
    throw new Error(extractionErrorMessages.response)
  }
}

export async function extractDonors(
  file: File,
  range: PdfScanResult,
  options: HybridExtractionOptions = {},
): Promise<ExtractionResult> {
  const startedAt = Date.now()
  if (options.forceGemini) {
    const extracted = await extractDonorsWithGemini(file, range)
    return {
      ...extracted,
      donors: extracted.donors.map(normalizeExtractedDonor),
      extractionMethod: 'gemini-forced',
      parserVersion: DETERMINISTIC_PARSER_VERSION,
      extractionDurationMs: Date.now() - startedAt,
      fallbackReason: null,
    }
  }

  try {
    const extracted = await extractDonorsDeterministically(file, range)
    return {
      ...extracted,
      donors: extracted.donors.map(normalizeExtractedDonor),
      model: DETERMINISTIC_PARSER_VERSION,
      extractionMethod: 'deterministic',
      parserVersion: DETERMINISTIC_PARSER_VERSION,
      extractionDurationMs: Date.now() - startedAt,
      fallbackReason: null,
    }
  } catch (error) {
    const fallbackReason = error instanceof DeterministicExtractionFailure
      ? error.reason
      : 'unsupported_layout'
    options.onFallback?.(fallbackReason)
    const extracted = await extractDonorsWithGemini(file, range)
    return {
      ...extracted,
      donors: extracted.donors.map(normalizeExtractedDonor),
      extractionMethod: 'gemini-fallback',
      parserVersion: DETERMINISTIC_PARSER_VERSION,
      extractionDurationMs: Date.now() - startedAt,
      fallbackReason,
    }
  }
}
