import { describe, expect, it, vi } from 'vitest'

import { deleteDonorPageImages, donorPageObjectNames } from './donorPages.js'

describe('donor page cleanup', () => {
  it('targets all three images in the same opaque folder used by the admin app', () => {
    expect(donorPageObjectNames(' D-5000 ')).toEqual([
      'donor-pages/642d35303030/page-1.jpg',
      'donor-pages/642d35303030/page-2.jpg',
      'donor-pages/642d35303030/page-3.jpg',
    ])
  })

  it('clears both canonical and legacy carrier-marker folders', async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined)

    await expect(deleteDonorPageImages('D-4922***', deleteObject)).resolves.toBe(6)
    expect(deleteObject).toHaveBeenCalledTimes(6)
    expect(deleteObject.mock.calls.map(([objectName]) => objectName)).toEqual(expect.arrayContaining([
      'donor-pages/642d34393232/page-1.jpg',
      'donor-pages/642d343932322a2a2a/page-3.jpg',
    ]))
  })

  it('propagates deletion failures so the event can be retried', async () => {
    const deleteObject = vi.fn().mockRejectedValueOnce(new Error('temporary Storage failure'))
    await expect(deleteDonorPageImages('D-5000', deleteObject)).rejects.toThrow('temporary Storage failure')
  })
})
