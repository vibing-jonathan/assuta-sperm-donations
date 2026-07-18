import { describe, expect, it } from 'vitest'

import { donorNumberClaimId, type DonorInput } from '../donors/donor'
import {
  executeAtomicImport,
  MAX_DONORS_PER_IMPORT,
  type AtomicImportStore,
  type AtomicTransaction,
} from './importRepository'

const donor = (donorNumber: string): DonorInput => ({
  donorNumber, geneticCarrierStatus: 'חיובי', occupation: '', origin: '', religion: '', skinColor: '', eyeColor: '', hairColor: '',
  heightMeters: 1.8, weightKg: 75, cmvIgg: 'שלילי',
})

function fakeStore(existingDocuments: Map<string, Record<string, unknown>> = new Map()) {
  let sequence = 0
  const committed = new Map(existingDocuments)
  const store: AtomicImportStore = {
    createId: (collectionName) => `${collectionName}-${++sequence}`,
    timestamp: () => 'server-time',
    async write(path, data) { committed.set(path, data) },
    async runTransaction(operation) {
      const pending = new Map<string, Record<string, unknown>>()
      const transaction: AtomicTransaction = {
        get: async (path) => ({ exists: committed.has(path), data: committed.get(path) }),
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
  model: 'donor-table-v2', extractionMethod: 'deterministic' as const,
  parserVersion: 'donor-table-v2', extractionDurationMs: 418, fallbackReason: null,
  adminEmail: 'jgabbayj@gmail.com', warnings: ['בדיקה'],
}

describe('atomic donor import', () => {
  it('commits donor, uniqueness claim, and complete audit metadata together', async () => {
    const { store, committed } = fakeStore()
    const result = await executeAtomicImport(store, {
      ...context, donors: [donor('A-1')], skippedDuplicateNumbers: ['OLD-1'],
    })

    expect(result).toMatchObject({ importedCount: 1, replacedCount: 0, skippedCount: 1 })
    expect([...committed.keys()].filter((path) => path.startsWith('donors/'))).toHaveLength(1)
    expect([...committed.keys()].filter((path) => path.startsWith('donorNumberClaims/'))).toHaveLength(1)
    const audit = [...committed.entries()].find(([path]) => path.startsWith('donorImports/'))?.[1]
    expect(audit).toMatchObject({
      sourceFileName: 'fixture.pdf', detectedStartPage: 2, detectedEndPage: 4,
      detectedPageCount: 3, geminiModel: null, extractionMethod: 'deterministic',
      parserVersion: 'donor-table-v2', extractionDurationMs: 418, fallbackReason: null,
      importedBy: 'jgabbayj@gmail.com',
      approvedCount: 1, importedCount: 1, replacedCount: 0, skippedCount: 1,
      replacedDonorNumbers: [], status: 'completed',
      outcome: 'imported_with_skips', importedAt: 'server-time',
    })
  })

  it('stores a starred source number as a clean number with negative carrier status', async () => {
    const { store, committed } = fakeStore()
    await executeAtomicImport(store, {
      ...context, donors: [donor('A-8***')], skippedDuplicateNumbers: [],
    })

    const storedDonor = [...committed.entries()].find(([path]) => path.startsWith('donors/'))?.[1]
    expect(storedDonor).toMatchObject({
      donorNumber: 'A-8', geneticCarrierStatus: 'שלילי',
    })
  })

  it('defensively skips repeated numbers within the approved input', async () => {
    const { store, committed } = fakeStore()
    const result = await executeAtomicImport(store, {
      ...context, donors: [donor('A-7'), donor(' a-7 ')], skippedDuplicateNumbers: [],
    })

    expect(result).toMatchObject({
      importedCount: 1, replacedCount: 0, skippedCount: 1,
      skippedDuplicateNumbers: ['a-7'],
    })
    expect([...committed.keys()].filter((path) => path.startsWith('donors/'))).toHaveLength(1)
  })

  it('rechecks claims inside the transaction and atomically replaces an existing donor', async () => {
    const claimPath = `donorNumberClaims/${donorNumberClaimId('A-1')}`
    const donorPath = 'donors/existing-donor'
    const existingDocuments = new Map<string, Record<string, unknown>>([
      [claimPath, { donorId: 'existing-donor', donorNumber: 'A-1' }],
      [donorPath, {
        ...donor('A-1'), occupation: 'ישן', createdAt: 'original-time', createdBy: 'original-admin',
        updatedAt: 'original-time', updatedBy: 'original-admin',
      }],
    ])
    const { store, committed } = fakeStore(existingDocuments)

    const result = await executeAtomicImport(store, {
      ...context, donors: [{ ...donor('A-1'), occupation: 'חדש' }], skippedDuplicateNumbers: [],
    })
    expect(result).toMatchObject({
      importedCount: 0, replacedCount: 1, skippedCount: 0, replacedDonorNumbers: ['A-1'],
    })
    expect(committed.get(donorPath)).toMatchObject({
      occupation: 'חדש', createdAt: 'original-time', createdBy: 'original-admin',
      updatedAt: 'server-time', updatedBy: 'jgabbayj@gmail.com',
    })
    expect([...committed.values()].find((value) => value.status === 'completed')).toMatchObject({
      outcome: 'replaced', importedCount: 0, replacedCount: 1,
    })
  })

  it('replaces through a legacy starred claim and creates the canonical claim', async () => {
    const legacyClaimPath = `donorNumberClaims/${donorNumberClaimId('A-9***')}`
    const canonicalClaimPath = `donorNumberClaims/${donorNumberClaimId('A-9')}`
    const donorPath = 'donors/legacy-donor'
    const { store, committed } = fakeStore(new Map<string, Record<string, unknown>>([
      [legacyClaimPath, { donorId: 'legacy-donor', donorNumber: 'A-9***' }],
      [donorPath, {
        ...donor('A-9'), createdAt: 'original-time', createdBy: 'original-admin',
        updatedAt: 'original-time', updatedBy: 'original-admin',
      }],
    ]))

    const result = await executeAtomicImport(store, {
      ...context, donors: [donor('A-9')], skippedDuplicateNumbers: [],
    })

    expect(result).toMatchObject({ importedCount: 0, replacedCount: 1, skippedCount: 0 })
    expect(committed.get(donorPath)).toMatchObject({ donorNumber: 'A-9', importId: expect.any(String) })
    expect(committed.get(canonicalClaimPath)).toMatchObject({ donorId: 'legacy-donor', donorNumber: 'A-9' })
  })

  it('records Gemini only when it was used as a structural fallback', async () => {
    const { store, committed } = fakeStore()
    await executeAtomicImport(store, {
      ...context,
      model: 'gemini-test',
      extractionMethod: 'gemini-fallback',
      extractionDurationMs: 83_400,
      fallbackReason: 'columns_ambiguous',
      donors: [donor('A-2')],
      skippedDuplicateNumbers: [],
    })

    const audit = [...committed.entries()].find(([path]) => path.startsWith('donorImports/'))?.[1]
    expect(audit).toMatchObject({
      extractionMethod: 'gemini-fallback', geminiModel: 'gemini-test',
      parserVersion: 'donor-table-v2', extractionDurationMs: 83_400,
      fallbackReason: 'columns_ambiguous',
    })
  })

  it('records a forced Gemini extraction with no fallback reason', async () => {
    const { store, committed } = fakeStore()
    await executeAtomicImport(store, {
      ...context,
      model: 'gemini-test',
      extractionMethod: 'gemini-forced',
      extractionDurationMs: 71_200,
      fallbackReason: null,
      donors: [donor('A-3')],
      skippedDuplicateNumbers: [],
    })

    const audit = [...committed.entries()].find(([path]) => path.startsWith('donorImports/'))?.[1]
    expect(audit).toMatchObject({
      extractionMethod: 'gemini-forced', geminiModel: 'gemini-test',
      extractionDurationMs: 71_200, fallbackReason: null,
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
      outcome: 'import_failed', importedCount: 0, replacedCount: 0, skippedCount: 1,
    })
  })
})
