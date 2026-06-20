import { useEffect, useState } from 'react'
import { useData } from '../lib/DataContext'

type AdminMetrics = {
  generatedAt: string
  users: {
    total: number
    active1d: number
    active7d: number
    active30d: number
    new30d: number
    admins: number
    byRole: Record<string, number>
    byTier: Record<string, number>
    bySubscriptionStatus: Record<string, number>
  }
  feeds: {
    total: number
    enabled: number
    usersWithFeeds: number
    usersWithRecentlySyncedFeeds: number
  }
  sync: {
    runs7d: number
    successRate7d: number
    failed7d: number
    partial7d: number
    averageDurationMs7d: number
    averageAttempts7d: number
    byStatus7d: Record<string, number>
  }
  syncJobs: {
    unavailable: boolean
    total: number
    due: number
    byStatus: Record<string, number>
  }
  activation: {
    usersWithFeeds: number
    usersWithGames: number
    usersWithExpenses: number
    usersWithRequirements: number
    usersWithAnyCoreData: number
    coreActivationRate: number
  }
  events: {
    total30d: number
    usersWithEvents30d: number
    pageViews7d: number
    clientErrors7d: number
    apiErrors7d: number
    workflowEvents30d: number
    taxExports30d: number
    accountExports30d: number
    byType30d: Record<string, number>
    bySource30d: Record<string, number>
  }
}

type BetaAccessRequest = {
  id: string
  fullName: string
  email: string
  region: string
  sports: string[]
  platforms: string[]
  devicePreference: string
  notes: string
  status: 'new' | 'waitlisted' | 'invited' | 'rejected'
  adminNotes: string
  reviewedAt: string | null
  invitedAt: string | null
  createdAt: string
  updatedAt: string
}

function MiniBarList({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, value]) => value))
  if (!entries.length) return <p className="small">No metrics available yet.</p>
  return (
    <div className="admin-bar-list">
      {entries.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <div><i style={{ width: `${Math.max(8, Math.round((value / max) * 100))}%` }} /></div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function HealthRow({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="admin-health-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

export default function AdminPage() {
  const { mode, session } = useData()
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [betaRequests, setBetaRequests] = useState<BetaAccessRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [betaErr, setBetaErr] = useState<string | null>(null)

  async function authedJson(path: string, options: RequestInit = {}) {
    if (mode !== 'supabase' || !session?.access_token) return
    const res = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(json?.error || res.statusText))
    return json
  }

  async function loadMetrics() {
    if (mode !== 'supabase' || !session?.access_token) return
    setLoading(true)
    setErr(null)
    setBetaErr(null)
    try {
      const json = await authedJson('/api/platform?action=metrics')
      setMetrics(json.metrics as AdminMetrics)
    } catch (e: any) {
      setMetrics(null)
      setErr(String(e?.message ?? e))
    }

    try {
      const json = await authedJson('/api/platform?action=beta-requests')
      setBetaRequests((json.requests ?? []) as BetaAccessRequest[])
    } catch (e: any) {
      setBetaRequests([])
      setBetaErr(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  async function reviewBetaRequest(requestId: string, decision: 'invite' | 'waitlist' | 'reject') {
    setReviewingId(requestId)
    setBetaErr(null)
    try {
      const json = await authedJson('/api/platform?action=beta-request-review', {
        method: 'POST',
        body: JSON.stringify({ requestId, decision }),
      })
      const updated = json.request as BetaAccessRequest
      setBetaRequests((requests) => requests.map((request) => request.id === updated.id ? updated : request))
    } catch (e: any) {
      setBetaErr(String(e?.message ?? e))
    } finally {
      setReviewingId(null)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMetrics()
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session?.access_token])

  if (mode !== 'supabase' || !session) {
    return (
      <div className="grid">
        <section className="card">
          <h2>Admin</h2>
          <p className="small">Sign in with an admin account to view platform health.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="grid admin-page">
      <section className="card admin-hero-card">
        <div className="page-section-head">
          <div>
            <h2>Admin</h2>
            <p className="sub">Server-authorized platform health and adoption signals. Aggregates only; no referee schedule details.</p>
          </div>
          <button className="btn primary" onClick={loadMetrics} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
        {err ? <p className="small"><span className="pill bad">{err}</span></p> : null}
        {metrics ? <p className="small">Generated {new Date(metrics.generatedAt).toLocaleString()}</p> : null}
      </section>

      <section className="card admin-beta-card">
        <div className="page-section-head">
          <div>
            <h2>Beta Access Requests</h2>
            <p className="sub">Review curated beta applicants and send Whistle Keeper invitation emails.</p>
          </div>
          <span className="pill info">{betaRequests.length} requests</span>
        </div>
        {betaErr ? <p className="small"><span className="pill bad">{betaErr}</span></p> : null}
        {betaRequests.length ? (
          <div className="admin-beta-list">
            {betaRequests.map((request) => (
              <article className="admin-beta-request" key={request.id}>
                <div className="admin-beta-request-head">
                  <div>
                    <strong>{request.fullName}</strong>
                    <span>{request.email}</span>
                  </div>
                  <span className={`pill ${request.status === 'invited' ? 'ok' : request.status === 'rejected' ? 'bad' : request.status === 'waitlisted' ? 'warn' : 'info'}`}>
                    {request.status}
                  </span>
                </div>
                <div className="admin-beta-meta">
                  <span>{request.region}</span>
                  <span>{request.devicePreference}</span>
                  <span>{new Date(request.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="admin-beta-tags">
                  {[...request.sports, ...request.platforms].map((tag) => <span className="pill muted" key={tag}>{tag}</span>)}
                </div>
                {request.notes ? <p className="small">{request.notes}</p> : null}
                <div className="btnbar">
                  <button className="btn primary" onClick={() => void reviewBetaRequest(request.id, 'invite')} disabled={Boolean(reviewingId)}>
                    {reviewingId === request.id ? 'Updating...' : 'Invite'}
                  </button>
                  <button className="btn" onClick={() => void reviewBetaRequest(request.id, 'waitlist')} disabled={Boolean(reviewingId)}>Waitlist</button>
                  <button className="btn danger" onClick={() => void reviewBetaRequest(request.id, 'reject')} disabled={Boolean(reviewingId)}>Reject</button>
                </div>
                {request.invitedAt ? <p className="small">Invited {new Date(request.invitedAt).toLocaleString()}</p> : null}
              </article>
            ))}
          </div>
        ) : !betaErr ? (
          <p className="small">No beta requests yet.</p>
        ) : null}
      </section>

      {metrics ? (
        <>
          <section className="admin-kpi-grid">
            <div className="card admin-kpi-card">
              <span>Total users</span>
              <strong>{metrics.users.total}</strong>
              <p>{metrics.users.new30d} new in 30 days</p>
            </div>
            <div className="card admin-kpi-card">
              <span>Active users</span>
              <strong>{metrics.users.active7d}</strong>
              <p>{metrics.users.active30d} active in 30 days</p>
            </div>
            <div className="card admin-kpi-card">
              <span>Activation</span>
              <strong>{metrics.activation.coreActivationRate}%</strong>
              <p>{metrics.activation.usersWithAnyCoreData} users with core data</p>
            </div>
            <div className="card admin-kpi-card">
              <span>Sync success</span>
              <strong>{metrics.sync.successRate7d}%</strong>
              <p>{metrics.sync.runs7d} runs in 7 days</p>
            </div>
          </section>

          <section className="grid cols2">
            <div className="card">
              <h2>Activation</h2>
              <div className="admin-health-list">
                <HealthRow label="Users with feeds" value={metrics.activation.usersWithFeeds} />
                <HealthRow label="Users with games" value={metrics.activation.usersWithGames} />
                <HealthRow label="Users with expenses" value={metrics.activation.usersWithExpenses} />
                <HealthRow label="Users with requirements" value={metrics.activation.usersWithRequirements} />
              </div>
            </div>
            <div className="card">
              <h2>Reliability</h2>
              <div className="admin-health-list">
                <HealthRow label="Sync success rate" value={`${metrics.sync.successRate7d}%`} detail="Last 7 days" />
                <HealthRow label="Failed sync runs" value={metrics.sync.failed7d} />
                <HealthRow label="Partial sync runs" value={metrics.sync.partial7d} />
                <HealthRow label="Average sync duration" value={`${metrics.sync.averageDurationMs7d} ms`} />
                <HealthRow label="Average attempts" value={metrics.sync.averageAttempts7d} />
              </div>
            </div>
            <div className="card">
              <h2>Sync Jobs</h2>
              {metrics.syncJobs.unavailable ? (
                <p className="small">Sync job history is not available in this environment yet.</p>
              ) : (
                <>
                  <div className="admin-health-list">
                    <HealthRow label="Total queued history" value={metrics.syncJobs.total} />
                    <HealthRow label="Due now" value={metrics.syncJobs.due} />
                  </div>
                  <MiniBarList values={metrics.syncJobs.byStatus} />
                </>
              )}
            </div>
            <div className="card">
              <h2>Error Signals</h2>
              <div className="admin-health-list">
                <HealthRow label="Client errors" value={metrics.events.clientErrors7d} detail="Last 7 days" />
                <HealthRow label="API errors" value={metrics.events.apiErrors7d} detail="Last 7 days" />
                <HealthRow label="Page views" value={metrics.events.pageViews7d} detail="Last 7 days" />
                <HealthRow label="Workflow events" value={metrics.events.workflowEvents30d} detail="Last 30 days" />
              </div>
            </div>
            <div className="card">
              <h2>Users By Tier</h2>
              <MiniBarList values={metrics.users.byTier} />
            </div>
            <div className="card">
              <h2>Subscription Status</h2>
              <MiniBarList values={metrics.users.bySubscriptionStatus} />
            </div>
            <div className="card">
              <h2>Sync Run Status</h2>
              <MiniBarList values={metrics.sync.byStatus7d} />
            </div>
            <div className="card">
              <h2>Product Events</h2>
              <MiniBarList values={metrics.events.byType30d} />
            </div>
          </section>
        </>
      ) : !err ? (
        <section className="card">
          <p className="small">Loading admin metrics...</p>
        </section>
      ) : null}
    </div>
  )
}
