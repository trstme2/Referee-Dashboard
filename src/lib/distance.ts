import { supabase } from './supabaseClient'

export async function getDrivingDistanceMiles(origin: string, destination: string, options?: { originPlaceId?: string }): Promise<number> {
  const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sign in to calculate driving distance.')

  const res = await fetch('/api/distance', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      origin,
      destination,
      originPlaceId: options?.originPlaceId,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Distance API error: ${res.status}`)
  }
  const payload = await res.json()
  if (!payload?.miles || typeof payload.miles !== 'number') throw new Error('Bad distance response')
  return payload.miles
}
