import { describe, expect, it } from 'vitest'

import { donorDetailPdfPath, donorStorageKey } from './mediaRepository'

describe('donor media paths', () => {
  it('matches the backend UTF-8 hex storage key', () => {
    const number = 'Archie 1436'
    const expected = Array.from(new TextEncoder().encode(number.toLocaleLowerCase('he')))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('')
    expect(donorStorageKey(number)).toBe(expected)
    expect(donorDetailPdfPath(number)).toBe(`donor-pages/${expected}/details.pdf`)
  })

  it('removes legacy carrier markers before creating the path', () => {
    expect(donorStorageKey('Donor 1400***')).toBe(donorStorageKey('Donor 1400'))
  })
})
