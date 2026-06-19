type LogMetadata = Record<string, string | number | boolean | null | undefined>

function requestIdFrom(req: { headers?: Record<string, string | string[] | undefined> }) {
  const value = req.headers?.['x-vercel-id'] ?? req.headers?.['x-request-id']
  return Array.isArray(value) ? value[0] : value
}

function sanitize(metadata: LogMetadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .slice(0, 16)
  )
}

export function logApiStart(route: string, req: { method?: string; headers?: Record<string, string | string[] | undefined> }, metadata: LogMetadata = {}) {
  console.log(JSON.stringify({
    level: 'info',
    msg: 'api_start',
    route,
    method: req.method,
    requestId: requestIdFrom(req),
    ...sanitize(metadata),
  }))
}

export function logApiDone(route: string, startedAtMs: number, metadata: LogMetadata = {}) {
  console.log(JSON.stringify({
    level: 'info',
    msg: 'api_done',
    route,
    ms: Date.now() - startedAtMs,
    ...sanitize(metadata),
  }))
}

export function logApiError(route: string, startedAtMs: number, error: unknown, metadata: LogMetadata = {}) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error')
  console.error(JSON.stringify({
    level: 'error',
    msg: 'api_failed',
    route,
    ms: Date.now() - startedAtMs,
    error: message.slice(0, 180),
    ...sanitize(metadata),
  }))
}
