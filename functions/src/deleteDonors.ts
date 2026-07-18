import { getFirestore, type DocumentReference } from 'firebase-admin/firestore'

export const DELETE_BATCH_SIZE = 450

export async function deleteReferencesInBatches<T>(
  references: T[],
  commitBatch: (batch: T[]) => Promise<void>,
) {
  for (let index = 0; index < references.length; index += DELETE_BATCH_SIZE) {
    await commitBatch(references.slice(index, index + DELETE_BATCH_SIZE))
  }
}

export async function deleteAllDonorRecords() {
  const database = getFirestore()
  const [donors, claims] = await Promise.all([
    database.collection('donors').get(),
    database.collection('donorNumberClaims').get(),
  ])
  const references: DocumentReference[] = [
    ...donors.docs.map((snapshot) => snapshot.ref),
    ...claims.docs.map((snapshot) => snapshot.ref),
  ]

  await deleteReferencesInBatches(references, async (batchReferences) => {
    const batch = database.batch()
    batchReferences.forEach((reference) => batch.delete(reference))
    await batch.commit()
  })

  return {
    deletedDonorCount: donors.size,
    deletedClaimCount: claims.size,
  }
}
