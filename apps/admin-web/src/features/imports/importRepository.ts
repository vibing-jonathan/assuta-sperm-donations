import { getDatabase } from '../../lib/firebase'
import { donorNumberClaimId, normalizeDonorNumber, type DonorInput } from '../donors/donor'
import type { DeterministicFallbackReason } from './deterministicExtraction'

export const MAX_DONORS_PER_IMPORT = 249

export interface ImportAuditContext {
  sourceFileName: string
  startPage: number
  endPage: number
  pageCount: number
  model: string
  extractionMethod: 'deterministic' | 'gemini-fallback'
  parserVersion: string
  extractionDurationMs: number
  fallbackReason: DeterministicFallbackReason | null
  adminEmail: string
  warnings: string[]
}

export interface ApprovedImport extends ImportAuditContext {
  donors: DonorInput[]
  skippedDuplicateNumbers: string[]
}

export interface ImportResult {
  importId: string
  importedCount: number
  skippedCount: number
  skippedDuplicateNumbers: string[]
}

export interface ImportRepository {
  listNormalizedDonorNumbers(): Promise<Set<string>>
  importApproved(input: ApprovedImport): Promise<ImportResult>
}

interface AtomicSnapshot {
  exists: boolean
}

export interface AtomicTransaction {
  get(path: string): Promise<AtomicSnapshot>
  set(path: string, data: Record<string, unknown>): void
}

export interface AtomicImportStore {
  createId(collectionName: string): string
  timestamp(): unknown
  write(path: string, data: Record<string, unknown>): Promise<void>
  runTransaction<T>(operation: (transaction: AtomicTransaction) => Promise<T>): Promise<T>
}

function uniqueNumbers(numbers: string[]) {
  const unique = new Map<string, string>()
  for (const number of numbers) {
    const trimmed = number.trim()
    if (trimmed) unique.set(normalizeDonorNumber(trimmed), trimmed)
  }
  return [...unique.values()]
}

export async function executeAtomicImport(store: AtomicImportStore, input: ApprovedImport): Promise<ImportResult> {
  if (input.donors.length > MAX_DONORS_PER_IMPORT) {
    throw new Error(`An import can contain at most ${MAX_DONORS_PER_IMPORT} donors.`)
  }

  const importId = store.createId('donorImports')
  const candidates = input.donors.map((donor) => ({
    donor: { ...donor, donorNumber: donor.donorNumber.trim() },
    donorId: store.createId('donors'),
    claimPath: `donorNumberClaims/${donorNumberClaimId(donor.donorNumber)}`,
  }))

  try {
    return await store.runTransaction(async (transaction) => {
      const claimSnapshots: AtomicSnapshot[] = await Promise.all(
        candidates.map((candidate) => transaction.get(candidate.claimPath)),
      )

      const concurrentDuplicates: string[] = []
      const imported = candidates.filter((candidate, index) => {
        if (!claimSnapshots[index]?.exists) return true
        concurrentDuplicates.push(candidate.donor.donorNumber)
        return false
      })
      const skippedDuplicateNumbers = uniqueNumbers([
        ...input.skippedDuplicateNumbers,
        ...concurrentDuplicates,
      ])
      const timestamp = store.timestamp()

      for (const candidate of imported) {
        transaction.set(`donors/${candidate.donorId}`, {
          ...candidate.donor,
          importId,
          createdAt: timestamp,
          createdBy: input.adminEmail,
          updatedAt: timestamp,
          updatedBy: input.adminEmail,
        })
        transaction.set(candidate.claimPath, {
          donorId: candidate.donorId,
          donorNumber: candidate.donor.donorNumber,
          normalizedDonorNumber: normalizeDonorNumber(candidate.donor.donorNumber),
          createdAt: timestamp,
          createdBy: input.adminEmail,
        })
      }

      const outcome = imported.length === 0
        ? 'duplicates_skipped'
        : skippedDuplicateNumbers.length > 0 ? 'imported_with_skips' : 'imported'
      transaction.set(`donorImports/${importId}`, {
        sourceFileName: input.sourceFileName,
        detectedStartPage: input.startPage,
        detectedEndPage: input.endPage,
        detectedPageCount: input.pageCount,
        geminiModel: input.extractionMethod === 'gemini-fallback' ? input.model : null,
        extractionMethod: input.extractionMethod,
        parserVersion: input.parserVersion,
        extractionDurationMs: input.extractionDurationMs,
        fallbackReason: input.fallbackReason,
        importedBy: input.adminEmail,
        importedAt: timestamp,
        approvedCount: input.donors.length,
        importedCount: imported.length,
        skippedCount: skippedDuplicateNumbers.length,
        warnings: input.warnings,
        duplicateDonorNumbers: skippedDuplicateNumbers,
        status: 'completed',
        outcome,
      })

      return {
        importId,
        importedCount: imported.length,
        skippedCount: skippedDuplicateNumbers.length,
        skippedDuplicateNumbers,
      }
    })
  } catch (error) {
    const skippedDuplicateNumbers = uniqueNumbers(input.skippedDuplicateNumbers)
    try {
      await store.write(`donorImports/${importId}`, {
        sourceFileName: input.sourceFileName,
        detectedStartPage: input.startPage,
        detectedEndPage: input.endPage,
        detectedPageCount: input.pageCount,
        geminiModel: input.extractionMethod === 'gemini-fallback' ? input.model : null,
        extractionMethod: input.extractionMethod,
        parserVersion: input.parserVersion,
        extractionDurationMs: input.extractionDurationMs,
        fallbackReason: input.fallbackReason,
        importedBy: input.adminEmail,
        importedAt: store.timestamp(),
        approvedCount: input.donors.length,
        importedCount: 0,
        skippedCount: skippedDuplicateNumbers.length,
        warnings: input.warnings,
        duplicateDonorNumbers: skippedDuplicateNumbers,
        status: 'failed',
        outcome: 'import_failed',
      })
    } catch {
      // Preserve the atomic import error; audit creation is best effort during outages.
    }
    throw error
  }
}

async function createFirestoreStore(): Promise<AtomicImportStore> {
  const { collection, doc, runTransaction, serverTimestamp } = await import('firebase/firestore')
  const database = await getDatabase()
  return {
    createId(collectionName) {
      return doc(collection(database, collectionName)).id
    },
    timestamp: serverTimestamp,
    async write(path, data) {
      const { setDoc } = await import('firebase/firestore')
      await setDoc(doc(database, path), data)
    },
    runTransaction(operation) {
      return runTransaction(database, (firestoreTransaction) => operation({
        async get(path) {
          const snapshot = await firestoreTransaction.get(doc(database, path))
          return { exists: snapshot.exists() }
        },
        set(path, data) {
          firestoreTransaction.set(doc(database, path), data)
        },
      }))
    },
  }
}

export const firestoreImportRepository: ImportRepository = {
  async listNormalizedDonorNumbers() {
    const { collection, getDocs } = await import('firebase/firestore')
    const database = await getDatabase()
    const snapshot = await getDocs(collection(database, 'donors'))
    return new Set(snapshot.docs.map((document) => normalizeDonorNumber(String(document.data().donorNumber ?? ''))))
  },
  async importApproved(input) {
    return executeAtomicImport(await createFirestoreStore(), input)
  },
}
