import { useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import type { CompetitionLevel, GameStatus, Sport, Role, SoccerRole, LacrosseRole } from '../lib/types'
import { upsertGameIn, deleteGameIn } from '../lib/mutate'
import { getDrivingDistanceMiles } from '../lib/distance'

const sports: Sport[] = ['Soccer', 'Lacrosse']
const levels: CompetitionLevel[] = ['High School', 'College', 'Club']
const statuses: GameStatus[] = ['Scheduled', 'Completed', 'Canceled']

const soccerRoles: SoccerRole[] = ['Center', 'AR', '4th', 'Dual']
const lacrosseRoles: LacrosseRole[] = ['Lead', 'Ref']

type Meridiem = 'AM' | 'PM'

function to12HourParts(time: string | undefined): { hour: number; minute: number; meridiem: Meridiem } {
  if (!time) return { hour: 7, minute: 0, meridiem: 'PM' }
  const [hS, mS] = time.split(':')
  const h24 = Number(hS)
  const minute = Number(mS)
  if (!Number.isFinite(h24) || !Number.isFinite(minute)) return { hour: 7, minute: 0, meridiem: 'PM' }
  const meridiem: Meridiem = h24 >= 12 ? 'PM' : 'AM'
  const hour = (h24 % 12) || 12
  return { hour, minute, meridiem }
}

function to24HourString(hour: number, minute: number, meridiem: Meridiem): string {
  const clampedHour = Math.min(12, Math.max(1, Math.floor(hour)))
  const safeMinute = [0, 15, 30, 45].includes(minute) ? minute : 0
  let h24 = clampedHour % 12
  if (meridiem === 'PM') h24 += 12
  return `${String(h24).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`
}

function shiftTimeByMinutes(time: string, deltaMinutes: number): string {
  const [hS, mS] = time.split(':')
  const h = Number(hS)
  const m = Number(mS)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '19:00'
  const total = (((h * 60 + m + deltaMinutes) % (24 * 60)) + (24 * 60)) % (24 * 60)
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export default function GamesPage() {
  const { db, write, loading } = useData()
  const [filter, setFilter] = useState<'All' | GameStatus>('All')
  const [q, setQ] = useState<string>('')

  const [form, setForm] = useState({
    id: '',
    sport: 'Soccer' as Sport,
    competitionLevel: 'High School' as CompetitionLevel,
    league: '',
    levelDetail: '',
    gameDate: '',
    startTime: '',
    locationAddress: '',
    role: '' as Role | '',
    status: 'Scheduled' as GameStatus,
    gameFee: '',
    paidConfirmed: false,
    paidDate: '',
    homeTeam: '',
    awayTeam: '',
    notes: '',
    platformConfirmations: {} as Record<string, boolean>,
    distanceMiles: '' as string,
    roundtripMiles: '' as string,
  })

  const rolesForSport = form.sport === 'Soccer' ? soccerRoles : lacrosseRoles
  const timeParts = to12HourParts(form.startTime || undefined)

  const rows = useMemo(() => {
    let list = [...db.games]
    if (filter !== 'All') list = list.filter(g => g.status === filter)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(g =>
        g.locationAddress.toLowerCase().includes(s) ||
        (g.league ?? '').toLowerCase().includes(s) ||
        (g.homeTeam ?? '').toLowerCase().includes(s) ||
        (g.awayTeam ?? '').toLowerCase().includes(s) ||
        g.gameDate.includes(s)
      )
    }
    return list.sort((a,b) => (a.gameDate < b.gameDate ? 1 : -1))
  }, [db.games, filter, q])

  function startNew() {
    setForm({
      id: '',
      sport: 'Soccer',
      competitionLevel: 'High School',
      league: '',
      levelDetail: '',
      gameDate: '',
      startTime: '',
      locationAddress: '',
      role: '',
      status: 'Scheduled',
      gameFee: '',
      paidConfirmed: false,
      paidDate: '',
      homeTeam: '',
      awayTeam: '',
      notes: '',
      platformConfirmations: {},
      distanceMiles: '',
      roundtripMiles: '',
    })
  }

  async function save() {
    if (!form.gameDate || !form.locationAddress.trim()) return
    const next = upsertGameIn(db, {
      id: form.id || undefined,
      sport: form.sport,
      competitionLevel: form.competitionLevel,
      league: form.league.trim() || undefined,
      levelDetail: form.levelDetail.trim() || undefined,
      gameDate: form.gameDate,
      startTime: form.startTime || undefined,
      locationAddress: form.locationAddress.trim(),
      role: (form.role || undefined) as any,
      status: form.status,
      gameFee: form.gameFee ? Number(form.gameFee) : undefined,
      paidConfirmed: Boolean(form.paidConfirmed),
      paidDate: form.paidDate || undefined,
      homeTeam: form.homeTeam || undefined,
      awayTeam: form.awayTeam || undefined,
      notes: form.notes || undefined,
      platformConfirmations: form.platformConfirmations,
      distanceMiles: form.distanceMiles ? Number(form.distanceMiles) : undefined,
      roundtripMiles: form.roundtripMiles ? Number(form.roundtripMiles) : undefined,
    })
    await write(next)
    startNew()
  }

  async function edit(id: string) {
    const g = db.games.find(x => x.id === id)
    if (!g) return
    setForm({
      id: g.id,
      sport: g.sport,
      competitionLevel: g.competitionLevel,
      league: g.league ?? '',
      levelDetail: (g as any).levelDetail ?? '',
      gameDate: g.gameDate,
      startTime: g.startTime ?? '',
      locationAddress: g.locationAddress,
      role: (g.role ?? '') as any,
      status: g.status,
      gameFee: (g as any).gameFee != null ? String((g as any).gameFee) : '',
      paidConfirmed: Boolean((g as any).paidConfirmed ?? false),
      paidDate: (g as any).paidDate ?? '',
      homeTeam: g.homeTeam ?? '',
      awayTeam: g.awayTeam ?? '',
      notes: g.notes ?? '',
      platformConfirmations: g.platformConfirmations ?? {},
      distanceMiles: g.distanceMiles != null ? String(g.distanceMiles) : '',
      roundtripMiles: (g as any).roundtripMiles != null ? String((g as any).roundtripMiles) : '',
    })
  }

  async function del(id: string) {
    const next = deleteGameIn(db, id)
    await write(next)
    if (form.id === id) startNew()
  }

  function togglePlatform(p: string) {
    setForm(prev => ({
      ...prev,
      platformConfirmations: { ...(prev.platformConfirmations ?? {}), [p]: !prev.platformConfirmations?.[p] }
    }))
  }

  async function calcDistance() {
    const origin = db.settings.homeAddress
    const dest = form.locationAddress.trim()
    if (!dest) return
    try {
      const miles = await getDrivingDistanceMiles(origin, dest)
      const oneWay = Math.round(miles * 10) / 10
      const rt = Math.round(oneWay * 2)
      setForm(prev => ({ ...prev, distanceMiles: String(oneWay), roundtripMiles: prev.roundtripMiles || String(rt) }))
    } catch (e: any) {
      alert(`Distance lookup failed: ${String(e?.message ?? e)}`)
    }
  }

  return (
    <div className="grid cols2">
      <section className="card">
        <h2>Games</h2>
        <div className="row">
          <div className="field">
            <label>Status filter</label>
            <select value={filter} onChange={e => setFilter(e.target.value as any)}>
              <option>All</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="date, league, location, teams..." />
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Sport</th><th>Level</th><th>Level detail</th><th>League</th><th>Roundtrip mi</th><th>Pay</th><th>Paid</th><th>Location</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(g => (
              <tr key={g.id}>
                <td>{g.gameDate}{g.startTime ? ` ${g.startTime}` : ''}</td>
                <td>{g.sport}</td>
                <td>{g.competitionLevel}</td>
                <td>{(g as any).levelDetail ?? ''}</td>
                <td>{g.league ?? ''}</td>
                <td>{(g as any).roundtripMiles != null ? Number((g as any).roundtripMiles).toFixed(0) : ''}</td>
                <td>{(g as any).gameFee != null ? `$${Number((g as any).gameFee).toFixed(0)}` : ''}</td>
                <td>{(g as any).paidConfirmed ? <span className="pill ok">Yes</span> : <span className="pill">No</span>}</td>
                <td>
                  {g.locationAddress}
                  {g.distanceMiles != null ? <div className="small">{g.distanceMiles.toFixed(1)} mi one-way</div> : null}
                </td>
                <td><span className={"pill " + (g.status === 'Completed' ? 'ok' : g.status === 'Canceled' ? 'bad' : '')}>{g.status}</span></td>
                <td>
                  <div className="btnbar">
                    <button className="btn" onClick={() => edit(g.id)}>Edit</button>
                    <button className="btn danger" onClick={() => del(g.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="small">No games yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{form.id ? 'Edit game' : 'Add game'}</h2>
        <p className="sub">Saving a game also creates/updates a linked calendar entry (2-hour default).</p>

        <div className="row">
          <div className="field">
            <label>Sport</label>
            <select value={form.sport} onChange={e => setForm({ ...form, sport: e.target.value as any, role: '' })}>
              {sports.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Competition level</label>
            <select value={form.competitionLevel} onChange={e => setForm({ ...form, competitionLevel: e.target.value as any })}>
              {levels.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.gameDate} onChange={e => setForm({ ...form, gameDate: e.target.value })} />
          </div>

          <div className="field">
            <label>Start time</label>
            <div className="btnbar" style={{ alignItems: 'center' }}>
              <input
                type="number"
                min={1}
                max={12}
                value={timeParts.hour}
                onChange={e => {
                  const h = Number(e.target.value)
                  setForm(prev => ({ ...prev, startTime: to24HourString(h, timeParts.minute, timeParts.meridiem) }))
                }}
                style={{ width: 80 }}
              />
              <select
                value={String(timeParts.minute)}
                onChange={e => {
                  const m = Number(e.target.value)
                  setForm(prev => ({ ...prev, startTime: to24HourString(timeParts.hour, m, timeParts.meridiem) }))
                }}
                style={{ width: 90 }}
              >
                <option value="0">00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
              </select>
              <select
                value={timeParts.meridiem}
                onChange={e => {
                  const meridiem = e.target.value as Meridiem
                  setForm(prev => ({ ...prev, startTime: to24HourString(timeParts.hour, timeParts.minute, meridiem) }))
                }}
                style={{ width: 90 }}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
            <div className="btnbar" style={{ marginTop: 8 }}>
              <button
                className="btn"
                onClick={() => setForm(prev => ({ ...prev, startTime: shiftTimeByMinutes(prev.startTime || '19:00', -15) }))}
              >
                -15m
              </button>
              <button
                className="btn"
                onClick={() => setForm(prev => ({ ...prev, startTime: shiftTimeByMinutes(prev.startTime || '19:00', 15) }))}
              >
                +15m
              </button>
              <button className="btn" onClick={() => setForm(prev => ({ ...prev, startTime: '' }))}>Clear</button>
              <span className={'pill ' + (form.startTime ? 'ok' : '')}>{form.startTime || 'No start time'}</span>
            </div>
          </div>
          <div className="field">
            <label>Game fee</label>
            <input value={form.gameFee} onChange={e => setForm({ ...form, gameFee: e.target.value })} placeholder="e.g., 85" />
          </div>
          <div className="field">
            <label>Paid confirmed</label>
            <div className="btnbar">
              <label className="pill" style={{cursor:'pointer'}}>
                <input type="checkbox" checked={Boolean(form.paidConfirmed)} onChange={() => setForm(prev => ({...prev, paidConfirmed: !prev.paidConfirmed }))} style={{marginRight:8}}/>
                Paid
              </label>
</div>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>League / assignor (optional)</label>
            <input list="leagueList" value={form.league} onChange={e => setForm({ ...form, league: e.target.value })} placeholder="e.g., OCC, USYS, OHSAA assignor..." />
            <datalist id="leagueList">
              {db.settings.leagues.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Level detail (optional)</label>
            <input value={form.levelDetail} onChange={e => setForm({ ...form, levelDetail: e.target.value })} placeholder="VarB, JV, ColG, AdultM, U19..." />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}>
              <option value="">(none)</option>
              {rolesForSport.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Location (required address/field)</label>
          <input value={form.locationAddress} onChange={e => setForm({ ...form, locationAddress: e.target.value })} placeholder="Address or field name + city" />
          <div className="btnbar" style={{marginTop: 8}}>
            <button className="btn" onClick={calcDistance} disabled={!form.locationAddress.trim()}>Calculate distance from home</button>
            {form.distanceMiles ? <span className="pill ok">{form.distanceMiles} mi one-way</span> : <span className="pill">distance n/a</span>}
          </div>
          <div className="row" style={{marginTop: 8}}>
            <div className="field">
              <label>Roundtrip miles (overrideable)</label>
              <input value={form.roundtripMiles} onChange={e => setForm({ ...form, roundtripMiles: e.target.value })} placeholder="e.g., 0 (multi-game day), 75..." />
              <div className="small">Set to 0 if you're stacking multiple games at one site and only claiming mileage once.</div>
            </div>
          </div>
          <p className="small">Distance uses <code>/api/distance</code>. Add <code>GOOGLE_MAPS_API_KEY</code> in Vercel env vars if you want this.</p>
        </div>

        <div className="row">
          <div className="field">
            <label>Home team</label>
            <input value={form.homeTeam} onChange={e => setForm({ ...form, homeTeam: e.target.value })} />
          </div>
          <div className="field">
            <label>Away team</label>
            <input value={form.awayTeam} onChange={e => setForm({ ...form, awayTeam: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>Assigning platforms confirmation</label>
          <div className="btnbar">
            {db.settings.assigningPlatforms.map(p => (
              <label key={p} className="pill" style={{cursor:'pointer'}}>
                <input
                  type="checkbox"
                  checked={Boolean(form.platformConfirmations?.[p])}
                  onChange={() => togglePlatform(p)}
                  style={{marginRight: 8}}
                />
                {p}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="btnbar">
          <button className="btn primary" onClick={save} disabled={loading || !form.gameDate || !form.locationAddress.trim()}>
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button className="btn" onClick={startNew} disabled={loading}>New</button>
        </div>
      </section>
    </div>
  )
}


