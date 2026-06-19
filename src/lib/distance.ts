import { supabase } from './supabaseClient'

export async function getDrivingDistanceMiles(origin: string, destination: string, options?: { originPlaceId?: string }): Promise<number> {
  const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sign in to calculate driving distance.')

  const u = new URL('/api/distance', window.location.origin)
  u.searchParams.set('origin', origin)
  u.searchParams.set('destination', destination)
  if (options?.originPlaceId) u.searchParams.set('originPlaceId', options.originPlaceId)
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Distance API error: ${res.status}`)
  }
  const payload = await res.json()
  if (!payload?.miles || typeof payload.miles !== 'number') throw new Error('Bad distance response')
  return payload.miles
}
