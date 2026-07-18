export const MAX_EVENTS_PER_FEED_SYNC = 1000
export const MAX_AUTO_MILEAGE_LOOKUPS_PER_SYNC = 25
export const SYNC_LOOKBACK_DAYS = 400
export const SYNC_LOOKAHEAD_DAYS = 730
export const SYNC_DATABASE_BATCH_SIZE = 100

type MileageCandidate = {
  location_address?: unknown
  distance_miles?: unknown
  roundtrip_miles?: unknown
  mileage_origin?: unknown
}

export function assertSyncEventCount(eventCount: number): void {
  if (eventCount > MAX_EVENTS_PER_FEED_SYNC) {
    throw new Error(
      `This calendar contains more than ${MAX_EVENTS_PER_FEED_SYNC} events. Narrow the source calendar or set an import start date before syncing.`
    )
  }
}

export function isWithinSyncWindow(value: Date, reference = new Date()): boolean {
  const time = value.getTime()
  if (!Number.isFinite(time)) return false
  const earliest = reference.getTime() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  const latest = reference.getTime() + SYNC_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000
  return time >= earliest && time <= latest
}

export function chunkSyncValues<T>(values: T[], batchSize = SYNC_DATABASE_BATCH_SIZE): T[][] {
  const safeBatchSize = Math.max(1, Math.floor(batchSize))
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += safeBatchSize) {
    chunks.push(values.slice(index, index + safeBatchSize))
  }
  return chunks
}

export function mileageLookupCandidates<T extends MileageCandidate>(rows: T[]): T[] {
  return rows.filter((row) => {
    const destination = String(row.location_address || '').trim()
    const alreadyHasMileage = row.distance_miles != null || row.roundtrip_miles != null
    return Boolean(destination) && !alreadyHasMileage && row.mileage_origin !== 'other'
  })
}
