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

function MiniBarList({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, value]) => value))
  if (!entries.length) return <p className="small">No data yet.</p>
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
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadMetrics() {
    if (mode !== 'supabase' || !session?.access_token) return
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/platform?action=metrics', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || res.statusText))
      setMetrics(json.metrics as AdminMetrics)
    } catch (e: any) {
      setMetrics(null)
      setErr(String(e?.message ?? e))
    } finally {
      setLoading(false)
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
                <p className="small">Sync job table is not installed in this environment yet.</p>
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
