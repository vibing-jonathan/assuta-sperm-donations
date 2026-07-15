import { GoogleGenAI } from '@google/genai'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'

import { getAllowedAdminEmail } from './admin.js'
import { extractionJsonSchema, parseExtractionResponse } from './extractionSchema.js'

const geminiApiKey = defineSecret('GEMINI_API_KEY')
const MAX_RELEVANT_PDF_BYTES = 8 * 1024 * 1024
const GEMINI_MODEL = 'gemini-3.5-flash'

if (getApps().length === 0) initializeApp()

interface ExtractionRequest {
  pdfBase64: string
  sourceFileName: string
  startPage: number
  endPage: number
}

class InvalidRequestError extends Error {}

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
    response.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const authorization = request.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: 'Authentication is required.' })
    return
  }

  let decodedToken
  try {
    decodedToken = await getAuth().verifyIdToken(authorization.slice('Bearer '.length), true)
  } catch {
    response.status(401).json({ error: 'Invalid authentication token.' })
    return
  }

  const adminEmail = getAllowedAdminEmail({ token: decodedToken })
  if (!adminEmail) {
    response.status(403).json({ error: 'Verified administrator access is required.' })
    return
  }

  let input: ExtractionRequest
  try {
    input = readExtractionRequest(request.body)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid extraction request.' })
    return
  }
  const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() })
  const prompt = `
חלץ את כל שורות התורמים מטבלת ה-PDF המצורף. אלו עמודים ${input.startPage} עד ${input.endPage} בקובץ המקורי.
שמור טקסט עברי בדיוק ככל האפשר ואל תמציא ערכים חסרים. כל שורה חייבת להפוך לרשומת תורם אחת.
העמודה הראשונה היא מזהה התורם; שמור את כל תוכן התא, לרבות שם כינוי ומספר אם שניהם מופיעים.
המר גובה למטרים ומשקל לקילוגרמים כמספרים. המר CMV IgG ל"חיובי" או "שלילי" בלבד כשאפשר לזהות אותו.
אם תא אינו קריא, השאר מחרוזת ריקה או null לפי הסכימה והוסף אזהרה קצרה בעברית.
אל תחלץ כותרות, הערות שוליים או מידע שאינו שורת טבלה.
  `.trim()

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
    })
    if (!interaction.output_text) throw new Error('Gemini returned an empty extraction response.')
    const extracted = parseExtractionResponse(interaction.output_text)
    logger.info('Donor PDF extraction completed.', {
      adminEmail,
      sourceFileName: input.sourceFileName,
      startPage: input.startPage,
      endPage: input.endPage,
      donorCount: extracted.donors.length,
      warningCount: extracted.warnings.length,
    })
    response.status(200).json({ ...extracted, model: GEMINI_MODEL })
  } catch (error) {
    logger.error('Donor PDF extraction failed.', {
      adminEmail,
      sourceFileName: input.sourceFileName,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    response.status(500).json({ error: 'Donor extraction failed. Please try again.' })
  }
})
