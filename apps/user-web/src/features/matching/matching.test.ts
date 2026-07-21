import { describe, expect, it } from 'vitest'

import type { Donor } from '../donors/donor'
import {
  ANY_OPTION,
  DARK_EYES_OPTION,
  LIGHT_EYES_OPTION,
  eyeShade,
  rankClosestDonors,
} from './matching'
import { buildQuestions } from './questions'

function donor(overrides: Partial<Donor>): Donor {
  return {
    id: 'one',
    donorNumber: 'Donor 1001',
    geneticCarrierStatus: 'חיובי',
    occupation: '',
    origin: 'ישראל',
    religion: 'יהודי',
    skinColor: 'בהיר',
    eyeColor: 'חום',
    hairColor: 'חום, חלק',
    heightMeters: 1.8,
    weightKg: 80,
    cmvIgg: 'חיובי',
    ...overrides,
  }
}

describe('closest donor ranking', () => {
  it('keeps every donor and ranks the closest one first', () => {
    const close = donor({ id: 'close', donorNumber: 'Close', eyeColor: 'כחול' })
    const partial = donor({ id: 'partial', donorNumber: 'Partial', eyeColor: 'ירוק' })
    const far = donor({ id: 'far', donorNumber: 'Far', eyeColor: 'חום' })
    const ranked = rankClosestDonors([far, partial, close], { eyeColor: LIGHT_EYES_OPTION })
    expect(ranked.map((item) => item.donor.id)).toEqual(['close', 'partial', 'far'])
    expect(ranked).toHaveLength(3)
    expect(ranked[0]?.score).toBe(100)
  })

  it('does not count “לא משנה לי” as an active preference', () => {
    const ranked = rankClosestDonors([donor({})], { eyeColor: ANY_OPTION })
    expect(ranked[0]?.score).toBeNull()
    expect(ranked[0]?.activePreferenceCount).toBe(0)
  })

  it('gives carrier and CMV preferences more influence than appearance preferences', () => {
    const medicallyCloser = donor({ id: 'medical', geneticCarrierStatus: 'שלילי', cmvIgg: 'שלילי', eyeColor: 'חום' })
    const visuallyCloser = donor({ id: 'visual', geneticCarrierStatus: 'חיובי', cmvIgg: 'חיובי', eyeColor: 'כחול' })
    const ranked = rankClosestDonors([visuallyCloser, medicallyCloser], {
      carrierFree: 'כן', cmvNegative: 'כן', eyeColor: LIGHT_EYES_OPTION,
    })
    expect(ranked[0]?.donor.id).toBe('medical')
  })

  it('groups detailed eye colors into light and dark eyes', () => {
    expect(eyeShade('כחול-ירוק')).toBe(LIGHT_EYES_OPTION)
    expect(eyeShade('אפור בהיר')).toBe(LIGHT_EYES_OPTION)
    expect(eyeShade('חום')).toBe(DARK_EYES_OPTION)
    expect(eyeShade('שחור')).toBe(DARK_EYES_OPTION)
    expect(eyeShade('')).toBeNull()

    expect(rankClosestDonors([donor({ eyeColor: 'ירוק' })], { eyeColor: LIGHT_EYES_OPTION })[0]?.score).toBe(100)
    expect(rankClosestDonors([donor({ eyeColor: 'חום' })], { eyeColor: LIGHT_EYES_OPTION })[0]?.score).toBe(0)
  })
})

describe('dynamic questions', () => {
  it('omits country and hair preferences and offers only grouped eye shades', () => {
    const donors = [
      donor({ origin: 'ישראל, רוסיה', religion: 'יהודי, לאחר גיור', eyeColor: 'חום-ירוק', hairColor: 'חום בהיר-שחור, גלי' }),
      donor({ id: 'two', origin: 'פולין', religion: 'לאחר גיור', eyeColor: 'כחול', hairColor: 'שחור, מתולתל' }),
    ]
    const questions = buildQuestions(donors)
    expect(questions.map((question) => question.key)).toEqual([
      'religion', 'carrierFree', 'cmvNegative', 'skinColor', 'eyeColor',
    ])
    expect(questions.find((question) => question.key === 'eyeColor')?.options)
      .toEqual([LIGHT_EYES_OPTION, DARK_EYES_OPTION, ANY_OPTION])
    expect(questions.find((question) => question.key === 'religion')?.options)
      .toEqual(['יהודי', ANY_OPTION])
  })
})
