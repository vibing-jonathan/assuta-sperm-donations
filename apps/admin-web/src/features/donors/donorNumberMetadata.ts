export type GeneticCarrierStatus = 'חיובי' | 'שלילי'

export function parseDonorNumberMetadata(value: string): {
  donorNumber: string
  geneticCarrierStatus: GeneticCarrierStatus
} {
  const normalized = value
    .normalize('NFKC')
    .replace(/[﹡＊∗]/g, '*')
    .replace(/\s+/g, ' ')
    .trim()
  const hasNegativeMarker = (normalized.match(/\*/g) ?? []).length === 3
  return {
    donorNumber: hasNegativeMarker
      ? normalized.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
      : normalized,
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
