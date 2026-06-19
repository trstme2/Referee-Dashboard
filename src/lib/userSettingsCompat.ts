export const userSettingsCompatColumns = [
  'home_address_place_id',
  'home_address_latitude',
  'home_address_longitude',
  'other_work_address',
  'other_work_address_place_id',
  'other_work_address_latitude',
  'other_work_address_longitude',
  'default_timezone',
  'tax_mileage_rate_cents',
  'weekly_games_email_enabled',
  'tracked_sports',
  'show_game_platform_chips',
  'onboarding_completed_at',
] as const

export function isMissingColumnError(error: any, table: string, column: string): boolean {
  const message = String(error?.message ?? error ?? '')
  return message.includes(`Could not find the '${column}' column of '${table}'`) ||
    message.includes(`column "${column}" of relation "${table}" does not exist`)
}

export function missingCompatColumn(error: any, table: string, columns: readonly string[]): string | null {
  return columns.find((column) => isMissingColumnError(error, table, column)) ?? null
}

export async function upsertUserSettingsCompat(client: any, payload: any, options?: { ignoreDuplicates?: boolean }) {
  let nextPayload = { ...payload }
  let result: any = null

  for (let attempt = 0; attempt <= userSettingsCompatColumns.length; attempt += 1) {
    result = await client
      .from('user_settings')
      .upsert([nextPayload], { onConflict: 'user_id', ...(options ?? {}) })

    if (!result.error) return result

    const missingColumn = missingCompatColumn(result.error, 'user_settings', userSettingsCompatColumns)
    if (!missingColumn || !(missingColumn in nextPayload)) return result

    const { [missingColumn]: _missing, ...rest } = nextPayload
    nextPayload = rest
  }

  return result
}
