import type { Settings } from './types'

type ValidatedAddressResponse = {
  address: {
    formattedAddress: string
    placeId: string
    latitude: number
    longitude: number
  }
}

async function validateSingleProfileAddress(accessToken: string | undefined, address: string) {
  if (!accessToken) throw new Error('Sign in to verify your mileage origin.')
  const response = await fetch('/api/address-validate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(payload?.error || response.statusText))
  const result = payload as ValidatedAddressResponse
  return result.address
}

export async function resolveVerifiedProfileAddresses(
  accessToken: string | undefined,
  addresses: { homeAddress: string; otherWorkAddress?: string }
): Promise<Pick<Settings,
  'homeAddress' |
  'homeAddressPlaceId' |
  'homeAddressLatitude' |
  'homeAddressLongitude' |
  'otherWorkAddress' |
  'otherWorkAddressPlaceId' |
  'otherWorkAddressLatitude' |
  'otherWorkAddressLongitude'
>> {
  const homeAddress = addresses.homeAddress.trim()
  if (!homeAddress) throw new Error('Enter your primary mileage origin.')

  const verifiedHome = await validateSingleProfileAddress(accessToken, homeAddress)
  const otherWorkAddress = String(addresses.otherWorkAddress ?? '').trim()
  const verifiedOther = otherWorkAddress
    ? await validateSingleProfileAddress(accessToken, otherWorkAddress)
    : null

  return {
    homeAddress: verifiedHome.formattedAddress,
    homeAddressPlaceId: verifiedHome.placeId,
    homeAddressLatitude: verifiedHome.latitude,
    homeAddressLongitude: verifiedHome.longitude,
    otherWorkAddress: verifiedOther?.formattedAddress ?? '',
    otherWorkAddressPlaceId: verifiedOther?.placeId,
    otherWorkAddressLatitude: verifiedOther?.latitude,
    otherWorkAddressLongitude: verifiedOther?.longitude,
  }
}
