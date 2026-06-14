import dns from 'node:dns/promises'
import net from 'node:net'

const MAX_FEED_BYTES = 2 * 1024 * 1024
const FEED_TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 3

function isInRange(value: number, start: number, end: number): boolean {
  return value >= start && value <= end
}

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToNumber(ip)
  return (
    isInRange(n, ipv4ToNumber('0.0.0.0'), ipv4ToNumber('0.255.255.255')) ||
    isInRange(n, ipv4ToNumber('10.0.0.0'), ipv4ToNumber('10.255.255.255')) ||
    isInRange(n, ipv4ToNumber('127.0.0.0'), ipv4ToNumber('127.255.255.255')) ||
    isInRange(n, ipv4ToNumber('169.254.0.0'), ipv4ToNumber('169.254.255.255')) ||
    isInRange(n, ipv4ToNumber('172.16.0.0'), ipv4ToNumber('172.31.255.255')) ||
    isInRange(n, ipv4ToNumber('192.168.0.0'), ipv4ToNumber('192.168.255.255')) ||
    isInRange(n, ipv4ToNumber('224.0.0.0'), ipv4ToNumber('255.255.255.255'))
  )
}

function isPrivateIpv6(ip: string): boolean {
  const value = ip.toLowerCase()
  if (value === '::1' || value === '::') return true
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  return mapped ? isPrivateIpv4(mapped[1]) : false
}

function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIpv4(ip)
  if (family === 6) return isPrivateIpv6(ip)
  return true
}

export function validateFeedUrl(raw: unknown): string {
  const value = String(raw || '').trim()
  if (!value) throw new Error('feedUrl is required')
  if (value.length > 2048) throw new Error('feedUrl is too long')

  const url = new URL(value)
  if (url.protocol !== 'https:') {
    if (url.protocol === 'http:' && process.env.ALLOW_INSECURE_FEED_URLS === 'true') return url.toString()
    throw new Error('feedUrl must use https')
  }
  return url.toString()
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost')) throw new Error('feed host is not allowed')

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('feed host is not allowed')
    return
  }

  const results = await dns.lookup(host, { all: true, verbatim: true })
  if (!results.length) throw new Error('feed host could not be resolved')
  if (results.some((result) => isBlockedIp(result.address))) throw new Error('feed host is not allowed')
}

function isAllowedContentType(value: string | null): boolean {
  if (!value) return true
  const contentType = value.split(';')[0].trim().toLowerCase()
  return ['text/calendar', 'text/plain', 'application/octet-stream', 'application/calendar'].includes(contentType)
}

async function responseTextWithLimit(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_FEED_BYTES) throw new Error('feed is too large')
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_FEED_BYTES) throw new Error('feed is too large')
    text += decoder.decode(value, { stream: true })
  }

  text += decoder.decode()
  return text
}

export async function fetchCalendarFeedText(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let current = new URL(validateFeedUrl(rawUrl))

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicHost(current)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
    try {
      const response = await fetchImpl(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'text/calendar,text/plain,application/calendar,*/*;q=0.1' },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error('feed redirect missing location')
        current = new URL(validateFeedUrl(new URL(location, current).toString()))
        continue
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!isAllowedContentType(response.headers.get('content-type'))) throw new Error('feed content type is not allowed')
      return await responseTextWithLimit(response)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error('too many feed redirects')
}
