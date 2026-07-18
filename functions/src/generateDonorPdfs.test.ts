import { describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import {
  generateAndStoreDonorPdfs,
  InvalidDonorPdfRequestError,
  readDonorPdfGenerationRequest,
} from './generateDonorPdfs.js'

function envelope(metadata: unknown, pdf: Uint8Array) {
  const metadataBytes = Buffer.from(JSON.stringify(metadata), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(metadataBytes.byteLength)
  return Buffer.concat([header, metadataBytes, Buffer.from(pdf)])
}

async function sourcePdf(pageCount = 5) {
  const source = await PDFDocument.create()
  Array.from({ length: pageCount }, (_, index) => source.addPage([200 + index, 300 + index]))
  return source.save({ useObjectStreams: true })
}

describe('server-side donor PDF generation', () => {
  it('reads the binary envelope without base64 expansion', async () => {
    const pdf = await sourcePdf()
    const metadata = {
      summaryEndPage: 2,
      sources: [{ sourceIndex: 0, sourceDonorNumber: 'D-5000', donorNumber: 'D-5000' }],
    }

    const parsed = readDonorPdfGenerationRequest(envelope(metadata, pdf))

    expect(parsed.summaryEndPage).toBe(2)
    expect(parsed.sources).toEqual(metadata.sources)
    expect(parsed.sourcePdf.byteLength).toBe(pdf.byteLength)
  })

  it('creates exactly three original pages and uploads to the opaque donor path', async () => {
    const pdf = await sourcePdf()
    const savePdf = vi.fn().mockResolvedValue(undefined)

    const result = await generateAndStoreDonorPdfs({
      summaryEndPage: 2,
      sources: [{ sourceIndex: 0, sourceDonorNumber: 'D-5000', donorNumber: 'D-5000' }],
      sourcePdf: Buffer.from(pdf),
    }, savePdf)

    expect(savePdf).toHaveBeenCalledTimes(1)
    expect(savePdf.mock.calls[0]?.[0]).toBe('donor-pages/642d35303030/details.pdf')
    const generated = await PDFDocument.load(savePdf.mock.calls[0]?.[1] as Buffer)
    expect(generated.getPageCount()).toBe(3)
    expect(generated.getPages().map((page) => page.getWidth())).toEqual([202, 203, 204])
    expect(result).toEqual(expect.objectContaining({
      uploadedDonorCount: 1,
      uploadedPdfCount: 1,
      sourcePdfBytes: pdf.byteLength,
    }))
    expect(result.generatedPdfBytes).toBeGreaterThan(0)
  })

  it('rejects duplicate targets and incomplete page groups before writing', async () => {
    const pdf = await sourcePdf()
    const duplicateMetadata = {
      summaryEndPage: 2,
      sources: [
        { sourceIndex: 0, sourceDonorNumber: 'D-5000', donorNumber: 'D-5000' },
        { sourceIndex: 1, sourceDonorNumber: 'D-5000', donorNumber: ' d-5000 ' },
      ],
    }
    expect(() => readDonorPdfGenerationRequest(envelope(duplicateMetadata, pdf)))
      .toThrow(InvalidDonorPdfRequestError)

    const savePdf = vi.fn()
    await expect(generateAndStoreDonorPdfs({
      summaryEndPage: 4,
      sources: [{ sourceIndex: 0, sourceDonorNumber: 'D-5000', donorNumber: 'D-5000' }],
      sourcePdf: Buffer.from(pdf),
    }, savePdf)).rejects.toThrow(InvalidDonorPdfRequestError)
    expect(savePdf).not.toHaveBeenCalled()
  })
})
