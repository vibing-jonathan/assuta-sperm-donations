import { describe, expect, it } from 'vitest'

import { emptyDonorInput } from './donor'
import { normalizeDonorForPersistence } from './donorRepository'

describe('donor repository persistence normalization', () => {
  it('preserves a manually selected negative genetic carrier status', () => {
    expect(normalizeDonorForPersistence({
      ...emptyDonorInput,
      donorNumber: 'D-500',
      geneticCarrierStatus: 'שלילי',
    })).toMatchObject({
      donorNumber: 'D-500',
      geneticCarrierStatus: 'שלילי',
    })
  })

  it('still recognizes the legacy three-asterisk carrier marker', () => {
    expect(normalizeDonorForPersistence({
      ...emptyDonorInput,
      donorNumber: 'D-501***',
      geneticCarrierStatus: 'חיובי',
    })).toMatchObject({
      donorNumber: 'D-501',
      geneticCarrierStatus: 'שלילי',
    })
  })
})
