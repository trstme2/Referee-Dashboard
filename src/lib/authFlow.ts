import { supabase } from './supabaseClient'

export type AuthDelivery = 'otp' | 'magic-link'

export function normalizeOtpToken(value: string): string {
  return value.replace(/[^0-9a-z]/gi, '').trim()
}

export function friendlyAuthError(raw: string | null, delivery: AuthDelivery = 'magic-link') {
  const message = String(raw || '').toLowerCase()

  if (message.includes('expired')) {
    return delivery === 'otp'
      ? {
          title: 'This code expired',
          detail: 'Email sign-in codes are time-limited for your security. Ask Whistle Keeper to send a fresh code and use the newest email.',
        }
      : {
          title: 'This sign-in link expired',
          detail: 'Magic links are time-limited for your security. Ask Whistle Keeper to send a fresh link and use the newest email.',
        }
  }

  if (message.includes('invalid') || message.includes('otp') || message.includes('token')) {
    return delivery === 'otp'
      ? {
          title: 'This code could not be used',
          detail: 'The code may be incorrect, expired, or already used. Request a fresh Whistle Keeper email and enter the newest code.',
        }
      : {
          title: 'This sign-in link could not be used',
          detail: 'The link may be invalid, already used, or opened in a different browser. Request a new Whistle Keeper sign-in email.',
        }
  }

  return delivery === 'otp'
    ? {
        title: 'We could not verify that code',
        detail: 'Request a fresh Whistle Keeper email and try the newest code again.',
      }
    : {
        title: 'We could not complete sign-in',
        detail: 'Request a fresh Whistle Keeper sign-in email and try again. If the problem continues, check that the full email link opened in this browser.',
      }
}

export async function destinationForUser(userId: string) {
  if (!supabase) return '/'
  const { data, error } = await supabase
    .from('user_settings')
    .select('onboarding_completed_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return '/onboarding'
  return data?.onboarding_completed_at ? '/' : '/onboarding'
}
