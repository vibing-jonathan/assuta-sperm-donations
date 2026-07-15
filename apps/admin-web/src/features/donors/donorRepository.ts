import type { DocumentData, QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore'

import { getDatabase } from '../../lib/firebase'
import type { Donor, DonorInput } from './donor'

export interface DonorRepository {
  subscribe(onData: (donors: Donor[]) => void, onError: (error: Error) => void): Promise<Unsubscribe>
  add(input: DonorInput, adminEmail: string): Promise<void>
  remove(id: string): Promise<void>
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
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
    const database = await getDatabase()
    await addDoc(collection(database, 'donors'), {
      ...input,
      donorNumber: input.donorNumber.trim(),
      createdAt: serverTimestamp(),
      createdBy: adminEmail,
      updatedAt: serverTimestamp(),
      updatedBy: adminEmail,
    })
  },

  async remove(id) {
    const { deleteDoc, doc } = await import('firebase/firestore')
    const database = await getDatabase()
    await deleteDoc(doc(database, 'donors', id))
  },
}
