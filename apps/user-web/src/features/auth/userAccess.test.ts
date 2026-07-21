import { describe, expect, it } from 'vitest'

import { loginErrorMessage } from './userAccess'

describe('loginErrorMessage', () => {
  it('maps safe callable errors to Hebrew messages', () => {
    expect(loginErrorMessage({ code: 'functions/invalid-argument' })).toContain('למלא')
    expect(loginErrorMessage({ code: 'functions/permission-denied' })).toContain('אינם נכונים')
  })

  it('does not expose unexpected backend details', () => {
    expect(loginErrorMessage(new Error('database credentials leaked'))).not.toContain('database')
  })
})
