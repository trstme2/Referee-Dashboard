import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const FEED_URL_PREFIX = 'wkenc:v1:'
const CALENDAR_TOKEN_HASH_PREFIX = 'sha256:'

function feedEncryptionKey(): Buffer | null {
  const raw = process.env.FEED_URL_ENCRYPTION_KEY || ''
  if (!raw.trim()) return null

  const trimmed = raw.trim()
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex')

  const decoded = Buffer.from(trimmed, 'base64')
  if (decoded.length === 32) return decoded

  throw new Error('FEED_URL_ENCRYPTION_KEY must be a 32-byte base64 value or 64-character hex value')
}

export function protectFeedUrl(url: string): string {
  if (url.startsWith(FEED_URL_PREFIX)) return url
  const key = feedEncryptionKey()
  if (!key) return url

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${FEED_URL_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

export function revealFeedUrl(value: string): string {
  if (!value.startsWith(FEED_URL_PREFIX)) return value
  const key = feedEncryptionKey()
  if (!key) throw new Error('Encrypted feed URL cannot be read without FEED_URL_ENCRYPTION_KEY')

  const encoded = value.slice(FEED_URL_PREFIX.length)
  const [ivRaw, tagRaw, ciphertextRaw] = encoded.split('.')
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Encrypted feed URL is malformed')

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function hashCalendarExportToken(token: string): string {
  return `${CALENDAR_TOKEN_HASH_PREFIX}${createHash('sha256').update(token, 'utf8').digest('hex')}`
}

export function isHashedCalendarExportToken(value: unknown): boolean {
  return new RegExp(`^${CALENDAR_TOKEN_HASH_PREFIX}[a-f0-9]{64}$`, 'i').test(String(value || '').trim())
}
