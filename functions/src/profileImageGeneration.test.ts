import { describe, expect, it, vi } from 'vitest'

import {
  ARCHIE_1436_APPEARANCE,
  buildDonorProfilePrompt,
  GEMINI_PROFILE_IMAGE_MODEL,
  GEMINI_PROFILE_IMAGE_SIZE,
  generateProfileImageWithGemini,
  generateProfileImageWithOpenAI,
  OPENAI_PROFILE_IMAGE_MODEL,
  OPENAI_PROFILE_IMAGE_SIZE,
} from './profileImageGeneration.js'

describe('local donor profile image comparison', () => {
  it('builds one anonymized prompt from donor and parental appearance fields', () => {
    const prompt = buildDonorProfilePrompt(ARCHIE_1436_APPEARANCE)

    expect(prompt).toContain('full, wavy, light-brown hair')
    expect(prompt).toContain('blue-green, almond-shaped eyes')
    expect(prompt).toContain('long eyelashes')
    expect(prompt).toContain('no freckles')
    expect(prompt).toContain('maternal side - Russian and Ukrainian family background')
    expect(prompt).toContain('paternal side - Persian and Belarusian family background')
    expect(prompt).toContain('Do not show either parent')
    expect(prompt).toContain('must not depict or copy an identifiable real person')
    expect(prompt).not.toContain('1436')
    expect(prompt).not.toContain('Archie')
  })

  it('sends the shared prompt to GPT Image 2 and decodes its PNG', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('openai-image').toString('base64') }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await generateProfileImageWithOpenAI('same prompt', 'test-key', fetchImpl)

    const request = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)
    expect(request).toEqual(expect.objectContaining({
      model: OPENAI_PROFILE_IMAGE_MODEL,
      prompt: 'same prompt',
      size: OPENAI_PROFILE_IMAGE_SIZE,
      quality: 'low',
    }))
    expect(result.bytes.toString()).toBe('openai-image')
  })

  it('sends the identical prompt to Gemini and decodes its image', async () => {
    const create = vi.fn().mockResolvedValue({
      output_image: { data: Buffer.from('gemini-image').toString('base64'), mime_type: 'image/jpeg' },
    })
    const createClient = vi.fn(() => ({ interactions: { create } }))

    const result = await generateProfileImageWithGemini('same prompt', 'test-key', createClient as never)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: GEMINI_PROFILE_IMAGE_MODEL,
      input: 'same prompt',
      response_format: expect.objectContaining({
        aspect_ratio: '1:1', image_size: GEMINI_PROFILE_IMAGE_SIZE, mime_type: 'image/jpeg',
      }),
    }))
    expect(result.bytes.toString()).toBe('gemini-image')
  })
})
