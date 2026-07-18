import { describe, expect, it } from 'vitest'

import { extractionJsonSchema, parseExtractionResponse } from './extractionSchema.js'

describe('Gemini extraction validation', () => {
  it('accepts a complete donor row', () => {
    const result = parseExtractionResponse(JSON.stringify({
      donors: [{
        donorNumber: 'Carson 1314', occupation: 'מהנדס', origin: 'אירופאי', religion: 'יהודי',
        skinColor: 'בהיר', eyeColor: 'כחול', hairColor: 'חום', heightMeters: 1.82,
        weightKg: 79, cmvIgg: 'שלילי',
      }],
      warnings: [],
    }))

    expect(result.donors[0]?.donorNumber).toBe('Carson 1314')
  })

  it('preserves a trailing three-asterisk donor marker for client-side status derivation', () => {
    const result = parseExtractionResponse(JSON.stringify({
      donors: [{
        donorNumber: 'Carson 1314***', occupation: '', origin: '', religion: '', skinColor: '',
        eyeColor: '', hairColor: '', heightMeters: 1.82, weightKg: 79, cmvIgg: 'שלילי',
      }],
      warnings: [],
    }))

    expect(result.donors[0]?.donorNumber).toBe('Carson 1314***')
  })

  it('rejects physiologically invalid numeric values', () => {
    expect(() => parseExtractionResponse(JSON.stringify({
      donors: [{
        donorNumber: '100', occupation: '', origin: '', religion: '', skinColor: '', eyeColor: '',
        hairColor: '', heightMeters: 18.2, weightKg: 79, cmvIgg: '',
      }],
      warnings: [],
    }))).toThrow()
  })

  it('keeps collection limits out of the Gemini schema', () => {
    expect(extractionJsonSchema.properties.donors).not.toHaveProperty('maxItems')
    expect(extractionJsonSchema.properties.warnings).not.toHaveProperty('maxItems')
  })
})
