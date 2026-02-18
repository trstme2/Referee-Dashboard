import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.query.origin ?? '').trim()
  const destination = String(req.query.destination ?? '').trim()
  if (!origin || !destination) return res.status(400).send('origin and destination are required')

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return res.status(500).send('Missing GOOGLE_MAPS_API_KEY')

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', origin)
  url.searchParams.set('destinations', destination)
  url.searchParams.set('key', key)
  url.searchParams.set('units', 'imperial')

  const r = await fetch(url.toString())
  const j = await r.json()

  const el = j?.rows?.[0]?.elements?.[0]
  if (!el || el.status !== 'OK' || !el.distance) {
    return res.status(400).json({ error: 'Distance lookup failed', raw: j })
  }

  const text: string = el.distance.text ?? ''
  const m = text.match(/([0-9.]+)\s*mi/i)
  if (m) return res.status(200).json({ miles: Number(m[1]) })

  const meters = Number(el.distance.value ?? 0)
  const miles = meters / 1609.344
  return res.status(200).json({ miles })
}
