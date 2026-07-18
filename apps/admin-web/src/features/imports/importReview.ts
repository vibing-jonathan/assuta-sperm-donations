import {
  normalizeDonorNumber,
  validateImportDonor,
  type DonorInput,
  type DonorValidationErrors,
} from '../donors/donor'

export interface ReviewRow {
  id: string
  donor: DonorInput
  selected: boolean
}

export interface ReviewedRow extends ReviewRow {
  duplicateKind: 'existing' | 'within-file' | null
  errors: DonorValidationErrors
  eligible: boolean
}

export function createReviewRows(donors: DonorInput[]): ReviewRow[] {
  return donors.map((donor, index) => ({ id: `row-${index + 1}`, donor, selected: true }))
}

export function analyzeReviewRows(rows: ReviewRow[], existingNumbers: ReadonlySet<string>): ReviewedRow[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    const normalized = normalizeDonorNumber(row.donor.donorNumber)
    let duplicateKind: ReviewedRow['duplicateKind'] = null
    if (normalized && existingNumbers.has(normalized)) duplicateKind = 'existing'
    else if (normalized && seen.has(normalized)) duplicateKind = 'within-file'
    if (normalized) seen.add(normalized)
    const errors = validateImportDonor(row.donor)
    return {
      ...row,
      duplicateKind,
      errors,
      eligible: duplicateKind !== 'within-file' && Object.keys(errors).length === 0,
    }
  })
}

export function selectedValidDonors(rows: ReviewedRow[]) {
  return rows.filter((row) => row.selected && row.eligible).map((row) => row.donor)
}
