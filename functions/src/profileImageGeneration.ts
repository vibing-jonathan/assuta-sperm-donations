import { GoogleGenAI } from '@google/genai'

export const OPENAI_PROFILE_IMAGE_MODEL = 'gpt-image-2'
export const GEMINI_PROFILE_IMAGE_MODEL = 'gemini-3.1-flash-image'
export const OPENAI_PROFILE_IMAGE_SIZE = '816x816'
export const GEMINI_PROFILE_IMAGE_SIZE = '512'

export interface DonorAppearance {
  build: string
  skin: string
  hair: string
  eyes: string
  facialDetails: string[]
  maternalAppearance: string
  paternalAppearance: string
}

export interface GeneratedProfileImage {
  bytes: Buffer
  mimeType: string
  model: string
  requestedSize: string
}

export const ARCHIE_1436_APPEARANCE: DonorAppearance = {
  build: 'sturdy, broad-shouldered build',
  skin: 'fair skin with a complexion that tans',
  hair: 'full, wavy, light-brown hair',
  eyes: 'blue-green, almond-shaped eyes',
  facialDetails: ['long eyelashes', 'no freckles'],
  maternalAppearance: 'Russian and Ukrainian family background; blue eyes; fair skin; brown, curly hair; 1.70 m tall',
  paternalAppearance: 'Persian and Belarusian family background; brown eyes; tanned skin; black, curly hair; 1.80 m tall',
}

export function buildDonorProfilePrompt(appearance: DonorAppearance) {
  const context = [appearance.build, appearance.skin, appearance.hair, appearance.eyes, ...appearance.facialDetails]
    .filter(Boolean).join('; ')
  const parentContext = [
    appearance.maternalAppearance ? `maternal side - ${appearance.maternalAppearance}` : '',
    appearance.paternalAppearance ? `paternal side - ${appearance.paternalAppearance}` : '',
  ].filter(Boolean).join('; ')
  return [
    'Use case: photorealistic-natural',
    'Asset type: square donor profile avatar',
    'Primary request: Create a realistic but clearly synthetic head-and-shoulders portrait of a young adult man. He must not depict or copy an identifiable real person.',
    `Subject: ${context}.`,
    parentContext ? `Family appearance context, for subtle inherited-feature plausibility only: ${parentContext}. Do not show either parent.` : '',
    'Style/medium: natural professional portrait photography with realistic skin and hair texture',
    'Composition/framing: centered eye-level head-and-shoulders crop, face fully visible, broad shoulders subtly visible, square composition',
    'Lighting/mood: soft neutral studio lighting, calm and approachable expression',
    'Scene/backdrop: simple warm light-gray background with no objects',
    'Constraints: one adult person only; everyday modest clothing; no medical context; no donor identifiers; no text; no logo; no watermark; no celebrity resemblance; no exaggerated beauty retouching.',
  ].filter(Boolean).join('\n')
}

async function readProviderError(response: Response, provider: string): Promise<never> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: unknown } | string
  } | null
  const message = typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.error?.message === 'string' ? payload.error.message : undefined
  throw new Error(`${provider} image generation failed (${response.status})${message ? `: ${message}` : '.'}`)
}

export async function generateProfileImageWithOpenAI(
  prompt: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeneratedProfileImage> {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required.')
  const response = await fetchImpl('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_PROFILE_IMAGE_MODEL,
      prompt,
      n: 1,
      size: OPENAI_PROFILE_IMAGE_SIZE,
      quality: 'low',
      output_format: 'png',
    }),
  })
  if (!response.ok) return readProviderError(response, 'OpenAI')
  const payload = await response.json() as { data?: Array<{ b64_json?: unknown }> }
  const encoded = payload.data?.[0]?.b64_json
  if (typeof encoded !== 'string' || !encoded) throw new Error('OpenAI returned no image data.')
  return {
    bytes: Buffer.from(encoded, 'base64'),
    mimeType: 'image/png',
    model: OPENAI_PROFILE_IMAGE_MODEL,
    requestedSize: OPENAI_PROFILE_IMAGE_SIZE,
  }
}

export async function generateProfileImageWithGemini(
  prompt: string,
  apiKey: string,
  createClient: (key: string) => GoogleGenAI = (key) => new GoogleGenAI({ apiKey: key }),
): Promise<GeneratedProfileImage> {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required.')
  const interaction = await createClient(apiKey).interactions.create({
    model: GEMINI_PROFILE_IMAGE_MODEL,
    input: prompt,
    response_format: {
      type: 'image',
      mime_type: 'image/jpeg',
      aspect_ratio: '1:1',
      image_size: GEMINI_PROFILE_IMAGE_SIZE,
    },
  })
  const encoded = interaction.output_image?.data
  if (!encoded) throw new Error('Gemini returned no image data.')
  return {
    bytes: Buffer.from(encoded, 'base64'),
    mimeType: interaction.output_image?.mime_type ?? 'image/jpeg',
    model: GEMINI_PROFILE_IMAGE_MODEL,
    requestedSize: GEMINI_PROFILE_IMAGE_SIZE,
  }
}
