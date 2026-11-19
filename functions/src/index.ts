import { GoogleGenAI } from '@google/genai'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { onTaskDispatched } from 'firebase-functions/v2/tasks'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

import { getAllowedAdminEmail } from './admin.js'
import { deleteAllDonorRecords } from './deleteDonors.js'
import { deleteDonorPageImages } from './donorPages.js'
import { extractionJsonSchema, parseExtractionResponse } from './extractionSchema.js'
import {
  generateAndStoreDonorPdfs,
  InvalidDonorPdfRequestError,
  readDonorPdfGenerationRequest,
} from './generateDonorPdfs.js'
import { geminiGenerationConfig } from './geminiConfig.js'
import {
  deleteDonorProfileArtifacts,
  enqueueProfileImageTask,
  processProfileImageJob,
  registerDonorProfileInput,
  registerDonorProfileInputByNumber,
  summaryProfileInput,
  type ProfileImageTaskPayload,
} from './donorProfileImages.js'
import { donorStorageKey } from './donorPages.js'
import {
  InvalidDonorMediaPathError,
  canReadDonorMedia,
  donorMediaContentType,
  readDonorMediaPath,
} from './donorMedia.js'
import {
  DonorNotFoundError,
  InvalidAdminProfileImageError,
  readAdminProfileImageUpload,
  storeAdminProfileImage,
} from './uploadDonorProfileImage.js'
import {
  createUserAppSession,
  InvalidUserAppCredentialError,
  InvalidUserAppLoginRequestError,
  USER_ACCESS_SETTINGS_PATH,
} from './userAppAccess.js'
import { userDonorRecord } from './userDonors.js'

const geminiApiKey = defineSecret('GEMINI_API_KEY')
const MAX_RELEVANT_PDF_BYTES = 8 * 1024 * 1024
const GEMINI_MODEL = 'gemini-3.5-flash'

if (getApps().length === 0) initializeApp()

export const loginUserApp = onCall({
  region: 'europe-west1',
  maxInstances: 10,
}, async (request) => {
  try {
    const token = await createUserAppSession(
      request.data,
      async () => (await getFirestore().doc(USER_ACCESS_SETTINGS_PATH).get()).data(),
      (uid, claims) => getAuth().createCustomToken(uid, claims),
    )
    return { token }
  } catch (error) {
    if (error instanceof InvalidUserAppLoginRequestError) {
      throw new HttpsError('invalid-argument', 'Invalid login request.')
    }
    if (error instanceof InvalidUserAppCredentialError) {
      throw new HttpsError('permission-denied', 'Invalid username or password.')
    }
    logger.error('User app login failed.', readErrorDiagnostics(error))
    throw new HttpsError('internal', 'Login failed.')
  }
})

export const listUserDonors = onCall({
  region: 'europe-west1',
  maxInstances: 10,
}, async (request) => {
  if (request.auth?.token.userApp !== true) {
    throw new HttpsError('permission-denied', 'User app access is required.')
  }
  try {
    const snapshot = await getFirestore().collection('donors').orderBy('createdAt', 'desc').get()
    return { donors: snapshot.docs.map((document) => userDonorRecord(document.id, document.data())) }
  } catch (error) {
    logger.error('User donor list failed.', readErrorDiagnostics(error))
    throw new HttpsError('internal', 'Donors could not be loaded.')
  }
})

interface ExtractionRequest {
  pdfBase64: string
  sourceFileName: string
  startPage: number
  endPage: number
}

class InvalidRequestError extends Error {}

function readErrorDiagnostics(error: unknown) {
  if (!(error instanceof Error)) return { errorName: 'UnknownError' }
  const apiError = error as Error & { status?: unknown; code?: unknown }
  return {
    errorName: error.name,
    errorStatus: typeof apiError.status === 'number' ? apiError.status : undefined,
    errorCode: typeof apiError.code === 'string' || typeof apiError.code === 'number' ? apiError.code : undefined,
  }
}

function readExtractionRequest(data: unknown): ExtractionRequest {
  if (!data || typeof data !== 'object') throw new InvalidRequestError('Invalid extraction request.')
  const input = data as Record<string, unknown>
  if (typeof input.pdfBase64 !== 'string' || !input.pdfBase64) {
    throw new InvalidRequestError('A PDF payload is required.')
  }
  if (typeof input.sourceFileName !== 'string' || input.sourceFileName.length > 200) {
    throw new InvalidRequestError('Invalid source file name.')
  }
  if (!Number.isInteger(input.startPage) || !Number.isInteger(input.endPage)) {
    throw new InvalidRequestError('Invalid page range.')
  }
  const startPage = input.startPage as number
  const endPage = input.endPage as number
  if (startPage < 1 || endPage < startPage || endPage - startPage + 1 > 30) {
    throw new InvalidRequestError('The PDF page range is outside the allowed limits.')
  }

  const pdf = Buffer.from(input.pdfBase64, 'base64')
  if (pdf.byteLength === 0 || pdf.byteLength > MAX_RELEVANT_PDF_BYTES) {
    throw new InvalidRequestError('The relevant PDF pages exceed the allowed size.')
  }
  if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new InvalidRequestError('The supplied document is not a PDF.')
  }

  return {
    pdfBase64: pdf.toString('base64'),
    sourceFileName: input.sourceFileName,
    startPage,
    endPage,
  }
}

export const extractDonorsFromPdf = onRequest({
  region: 'europe-west1',
  secrets: [geminiApiKey],
  timeoutSeconds: 300,
  memory: '1GiB',
  maxInstances: 3,
  invoker: 'public',
  cors: true,
}, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const authorization = request.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: 'AUTHENTICATION_REQUIRED' })
    return
  }

  let decodedToken
  try {
    decodedToken = await getAuth().verifyIdToken(authorization.slice('Bearer '.length), true)
  } catch {
    response.status(401).json({ error: 'INVALID_AUTHENTICATION' })
    return
  }

  const adminEmail = getAllowedAdminEmail({ token: decodedToken })
  if (!adminEmail) {
    response.status(403).json({ error: 'ADMIN_ACCESS_REQUIRED' })
    return
  }

  let input: ExtractionRequest
  try {
    input = readExtractionRequest(request.body)
  } catch (error) {
    response.status(400).json({ error: 'INVALID_EXTRACTION_REQUEST' })
    return
  }
  const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() })
  const prompt = `
חלץ את כל שורות התורמים מטבלת ה-PDF המצורף. אלו עמודים ${input.startPage} עד ${input.endPage} בקובץ המקורי.
שמור טקסט עברי בדיוק ככל האפשר ואל תמציא ערכים חסרים. כל שורה חייבת להפוך לרשומת תורם אחת.
העמודה הראשונה היא מזהה התורם; שמור את כל תוכן התא, לרבות שם כינוי ומספר אם שניהם מופיעים.
אם מזהה התורם מסתיים בדיוק בשלוש כוכביות (***), חובה לשמור את שלוש הכוכביות בסוף המזהה. אל תוסיף כוכביות למזהה שאינו מסומן.
המר גובה למטרים ומשקל לקילוגרמים כמספרים. המר CMV IgG ל"חיובי" או "שלילי" בלבד כשאפשר לזהות אותו.
אם תא אינו קריא, השאר מחרוזת ריקה או null לפי הסכימה והוסף אזהרה קצרה בעברית.
אל תחלץ כותרות, הערות שוליים או מידע שאינו שורת טבלה.
  `.trim()

  let extractionStage = 'gemini_request'
  try {
    const interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      input: [
        { type: 'text', text: prompt },
        { type: 'document', data: input.pdfBase64, mime_type: 'application/pdf' },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: extractionJsonSchema,
      },
      generation_config: geminiGenerationConfig,
    })
    if (!interaction.output_text) throw new Error('Gemini returned an empty extraction response.')
    extractionStage = 'response_validation'
    const extracted = parseExtractionResponse(interaction.output_text)
    logger.info('Donor PDF extraction completed.', {
      adminEmail,
      startPage: input.startPage,
      endPage: input.endPage,
      donorCount: extracted.donors.length,
      warningCount: extracted.warnings.length,
    })
    response.status(200).json({ ...extracted, model: GEMINI_MODEL })
  } catch (error) {
    logger.error('Donor PDF extraction failed.', {
      adminEmail,
      extractionStage,
      ...readErrorDiagnostics(error),
    })
    response.status(500).json({ error: 'EXTRACTION_FAILED' })
  }
})

export const cleanupDonorPagesOnDelete = onDocumentDeleted({
  document: 'donors/{donorId}',
  region: 'europe-west1',
  retry: true,
}, async (event) => {
  const donorNumber = event.data?.get('donorNumber')
  let deletedObjectCount = 0
  if (typeof donorNumber !== 'string' || !donorNumber.trim()) {
    logger.warn('Deleted donor did not contain a usable donor number.', {
      donorId: event.params.donorId,
    })
  } else {
    deletedObjectCount = await deleteDonorPageImages(donorNumber)
  }
  const profileCleanup = await deleteDonorProfileArtifacts(event.params.donorId)
  logger.info('Deleted donor storage artifacts.', {
    donorId: event.params.donorId,
    deletedObjectCount,
    ...profileCleanup,
  })
})

export const createManualDonorProfileJob = onDocumentCreated({
  document: 'donors/{donorId}',
  region: 'europe-west1',
  retry: true,
}, async (event) => {
  if (!event.data || event.data.get('importId')) return
  const input = summaryProfileInput(event.data.data())
  if (!input) return
  const result = await registerDonorProfileInput(event.params.donorId, input)
  logger.info('Manual donor profile image input registered.', {
    donorId: event.params.donorId,
    jobCreated: result.created,
  })
})

export const enqueueDonorProfileImage = onDocumentCreated({
  document: 'donorProfileJobs/{jobId}',
  region: 'europe-west1',
  retry: true,
}, async (event) => {
  const donorId = event.data?.get('donorId')
  const inputHash = event.data?.get('inputHash')
  if (typeof donorId !== 'string' || typeof inputHash !== 'string'
    || inputHash.length !== 64 || event.params.jobId.length !== 64) {
    logger.warn('Rejected invalid donor profile image job.', { jobId: event.params.jobId })
    return
  }
  const enqueued = await enqueueProfileImageTask({ jobId: event.params.jobId, donorId, inputHash })
  logger.info('Donor profile image task handled.', { jobId: event.params.jobId, donorId, enqueued })
})

export const generateDonorProfileImage = onTaskDispatched<ProfileImageTaskPayload>({
  region: 'europe-west1',
  secrets: [geminiApiKey],
  timeoutSeconds: 300,
  memory: '512MiB',
  maxInstances: 2,
  concurrency: 1,
  retryConfig: {
    maxAttempts: 4,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 900,
    maxDoublings: 3,
  },
  rateLimits: {
    maxConcurrentDispatches: 2,
    maxDispatchesPerSecond: 1,
  },
}, async (request) => {
  const payload = request.data
  if (!payload || typeof payload.jobId !== 'string' || typeof payload.donorId !== 'string'
    || typeof payload.inputHash !== 'string') {
    logger.warn('Rejected invalid donor profile task payload.')
    return
  }
  const result = await processProfileImageJob(payload, geminiApiKey.value())
  logger.info('Donor profile image task completed.', {
    jobId: payload.jobId,
    donorId: payload.donorId,
    outcome: result.outcome,
  })
})

export const generateDonorDetailPdfs = onRequest({
  region: 'europe-west1',
  timeoutSeconds: 540,
  memory: '1GiB',
  maxInstances: 2,
  invoker: 'public',
  cors: true,
}, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const authorization = request.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: 'AUTHENTICATION_REQUIRED' })
    return
  }

  let decodedToken
  try {
    decodedToken = await getAuth().verifyIdToken(authorization.slice('Bearer '.length), true)
  } catch {
    response.status(401).json({ error: 'INVALID_AUTHENTICATION' })
    return
  }
  const adminEmail = getAllowedAdminEmail({ token: decodedToken })
  if (!adminEmail) {
    response.status(403).json({ error: 'ADMIN_ACCESS_REQUIRED' })
    return
  }

  let input
  try {
    input = readDonorPdfGenerationRequest(request.rawBody)
  } catch (error) {
    logger.warn('Invalid donor PDF generation request.', {
      adminEmail,
      ...readErrorDiagnostics(error),
    })
    response.status(400).json({ error: 'INVALID_PDF_GENERATION_REQUEST' })
    return
  }

  try {
    const result = await generateAndStoreDonorPdfs(input)
    const profileInputs = input.sources.filter((source) => source.profileImageInput)
    const profileJobs = await Promise.all(profileInputs.map((source) => registerDonorProfileInputByNumber(
      donorStorageKey(source.donorNumber),
      source.profileImageInput,
    )))
    logger.info('Donor detail PDFs generated.', {
      adminEmail,
      donorCount: result.uploadedDonorCount,
      sourcePdfBytes: result.sourcePdfBytes,
      generatedPdfBytes: result.generatedPdfBytes,
      profileJobCount: profileJobs.filter((job) => job.created).length,
    })
    response.status(200).json(result)
  } catch (error) {
    if (error instanceof InvalidDonorPdfRequestError) {
      logger.warn('Donor PDF generation validation failed.', {
        adminEmail,
        ...readErrorDiagnostics(error),
      })
      response.status(400).json({ error: 'INVALID_PDF_GENERATION_REQUEST' })
      return
    }
    logger.error('Donor PDF generation failed.', {
      adminEmail,
      ...readErrorDiagnostics(error),
    })
    response.status(500).json({ error: 'PDF_GENERATION_FAILED' })
  }
})

export const uploadDonorProfileImage = onRequest({
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 3,
  invoker: 'public',
  cors: true,
}, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }
  const authorization = request.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: 'AUTHENTICATION_REQUIRED' })
    return
  }
  let decodedToken
  try {
    decodedToken = await getAuth().verifyIdToken(authorization.slice('Bearer '.length), true)
  } catch {
    response.status(401).json({ error: 'INVALID_AUTHENTICATION' })
    return
  }
  const adminEmail = getAllowedAdminEmail({ token: decodedToken })
  if (!adminEmail) {
    response.status(403).json({ error: 'ADMIN_ACCESS_REQUIRED' })
    return
  }

  try {
    const upload = readAdminProfileImageUpload(
      request.get('x-donor-id'),
      request.get('content-type'),
      request.rawBody,
    )
    const result = await storeAdminProfileImage(upload, adminEmail)
    logger.info('Administrator replaced a donor profile image.', {
      adminEmail,
      donorId: upload.donorId,
    })
    response.status(200).json(result)
  } catch (error) {
    if (error instanceof InvalidAdminProfileImageError) {
      response.status(400).json({ error: 'INVALID_PROFILE_IMAGE' })
      return
    }
    if (error instanceof DonorNotFoundError) {
      response.status(404).json({ error: 'DONOR_NOT_FOUND' })
      return
    }
    logger.error('Administrator profile image upload failed.', {
      adminEmail,
      ...readErrorDiagnostics(error),
    })
    response.status(500).json({ error: 'PROFILE_IMAGE_UPLOAD_FAILED' })
  }
})

export const getDonorMedia = onRequest({
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 10,
  invoker: 'public',
  cors: true,
}, async (request, response) => {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }
  const authorization = request.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: 'AUTHENTICATION_REQUIRED' })
    return
  }
  let decodedToken
  try {
    decodedToken = await getAuth().verifyIdToken(authorization.slice('Bearer '.length))
  } catch {
    response.status(401).json({ error: 'INVALID_AUTHENTICATION' })
    return
  }
  if (!canReadDonorMedia(decodedToken)) {
    response.status(403).json({ error: 'MEDIA_ACCESS_REQUIRED' })
    return
  }

  let path: string
  try {
    path = readDonorMediaPath(request.query.path)
  } catch (error) {
    if (error instanceof InvalidDonorMediaPathError) {
      response.status(400).json({ error: 'INVALID_MEDIA_PATH' })
      return
    }
    throw error
  }

  try {
    const [bytes] = await getStorage().bucket().file(path).download()
    response.set({
      'Cache-Control': 'private, max-age=3600',
      'Content-Type': donorMediaContentType(path),
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
    })
    response.status(200).send(bytes)
  } catch (error) {
    const status = Number((error as { code?: unknown }).code)
    if (status === 404) {
      response.status(404).json({ error: 'MEDIA_NOT_FOUND' })
      return
    }
    logger.error('Donor media download failed.', {
      path,
      ...readErrorDiagnostics(error),
    })
    response.status(500).json({ error: 'MEDIA_DOWNLOAD_FAILED' })
  }
})

export const deleteAllDonors = onCall({
  region: 'europe-west1',
  timeoutSeconds: 540,
  memory: '256MiB',
  maxInstances: 1,
}, async (request) => {
  const adminEmail = getAllowedAdminEmail(request.auth)
  if (!adminEmail) throw new HttpsError('permission-denied', 'Administrator access is required.')

  try {
    const result = await deleteAllDonorRecords()
    logger.info('Bulk donor deletion completed.', { adminEmail, ...result })
    return result
  } catch (error) {
    logger.error('Bulk donor deletion failed.', {
      adminEmail,
      ...readErrorDiagnostics(error),
    })
    throw new HttpsError('internal', 'Bulk donor deletion failed.')
  }
})
