import { describe, expect, it } from 'vitest'

import type { Donor } from '../donors/donor'
import { ANY_OPTION, colorValues, hairAttributes, rankClosestDonors } from './matching'
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
    const close = donor({ id: 'close', donorNumber: 'Close', eyeColor: 'כחול', hairColor: 'שחור, גלי' })
    const partial = donor({ id: 'partial', donorNumber: 'Partial', eyeColor: 'כחול', hairColor: 'חום, חלק' })
    const far = donor({ id: 'far', donorNumber: 'Far', eyeColor: 'ירוק', hairColor: 'בלונד, מתולתל' })
    const ranked = rankClosestDonors([far, partial, close], { eyeColor: 'כחול', hairTexture: 'גלי' })
    expect(ranked.map((item) => item.donor.id)).toEqual(['close', 'partial', 'far'])
    expect(ranked).toHaveLength(3)
    expect(ranked[0]?.score).toBe(100)
  })

  it('does not count “לא משנה לי” as an active preference', () => {
    const ranked = rankClosestDonors([donor({})], { eyeColor: ANY_OPTION, origin: [ANY_OPTION] })
    expect(ranked[0]?.score).toBeNull()
    expect(ranked[0]?.activePreferenceCount).toBe(0)
  })

  it('uses partial origin overlap instead of filtering', () => {
    const both = donor({ id: 'both', origin: 'ישראל, רוסיה' })
    const one = donor({ id: 'one', origin: 'ישראל' })
    const neither = donor({ id: 'neither', origin: 'פולין' })
    const ranked = rankClosestDonors([neither, one, both], { origin: ['ישראל', 'רוסיה'] })
    expect(ranked.map((item) => item.donor.id)).toEqual(['both', 'one', 'neither'])
    expect(ranked.map((item) => item.score)).toEqual([100, 50, 0])
  })

  it('gives carrier and CMV preferences more influence than appearance preferences', () => {
    const medicallyCloser = donor({ id: 'medical', geneticCarrierStatus: 'שלילי', cmvIgg: 'שלילי', eyeColor: 'חום' })
    const visuallyCloser = donor({ id: 'visual', geneticCarrierStatus: 'חיובי', cmvIgg: 'חיובי', eyeColor: 'כחול' })
    const ranked = rankClosestDonors([visuallyCloser, medicallyCloser], {
      carrierFree: 'כן', cmvNegative: 'כן', eyeColor: 'כחול',
    })
    expect(ranked[0]?.donor.id).toBe('medical')
  })

  it('matches every distinctive eye and hair color in a composite value', () => {
    const composite = donor({ id: 'composite', eyeColor: 'חום-ירוק', hairColor: 'חום-שחור, גלי' })

    expect(rankClosestDonors([composite], { eyeColor: 'חום' })[0]?.score).toBe(100)
    expect(rankClosestDonors([composite], { eyeColor: 'ירוק' })[0]?.score).toBe(100)
    expect(rankClosestDonors([composite], { hairColor: 'חום' })[0]?.score).toBe(100)
    expect(rankClosestDonors([composite], { hairColor: 'שחור' })[0]?.score).toBe(100)
  })
})

describe('dynamic questions', () => {
  it('derives answer values from donor data and separates hair color from texture', () => {
    const donors = [
      donor({ origin: 'ישראל, רוסיה', eyeColor: 'חום-ירוק', hairColor: 'חום בהיר-שחור, גלי' }),
      donor({ id: 'two', origin: 'פולין', eyeColor: 'כחול', hairColor: 'שחור, מתולתל' }),
    ]
    const questions = buildQuestions(donors)
    expect(questions.find((question) => question.key === 'origin')?.options)
      .toEqual(expect.arrayContaining(['ישראל', 'רוסיה', 'פולין', ANY_OPTION]))
    expect(questions.find((question) => question.key === 'hairColor')?.options)
      .toEqual(expect.arrayContaining(['חום בהיר', 'שחור', ANY_OPTION]))
    expect(questions.find((question) => question.key === 'hairColor')?.options)
      .not.toContain('חום בהיר-שחור')
    expect(questions.find((question) => question.key === 'hairTexture')?.options)
      .toEqual(['גלי', 'מתולתל', ANY_OPTION])
    expect(questions.find((question) => question.key === 'eyeColor')?.options)
      .toEqual(expect.arrayContaining(['חום', 'ירוק', 'כחול', ANY_OPTION]))
    expect(questions.find((question) => question.key === 'eyeColor')?.options)
      .not.toContain('חום-ירוק')
  })

  it('parses combined hair attributes', () => {
    expect(hairAttributes('חום כהה, מתולתל')).toEqual({ colors: ['חום כהה'], textures: ['מתולתל'] })
    expect(hairAttributes('חום-שחור, גלי')).toEqual({ colors: ['חום', 'שחור'], textures: ['גלי'] })
  })

  it('splits distinct colors but keeps shade modifiers attached', () => {
    expect(colorValues('חום-ירוק / כחול')).toEqual(['חום', 'ירוק', 'כחול'])
    expect(colorValues('חום-בהיר')).toEqual(['חום בהיר'])
  })
})
