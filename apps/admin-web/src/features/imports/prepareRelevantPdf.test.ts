import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { prepareRelevantPdf } from './prepareRelevantPdf'

describe('relevant PDF preparation', () => {
  it('copies only the requested consecutive pages', async () => {
    const source = await PDFDocument.create()
    for (let index = 0; index < 10; index += 1) source.addPage([200, 200])
    const bytes = await source.save()
    const fileBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(fileBuffer).set(bytes)
    const file = new File([fileBuffer], 'catalog.pdf', { type: 'application/pdf' })

    const prepared = await prepareRelevantPdf(file, { startPage: 2, endPage: 8, pageCount: 7 })
    const decoded = Uint8Array.from(atob(prepared.pdfBase64), (character) => character.charCodeAt(0))
    const subset = await PDFDocument.load(decoded)

    expect(subset.getPageCount()).toBe(7)
    expect(prepared.byteSize).toBeLessThan(bytes.byteLength)
  })
})
