import { describe, expect, it } from 'vitest'

import { isAllowedAdmin } from './admin'

describe('isAllowedAdmin', () => {
  it('normalizes and permits configured administrators', () => {
    expect(isAllowedAdmin('  JGabbayJ@GMAIL.COM ')).toBe(true)
    expect(isAllowedAdmin('robieis153@gmail.com')).toBe(true)
  })

  it('rejects all other accounts', () => {
    expect(isAllowedAdmin('visitor@example.com')).toBe(false)
    expect(isAllowedAdmin(null)).toBe(false)
  })
})
