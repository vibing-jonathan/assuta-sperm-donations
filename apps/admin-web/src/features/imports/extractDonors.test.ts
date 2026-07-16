import { describe, expect, it } from 'vitest'

import { extractionErrorMessages, mapExtractionHttpError } from './extractDonors'

describe('extraction error mapping', () => {
  it.each([
    [400, extractionErrorMessages.request],
    [401, extractionErrorMessages.authentication],
    [403, extractionErrorMessages.authorization],
    [413, extractionErrorMessages.tooLarge],
    [429, extractionErrorMessages.busy],
    [500, extractionErrorMessages.server],
    [503, extractionErrorMessages.server],
  ])('maps HTTP %s to a safe useful Hebrew message', (status, message) => {
    expect(mapExtractionHttpError(status)).toBe(message)
  })

  it('never forwards raw server diagnostics', () => {
    expect(mapExtractionHttpError(418)).toBe(extractionErrorMessages.connection)
    expect(mapExtractionHttpError(418)).not.toContain('418')
  })

  it('parses the Function safe error code without exposing its raw response', () => {
    expect(mapExtractionHttpError(400, 'INVALID_AUTHENTICATION')).toBe(extractionErrorMessages.authentication)
    expect(mapExtractionHttpError(500, 'INVALID_EXTRACTION_REQUEST')).toBe(extractionErrorMessages.request)
    expect(mapExtractionHttpError(500, 'EXTRACTION_FAILED')).toBe(extractionErrorMessages.server)
  })
})
