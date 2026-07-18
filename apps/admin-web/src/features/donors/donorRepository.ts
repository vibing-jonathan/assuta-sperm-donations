import type { DocumentData, QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore'

import { getDatabase } from '../../lib/firebase'
import { donorNumberClaimId, normalizeDonorNumber, type Donor, type DonorInput } from './donor'
import { parseDonorNumberMetadata } from './donorNumberMetadata'

export class DuplicateDonorNumberError extends Error {
  constructor() {
    super('A donor with this donor number already exists.')
    this.name = 'DuplicateDonorNumberError'
  }
}

export interface DonorRepository {
  subscribe(onData: (donors: Donor[]) => void, onError: (error: Error) => void): Promise<Unsubscribe>
  add(input: DonorInput, adminEmail: string): Promise<void>
  remove(id: string, donorNumber: string): Promise<void>
}

function toDonor(snapshot: QueryDocumentSnapshot<DocumentData>): Donor {
  const data = snapshot.data() as DonorInput
  return { id: snapshot.id, ...data }
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
    const donorMetadata = parseDonorNumberMetadata(input.donorNumber)
    const normalizedInput = { ...input, ...donorMetadata }
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
}
