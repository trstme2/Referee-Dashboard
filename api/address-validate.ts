import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders, toJsonBody } from '../src/server/auth-utils.js'
import { extractValidatedProfileAddress } from '../src/server/profile-addresses.js'

const MAX_ADDRESS_LENGTH = 300
const GEOCODE_TIMEOUT_MS = 5_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res)

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const rate = checkRateLimit(req, 'address-validate', { limit: 30, windowMs: 60 * 1000 })
    if (!rate.allowed) return sendRateLimited(res, rate.retryAfterSeconds)

    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })

    const client = createAuthedSupabase(token)
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })

    const body = toJsonBody(req)
    const address = String(body.address ?? '').trim()
    if (!address) return res.status(400).json({ error: 'Address is required' })
    if (address.length > MAX_ADDRESS_LENGTH) return res.status(400).json({ error: 'Address is too long' })

    const key = process.env.GOOGLE_MAPS_API_KEY
    if (!key) return res.status(500).json({ error: 'Address verification is not configured' })

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('address', address)
    url.searchParams.set('key', key)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)
    const response = await fetch(url.toString(), { signal: controller.signal }).finally(() => clearTimeout(timeout))
    const payload = await response.json()

    const validated = extractValidatedProfileAddress(Array.isArray(payload?.results) ? payload.results : [])
    if (!response.ok || !validated) {
      return res.status(400).json({
        error: 'Enter a real street address that Google Maps can verify for mileage calculations.',
      })
    }

    return res.status(200).json({ address: validated })
  } catch {
    return res.status(502).json({ error: 'Address verification failed' })
  }
}
