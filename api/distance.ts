import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders } from '../src/server/auth-utils.js'
import { lookupDrivingDistanceMiles } from '../src/server/distance-service.js'

const MAX_ADDRESS_LENGTH = 300
const MAX_PLACE_ID_LENGTH = 200

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
    const miles = await lookupDrivingDistanceMiles({
      origin,
      destination,
      apiKey: key,
      originPlaceId,
    })
    return res.status(200).json({ miles })
  } catch {
    return res.status(502).json({ error: 'Distance lookup failed' })
  }
}
