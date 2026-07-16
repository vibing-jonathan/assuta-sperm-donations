import { describe, expect, it } from 'vitest'

import { displayedDonorMetadata, parseDonorNumberMetadata } from './donorNumberMetadata'

describe('donor number metadata', () => {
  it('marks exactly three trailing asterisks as a negative genetic carrier status', () => {
    expect(parseDonorNumberMetadata(' D-300*** ')).toEqual({
      donorNumber: 'D-300', geneticCarrierStatus: 'שלילי',
    })
  })

  it('infers positive for unmarked or differently marked donor numbers', () => {
    expect(parseDonorNumberMetadata('D-301')).toEqual({
      donorNumber: 'D-301', geneticCarrierStatus: 'חיובי',
    })
    expect(parseDonorNumberMetadata('D-302****')).toEqual({
      donorNumber: 'D-302****', geneticCarrierStatus: 'חיובי',
    })
  })

  it('derives legacy display metadata while preferring a persisted status', () => {
    expect(displayedDonorMetadata({ donorNumber: 'D-303***' })).toEqual({
      donorNumber: 'D-303', geneticCarrierStatus: 'שלילי',
    })
    expect(displayedDonorMetadata({ donorNumber: 'D-304', geneticCarrierStatus: 'שלילי' })).toEqual({
      donorNumber: 'D-304', geneticCarrierStatus: 'שלילי',
    })
  })
})
