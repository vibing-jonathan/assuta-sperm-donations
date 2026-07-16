import { z } from 'zod'

const optionalText = z.string().trim()

export const donorRowSchema = z.object({
  donorNumber: z.string().trim().min(1),
  occupation: optionalText,
  origin: optionalText,
  religion: optionalText,
  skinColor: optionalText,
  eyeColor: optionalText,
  hairColor: optionalText,
  heightMeters: z.number().min(1).max(2.5).nullable(),
  weightKg: z.number().min(30).max(300).nullable(),
  cmvIgg: optionalText,
})

export const extractionResponseSchema = z.object({
  donors: z.array(donorRowSchema).max(500),
  warnings: z.array(z.string().trim()).max(100),
})

export const extractionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    donors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          donorNumber: { type: 'string', description: 'The complete donor identifier exactly as displayed in the first table column.' },
          occupation: { type: 'string', description: 'Occupation in Hebrew; use an empty string when blank.' },
          origin: { type: 'string', description: 'Ethnic or geographic origin in Hebrew; use an empty string when blank.' },
          religion: { type: 'string', description: 'Religion in Hebrew; use an empty string when blank.' },
          skinColor: { type: 'string', description: 'Skin color in Hebrew; use an empty string when blank.' },
          eyeColor: { type: 'string', description: 'Eye color in Hebrew; use an empty string when blank.' },
          hairColor: { type: 'string', description: 'Hair color and texture in Hebrew; use an empty string when blank.' },
          heightMeters: { type: ['number', 'null'], minimum: 1, maximum: 2.5, description: 'Height in meters as a number.' },
          weightKg: { type: ['number', 'null'], minimum: 30, maximum: 300, description: 'Weight in kilograms as a number.' },
          cmvIgg: { type: 'string', description: 'Normalize the CMV IgG value to חיובי or שלילי; use an empty string when unknown.' },
        },
        required: [
          'donorNumber', 'occupation', 'origin', 'religion', 'skinColor',
          'eyeColor', 'hairColor', 'heightMeters', 'weightKg', 'cmvIgg',
        ],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Hebrew notes about illegible or uncertain source cells. Return an empty array when none.',
    },
  },
  required: ['donors', 'warnings'],
} as const

export function parseExtractionResponse(json: string) {
  return extractionResponseSchema.parse(JSON.parse(json))
}
