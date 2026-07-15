import type { DonorInput } from '../donors/donor'
import { auth } from '../../lib/firebase'
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
}

export async function extractDonors(file: File, range: PdfScanResult) {
  const { prepareRelevantPdf } = await import('./prepareRelevantPdf')
  const prepared = await prepareRelevantPdf(file, range)
  const user = auth.currentUser
  if (!user) throw new Error('Administrator authentication is required.')
  const idToken = await user.getIdToken()
  const request: ExtractionRequest = {
    pdfBase64: prepared.pdfBase64, sourceFileName: file.name,
    startPage: range.startPage, endPage: range.endPage,
  }
  const response = await fetch('https://europe-west1-assuta-sperm-donations.cloudfunctions.net/extractDonorsFromPdf', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error('Donor extraction request failed.')
  return await response.json() as ExtractionResult
}
