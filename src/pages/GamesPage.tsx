import { Fragment, useMemo, useState } from 'react'
import HelpTip from '../components/HelpTip'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { trackedSportsFor } from '../lib/preferences'
import type { CompetitionLevel, GameStatus, Role, SoccerRole, LacrosseRole, MileageOrigin } from '../lib/types'
import { upsertGameIn, deleteGameIn } from '../lib/mutate'
import { getDrivingDistanceMiles } from '../lib/distance'
import { formatMoney, isWithinNextDays } from '../lib/utils'
import { recordPlatformEvent } from '../lib/platformEvents'
import { IRS_MILEAGE_ORIGIN_LINKS } from '../lib/taxReview'

const levels: CompetitionLevel[] = ['High School', 'College', 'Club']
const statuses: GameStatus[] = ['Scheduled', 'Played', 'Paid / Complete', 'Canceled']

const soccerRoles: SoccerRole[] = ['Center', 'AR', '4th', 'Dual', 'Mentor']
const lacrosseRoles: LacrosseRole[] = ['Lead', 'Field Judge', 'Alternate', 'Mentor']
const DEFAULT_GAME_START_TIME = '19:00'
const commonStartTimes = ['16:00', '17:00', '18:00', '19:00', '19:30', '20:00']

type Meridiem = 'AM' | 'PM'
type GameFormState = {
  id: string
  sport: string
  competitionLevel: CompetitionLevel
  league: string
  levelDetail: string
  gameDate: string
  startTime: string
  locationAddress: string
  role: Role | ''
  mileageOrigin: MileageOrigin
  status: GameStatus
  gameFee: string
  paidConfirmed: boolean
  paidDate: string
  homeTeam: string
  awayTeam: string
  notes: string
  platformConfirmations: Record<string, boolean>
  distanceMiles: string
  roundtripMiles: string
}

function clearDerivedMileage<T extends { distanceMiles: string; roundtripMiles: string }>(value: T): T {
  const oneWay = Number(value.distanceMiles)
  const autoRoundtrip = Number.isFinite(oneWay) ? String(Math.round(oneWay * 2)) : ''
  return {
    ...value,
    distanceMiles: '',
    roundtripMiles: value.roundtripMiles === autoRoundtrip ? '' : value.roundtripMiles,
  }
}

function normalizeMileageOrigin(origin: MileageOrigin | '' | undefined, hasOtherWorkAddress: boolean): MileageOrigin {
  return origin === 'other' && hasOtherWorkAddress ? 'other' : 'home'
}

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

function timeLabel(time: string): string {
  const parts = to12HourParts(time)
  return `${parts.hour}:${String(parts.minute).padStart(2, '0')} ${parts.meridiem}`
}

function paymentBadge(game: { paidConfirmed: boolean; status: GameStatus }) {
  if (game.paidConfirmed || game.status === 'Paid / Complete') return { label: 'Paid', tone: 'ok' }
  if (game.status === 'Canceled') return { label: 'Canceled', tone: 'bad' }
  if (game.status === 'Played') return { label: 'Unpaid', tone: 'warn' }
  return { label: 'Unpaid', tone: 'warn' }
}

function gameStatusTone(status: GameStatus) {
  if (status === 'Paid / Complete') return 'ok'
  if (status === 'Played') return 'warn'
  if (status === 'Canceled') return 'bad'
  return 'info'
}

const commonPlatformSuggestions = ['DragonFly', 'RefQuest', 'Arbiter', 'Assignr', 'GameOfficials', 'GotSport']

function normalizeTrackedPlatforms(platforms: string[]): string[] {
  return Array.from(new Set(platforms.map((platform) => platform.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function createGameForm(sport: string, startTime = DEFAULT_GAME_START_TIME): GameFormState {
  return {
    id: '',
    sport,
    competitionLevel: 'High School',
    league: '',
    levelDetail: '',
    gameDate: '',
    startTime,
    locationAddress: '',
    role: '',
    mileageOrigin: 'home',
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
  }
}

export default function GamesPage() {
  const { db, write, loading, session } = useData()
  const navigate = useNavigate()
  const initialSport = trackedSportsFor(db.settings.trackedSports, db.games.map(g => g.sport))[0] ?? 'Soccer'
  const [filter, setFilter] = useState<'All' | GameStatus>('All')
  const [q, setQ] = useState<string>('')
  const [yearFilter, setYearFilter] = useState<string>('All years')
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [trackedPlatformInput, setTrackedPlatformInput] = useState('')

  const [form, setForm] = useState<GameFormState>(() => createGameForm(initialSport))

  const sports = useMemo(
    () => trackedSportsFor(db.settings.trackedSports, db.games.map(g => g.sport)),
    [db.settings.trackedSports, db.games]
  )
  const rolesForSport = form.sport === 'Soccer' ? soccerRoles : form.sport === 'Lacrosse' ? lacrosseRoles : []
  const hasOtherWorkAddress = Boolean(db.settings.otherWorkAddress?.trim())
  const workLocationOptions = [
    {
      value: 'home' as MileageOrigin,
      label: 'Primary mileage origin',
      address: db.settings.homeAddress.trim(),
      placeId: db.settings.homeAddressPlaceId,
    },
    ...(hasOtherWorkAddress
      ? [{
        value: 'other' as MileageOrigin,
        label: 'Secondary mileage origin',
        address: db.settings.otherWorkAddress!.trim(),
        placeId: db.settings.otherWorkAddressPlaceId,
      }]
      : []),
  ]
  const selectedMileageOrigin = normalizeMileageOrigin(form.mileageOrigin, hasOtherWorkAddress)
  const selectedWorkLocation = workLocationOptions.find(option => option.value === selectedMileageOrigin) ?? workLocationOptions[0]
  const timeParts = to12HourParts(form.startTime || undefined)
  const assigningPlatforms = useMemo(
    () => normalizeTrackedPlatforms(db.settings.assigningPlatforms),
    [db.settings.assigningPlatforms]
  )
  const showPlatformChips = db.settings.showGamePlatformChips !== false
  const gameTableColSpan = showPlatformChips ? 13 : 12
  const availableYears = useMemo(() => {
    return Array.from(new Set(
      db.games
        .map(g => g.gameDate.slice(0, 4))
        .filter(Boolean)
    )).sort((a, b) => Number(b) - Number(a))
  }, [db.games])

  const rows = useMemo(() => {
    let list = [...db.games]
    if (filter !== 'All') list = list.filter(g => g.status === filter)
    if (yearFilter !== 'All years') list = list.filter(g => g.gameDate.startsWith(yearFilter))
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
    return list.sort((a, b) => {
      if (a.gameDate !== b.gameDate) {
        return a.gameDate < b.gameDate ? 1 : -1
      }
      const timeA = a.startTime ?? ''
      const timeB = b.startTime ?? ''
      if (timeA === timeB) return 0
      return timeA < timeB ? 1 : -1
    })
  }, [db.games, filter, q, yearFilter])
  const strip = useMemo(() => {
    const activeRows = rows.filter(g => g.status !== 'Canceled')
    const mileageRows = activeRows.filter(g => g.status === 'Played' || g.status === 'Paid / Complete')
    const gamesThisWeek = activeRows.filter(g => isWithinNextDays(g.gameDate, 7)).length
    const totalExpectedPay = activeRows.reduce((sum, g) => sum + Number(g.gameFee ?? 0), 0)
    const paidAmount = activeRows
      .filter(g => g.paidConfirmed || g.status === 'Paid / Complete')
      .reduce((sum, g) => sum + Number(g.gameFee ?? 0), 0)
    const unpaidAmount = activeRows
      .filter(g => !(g.paidConfirmed || g.status === 'Paid / Complete'))
      .reduce((sum, g) => sum + Number(g.gameFee ?? 0), 0)
    const milesLogged = mileageRows.reduce((sum, g) => sum + Number(g.roundtripMiles ?? (g.distanceMiles != null ? g.distanceMiles * 2 : 0)), 0)
    return { gamesThisWeek, totalExpectedPay, paidAmount, unpaidAmount, milesLogged }
  }, [rows])
  const noGamesYet = db.games.length === 0

  function applyStatusToForm(nextStatus: GameStatus) {
    setForm(prev => ({
      ...prev,
      status: nextStatus,
      paidConfirmed: nextStatus === 'Paid / Complete',
      paidDate: nextStatus === 'Paid / Complete' ? (prev.paidDate || prev.gameDate) : '',
    }))
  }

  function resetForm() {
    setForm(createGameForm(sports[0] ?? 'Soccer'))
  }

  function startNew() {
    resetForm()
    setFormOpen(true)
  }

  async function save() {
    if (!form.gameDate || !form.locationAddress.trim()) return
    const isNew = !form.id
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
      mileageOrigin: selectedMileageOrigin,
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
    if (isNew) {
      void recordPlatformEvent(session?.access_token, 'game_created', {
        sport: form.sport,
        competitionLevel: form.competitionLevel,
        status: form.status,
        hasFee: Boolean(form.gameFee),
        hasMileage: Boolean(form.distanceMiles || form.roundtripMiles),
      })
    }
    resetForm()
    setFormOpen(false)
  }

  async function edit(id: string) {
    const g = db.games.find(x => x.id === id)
    if (!g) return
    setExpandedGameId(id)
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
      mileageOrigin: normalizeMileageOrigin(g.mileageOrigin, hasOtherWorkAddress),
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
    setFormOpen(true)
  }

  async function del(id: string) {
    const next = deleteGameIn(db, id)
    await write(next)
    if (expandedGameId === id) setExpandedGameId(null)
    if (form.id === id) {
      resetForm()
      setFormOpen(false)
    }
  }

  async function updateStatus(id: string, nextStatus: GameStatus) {
    const g = db.games.find(x => x.id === id)
    if (!g) return
    const next = upsertGameIn(db, {
      ...g,
      id: g.id,
      status: nextStatus,
    })
    await write(next)
    if (form.id === id) {
      setForm(prev => ({
        ...prev,
        status: nextStatus,
        paidConfirmed: nextStatus === 'Paid / Complete',
        paidDate: nextStatus === 'Paid / Complete' ? (g.paidDate ?? g.gameDate) : '',
      }))
    }
  }

  function toggleExpanded(id: string) {
    setExpandedGameId(prev => prev === id ? null : id)
  }

  function togglePlatform(p: string) {
    setForm(prev => ({
      ...prev,
      platformConfirmations: { ...(prev.platformConfirmations ?? {}), [p]: !prev.platformConfirmations?.[p] }
    }))
  }

  function updateStartTime(hour: number, minute: number, meridiem: Meridiem) {
    setForm(prev => ({ ...prev, startTime: to24HourString(hour, minute, meridiem) }))
  }

  function adjustStartHour(delta: number) {
    const nextHour = (((timeParts.hour - 1 + delta) % 12) + 12) % 12 + 1
    updateStartTime(nextHour, timeParts.minute, timeParts.meridiem)
  }

  function adjustStartMinutes(delta: number) {
    setForm(prev => ({ ...prev, startTime: shiftTimeByMinutes(prev.startTime || DEFAULT_GAME_START_TIME, delta) }))
  }

  async function saveTrackedPlatforms(nextPlatforms: string[]) {
    await write({
      ...db,
      settings: {
        ...db.settings,
        assigningPlatforms: normalizeTrackedPlatforms(nextPlatforms),
      },
    })
  }

  async function addTrackedPlatform(platformName: string) {
    const platform = platformName.trim()
    if (!platform) return
    if (assigningPlatforms.some((existing) => existing.toLowerCase() === platform.toLowerCase())) {
      setTrackedPlatformInput('')
      return
    }
    await saveTrackedPlatforms([...assigningPlatforms, platform])
    setTrackedPlatformInput('')
  }

  async function removeTrackedPlatform(platformName: string) {
    await saveTrackedPlatforms(assigningPlatforms.filter((platform) => platform !== platformName))
  }

  async function calcDistance() {
    const origin = selectedWorkLocation?.address?.trim() ?? ''
    const dest = form.locationAddress.trim()
    if (!origin || !dest) return
    try {
      const miles = await getDrivingDistanceMiles(origin, dest, { originPlaceId: selectedWorkLocation?.placeId })
      const oneWay = Math.round(miles * 10) / 10
      const rt = Math.round(oneWay * 2)
      setForm(prev => ({ ...prev, distanceMiles: String(oneWay), roundtripMiles: prev.roundtripMiles || String(rt) }))
    } catch (e: any) {
      alert(`Distance lookup failed: ${String(e?.message ?? e)}`)
    }
  }

  return (
    <div className="grid games-page">
      <section className="card accent-frame">
        <h2>Games</h2>
        <div className="kpi compact-kpi">
          <div className="box">
            <div className="label">Games this week</div>
            <div className="value">{strip.gamesThisWeek}</div>
          </div>
          <div className="box">
            <div className="label">Total expected pay</div>
            <div className="value">{formatMoney(strip.totalExpectedPay)}</div>
          </div>
          <div className="box">
            <div className="label">Paid vs unpaid</div>
            <div className="value">{formatMoney(strip.paidAmount)} / {formatMoney(strip.unpaidAmount)}</div>
          </div>
          <div className="box">
            <div className="label">Miles logged</div>
            <div className="value">{strip.milesLogged.toFixed(1)} mi</div>
          </div>
        </div>
        <div className="btnbar games-actions">
          <button className="btn primary" onClick={startNew}>Add game</button>
          <button className="btn" onClick={() => navigate('/sync')}>Sync calendars</button>
          <button className="btn" onClick={() => navigate('/import')}>Import CSV</button>
        </div>

        <div className="games-platform-manager">
          <div>
            <strong>Tracked platforms for blocks and confirmations</strong>
            <p className="small">Choose which assigning platforms should appear as block-tracking chips on this page. Remove any platform you do not use.</p>
          </div>
          <div className="platform-row">
            {assigningPlatforms.map((platform) => (
              <button key={platform} className="platform-chip on platform-manager-chip" onClick={() => removeTrackedPlatform(platform)}>
                {platform} <span aria-hidden="true">x</span>
              </button>
            ))}
            {assigningPlatforms.length === 0 ? <span className="small">No tracked platforms yet.</span> : null}
          </div>
          <div className="games-platform-manager-add">
            <input
              value={trackedPlatformInput}
              onChange={(event) => setTrackedPlatformInput(event.target.value)}
              placeholder="Add another platform"
            />
            <button className="btn" onClick={() => void addTrackedPlatform(trackedPlatformInput)} disabled={!trackedPlatformInput.trim()}>
              Add platform
            </button>
          </div>
          <div className="platform-row">
            {commonPlatformSuggestions
              .filter((platform) => !assigningPlatforms.some((existing) => existing.toLowerCase() === platform.toLowerCase()))
              .map((platform) => (
                <button key={platform} className="platform-chip off platform-suggestion-chip" onClick={() => void addTrackedPlatform(platform)}>
                  Add {platform}
                </button>
              ))}
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Status filter</label>
            <select value={filter} onChange={e => setFilter(e.target.value as any)}>
              <option>All</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Year filter</label>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
              <option value="All years">All years</option>
              {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="date, league, location, teams..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th></th><th>Date</th><th>Sport</th><th>Level</th><th>Level detail</th><th>League</th>{showPlatformChips ? <th>Platforms</th> : null}<th>Roundtrip mi</th><th>Pay</th><th>Paid</th><th>Location</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(g => {
                const isExpanded = expandedGameId === g.id
                const payBadge = paymentBadge(g)
                return (
                  <Fragment key={g.id}>
                    <tr
                      className={`expandable-row${isExpanded ? ' expanded' : ''}`}
                      onClick={() => toggleExpanded(g.id)}
                    >
                      <td className="expander-cell" aria-label={isExpanded ? 'Collapse row' : 'Expand row'}>
                        {isExpanded ? '−' : '+'}
                      </td>
                      <td>{g.gameDate}{g.startTime ? ` ${g.startTime}` : ''}</td>
                      <td>{g.sport}</td>
                      <td>{g.competitionLevel}</td>
                      <td>{(g as any).levelDetail ?? ''}</td>
                      <td>{g.league ?? ''}</td>
                      {showPlatformChips ? (
                        <td>
                          <div className="platform-row">
                            {assigningPlatforms.map(p => (
                              <span key={p} className={'platform-chip ' + (g.platformConfirmations?.[p] ? 'on' : 'off')}>
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                      ) : null}
                      <td>{(g as any).roundtripMiles != null ? Number((g as any).roundtripMiles).toFixed(0) : ''}</td>
                      <td>{(g as any).gameFee != null ? `$${Number((g as any).gameFee).toFixed(0)}` : ''}</td>
                      <td><span className={`pill ${payBadge.tone}`}>{payBadge.label}</span></td>
                      <td>
                        {g.locationAddress}
                        {g.distanceMiles != null ? (
                          <div className="small">
                            {g.distanceMiles.toFixed(1)} mi one-way from {g.mileageOrigin === 'other' ? 'secondary mileage origin' : 'primary mileage origin'}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="btnbar" onClick={e => e.stopPropagation()}>
                          <span className={`pill ${gameStatusTone(g.status)}`}>{g.status}</span>
                          <select
                            value={g.status}
                            onChange={e => updateStatus(g.id, e.target.value as GameStatus)}
                            style={{ minWidth: 145 }}
                          >
                            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </td>
                      <td>
                        <div className="btnbar" onClick={e => e.stopPropagation()}>
                          <button className="btn" onClick={() => edit(g.id)}>Edit</button>
                          <button className="btn danger" onClick={() => del(g.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="expanded">
                        <td colSpan={gameTableColSpan}>
                          <div className="expanded-panel">
                            <div className="expanded-grid">
                              <div className="expanded-block">
                                <div className="expanded-label">Teams</div>
                                <div className="expanded-value">
                                  {g.homeTeam || g.awayTeam ? `${g.homeTeam || 'TBD'} vs ${g.awayTeam || 'TBD'}` : 'Teams not entered yet'}
                                </div>
                              </div>
                              <div className="expanded-block">
                                <div className="expanded-label">Location</div>
                                <div className="expanded-value">{g.locationAddress}</div>
                              </div>
                              <div className="expanded-block">
                                <div className="expanded-label">Pay</div>
                                <div className="expanded-value">
                                  {(g as any).gameFee != null ? `$${Number((g as any).gameFee).toFixed(2)}` : 'No fee entered'}
                                  {' · '}
                                  <span className={`pill ${payBadge.tone}`}>{payBadge.label}</span>
                                </div>
                              </div>
                              <div className="expanded-block">
                                <div className="expanded-label">Mileage</div>
                                <div className="expanded-value">
                                  {(g as any).roundtripMiles != null
                                    ? `${Number((g as any).roundtripMiles).toFixed(1)} roundtrip mi`
                                    : g.distanceMiles != null
                                      ? `${(g.distanceMiles * 2).toFixed(1)} estimated roundtrip mi`
                                      : 'No mileage logged'}
                                  {' · '}
                                  {g.mileageOrigin === 'other' ? 'from secondary mileage origin' : 'from primary mileage origin'}
                                </div>
                              </div>
                              {showPlatformChips ? (
                                <div className="expanded-block">
                                  <div className="expanded-label">Platforms</div>
                                  <div className="expanded-value">
                                    {(assigningPlatforms.filter(p => g.platformConfirmations?.[p]).join(', ')) || 'No platform confirmations yet'}
                                  </div>
                                </div>
                              ) : null}
                              <div className="expanded-block">
                                <div className="expanded-label">Notes</div>
                                <div className="expanded-value">{g.notes?.trim() ? g.notes : 'No notes yet'}</div>
                              </div>
                            </div>
                            <div className="btnbar expanded-actions" onClick={e => e.stopPropagation()}>
                              <button className="btn primary" onClick={() => edit(g.id)}>Edit game</button>
                              <button className="btn" onClick={() => setExpandedGameId(null)}>Collapse</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={gameTableColSpan} className="empty-cell">
                    <div className="empty-state centered">
                      <h3>{noGamesYet ? 'No games yet' : 'No games match those filters'}</h3>
                      <p>
                        {noGamesYet
                          ? 'Sync an assigning platform, import a CSV, or add your first assignment here so this page becomes your working schedule.'
                          : 'Try clearing one of the filters or your search to bring more assignments back into view.'}
                      </p>
                      <div className="btnbar">
                        {noGamesYet ? (
                          <>
                            <button className="btn primary" onClick={startNew}>Add your first assignment</button>
                            <button className="btn" onClick={() => navigate('/sync')}>Sync calendars</button>
                            <button className="btn" onClick={() => navigate('/import')}>Import CSV</button>
                          </>
                        ) : (
                          <>
                            <button className="btn primary" onClick={() => setFilter('All')}>Clear status filter</button>
                            <button className="btn" onClick={() => setYearFilter('All years')}>Show all years</button>
                            <button className="btn" onClick={() => setQ('')}>Clear search</button>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="game-card-list">
          {rows.map(g => {
            const payBadge = paymentBadge(g)
            return (
              <article key={g.id} className="game-card">
                <div className="game-card-head">
                  <div>
                    <div className="game-card-date">{g.gameDate}{g.startTime ? ` at ${g.startTime}` : ''}</div>
                    <div className="game-card-title">
                      {g.homeTeam || g.awayTeam ? `${g.homeTeam || 'TBD'} vs ${g.awayTeam || 'TBD'}` : `${g.sport} (${g.competitionLevel})`}
                    </div>
                  </div>
                  <span className={`pill ${gameStatusTone(g.status)}`}>{g.status}</span>
                </div>
                <div className="game-card-meta">
                  <span>{g.levelDetail || g.competitionLevel}</span>
                  <span>{g.league || 'No league'}</span>
                  <span>{g.roundtripMiles != null ? `${Number(g.roundtripMiles).toFixed(0)} mi` : 'No mileage'}</span>
                  <span>{g.gameFee != null ? `$${Number(g.gameFee).toFixed(0)}` : 'No pay'}</span>
                </div>
                <div className="small">{g.locationAddress || 'No location entered'}</div>
                <div className="game-card-foot">
                  <span className={`pill ${payBadge.tone}`}>{payBadge.label}</span>
                  {showPlatformChips ? (
                    <div className="platform-row">
                      {assigningPlatforms.map(p => (
                        <span key={p} className={'platform-chip ' + (g.platformConfirmations?.[p] ? 'on' : 'off')}>
                          {p}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button className="btn compact" onClick={() => edit(g.id)}>Edit</button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {formOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setFormOpen(false)
        }}>
          <section className="card modal-card game-editor-modal" role="dialog" aria-modal="true" aria-label={form.id ? 'Edit game' : 'Add game'}>
            <div className="modal-titlebar">
              <div>
                <h2>{form.id ? 'Edit game' : 'Add game'}</h2>
                <p className="sub">Saving a game also creates or updates a linked calendar entry using a default event duration that you can adjust from the calendar.</p>
              </div>
              <button className="btn compact" onClick={() => setFormOpen(false)}>Close</button>
            </div>

            <div className="editor-guidance-row">
              <HelpTip title="Why am I filling this in manually?">
                <p>Most assignor calendar feeds provide only partial assignment details. Pay, exact field address, roundtrip mileage, and some level details often need a quick review here.</p>
                <p>This is the place to turn a synced assignment into a record you can review for mileage, tax-time exports, and end-of-season reporting.</p>
              </HelpTip>
              <HelpTip label="Will sync wipe this out?" title="How manual edits and sync work together">
                <p>No. Once Whistle Keeper matches a synced assignment to this game, later syncs are designed to merge around your manual edits instead of wiping fee, location, and mileage fields.</p>
                <p>If a sync ever creates a duplicate, use Sync duplicate review instead of re-entering everything.</p>
              </HelpTip>
            </div>

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
            <select value={form.status} onChange={e => applyStatusToForm(e.target.value as GameStatus)}>
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
            <div className="game-time-picker" aria-label="Game start time picker">
              <div className="game-time-main">
                <div className="game-time-stepper">
                  <span>Hour</span>
                  <div>
                    <button type="button" className="btn compact" onClick={() => adjustStartHour(-1)} aria-label="Decrease start hour">-</button>
                    <strong>{timeParts.hour}</strong>
                    <button type="button" className="btn compact" onClick={() => adjustStartHour(1)} aria-label="Increase start hour">+</button>
                  </div>
                </div>
                <div className="game-time-divider">:</div>
                <div className="game-time-stepper">
                  <span>Minutes</span>
                  <div>
                    <button type="button" className="btn compact" onClick={() => adjustStartMinutes(-15)} aria-label="Decrease start time by 15 minutes">-</button>
                    <strong>{String(timeParts.minute).padStart(2, '0')}</strong>
                    <button type="button" className="btn compact" onClick={() => adjustStartMinutes(15)} aria-label="Increase start time by 15 minutes">+</button>
                  </div>
                </div>
                <div className="game-time-meridiem" aria-label="AM or PM">
                  {(['AM', 'PM'] as Meridiem[]).map(value => (
                    <button
                      key={value}
                      type="button"
                      className={`btn compact ${timeParts.meridiem === value ? 'primary' : ''}`}
                      onClick={() => updateStartTime(timeParts.hour, timeParts.minute, value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="game-time-summary">
                <span className={'pill ' + (form.startTime ? 'ok' : '')}>{form.startTime ? timeLabel(form.startTime) : 'No start time'}</span>
                <button type="button" className="btn compact" onClick={() => setForm(prev => ({ ...prev, startTime: '' }))}>Clear</button>
              </div>
              <div className="game-time-presets" aria-label="Common start times">
                {commonStartTimes.map(time => (
                  <button
                    key={time}
                    type="button"
                    className={`btn compact ${form.startTime === time ? 'primary' : ''}`}
                    onClick={() => setForm(prev => ({ ...prev, startTime: time }))}
                  >
                    {timeLabel(time)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field">
            <label>Game fee</label>
            <input value={form.gameFee} onChange={e => setForm({ ...form, gameFee: e.target.value })} placeholder="e.g., 85" />
          </div>
          <div className="field">
            <label>Paid confirmed</label>
            <div className="btnbar">
              <span className={'pill ' + (form.paidConfirmed ? 'ok' : '')}>
                {form.paidConfirmed ? `Paid${form.paidDate ? ` (${form.paidDate})` : ''}` : 'Unpaid'}
              </span>
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
            {rolesForSport.length ? (
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}>
                <option value="">(none)</option>
                {rolesForSport.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })} placeholder="Referee, Line Judge, Umpire, Crew Chief..." />
            )}
          </div>
        </div>

        <div className="field">
          <label>Location (required address/field)</label>
          <input
            value={form.locationAddress}
            onChange={e => {
              const nextAddress = e.target.value
              setForm(prev => {
              if (nextAddress === prev.locationAddress) return { ...prev, locationAddress: nextAddress }
              return { ...clearDerivedMileage(prev), locationAddress: nextAddress }
              })
            }}
            placeholder="Address or field name + city"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <div className="field">
              <label>Calculate mileage from</label>
              <select
                value={selectedMileageOrigin}
                onChange={e => {
                  const nextOrigin = e.target.value as MileageOrigin
                  setForm(prev => ({
                    ...clearDerivedMileage(prev),
                    mileageOrigin: nextOrigin,
                  }))
                }}
              >
                {workLocationOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <div className="small">{selectedWorkLocation?.address || 'Add a mileage origin in Settings first.'}</div>
              <HelpTip label="Mileage note" title="Mileage calculation is not tax advice">
                <p>Whistle Keeper calculates route distance for records. It does not determine whether a trip is deductible, commuting, reimbursed, duplicated, or otherwise excluded.</p>
                <p>Review IRS guidance or ask your preparer before relying on mileage in a tax filing.</p>
                <div className="tax-review-links">
                  {IRS_MILEAGE_ORIGIN_LINKS.map(link => (
                    <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
                  ))}
                </div>
              </HelpTip>
            </div>
          </div>
          <div className="btnbar" style={{marginTop: 8}}>
            <button className="btn" onClick={calcDistance} disabled={!form.locationAddress.trim() || !selectedWorkLocation?.address}>
              Calculate distance from {selectedWorkLocation?.label.toLowerCase() || 'mileage origin'}
            </button>
            {form.distanceMiles ? <span className="pill ok">{form.distanceMiles} mi one-way</span> : <span className="pill">distance n/a</span>}
          </div>
          <div className="row" style={{marginTop: 8}}>
            <div className="field">
              <label>Roundtrip miles (overrideable)</label>
              <input value={form.roundtripMiles} onChange={e => setForm({ ...form, roundtripMiles: e.target.value })} placeholder="e.g., 0 (multi-game day), 75..." />
              <div className="small">Set to 0 if you are stacking multiple games at one site and recording mileage once elsewhere.</div>
            </div>
          </div>
          <p className="small">Mileage lookup is available when the Maps integration has been configured.</p>
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
          <div className="small" style={{marginBottom: 6}}>Mark a platform once this date is blocked or entered there. Sync can also mark a platform when its iCal feed contains a block for this date.</div>
          <div className="btnbar">
            {assigningPlatforms.map(p => (
              <label key={p} className={'platform-chip ' + (form.platformConfirmations?.[p] ? 'on' : 'off')} style={{cursor:'pointer'}}>
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
      )}
    </div>
  )
}


