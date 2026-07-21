import { createHash } from 'node:crypto'

import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

import { profileImageStoragePath } from './donorProfileImages.js'

export const MAX_ADMIN_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024

export class InvalidAdminProfileImageError extends Error {}
export class DonorNotFoundError extends Error {}

export function readAdminProfileImageUpload(donorIdValue: unknown, contentType: unknown, bytes: Buffer) {
  const donorId = typeof donorIdValue === 'string' ? donorIdValue.trim() : ''
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(donorId)) {
    throw new InvalidAdminProfileImageError('Invalid donor identifier.')
  }
  if (contentType !== 'image/jpeg') throw new InvalidAdminProfileImageError('Only JPEG images are accepted.')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ADMIN_PROFILE_IMAGE_BYTES) {
    throw new InvalidAdminProfileImageError('Invalid image size.')
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new InvalidAdminProfileImageError('Invalid JPEG data.')
  }
  const inputHash = createHash('sha256').update(bytes).digest('hex')
  return { donorId, inputHash, storagePath: profileImageStoragePath(donorId, inputHash), bytes }
}

function isPreconditionFailure(error: unknown) {
  const code = (error as { code?: unknown })?.code
  return code === 412 || code === '412'
}

export async function storeAdminProfileImage(
  input: ReturnType<typeof readAdminProfileImageUpload>,
  adminEmail: string,
) {
  const bucket = getStorage().bucket()
  const file = bucket.file(input.storagePath)
  try {
    await file.save(input.bytes, {
      resumable: false,
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'private,max-age=31536000,immutable' },
      preconditionOpts: { ifGenerationMatch: 0 },
    })
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error
  }

  const database = getFirestore()
  const donorReference = database.collection('donors').doc(input.donorId)
  let previousStoragePath: string | undefined
  try {
    await database.runTransaction(async (transaction) => {
      const donor = await transaction.get(donorReference)
      if (!donor.exists) throw new DonorNotFoundError('Donor not found.')
      const currentProfile = donor.get('profileImage') as Record<string, unknown> | undefined
      previousStoragePath = typeof currentProfile?.storagePath === 'string' ? currentProfile.storagePath : undefined
      const now = Timestamp.now()
      transaction.update(donorReference, {
        profileImageInput: FieldValue.delete(),
        profileImage: {
          status: 'ready',
          inputHash: input.inputHash,
          promptVersion: 'manual-upload-v1',
          model: 'manual-upload',
          requestedSize: 'original',
          storagePath: input.storagePath,
          generatedAt: now,
          updatedAt: now,
        },
        updatedAt: now,
        updatedBy: adminEmail,
      })
    })
  } catch (error) {
    if (error instanceof DonorNotFoundError) await file.delete({ ignoreNotFound: true })
    throw error
  }

  if (previousStoragePath && previousStoragePath !== input.storagePath
    && previousStoragePath.startsWith(`donor-profile-images/${input.donorId}/`)) {
    await bucket.file(previousStoragePath).delete({ ignoreNotFound: true })
  }
  return { storagePath: input.storagePath, inputHash: input.inputHash }
}
