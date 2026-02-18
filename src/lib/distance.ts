export async function getDrivingDistanceMiles(origin: string, destination: string): Promise<number> {
  const u = new URL('/api/distance', window.location.origin)
  u.searchParams.set('origin', origin)
  u.searchParams.set('destination', destination)
  const res = await fetch(u.toString())
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Distance API error: ${res.status}`)
  }
  const data = await res.json()
  if (!data?.miles || typeof data.miles !== 'number') throw new Error('Bad distance response')
  return data.miles
}
