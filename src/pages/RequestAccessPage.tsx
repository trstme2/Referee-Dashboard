import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  betaAccessDevices,
  betaAccessPlatforms,
  betaAccessSports,
  BetaAccessRequestInput,
  validateBetaAccessRequest,
} from '../lib/betaAccess'
import logo from '../assets/logo.png'

const initialForm: BetaAccessRequestInput = {
  fullName: '',
  email: '',
  region: '',
  sports: [],
  platforms: [],
  devicePreference: '',
  notes: '',
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function CheckboxGroup({
  legend,
  values,
  selected,
  onChange,
}: {
  legend: string
  values: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <fieldset className="beta-checkbox-group">
      <legend>{legend}</legend>
      <div>
        {values.map((value) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onChange(toggleValue(selected, value))}
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function RequestAccessPage() {
  const [form, setForm] = useState<BetaAccessRequestInput>(initialForm)
  const [otherPlatform, setOtherPlatform] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  async function submitRequest() {
    setErrors([])
    const platforms = otherPlatform.trim()
      ? [...form.platforms.filter((platform) => platform !== 'Other'), `Other: ${otherPlatform.trim()}`]
      : form.platforms
    const validation = validateBetaAccessRequest({ ...form, platforms })
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/platform?action=beta-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: validation.value }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json?.error || response.statusText))
      setSubmitted(true)
    } catch (error: any) {
      setErrors([String(error?.message || error || 'Whistle Keeper could not submit the request.')])
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <main className="landing-page beta-access-page">
        <header className="landing-nav">
          <Link to="/" className="landing-brand" aria-label="Whistle Keeper home">
            <img src={logo} alt="Whistle Keeper logo" />
            <span>Whistle Keeper</span>
          </Link>
          <nav className="landing-links" aria-label="Beta request">
            <Link to="/auth" className="landing-login">Sign in</Link>
          </nav>
        </header>
        <section className="card beta-access-card beta-access-success">
          <span className="pill ok">Request received</span>
          <h1>Thanks for raising your hand.</h1>
          <p>
            Your beta request is in the queue. If it is a fit for this test round,
            Whistle Keeper will send access to <strong>{form.email}</strong>.
          </p>
          <div className="btnbar">
            <Link to="/" className="btn primary">Back to overview</Link>
            <Link to="/auth" className="btn">Already invited? Sign in</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="landing-page beta-access-page">
      <header className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="Whistle Keeper home">
          <img src={logo} alt="Whistle Keeper logo" />
          <span>Whistle Keeper</span>
        </Link>
        <nav className="landing-links" aria-label="Beta request">
          <Link to="/auth" className="landing-login">Sign in</Link>
        </nav>
      </header>

      <section className="landing-hero beta-access-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">Private beta</div>
          <h1>Request access to Whistle Keeper.</h1>
          <p>
            We are inviting a small group of officials to test assignment sync,
            mileage, requirements, expenses, and tax-season recordkeeping before
            wider release.
          </p>
          <div className="landing-proof-row">
            <span>Curated beta</span>
            <span>No public self-serve signup yet</span>
            <span>Built for solo officials</span>
          </div>
        </div>

        <section className="card beta-access-card" aria-label="Request beta access">
          <div className="page-section-head">
            <div>
              <h2>Tell us where you officiate</h2>
              <p className="sub">This helps us choose testers across sports, regions, devices, and assigning platforms.</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Name</label>
              <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Your name" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>State / region</label>
              <input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} placeholder="Ohio, Central Florida, etc." />
            </div>
            <div className="field">
              <label>Primary device</label>
              <select value={form.devicePreference} onChange={(event) => setForm({ ...form, devicePreference: event.target.value })}>
                <option value="">Choose one</option>
                {betaAccessDevices.map((device) => <option key={device} value={device}>{device}</option>)}
              </select>
            </div>
          </div>

          <CheckboxGroup
            legend="Sports"
            values={betaAccessSports}
            selected={form.sports}
            onChange={(sports) => setForm({ ...form, sports })}
          />

          <CheckboxGroup
            legend="Assigning platforms / sources"
            values={betaAccessPlatforms}
            selected={form.platforms}
            onChange={(platforms) => setForm({ ...form, platforms })}
          />

          {form.platforms.includes('Other') ? (
            <div className="field">
              <label>Other platform or source</label>
              <input value={otherPlatform} onChange={(event) => setOtherPlatform(event.target.value)} placeholder="Local association calendar, league site, etc." />
            </div>
          ) : null}

          <div className="field">
            <label>Anything we should know?</label>
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Examples: I work multiple sports, I mainly use DragonFly, I want help with mileage, I am testing on iPad..."
            />
          </div>

          {errors.length ? (
            <div className="beta-error-list">
              {errors.map((error) => <span className="pill bad" key={error}>{error}</span>)}
            </div>
          ) : null}

          <div className="btnbar">
            <button className="btn primary" onClick={() => void submitRequest()} disabled={busy}>
              {busy ? 'Submitting...' : 'Request beta access'}
            </button>
            <Link to="/" className="btn">Back</Link>
          </div>
        </section>
      </section>
    </main>
  )
}
