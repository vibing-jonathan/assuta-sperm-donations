import { describe, expect, it } from 'vitest'

import { geminiGenerationConfig } from './geminiConfig.js'

describe('Gemini extraction generation config', () => {
  it('uses low thinking for latency-sensitive table extraction', () => {
    expect(geminiGenerationConfig).toEqual({ thinking_level: 'low' })
  })
})
