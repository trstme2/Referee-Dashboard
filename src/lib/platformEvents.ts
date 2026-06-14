export async function recordPlatformEvent(
  accessToken: string | undefined,
  eventType: string,
  metadata?: Record<string, string | number | boolean | null>
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
