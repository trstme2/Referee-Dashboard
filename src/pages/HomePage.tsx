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
    const expenseMiles = db.expenses
      .filter(e => e.category === 'Mileage')
      .filter(e => e.expenseDate.startsWith(String(y)))
      .reduce((s, e) => s + (e.miles ?? 0), 0)
    const gameMiles = db.games
      .filter(g => g.status === 'Played' || g.status === 'Paid / Complete')
      .filter(g => g.gameDate.startsWith(String(y)))
      .reduce((s, g) => s + (g.roundtripMiles ?? (g.distanceMiles != null ? g.distanceMiles * 2 : 0)), 0)
    const miles = expenseMiles + gameMiles

    const total = db.expenses
      .filter(e => e.expenseDate.startsWith(String(y)))
      .reduce((s, e) => s + e.amount, 0)

    const due = db.requirementInstances
      .filter(i => i.status !== 'Complete' && i.status !== 'Waived')
      .length

    return { upcoming, miles, total, due }
  }, [db])

  const upcomingWeekGames = useMemo(() => {
    return [...db.games]
      .filter(g => g.status === 'Scheduled')
      .filter(g => isWithinNextDays(g.gameDate, 7))
      .sort((a, b) => {
        const ak = `${a.gameDate} ${a.startTime ?? '99:99'}`
        const bk = `${b.gameDate} ${b.startTime ?? '99:99'}`
        return ak < bk ? -1 : ak > bk ? 1 : 0
      })
  }, [db.games])

  const outstandingRequirements = useMemo(() => {
    const defById = new Map(db.requirementDefinitions.map(d => [d.id, d]))
    const today = new Date().toISOString().slice(0, 10)
    return db.requirementInstances
      .filter(i => i.status !== 'Complete' && i.status !== 'Waived')
      .map(i => {
        const def = defById.get(i.definitionId)
        return {
          id: i.id,
          name: def?.name ?? 'Requirement',
          governingBody: def?.governingBody,
          dueDate: i.dueDate,
          status: i.status,
          overdue: Boolean(i.dueDate && i.dueDate < today),
        }
      })
      .sort((a, b) => {
        const ad = a.dueDate ?? '9999-12-31'
        const bd = b.dueDate ?? '9999-12-31'
        return ad < bd ? -1 : ad > bd ? 1 : 0
      })
  }, [db.requirementInstances, db.requirementDefinitions])

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
            <div className="label">Mileage logged (this year, games + expenses)</div>
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
          Dashboard is now optimized for quick weekly planning and requirement tracking.
        </div>
      </section>

      <section className="grid cols2">
        <div className="card">
          <h2>Games Next 7 Days</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Match</th><th>Location</th>
              </tr>
            </thead>
            <tbody>
              {upcomingWeekGames.map(g => (
                <tr key={g.id}>
                  <td>{g.gameDate}</td>
                  <td>{g.startTime ?? '-'}</td>
                  <td>{g.homeTeam && g.awayTeam ? `${g.homeTeam} vs ${g.awayTeam}` : `${g.sport} (${g.competitionLevel})`}</td>
                  <td>{g.locationAddress}</td>
                </tr>
              ))}
              {upcomingWeekGames.length === 0 && (
                <tr><td colSpan={4} className="small">No scheduled games in the next 7 days.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Outstanding Requirements</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Requirement</th><th>Due</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {outstandingRequirements.map(r => (
                <tr key={r.id}>
                  <td>
                    <div>{r.name}</div>
                    {r.governingBody ? <div className="small">{r.governingBody}</div> : null}
                  </td>
                  <td>{r.dueDate ?? '-'}</td>
                  <td>
                    <span className={'pill ' + (r.overdue ? 'bad' : r.status === 'In Progress' ? 'warn' : '')}>
                      {r.overdue ? 'Overdue' : r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {outstandingRequirements.length === 0 && (
                <tr><td colSpan={3} className="small">No outstanding requirements.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
