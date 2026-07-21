import type { DocumentData, QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore'

import { firebaseApp, getDatabase } from '../../lib/firebase'
import { donorNumberClaimId, normalizeDonorNumber, type Donor, type DonorInput } from './donor'
import { normalizeExtractedDonor } from './donorFieldRules'
import { parseDonorNumberMetadata } from './donorNumberMetadata'

export class DuplicateDonorNumberError extends Error {
  constructor() {
    super('A donor with this donor number already exists.')
    this.name = 'DuplicateDonorNumberError'
  }
}

export interface RemoveAllDonorsResult {
  deletedDonorCount: number
  deletedClaimCount: number
}

export interface DonorRepository {
  subscribe(onData: (donors: Donor[]) => void, onError: (error: Error) => void): Promise<Unsubscribe>
  add(input: DonorInput, adminEmail: string): Promise<void>
  update(id: string, currentDonorNumber: string, input: DonorInput, adminEmail: string): Promise<void>
  remove(id: string, donorNumber: string): Promise<void>
  removeAll(): Promise<RemoveAllDonorsResult>
}

function toDonor(snapshot: QueryDocumentSnapshot<DocumentData>): Donor {
  const data = snapshot.data() as Omit<Donor, 'id'>
  return { id: snapshot.id, ...data }
}

export function normalizeDonorForPersistence(input: DonorInput): DonorInput {
  return normalizeExtractedDonor(input)
}

export const firestoreDonorRepository: DonorRepository = {
  async subscribe(onData, onError) {
    const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore')
    const database = await getDatabase()
    const donorsQuery = query(collection(database, 'donors'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      donorsQuery,
      (snapshot) => onData(snapshot.docs.map(toDonor)),
      (error) => onError(error),
    )
  },

  async add(input, adminEmail) {
    const { collection, doc, getDocs, runTransaction, serverTimestamp } = await import('firebase/firestore')
    const database = await getDatabase()
    const normalizedInput = normalizeDonorForPersistence(input)
    const normalized = normalizeDonorNumber(normalizedInput.donorNumber)
    const existing = await getDocs(collection(database, 'donors'))
    if (existing.docs.some((snapshot) => normalizeDonorNumber(
      parseDonorNumberMetadata(String(snapshot.data().donorNumber ?? '')).donorNumber,
    ) === normalized)) {
      throw new DuplicateDonorNumberError()
    }
    const donorReference = doc(collection(database, 'donors'))
    const claimReference = doc(database, 'donorNumberClaims', donorNumberClaimId(normalizedInput.donorNumber))
    const legacyClaimReference = doc(database, 'donorNumberClaims', donorNumberClaimId(`${normalizedInput.donorNumber}***`))
    await runTransaction(database, async (transaction) => {
      const [claim, legacyClaim] = await Promise.all([
        transaction.get(claimReference),
        transaction.get(legacyClaimReference),
      ])
      if (claim.exists() || legacyClaim.exists()) throw new DuplicateDonorNumberError()
      const timestamp = serverTimestamp()
      transaction.set(donorReference, {
        ...normalizedInput,
        createdAt: timestamp,
        createdBy: adminEmail,
        updatedAt: timestamp,
        updatedBy: adminEmail,
      })
      transaction.set(claimReference, {
        donorId: donorReference.id,
        donorNumber: normalizedInput.donorNumber,
        normalizedDonorNumber: normalized,
        createdAt: timestamp,
        createdBy: adminEmail,
      })
    })
  },

  async update(id, currentDonorNumber, input, adminEmail) {
    const { collection, doc, getDocs, runTransaction, serverTimestamp } = await import('firebase/firestore')
    const database = await getDatabase()
    const normalizedInput = normalizeDonorForPersistence(input)
    const currentNumber = parseDonorNumberMetadata(currentDonorNumber).donorNumber
    const numberChanged = normalizeDonorNumber(currentNumber) !== normalizeDonorNumber(normalizedInput.donorNumber)
    const donorReference = doc(database, 'donors', id)
    if (numberChanged) {
      const existing = await getDocs(collection(database, 'donors'))
      if (existing.docs.some((snapshot) => snapshot.id !== id && normalizeDonorNumber(
        parseDonorNumberMetadata(String(snapshot.data().donorNumber ?? '')).donorNumber,
      ) === normalizeDonorNumber(normalizedInput.donorNumber))) {
        throw new DuplicateDonorNumberError()
      }
    }

    await runTransaction(database, async (transaction) => {
      const donorSnapshot = await transaction.get(donorReference)
      if (!donorSnapshot.exists()) throw new Error('Donor not found.')

      if (numberChanged) {
        const newClaimReference = doc(database, 'donorNumberClaims', donorNumberClaimId(normalizedInput.donorNumber))
        const newLegacyClaimReference = doc(database, 'donorNumberClaims', donorNumberClaimId(`${normalizedInput.donorNumber}***`))
        const oldClaimReference = doc(database, 'donorNumberClaims', donorNumberClaimId(currentNumber))
        const oldLegacyClaimReference = doc(database, 'donorNumberClaims', donorNumberClaimId(`${currentNumber}***`))
        const [newClaim, newLegacyClaim, oldClaim, oldLegacyClaim] = await Promise.all([
          transaction.get(newClaimReference),
          transaction.get(newLegacyClaimReference),
          transaction.get(oldClaimReference),
          transaction.get(oldLegacyClaimReference),
        ])
        if ([newClaim, newLegacyClaim].some((claim) => claim.exists() && claim.data().donorId !== id)) {
          throw new DuplicateDonorNumberError()
        }
        const timestamp = serverTimestamp()
        if (!newClaim.exists()) transaction.set(newClaimReference, {
          donorId: id,
          donorNumber: normalizedInput.donorNumber,
          normalizedDonorNumber: normalizeDonorNumber(normalizedInput.donorNumber),
          createdAt: timestamp,
          createdBy: adminEmail,
        })
        if (newLegacyClaim.exists() && newLegacyClaim.data().donorId === id
          && newLegacyClaimReference.path !== newClaimReference.path) {
          transaction.delete(newLegacyClaimReference)
        }
        for (const [reference, snapshot] of [
          [oldClaimReference, oldClaim],
          [oldLegacyClaimReference, oldLegacyClaim],
        ] as const) {
          if (reference.path !== newClaimReference.path && snapshot.exists() && snapshot.data().donorId === id) {
            transaction.delete(reference)
          }
        }
      }

      transaction.update(donorReference, {
        ...normalizedInput,
        updatedAt: serverTimestamp(),
        updatedBy: adminEmail,
      })
    })
  },

  async remove(id, donorNumber) {
    const { doc, runTransaction } = await import('firebase/firestore')
    const database = await getDatabase()
    const donorReference = doc(database, 'donors', id)
    const claimReference = doc(database, 'donorNumberClaims', donorNumberClaimId(donorNumber))
    await runTransaction(database, async (transaction) => {
      const claim = await transaction.get(claimReference)
      transaction.delete(donorReference)
      if (claim.exists() && claim.data().donorId === id) transaction.delete(claimReference)
    })
  },

  async removeAll() {
    const { getFunctions, httpsCallable } = await import('firebase/functions')
    const callable = httpsCallable<undefined, RemoveAllDonorsResult>(
      getFunctions(firebaseApp, 'europe-west1'),
      'deleteAllDonors',
    )
    return (await callable()).data
  },
}
