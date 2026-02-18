import { useMemo } from 'react'
import { useData } from '../lib/DataContext'
import { formatMoney, isWithinNextDays } from '../lib/utils'

export default function HomePage() {
  const { db, mode, loading, session } = useData()

  const kpis = useMemo(() => {
    const upcoming = db.games
      .filter(g => g.status === 'Scheduled')
      .filter(g => isWithinNextDays(g.gameDate, 21))
      .length

    const y = new Date().getFullYear()
    const miles = db.expenses
      .filter(e => e.category === 'Mileage')
      .filter(e => e.expenseDate.startsWith(String(y)))
      .reduce((s, e) => s + (e.miles ?? 0), 0)

    const total = db.expenses
      .filter(e => e.expenseDate.startsWith(String(y)))
      .reduce((s, e) => s + e.amount, 0)

    const due = db.requirementInstances
      .filter(i => i.status !== 'Complete' && i.status !== 'Waived')
      .length

    return { upcoming, miles, total, due }
  }, [db])

  return (
    <div className="grid">
      <section className="card">
        <h2>Status</h2>
        <p className="sub">
          Mode: <span className="pill">{mode}</span>
          {mode === 'supabase' && session?.user?.email ? (
            <> <span className="pill ok">{session.user.email}</span></>
          ) : null}
          {loading ? <> <span className="pill warn">syncing</span></> : null}
        </p>

        <div className="kpi">
          <div className="box">
            <div className="label">Upcoming games (21 days)</div>
            <div className="value">{kpis.upcoming}</div>
          </div>
          <div className="box">
            <div className="label">Mileage logged (this year)</div>
            <div className="value">{kpis.miles.toFixed(1)} mi</div>
          </div>
          <div className="box">
            <div className="label">Expenses (this year)</div>
            <div className="value">{formatMoney(kpis.total)}</div>
          </div>
          <div className="box">
            <div className="label">Open requirements</div>
            <div className="value">{kpis.due}</div>
          </div>
        </div>

        <div className="footer-note">
          In Supabase mode, edits sync by replacing your cloud snapshot (MVP approach). Next upgrade is real upserts.
        </div>
      </section>
    </div>
  )
}
