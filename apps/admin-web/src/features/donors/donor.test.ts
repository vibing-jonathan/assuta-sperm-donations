import { describe, expect, it } from 'vitest'

import { emptyDonorInput, validateDonor } from './donor'

describe('validateDonor', () => {
  it('requires a donor number', () => {
    expect(validateDonor(emptyDonorInput)).toBe('יש להזין מספר תורם.')
  })

  it('accepts the supported donor fields', () => {
    expect(
      validateDonor({
        ...emptyDonorInput,
        donorNumber: '1024',
        heightMeters: 1.82,
        weightKg: 78,
      }),
    ).toBeNull()
  })

  it('rejects values outside sensible measurement ranges', () => {
    expect(validateDonor({ ...emptyDonorInput, donorNumber: '1', heightMeters: 3 })).toContain(
      'הגובה',
    )
    expect(validateDonor({ ...emptyDonorInput, donorNumber: '1', weightKg: 20 })).toContain(
      'המשקל',
    )
  })
})
