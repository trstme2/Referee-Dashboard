import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

type CallbackState =
  | { status: 'checking'; title: string; detail: string }
  | { status: 'success'; title: string; detail: string; destination: string }
  | { status: 'error'; title: string; detail: string; email?: string }

function friendlyAuthError(raw: string | null) {
  const message = String(raw || '').toLowerCase()
  if (message.includes('expired')) {
    return {
      title: 'This sign-in link expired',
      detail: 'Magic links are time-limited for your security. Ask Whistle Keeper to send a fresh link and use the newest email.',
    }
  }
  if (message.includes('invalid') || message.includes('otp') || message.includes('token')) {
    return {
      title: 'This sign-in link could not be used',
      detail: 'The link may be invalid, already used, or opened in a different browser. Request a new Whistle Keeper sign-in email.',
    }
  }
  return {
    title: 'We could not complete sign-in',
    detail: 'Request a fresh Whistle Keeper sign-in email and try again. If the problem continues, check that the full email link opened in this browser.',
  }
}

async function destinationForUser(userId: string) {
  if (!supabase) return '/'
  const { data, error } = await supabase
    .from('user_settings')
    .select('onboarding_completed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return '/onboarding'
  return data?.onboarding_completed_at ? '/' : '/onboarding'
}

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const ran = useRef(false)
  const [state, setState] = useState<CallbackState>({
    status: 'checking',
    title: 'Signing you in',
    detail: 'Whistle Keeper is verifying your secure email link.',
  })

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function completeSignIn() {
      if (!supabaseConfigured || !supabase) {
        setState({
          status: 'error',
          title: 'Cloud sign-in is not configured',
          detail: 'Whistle Keeper cannot complete sign-in in this environment.',
        })
        return
      }

      const query = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const rawError = query.get('error_description') || query.get('error') || hash.get('error_description') || hash.get('error')
      const email = query.get('email') || hash.get('email') || undefined
      if (rawError) {
        setState({ status: 'error', ...friendlyAuthError(rawError), email })
        return
      }

      try {
        const code = query.get('code')
        let session = null
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          session = data.session
        } else {
          const { data, error } = await supabase.auth.getSession()
          if (error) throw error
          session = data.session
        }

        if (!session?.user?.id) {
          throw new Error('No active sign-in session was found.')
        }

        const destination = await destinationForUser(session.user.id)
        setState({
          status: 'success',
          title: 'You are signed in',
          detail: destination === '/onboarding'
            ? 'We will take you to setup so you can finish your Whistle Keeper foundation.'
            : 'We will take you to your Whistle Keeper dashboard.',
          destination,
        })
        window.setTimeout(() => navigate(destination, { replace: true }), 900)
      } catch (e: any) {
        setState({ status: 'error', ...friendlyAuthError(String(e?.message ?? e)), email })
      }
    }

    void completeSignIn()
  }, [navigate])

  return (
    <div className="auth-shell">
      <section className={`card auth-card auth-callback-card ${state.status}`}>
        <span className={`pill ${state.status === 'success' ? 'ok' : state.status === 'error' ? 'bad' : 'info'}`}>
          {state.status === 'checking' ? 'Secure link' : state.status === 'success' ? 'Signed in' : 'Link issue'}
        </span>
        <h2>{state.title}</h2>
        <p>{state.detail}</p>
        {state.status === 'checking' ? <div className="auth-spinner" aria-label="Checking sign-in link" /> : null}
        {state.status === 'success' ? (
          <p className="small">Redirecting to {state.destination === '/onboarding' ? 'setup' : 'your dashboard'}...</p>
        ) : null}
        {state.status === 'error' ? (
          <div className="btnbar">
            <Link className="btn primary" to={`/auth${state.email ? `?email=${encodeURIComponent(state.email)}` : ''}`}>
              Send a new link
            </Link>
            <Link className="btn" to="/auth">Use a different email</Link>
          </div>
        ) : null}
      </section>
    </div>
  )
}

