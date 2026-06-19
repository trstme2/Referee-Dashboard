export type ValidatedProfileAddress = {
  formattedAddress: string
  placeId: string
  latitude: number
  longitude: number
}

type GeocodeResult = {
  formatted_address?: string
  place_id?: string
  partial_match?: boolean
  address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>
  geometry?: {
    location?: {
      lat?: number
      lng?: number
    }
    location_type?: string
  }
}

function hasComponent(result: GeocodeResult, type: string) {
  return (result.address_components ?? []).some((component) => (component.types ?? []).includes(type))
}

function isPreciseStreetAddress(result: GeocodeResult) {
  if (result.partial_match) return false
  if (!result.formatted_address || !result.place_id) return false
  const location = result.geometry?.location
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return false
  const hasStreetNumber = hasComponent(result, 'street_number')
  const hasRoute = hasComponent(result, 'route')
  return hasStreetNumber && hasRoute
}

export function extractValidatedProfileAddress(results: GeocodeResult[]): ValidatedProfileAddress | null {
  const exact = results.find(isPreciseStreetAddress)
  if (!exact) return null
  return {
    formattedAddress: String(exact.formatted_address),
    placeId: String(exact.place_id),
    latitude: Number(exact.geometry?.location?.lat),
    longitude: Number(exact.geometry?.location?.lng),
  }
}
