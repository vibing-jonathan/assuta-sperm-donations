import { describe, expect, it } from 'vitest'

import type { DonorInput } from '../donors/donor'
import {
  executeAtomicImport,
  MAX_DONORS_PER_IMPORT,
  type AtomicImportStore,
  type AtomicTransaction,
} from './importRepository'

const donor = (donorNumber: string): DonorInput => ({
  donorNumber, occupation: '', origin: '', religion: '', skinColor: '', eyeColor: '', hairColor: '',
  heightMeters: 1.8, weightKg: 75, cmvIgg: 'שלילי',
})

function fakeStore(existingClaims: Set<string> = new Set()) {
  let sequence = 0
  const committed = new Map<string, Record<string, unknown>>()
  const store: AtomicImportStore = {
    createId: (collectionName) => `${collectionName}-${++sequence}`,
    timestamp: () => 'server-time',
    async write(path, data) { committed.set(path, data) },
    async runTransaction(operation) {
      const pending = new Map<string, Record<string, unknown>>()
      const transaction: AtomicTransaction = {
        get: async (path) => ({ exists: existingClaims.has(path) }),
        set: (path, data) => { pending.set(path, data) },
      }
      const result = await operation(transaction)
      pending.forEach((value, key) => committed.set(key, value))
      return result
    },
  }
  return { store, committed }
}

const context = {
  sourceFileName: 'fixture.pdf', startPage: 2, endPage: 4, pageCount: 3,
  model: 'gemini-test', adminEmail: 'jgabbayj@gmail.com', warnings: ['בדיקה'],
}

describe('atomic donor import', () => {
  it('commits donor, uniqueness claim, and complete audit metadata together', async () => {
    const { store, committed } = fakeStore()
    const result = await executeAtomicImport(store, {
      ...context, donors: [donor('A-1')], skippedDuplicateNumbers: ['OLD-1'],
    })

    expect(result).toMatchObject({ importedCount: 1, skippedCount: 1 })
    expect([...committed.keys()].filter((path) => path.startsWith('donors/'))).toHaveLength(1)
    expect([...committed.keys()].filter((path) => path.startsWith('donorNumberClaims/'))).toHaveLength(1)
    const audit = [...committed.entries()].find(([path]) => path.startsWith('donorImports/'))?.[1]
    expect(audit).toMatchObject({
      sourceFileName: 'fixture.pdf', detectedStartPage: 2, detectedEndPage: 4,
      detectedPageCount: 3, geminiModel: 'gemini-test', importedBy: 'jgabbayj@gmail.com',
      approvedCount: 1, importedCount: 1, skippedCount: 1, status: 'completed',
      outcome: 'imported_with_skips', importedAt: 'server-time',
    })
  })

  it('rechecks claims inside the transaction and skips a concurrent duplicate', async () => {
    const probe = fakeStore()
    await executeAtomicImport(probe.store, { ...context, donors: [donor('A-1')], skippedDuplicateNumbers: [] })
    const claimPath = [...probe.committed.keys()].find((path) => path.startsWith('donorNumberClaims/'))!
    const { store, committed } = fakeStore(new Set([claimPath]))

    const result = await executeAtomicImport(store, { ...context, donors: [donor('A-1')], skippedDuplicateNumbers: [] })
    expect(result).toMatchObject({ importedCount: 0, skippedCount: 1 })
    expect([...committed.keys()].some((path) => path.startsWith('donors/'))).toBe(false)
    expect([...committed.values()].find((value) => value.status === 'completed')).toMatchObject({
      outcome: 'duplicates_skipped', importedCount: 0,
    })
  })

  it('rejects imports that could exceed the Firestore 500-write limit before starting a transaction', async () => {
    const { store, committed } = fakeStore()
    await expect(executeAtomicImport(store, {
      ...context,
      donors: Array.from({ length: MAX_DONORS_PER_IMPORT + 1 }, (_, index) => donor(String(index))),
      skippedDuplicateNumbers: [],
    })).rejects.toThrow('at most 249')
    expect(committed.size).toBe(0)
  })

  it('leaves no donor writes and records a safe failed audit when the atomic transaction aborts', async () => {
    const { store, committed } = fakeStore()
    store.runTransaction = async () => { throw new Error('transaction unavailable') }

    await expect(executeAtomicImport(store, {
      ...context, donors: [donor('A-1')], skippedDuplicateNumbers: ['OLD-1'],
    })).rejects.toThrow('transaction unavailable')
    expect([...committed.keys()].some((path) => path.startsWith('donors/'))).toBe(false)
    expect([...committed.values()].find((value) => value.status === 'failed')).toMatchObject({
      outcome: 'import_failed', importedCount: 0, skippedCount: 1,
    })
  })
})
