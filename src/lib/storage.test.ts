import { describe, expect, it } from 'vitest'
import { dbStorageKey } from './storage'

describe('db storage keys', () => {
  it('scopes signed-in users to separate browser cache keys', () => {
    expect(dbStorageKey()).toBe('referee_dashboard_db_v4_local')
    expect(dbStorageKey('user-a')).toBe('referee_dashboard_db_v4_local_user_user-a')
    expect(dbStorageKey('user-b')).toBe('referee_dashboard_db_v4_local_user_user-b')
    expect(dbStorageKey('user-a')).not.toBe(dbStorageKey('user-b'))
  })
})
