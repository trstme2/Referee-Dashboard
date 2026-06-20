const RESEND_URL = 'https://api.resend.com/emails'

export function supportEmail(): string {
  return process.env.SUPPORT_EMAIL || 'support@whistlekeeper.com'
}

export function appUrl(): string | undefined {
  const raw = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (!raw) return undefined
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendTransactionalEmail(input: {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
  replyTo?: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('Missing RESEND_API_KEY')

  const from = process.env.EMAIL_FROM || process.env.WEEKLY_EMAIL_FROM || 'Whistle Keeper <onboarding@resend.dev>'
  const replyTo = input.replyTo || process.env.EMAIL_REPLY_TO || process.env.WEEKLY_EMAIL_REPLY_TO || supportEmail()
  const body = {
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  }

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Resend ${response.status}: ${text}`)
  }
}
