const DISTANCE_TIMEOUT_MS = 5_000

type LookupDrivingDistanceOptions = {
  origin: string
  destination: string
  apiKey: string
  originPlaceId?: string | null
  timeoutMs?: number
}

export async function lookupDrivingDistanceMiles({
  origin,
  destination,
  apiKey,
  originPlaceId,
  timeoutMs = DISTANCE_TIMEOUT_MS,
}: LookupDrivingDistanceOptions): Promise<number> {
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', originPlaceId ? `place_id:${originPlaceId}` : origin)
  url.searchParams.set('destinations', destination)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('units', 'imperial')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const response = await fetch(url.toString(), { signal: controller.signal }).finally(() => clearTimeout(timeout))
  const payload = await response.json()

  const element = payload?.rows?.[0]?.elements?.[0]
  if (!response.ok || !element || element.status !== 'OK' || !element.distance) {
    throw new Error('Distance lookup failed')
  }

  const distanceText = String(element.distance.text ?? '')
  const milesMatch = distanceText.match(/([0-9.]+)\s*mi/i)
  if (milesMatch) return Number(milesMatch[1])

  const meters = Number(element.distance.value ?? 0)
  if (!Number.isFinite(meters) || meters <= 0) throw new Error('Distance lookup failed')
  return meters / 1609.344
}
