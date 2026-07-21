import { createHash } from 'node:crypto'

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getFunctions } from 'firebase-admin/functions'
import { getStorage } from 'firebase-admin/storage'

import {
  buildDonorProfilePrompt,
  GEMINI_PROFILE_IMAGE_MODEL,
  GEMINI_PROFILE_IMAGE_SIZE,
  generateProfileImageWithGemini,
  type DonorAppearance,
  type GeneratedProfileImage,
} from './profileImageGeneration.js'

export const DONOR_PROFILE_INPUT_VERSION = 'catalog-detail-v1'
export const DONOR_PROFILE_PROMPT_VERSION = 'profile-v1'
const MAX_FIELD_LENGTH = 500
const PROFILE_TASK_QUEUE = 'locations/europe-west1/functions/generateDonorProfileImage'

export interface DonorProfileImageInput extends DonorAppearance {
  sourceVersion: string
}

export interface ProfileImageTaskPayload {
  jobId: string
  donorId: string
  inputHash: string
}

export class InvalidProfileImageInputError extends Error {}

function clean(value: unknown, fieldName: string) {
  if (typeof value !== 'string') throw new InvalidProfileImageInputError(`Invalid ${fieldName}.`)
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (normalized.length > MAX_FIELD_LENGTH) throw new InvalidProfileImageInputError(`Invalid ${fieldName}.`)
  return normalized
}

export function readDonorProfileImageInput(value: unknown): DonorProfileImageInput {
  if (!value || typeof value !== 'object') throw new InvalidProfileImageInputError('Invalid profile input.')
  const input = value as Record<string, unknown>
  if (!Array.isArray(input.facialDetails) || input.facialDetails.length > 10) {
    throw new InvalidProfileImageInputError('Invalid facial details.')
  }
  const result = {
    sourceVersion: clean(input.sourceVersion, 'source version'),
    build: clean(input.build, 'build'),
    skin: clean(input.skin, 'skin'),
    hair: clean(input.hair, 'hair'),
    eyes: clean(input.eyes, 'eyes'),
    facialDetails: input.facialDetails.map((item) => clean(item, 'facial detail')).filter(Boolean),
    maternalAppearance: clean(input.maternalAppearance, 'maternal appearance'),
    paternalAppearance: clean(input.paternalAppearance, 'paternal appearance'),
  }
  if (!result.sourceVersion || !result.skin || !result.hair || !result.eyes) {
    throw new InvalidProfileImageInputError('Required profile fields are missing.')
  }
  return result
}

export function canonicalProfileInput(input: DonorProfileImageInput) {
  return JSON.stringify({
    sourceVersion: input.sourceVersion,
    build: input.build,
    skin: input.skin,
    hair: input.hair,
    eyes: input.eyes,
    facialDetails: input.facialDetails,
    maternalAppearance: input.maternalAppearance,
    paternalAppearance: input.paternalAppearance,
    promptVersion: DONOR_PROFILE_PROMPT_VERSION,
    model: GEMINI_PROFILE_IMAGE_MODEL,
    size: GEMINI_PROFILE_IMAGE_SIZE,
  })
}

export function profileInputHash(input: DonorProfileImageInput) {
  return createHash('sha256').update(canonicalProfileInput(input)).digest('hex')
}

export function profileJobId(donorId: string, inputHash: string) {
  return createHash('sha256').update(`${donorId}:${inputHash}`).digest('hex')
}

export function profileImageStoragePath(donorId: string, inputHash: string) {
  return `donor-profile-images/${donorId}/${inputHash}.jpg`
}

export function summaryProfileInput(data: Record<string, unknown>): DonorProfileImageInput | null {
  const skin = typeof data.skinColor === 'string' ? data.skinColor.trim() : ''
  const hair = typeof data.hairColor === 'string' ? data.hairColor.trim() : ''
  const eyes = typeof data.eyeColor === 'string' ? data.eyeColor.trim() : ''
  if (!skin || !hair || !eyes) return null
  return {
    sourceVersion: 'manual-summary-v1',
    build: '',
    skin,
    hair,
    eyes,
    facialDetails: [],
    maternalAppearance: '',
    paternalAppearance: '',
  }
}

export async function registerDonorProfileInput(donorId: string, rawInput: unknown) {
  const input = readDonorProfileImageInput(rawInput)
  const inputHash = profileInputHash(input)
  const jobId = profileJobId(donorId, inputHash)
  const database = getFirestore()
  const donorReference = database.collection('donors').doc(donorId)
  const jobReference = database.collection('donorProfileJobs').doc(jobId)
  let created = false

  await database.runTransaction(async (transaction) => {
    const [donor, job] = await Promise.all([
      transaction.get(donorReference),
      transaction.get(jobReference),
    ])
    if (!donor.exists) return
    const currentProfile = donor.get('profileImage') as Record<string, unknown> | undefined
    if (currentProfile?.inputHash === inputHash && currentProfile.status === 'ready') return
    const storagePath = typeof currentProfile?.storagePath === 'string' ? currentProfile.storagePath : undefined
    const existingJobStatus = job.get('status')
    const completedStoragePath = typeof job.get('storagePath') === 'string' ? job.get('storagePath') as string : undefined
    const status = existingJobStatus === 'ready' && completedStoragePath
      ? 'ready'
      : existingJobStatus === 'failed' ? 'failed' : 'pending'
    transaction.set(donorReference, {
      profileImageInput: input,
      profileImage: {
        status,
        inputHash,
        promptVersion: DONOR_PROFILE_PROMPT_VERSION,
        model: GEMINI_PROFILE_IMAGE_MODEL,
        requestedSize: GEMINI_PROFILE_IMAGE_SIZE,
        ...(completedStoragePath ? { storagePath: completedStoragePath } : storagePath ? { storagePath } : {}),
        updatedAt: Timestamp.now(),
      },
    }, { merge: true })
    if (!job.exists) {
      created = true
      transaction.create(jobReference, {
        donorId,
        inputHash,
        status: 'pending',
        attemptCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    }
  })
  return { created, donorId, inputHash, jobId }
}

export async function registerDonorProfileInputByNumber(donorNumberClaimId: string, input: unknown) {
  const claim = await getFirestore().collection('donorNumberClaims').doc(donorNumberClaimId).get()
  const donorId = claim.get('donorId')
  if (typeof donorId !== 'string' || !donorId) return { created: false }
  return registerDonorProfileInput(donorId, input)
}

export async function enqueueProfileImageTask(payload: ProfileImageTaskPayload) {
  try {
    await getFunctions().taskQueue<ProfileImageTaskPayload>(PROFILE_TASK_QUEUE).enqueue(payload, {
      id: payload.jobId,
      scheduleDelaySeconds: 5,
      dispatchDeadlineSeconds: 300,
    })
    return true
  } catch (error) {
    const code = (error as { code?: unknown })?.code
    if (code === 'functions/task-already-exists') return false
    throw error
  }
}

interface WorkerDependencies {
  generate(prompt: string): Promise<GeneratedProfileImage>
  objectExists(path: string): Promise<boolean>
  save(path: string, image: GeneratedProfileImage): Promise<void>
}

function defaultWorkerDependencies(apiKey: string): WorkerDependencies {
  const bucket = getStorage().bucket()
  return {
    generate: (prompt) => generateProfileImageWithGemini(prompt, apiKey),
    async objectExists(path) {
      return (await bucket.file(path).exists())[0]
    },
    async save(path, image) {
      await bucket.file(path).save(image.bytes, {
        resumable: false,
        contentType: image.mimeType,
        metadata: { cacheControl: 'private,max-age=31536000,immutable' },
        preconditionOpts: { ifGenerationMatch: 0 },
      })
    },
  }
}

function isPreconditionFailure(error: unknown) {
  const candidate = error as { code?: unknown }
  return candidate?.code === 412 || candidate?.code === '412'
}

export function isTransientProfileError(error: unknown) {
  const candidate = error as { status?: unknown; code?: unknown }
  const status = typeof candidate?.status === 'number' ? candidate.status : Number(candidate?.code)
  return error instanceof TypeError
    || ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(String(candidate?.code))
    || status === 408 || status === 409 || status === 429 || status >= 500
}

export async function processProfileImageJob(
  payload: ProfileImageTaskPayload,
  apiKey: string,
  dependencies: WorkerDependencies = defaultWorkerDependencies(apiKey),
) {
  const database = getFirestore()
  const jobReference = database.collection('donorProfileJobs').doc(payload.jobId)
  const donorReference = database.collection('donors').doc(payload.donorId)
  const storagePath = profileImageStoragePath(payload.donorId, payload.inputHash)
  let input: DonorProfileImageInput | null = null

  await database.runTransaction(async (transaction) => {
    const [job, donor] = await Promise.all([transaction.get(jobReference), transaction.get(donorReference)])
    if (!job.exists || !donor.exists || job.get('donorId') !== payload.donorId
      || job.get('inputHash') !== payload.inputHash) return
    const profile = donor.get('profileImage') as Record<string, unknown> | undefined
    if (profile?.inputHash !== payload.inputHash || job.get('status') === 'ready') return
    const leaseUntil = job.get('leaseUntil') as Timestamp | undefined
    if (job.get('status') === 'generating' && leaseUntil?.toMillis() && leaseUntil.toMillis() > Date.now()) return
    input = readDonorProfileImageInput(donor.get('profileImageInput'))
    const now = Timestamp.now()
    transaction.update(jobReference, {
      status: 'generating',
      attemptCount: Number(job.get('attemptCount') ?? 0) + 1,
      leaseUntil: Timestamp.fromMillis(now.toMillis() + 6 * 60 * 1000),
      updatedAt: now,
    })
    transaction.set(donorReference, { profileImage: { ...profile, status: 'generating', updatedAt: now } }, { merge: true })
  })
  if (!input) return { outcome: 'stale' as const }

  try {
    if (!(await dependencies.objectExists(storagePath))) {
      const image = await dependencies.generate(buildDonorProfilePrompt(input))
      try {
        await dependencies.save(storagePath, image)
      } catch (error) {
        if (!isPreconditionFailure(error) || !(await dependencies.objectExists(storagePath))) throw error
      }
    }
    await database.runTransaction(async (transaction) => {
      const [job, donor] = await Promise.all([transaction.get(jobReference), transaction.get(donorReference)])
      if (!job.exists || !donor.exists) return
      const profile = donor.get('profileImage') as Record<string, unknown> | undefined
      if (profile?.inputHash !== payload.inputHash) {
        transaction.update(jobReference, { status: 'superseded', updatedAt: Timestamp.now() })
        return
      }
      const now = Timestamp.now()
      transaction.set(donorReference, { profileImage: {
        ...profile,
        status: 'ready',
        storagePath,
        generatedAt: now,
        updatedAt: now,
      } }, { merge: true })
      transaction.update(jobReference, { status: 'ready', storagePath, completedAt: now, updatedAt: now })
    })
    return { outcome: 'ready' as const, storagePath }
  } catch (error) {
    const transient = isTransientProfileError(error)
    const now = Timestamp.now()
    await database.runTransaction(async (transaction) => {
      const [job, donor] = await Promise.all([transaction.get(jobReference), transaction.get(donorReference)])
      if (job.exists) transaction.update(jobReference, {
        status: transient ? 'pending' : 'failed',
        errorCode: transient ? 'TRANSIENT_GENERATION_FAILURE' : 'GENERATION_FAILED',
        updatedAt: now,
      })
      if (donor.exists) {
        const profile = donor.get('profileImage') as Record<string, unknown> | undefined
        if (profile?.inputHash === payload.inputHash) transaction.set(donorReference, {
          profileImage: { ...profile, status: transient ? 'pending' : 'failed', errorCode: transient ? 'TRANSIENT_GENERATION_FAILURE' : 'GENERATION_FAILED', updatedAt: now },
        }, { merge: true })
      }
    })
    if (transient) throw error
    return { outcome: 'failed' as const }
  }
}

export async function deleteDonorProfileArtifacts(donorId: string) {
  const database = getFirestore()
  const jobs = await database.collection('donorProfileJobs').where('donorId', '==', donorId).get()
  const batch = database.batch()
  jobs.docs.forEach((job) => batch.delete(job.ref))
  if (!jobs.empty) await batch.commit()
  const bucket = getStorage().bucket()
  const prefix = `donor-profile-images/${donorId}/`
  const [images] = await bucket.getFiles({ prefix })
  await bucket.deleteFiles({ prefix, force: true })
  return { deletedJobCount: jobs.size, deletedImageCount: images.length }
}
