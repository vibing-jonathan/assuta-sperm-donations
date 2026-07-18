import { describe, expect, it, vi } from 'vitest'

import { DELETE_BATCH_SIZE, deleteReferencesInBatches } from './deleteDonors.js'

describe('bulk donor deletion', () => {
  it('does nothing when there are no records', async () => {
    const commitBatch = vi.fn()
    await deleteReferencesInBatches([], commitBatch)
    expect(commitBatch).not.toHaveBeenCalled()
  })

  it('keeps every Firestore batch below the write limit', async () => {
    const references = Array.from({ length: DELETE_BATCH_SIZE * 2 + 1 }, (_, index) => `document-${index}`)
    const commitBatch = vi.fn().mockResolvedValue(undefined)

    await deleteReferencesInBatches(references, commitBatch)

    expect(commitBatch).toHaveBeenCalledTimes(3)
    expect(commitBatch.mock.calls.map(([batch]) => batch.length)).toEqual([450, 450, 1])
    expect(commitBatch.mock.calls.flatMap(([batch]) => batch)).toEqual(references)
  })

  it('stops and reports a failed batch so the administrator can retry', async () => {
    const commitBatch = vi.fn().mockRejectedValueOnce(new Error('Firestore unavailable'))
    await expect(deleteReferencesInBatches(['donor'], commitBatch)).rejects.toThrow('Firestore unavailable')
  })
})
