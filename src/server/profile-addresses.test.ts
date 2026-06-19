import { describe, expect, it } from 'vitest'
import { extractValidatedProfileAddress } from './profile-addresses.js'

describe('extractValidatedProfileAddress', () => {
  it('accepts a precise street address with place metadata', () => {
    const result = extractValidatedProfileAddress([
      {
        formatted_address: '399 S Columbia Ave, Columbus, OH 43209, USA',
        place_id: 'place-123',
        address_components: [
          { long_name: '399', types: ['street_number'] },
          { long_name: 'South Columbia Avenue', types: ['route'] },
        ],
        geometry: {
          location: { lat: 39.95, lng: -82.95 },
        },
      },
    ])

    expect(result).toEqual({
      formattedAddress: '399 S Columbia Ave, Columbus, OH 43209, USA',
      placeId: 'place-123',
      latitude: 39.95,
      longitude: -82.95,
    })
  })

  it('rejects broad or fuzzy matches', () => {
    expect(extractValidatedProfileAddress([
      {
        formatted_address: 'Columbus, OH, USA',
        place_id: 'city-123',
        address_components: [
          { long_name: 'Columbus', types: ['locality'] },
        ],
        geometry: {
          location: { lat: 39.96, lng: -82.99 },
        },
      },
    ])).toBeNull()

    expect(extractValidatedProfileAddress([
      {
        formatted_address: '399 Columbia Ave, Columbus, OH, USA',
        place_id: 'partial-123',
        partial_match: true,
        address_components: [
          { long_name: '399', types: ['street_number'] },
          { long_name: 'Columbia Avenue', types: ['route'] },
        ],
        geometry: {
          location: { lat: 39.95, lng: -82.95 },
        },
      },
    ])).toBeNull()
  })
})
