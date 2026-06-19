import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders } from '../src/server/auth-utils.js'

const MAX_ADDRESS_LENGTH = 300
const MAX_PLACE_ID_LENGTH = 200
const DISTANCE_TIMEOUT_MS = 5_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res)

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const rate = checkRateLimit(req, 'distance', { limit: 60, windowMs: 60 * 1000 })
    if (!rate.allowed) return sendRateLimited(res, rate.retryAfterSeconds)

    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })

    const client = createAuthedSupabase(token)
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })

    const origin = String(req.query.origin ?? '').trim()
    const destination = String(req.query.destination ?? '').trim()
    const originPlaceId = String(req.query.originPlaceId ?? '').trim()
    if (!origin || !destination) return res.status(400).json({ error: 'origin and destination are required' })
    if (origin.length > MAX_ADDRESS_LENGTH || destination.length > MAX_ADDRESS_LENGTH) {
      return res.status(400).json({ error: 'origin and destination are too long' })
    }
    if (originPlaceId && originPlaceId.length > MAX_PLACE_ID_LENGTH) {
      return res.status(400).json({ error: 'origin place id is too long' })
    }

    const key = process.env.GOOGLE_MAPS_API_KEY
    if (!key) return res.status(500).json({ error: 'Distance service is not configured' })

    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', originPlaceId ? `place_id:${originPlaceId}` : origin)
    url.searchParams.set('destinations', destination)
    url.searchParams.set('key', key)
    url.searchParams.set('units', 'imperial')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DISTANCE_TIMEOUT_MS)
    const r = await fetch(url.toString(), { signal: controller.signal }).finally(() => clearTimeout(timeout))
    const j = await r.json()

    const el = j?.rows?.[0]?.elements?.[0]
    if (!r.ok || !el || el.status !== 'OK' || !el.distance) {
      return res.status(400).json({ error: 'Distance lookup failed' })
    }

    const text: string = el.distance.text ?? ''
    const m = text.match(/([0-9.]+)\s*mi/i)
    if (m) return res.status(200).json({ miles: Number(m[1]) })

    const meters = Number(el.distance.value ?? 0)
    const miles = meters / 1609.344
    return res.status(200).json({ miles })
  } catch {
    return res.status(502).json({ error: 'Distance lookup failed' })
  }
}
