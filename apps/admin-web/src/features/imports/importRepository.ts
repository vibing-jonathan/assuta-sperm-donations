import { getDatabase } from '../../lib/firebase'
import { donorNumberClaimId, normalizeDonorNumber, type DonorInput } from '../donors/donor'
import { parseDonorNumberMetadata } from '../donors/donorNumberMetadata'
import type { DeterministicFallbackReason } from './deterministicExtraction'

export const MAX_DONORS_PER_IMPORT = 249

export interface ImportAuditContext {
  sourceFileName: string
  startPage: number
  endPage: number
  pageCount: number
  model: string
  extractionMethod: 'deterministic' | 'gemini-fallback' | 'gemini-forced'
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
  replacedCount: number
  skippedCount: number
  replacedDonorNumbers: string[]
  skippedDuplicateNumbers: string[]
}

export interface ImportRepository {
  listNormalizedDonorNumbers(): Promise<Set<string>>
  importApproved(input: ApprovedImport): Promise<ImportResult>
}

interface AtomicSnapshot {
  exists: boolean
  data?: Record<string, unknown>
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
  const duplicateDonorsWithinInput: string[] = []
  const seenInputNumbers = new Set<string>()
  const uniqueDonors = input.donors.filter((donor) => {
    const normalized = normalizeDonorNumber(parseDonorNumberMetadata(donor.donorNumber).donorNumber)
    if (!normalized || !seenInputNumbers.has(normalized)) {
      if (normalized) seenInputNumbers.add(normalized)
      return true
    }
    duplicateDonorsWithinInput.push(donor.donorNumber)
    return false
  })
  const candidates = uniqueDonors.map((donor) => {
    const metadata = parseDonorNumberMetadata(donor.donorNumber)
    const normalizedDonor = {
      ...donor,
      donorNumber: metadata.donorNumber,
      geneticCarrierStatus: metadata.geneticCarrierStatus === 'שלילי'
        ? 'שלילי' as const
        : donor.geneticCarrierStatus,
    }
    return {
      donor: normalizedDonor,
      donorId: store.createId('donors'),
      claimPath: `donorNumberClaims/${donorNumberClaimId(normalizedDonor.donorNumber)}`,
      legacyClaimPath: `donorNumberClaims/${donorNumberClaimId(`${normalizedDonor.donorNumber}***`)}`,
    }
  })

  try {
    return await store.runTransaction(async (transaction) => {
      const claimSnapshots: Array<[AtomicSnapshot, AtomicSnapshot]> = await Promise.all(
        candidates.map(async (candidate) => Promise.all([
          transaction.get(candidate.claimPath),
          transaction.get(candidate.legacyClaimPath),
        ])),
      )

      const concurrentDuplicates: string[] = []
      const imported: typeof candidates = []
      const replacements: Array<(typeof candidates)[number] & {
        targetDonorId: string
        canonicalClaimExists: boolean
      }> = []
      candidates.forEach((candidate, index) => {
        const [claim, legacyClaim] = claimSnapshots[index] ?? []
        if (!claim?.exists && !legacyClaim?.exists) {
          imported.push(candidate)
          return
        }
        const existingClaim = [claim, legacyClaim].find((snapshot) => (
          snapshot?.exists && typeof snapshot.data?.donorId === 'string' && snapshot.data.donorId
        )) ?? [claim, legacyClaim].find((snapshot) => snapshot?.exists)
        const targetDonorId = existingClaim?.data?.donorId
        if (typeof targetDonorId === 'string' && targetDonorId) {
          replacements.push({
            ...candidate,
            targetDonorId,
            canonicalClaimExists: Boolean(claim?.exists),
          })
          return
        }
        concurrentDuplicates.push(candidate.donor.donorNumber)
      })
      const replacementSnapshots = await Promise.all(
        replacements.map((candidate) => transaction.get(`donors/${candidate.targetDonorId}`)),
      )
      const skippedDuplicateNumbers = uniqueNumbers([
        ...input.skippedDuplicateNumbers,
        ...duplicateDonorsWithinInput,
        ...concurrentDuplicates,
      ])
      const replacedDonorNumbers = uniqueNumbers(replacements.map((candidate) => candidate.donor.donorNumber))
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

      replacements.forEach((candidate, index) => {
        const existingDonor = replacementSnapshots[index]
        transaction.set(`donors/${candidate.targetDonorId}`, {
          ...candidate.donor,
          importId,
          createdAt: existingDonor?.data?.createdAt ?? timestamp,
          createdBy: typeof existingDonor?.data?.createdBy === 'string'
            ? existingDonor.data.createdBy
            : input.adminEmail,
          updatedAt: timestamp,
          updatedBy: input.adminEmail,
        })
        if (!candidate.canonicalClaimExists) {
          transaction.set(candidate.claimPath, {
            donorId: candidate.targetDonorId,
            donorNumber: candidate.donor.donorNumber,
            normalizedDonorNumber: normalizeDonorNumber(candidate.donor.donorNumber),
            createdAt: timestamp,
            createdBy: input.adminEmail,
          })
        }
      })

      const outcome = imported.length === 0 && replacements.length === 0
        ? 'duplicates_skipped'
        : replacements.length > 0 && skippedDuplicateNumbers.length > 0
          ? 'imported_with_replacements_and_skips'
          : replacements.length > 0 && imported.length > 0
            ? 'imported_with_replacements'
            : replacements.length > 0 ? 'replaced' : skippedDuplicateNumbers.length > 0 ? 'imported_with_skips' : 'imported'
      transaction.set(`donorImports/${importId}`, {
        sourceFileName: input.sourceFileName,
        detectedStartPage: input.startPage,
        detectedEndPage: input.endPage,
        detectedPageCount: input.pageCount,
        geminiModel: input.extractionMethod === 'deterministic' ? null : input.model,
        extractionMethod: input.extractionMethod,
        parserVersion: input.parserVersion,
        extractionDurationMs: input.extractionDurationMs,
        fallbackReason: input.fallbackReason,
        importedBy: input.adminEmail,
        importedAt: timestamp,
        approvedCount: input.donors.length,
        importedCount: imported.length,
        replacedCount: replacements.length,
        skippedCount: skippedDuplicateNumbers.length,
        warnings: input.warnings,
        duplicateDonorNumbers: skippedDuplicateNumbers,
        replacedDonorNumbers,
        status: 'completed',
        outcome,
      })

      return {
        importId,
        importedCount: imported.length,
        replacedCount: replacements.length,
        skippedCount: skippedDuplicateNumbers.length,
        replacedDonorNumbers,
        skippedDuplicateNumbers,
      }
    })
  } catch (error) {
    const skippedDuplicateNumbers = uniqueNumbers([
      ...input.skippedDuplicateNumbers,
      ...duplicateDonorsWithinInput,
    ])
    try {
      await store.write(`donorImports/${importId}`, {
        sourceFileName: input.sourceFileName,
        detectedStartPage: input.startPage,
        detectedEndPage: input.endPage,
        detectedPageCount: input.pageCount,
        geminiModel: input.extractionMethod === 'deterministic' ? null : input.model,
        extractionMethod: input.extractionMethod,
        parserVersion: input.parserVersion,
        extractionDurationMs: input.extractionDurationMs,
        fallbackReason: input.fallbackReason,
        importedBy: input.adminEmail,
        importedAt: store.timestamp(),
        approvedCount: input.donors.length,
        importedCount: 0,
        replacedCount: 0,
        skippedCount: skippedDuplicateNumbers.length,
        warnings: input.warnings,
        duplicateDonorNumbers: skippedDuplicateNumbers,
        replacedDonorNumbers: [],
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
          return { exists: snapshot.exists(), data: snapshot.data() }
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
    return new Set(snapshot.docs.map((document) => normalizeDonorNumber(
      parseDonorNumberMetadata(String(document.data().donorNumber ?? '')).donorNumber,
    )))
  },
  async importApproved(input) {
    return executeAtomicImport(await createFirestoreStore(), input)
  },
}
