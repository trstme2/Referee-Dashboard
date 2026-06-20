import { describe, expect, it } from 'vitest'
import { normalizeBetaAccessEmail, validateBetaAccessRequest } from './betaAccess'

describe('betaAccess', () => {
  it('normalizes request email addresses', () => {
    expect(normalizeBetaAccessEmail('  Official@Example.COM  ')).toBe('official@example.com')
  })

  it('accepts a complete beta access request', () => {
    const result = validateBetaAccessRequest({
      fullName: 'Casey Referee',
      email: 'casey@example.com',
      region: 'Ohio',
      sports: ['Soccer'],
      platforms: ['DragonFly', 'Other: Local association feed'],
      devicePreference: 'iPhone',
      notes: 'I work high school and club matches.',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.emailNormalized).toBe('casey@example.com')
      expect(result.value.platforms).toEqual(['DragonFly', 'Other: Local association feed'])
    }
  })

  it('rejects incomplete requests', () => {
    const result = validateBetaAccessRequest({
      fullName: '',
      email: 'not-an-email',
      region: '',
      sports: [],
      platforms: [],
      devicePreference: 'Smart toaster',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('Enter a valid email address.')
  })
})
