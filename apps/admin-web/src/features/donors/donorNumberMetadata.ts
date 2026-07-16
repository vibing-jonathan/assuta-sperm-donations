export type GeneticCarrierStatus = 'חיובי' | 'שלילי'

export function parseDonorNumberMetadata(value: string): {
  donorNumber: string
  geneticCarrierStatus: GeneticCarrierStatus
} {
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  const trailingAsterisks = normalized.match(/\*+\s*$/)?.[0].trim() ?? ''
  const hasNegativeMarker = trailingAsterisks === '***'
  return {
    donorNumber: hasNegativeMarker ? normalized.slice(0, -3).trimEnd() : normalized,
    geneticCarrierStatus: hasNegativeMarker ? 'שלילי' : 'חיובי',
  }
}

export function displayedDonorMetadata(input: {
  donorNumber: string
  geneticCarrierStatus?: unknown
}) {
  const parsed = parseDonorNumberMetadata(input.donorNumber)
  const storedStatus = input.geneticCarrierStatus
  return {
    donorNumber: parsed.donorNumber,
    geneticCarrierStatus: storedStatus === 'חיובי' || storedStatus === 'שלילי'
      ? storedStatus
      : parsed.geneticCarrierStatus,
  }
}
