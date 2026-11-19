import { describe, expect, it } from 'vitest'

import {
  InvalidDonorMediaPathError,
  canReadDonorMedia,
  donorMediaContentType,
  readDonorMediaPath,
} from './donorMedia.js'

describe('donor media access', () => {
  it('accepts only profile photos and generated detail PDFs', () => {
    const imagePath = `donor-profile-images/donor_1/${'a'.repeat(64)}.jpg`
    const pdfPath = 'donor-pages/646f6e6f722031303031/details.pdf'

    expect(readDonorMediaPath(imagePath)).toBe(imagePath)
    expect(readDonorMediaPath(pdfPath)).toBe(pdfPath)
    expect(donorMediaContentType(imagePath)).toBe('image/jpeg')
    expect(donorMediaContentType(pdfPath)).toBe('application/pdf')
  })

  it('rejects unrelated files and path traversal', () => {
    expect(() => readDonorMediaPath('donor-pages/key/page-1.jpg')).toThrow(InvalidDonorMediaPathError)
    expect(() => readDonorMediaPath('../storage.rules')).toThrow(InvalidDonorMediaPathError)
    expect(() => readDonorMediaPath(['donor-pages/key/details.pdf'])).toThrow(InvalidDonorMediaPathError)
  })

  it('allows only restricted user-app sessions and approved administrators', () => {
    expect(canReadDonorMedia({ userApp: true })).toBe(true)
    expect(canReadDonorMedia({ email: 'jgabbayj@gmail.com' })).toBe(true)
    expect(canReadDonorMedia({ email: 'someone@example.com' })).toBe(false)
    expect(canReadDonorMedia({})).toBe(false)
  })
})
