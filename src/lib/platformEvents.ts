export type PlatformEventType =
  | 'account_exported'
  | 'api_error'
  | 'app_data_reset'
  | 'calendar_export_downloaded'
  | 'calendar_feed_add_cancelled'
  | 'calendar_feed_add_started'
  | 'calendar_feed_added'
  | 'calendar_feed_token_regenerated'
  | 'client_error'
  | 'expense_created'
  | 'assigning_platform_help_clicked'
  | 'assigning_platform_selected'
  | 'feed_created'
  | 'feed_deleted'
  | 'game_created'
  | 'onboarding_completed'
  | 'platform_other_entered'
  | 'page_view'
  | 'readiness_group_created'
  | 'calendar_feed_url_pasted'
  | 'calendar_feed_validation_failed'
  | 'sync_completed'
  | 'sync_failed'
  | 'tax_export_downloaded'
  | 'weekly_email_disabled'
  | 'weekly_email_enabled'

export type PlatformEventMetadata = Record<string, string | number | boolean | null>

export async function recordPlatformEvent(
  accessToken: string | undefined,
  eventType: PlatformEventType,
  metadata?: PlatformEventMetadata
) {
  if (!accessToken) return
  try {
    await fetch('/api/platform?action=event', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventType, metadata: metadata ?? {} }),
    })
  } catch {
    // Metrics should never block the user's workflow.
  }
}

export function safeRoutePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname
    .split('/')
    .filter(Boolean)
    .map((part) => (/^[0-9a-f-]{12,}$/i.test(part) ? ':id' : part))
    .join('/')
    .replace(/^/, '/')
}

export function errorMetadata(
  error: unknown,
  context: PlatformEventMetadata = {}
): PlatformEventMetadata {
  const err = error instanceof Error ? error : null
  const message = err?.message || String(error || 'Unknown error')
  return {
    ...context,
    errorName: err?.name || 'Error',
    message: message.slice(0, 120),
  }
}
