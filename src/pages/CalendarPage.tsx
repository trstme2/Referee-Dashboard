import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { addDays, endOfMonth, startOfMonth, yyyyMmDd } from '../lib/utils'
import { upsertCalendarEventIn, deleteCalendarEventIn } from '../lib/mutate'
import type { CalendarEvent, EventType } from '../lib/types'
import {
  calendarDateKey,
  calendarEventDayKeys,
  calendarEventDisplayTitle,
  calendarEventTimeRangeLabel,
  calendarTimeInputValue,
  visibleCalendarEvents,
} from '../lib/calendarEvents'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type CalendarWeek = {
  key: string
  days: Date[]
}

type WeekEventBar = {
  event: CalendarEvent
  startColumn: number
  endColumn: number
}

type WeekBarLayout = {
  bars: WeekEventBar[]
  hiddenCount: number
}

const MAX_WEEK_BARS = 4
const PLATFORM_ORDER = [
  'DragonFly',
  'RefQuest',
  'Arbiter',
  'Assignr',
  'HorizonWebRef',
  'Stack Officials',
  'GameOfficials',
  'ZebraWeb',
  'Manual',
  'CSV',
  'Multiple',
]

function eventTone(type: EventType): string {
  if (type === 'Game') return 'game'
  if (type === 'Block') return 'block'
  if (type === 'Travel') return 'travel'
  return 'admin'
}

function eventSourceLabel(event: CalendarEvent): string {
  if (event.externalRef) return event.externalRef.split(':')[0] || 'Synced'
  const confirmedPlatforms = Object.entries(event.platformConfirmations ?? {})
    .filter(([, confirmed]) => confirmed)
    .map(([platform]) => platform)
  if (confirmedPlatforms.length === 1) return confirmedPlatforms[0]
  if (confirmedPlatforms.length > 1) return 'Multiple'
  if (event.source === 'CSV Import') return 'CSV'
  return 'Manual'
}

function platformClassFromSource(sourceName: string): string {
  const source = sourceName.toLowerCase()
  if (source === 'dragonfly') return 'is-platform-dragonfly'
  if (source === 'refquest') return 'is-platform-refquest'
  if (source === 'arbiter') return 'is-platform-arbiter'
  if (source === 'assignr') return 'is-platform-assignr'
  if (source === 'horizonwebref') return 'is-platform-horizon'
  if (source === 'stack officials') return 'is-platform-stack'
  if (source === 'gameofficials') return 'is-platform-gameofficials'
  if (source === 'zebraweb') return 'is-platform-zebraweb'
  if (source === 'manual') return 'is-platform-manual'
  if (source === 'csv') return 'is-platform-csv'
  if (source === 'multiple') return 'is-platform-multiple'
  return 'is-platform-other'
}

function eventPlatformClass(event: CalendarEvent): string {
  return platformClassFromSource(eventSourceLabel(event))
}

function eventTypeLabel(event: CalendarEvent): string {
  if (event.eventType === 'Block') return 'Unavailable'
  return event.eventType
}

function selectedDayHeading(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function splitWeeks(days: Date[]): CalendarWeek[] {
  const weeks: CalendarWeek[] = []
  for (let i = 0; i < days.length; i += 7) {
    const weekDays = days.slice(i, i + 7)
    weeks.push({ key: yyyyMmDd(weekDays[0]), days: weekDays })
  }
  return weeks
}

function sortPlatformLabels(a: string, b: string): number {
  const ai = PLATFORM_ORDER.findIndex(item => item.toLowerCase() === a.toLowerCase())
  const bi = PLATFORM_ORDER.findIndex(item => item.toLowerCase() === b.toLowerCase())
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  }
  return a.localeCompare(b)
}

export default function CalendarPage() {
  const { db, write, loading } = useData()
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => yyyyMmDd(new Date()))
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState({
    id: '',
    eventType: 'Block' as EventType,
    title: 'Blocked',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    allDay: true,
    notes: '',
    platformConfirmations: {} as Record<string, boolean>,
  })

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })

  const gridStart = useMemo(() => {
    const s = new Date(monthStart)
    s.setDate(1 - s.getDay())
    return s
  }, [monthStart])

  const days = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 42; i += 1) arr.push(addDays(gridStart, i))
    return arr
  }, [gridStart])
  const weeks = useMemo(() => splitWeeks(days), [days])

  const displayEvents = useMemo(() => visibleCalendarEvents(db.calendarEvents), [db.calendarEvents])
  const hiddenDuplicateCount = Math.max(0, db.calendarEvents.length - displayEvents.length)

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of displayEvents) {
      for (const day of calendarEventDayKeys(event)) {
        map.set(day, [...(map.get(day) ?? []), event])
      }
    }
    for (const [, events] of map) events.sort((a, b) => (a.start < b.start ? -1 : 1))
    return map
  }, [displayEvents])

  const selectedEvents = eventsByDay.get(selectedDay) ?? []
  const selectedDayTitle = selectedDayHeading(selectedDay)

  function weekBarLayout(week: CalendarWeek): WeekBarLayout {
    const weekKeys = week.days.map(yyyyMmDd)
    const weekStart = weekKeys[0]
    const weekEnd = weekKeys[6]
    const bars = displayEvents
      .map((event) => {
        const keys = calendarEventDayKeys(event)
        if (keys.length <= 1) return null
        const touched = keys.filter(key => key >= weekStart && key <= weekEnd)
        if (!touched.length) return null
        const startColumn = Math.max(1, weekKeys.indexOf(touched[0]) + 1)
        const endColumn = Math.max(startColumn, weekKeys.indexOf(touched[touched.length - 1]) + 1)
        return { event, startColumn, endColumn }
      })
      .filter((bar): bar is WeekEventBar => Boolean(bar))
      .sort((a, b) => a!.event.start.localeCompare(b!.event.start))

    return {
      bars: bars.slice(0, MAX_WEEK_BARS),
      hiddenCount: Math.max(0, bars.length - MAX_WEEK_BARS),
    }
  }

  function visibleDayItems(dayKey: string): CalendarEvent[] {
    return (eventsByDay.get(dayKey) ?? [])
      .filter(event => calendarEventDayKeys(event).length <= 1)
  }

  const monthEvents = useMemo(() => {
    const monthStartKey = yyyyMmDd(monthStart)
    const monthEndKey = yyyyMmDd(monthEnd)
    return displayEvents.filter(event => {
      return calendarEventDayKeys(event).some(key => key >= monthStartKey && key <= monthEndKey)
    })
  }, [displayEvents, monthEnd, monthStart])

  const monthStats = useMemo(() => {
    return {
      games: monthEvents.filter(e => e.eventType === 'Game').length,
      blocks: monthEvents.filter(e => e.eventType === 'Block').length,
      admin: monthEvents.filter(e => e.eventType === 'Admin').length,
      travel: monthEvents.filter(e => e.eventType === 'Travel').length,
    }
  }, [monthEvents])

  const platformLegend = useMemo(() => {
    return Array.from(new Set(monthEvents.map(eventSourceLabel))).sort(sortPlatformLabels)
  }, [monthEvents])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return [...displayEvents]
      .filter(event => new Date(event.end) >= now)
      .sort((a, b) => (a.start < b.start ? -1 : 1))
      .slice(0, 6)
  }, [displayEvents])

  function startNew(day = selectedDay) {
    setNotice(null)
    setForm({
      id: '',
      eventType: 'Block',
      title: 'Blocked',
      startDate: day,
      startTime: '',
      endDate: day,
      endTime: '',
      allDay: true,
      notes: '',
      platformConfirmations: {},
    })
  }

  function togglePlatform(p: string) {
    setForm(prev => ({
      ...prev,
      platformConfirmations: { ...(prev.platformConfirmations ?? {}), [p]: !prev.platformConfirmations?.[p] },
    }))
  }

  async function saveBlock() {
    if (!form.startDate || !form.endDate) return
    const start = form.allDay ? new Date(`${form.startDate}T00:00:00`) : new Date(`${form.startDate}T${form.startTime || '00:00'}:00`)
    const end = form.allDay ? new Date(`${form.endDate}T23:59:00`) : new Date(`${form.endDate}T${form.endTime || '23:59'}:00`)

    const next = upsertCalendarEventIn(db, {
      id: form.id || undefined,
      eventType: form.eventType,
      title: form.title,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: form.allDay,
      notes: form.notes || undefined,
      source: 'Manual',
      status: 'Scheduled',
      platformConfirmations: form.platformConfirmations,
    })
    await write(next)
    setSelectedDay(form.startDate)
    startNew(form.startDate)
  }

  async function edit(id: string) {
    const event = db.calendarEvents.find(x => x.id === id)
    if (!event) return
    if (event.eventType === 'Game' || event.linkedGameId) {
      setNotice('Game events are managed on the Games page.')
      setSelectedDay(calendarDateKey(event.start, event.timezone))
      return
    }
    setNotice(null)
    const startDate = calendarDateKey(event.start, event.timezone)
    const endDate = calendarDateKey(event.end, event.timezone)
    setSelectedDay(startDate)
    setForm({
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      startDate,
      startTime: calendarTimeInputValue(event.start, event.timezone),
      endDate,
      endTime: calendarTimeInputValue(event.end, event.timezone),
      allDay: event.allDay,
      notes: event.notes ?? '',
      platformConfirmations: event.platformConfirmations ?? {},
    })
  }

  async function del(id: string) {
    const event = db.calendarEvents.find(x => x.id === id)
    if (!event) return
    if (!confirm(`Delete ${event.title}?`)) return
    const next = deleteCalendarEventIn(db, id)
    await write(next)
    if (form.id === id) startNew()
  }

  function moveMonth(offset: number) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1)
    setCursor(next)
  }

  function jumpToday() {
    const today = new Date()
    setCursor(today)
    setSelectedDay(yyyyMmDd(today))
  }

  return (
    <div className="grid calendar-page">
      <section className="card calendar-board-card">
        <div className="page-section-head calendar-head">
          <div>
            <h2>Calendar</h2>
            <p className="sub">Review games, blocks, travel, and admin time in one working month view.</p>
          </div>
          <div className="btnbar calendar-nav-actions">
            <button className="btn compact" onClick={() => moveMonth(-1)}>Prev</button>
            <button className="btn compact" onClick={jumpToday}>Today</button>
            <button className="btn compact" onClick={() => moveMonth(1)}>Next</button>
            <button className="btn primary" onClick={() => startNew()}>Add event</button>
          </div>
        </div>

        <div className="calendar-month-bar">
          <div>
            <span className="landing-eyebrow">{monthLabel}</span>
          </div>
          <div className="calendar-month-tools">
            <div className="calendar-stat-strip">
              <span><strong>{monthStats.games}</strong> games</span>
              <span><strong>{monthStats.blocks}</strong> blocks</span>
              <span><strong>{monthStats.admin}</strong> admin</span>
              <span><strong>{monthStats.travel}</strong> travel</span>
              {hiddenDuplicateCount ? <span><strong>{hiddenDuplicateCount}</strong> duplicates hidden</span> : null}
            </div>
            {platformLegend.length ? (
              <div className="calendar-platform-legend" aria-label="Calendar source colors">
                {platformLegend.map(source => (
                  <span key={source} className={platformClassFromSource(source)}>{source}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="calendar-shell">
          <div className="calendar-scroll" aria-label="Month calendar">
            <div className="calhead">
              {DOW.map(d => <div key={d}>{d}</div>)}
            </div>

            <div className="calendar-month-grid">
              {weeks.map(week => {
                const layout = weekBarLayout(week)
                const spanRows = layout.bars.length + (layout.hiddenCount ? 1 : 0)
                const weekStyle = {
                  '--calendar-span-rows': spanRows,
                  '--calendar-span-area': `${spanRows * 33}px`,
                } as CSSProperties
                return (
                  <div key={week.key} className="calendar-week" style={weekStyle}>
                    <div className="calendar-week-days">
                      {week.days.map(d => {
                        const ymd = yyyyMmDd(d)
                        const inMonth = d >= monthStart && d <= monthEnd
                        const allItems = eventsByDay.get(ymd) ?? []
                        const dayItems = visibleDayItems(ymd)
                        const visibleItems = dayItems.slice(0, 2)
                        const overflowCount = Math.max(0, dayItems.length - visibleItems.length)
                        const isToday = ymd === yyyyMmDd(new Date())
                        const isSelected = ymd === selectedDay
                        return (
                          <button
                            key={ymd}
                            className={`calendar-day ${inMonth ? '' : 'is-muted'} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setSelectedDay(ymd)}
                            type="button"
                          >
                            <div className="calendar-day-top">
                              <span>{d.getDate()}</span>
                              {allItems.length ? <span className="calendar-count">{allItems.length}</span> : <span />}
                            </div>
                            <div className="calendar-day-items">
                              {visibleItems.map(event => (
                                <span
                                  key={event.id}
                                  className={`calendar-chip is-${eventTone(event.eventType)} ${eventPlatformClass(event)}`}
                                  onClick={(e) => { e.stopPropagation(); void edit(event.id) }}
                                  title={`${eventSourceLabel(event)} | ${calendarEventTimeRangeLabel(event)} | ${calendarEventDisplayTitle(event)}`}
                                >
                                  <strong>{calendarEventDisplayTitle(event)}</strong>
                                  <em>{eventSourceLabel(event)} | {calendarEventTimeRangeLabel(event)}</em>
                                </span>
                              ))}
                              {overflowCount ? <span className="calendar-more">+{overflowCount} more</span> : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {layout.bars.length ? (
                      <div className="calendar-week-bars">
                        {layout.bars.map(({ event, startColumn, endColumn }) => (
                          <button
                            key={`${week.key}-${event.id}`}
                            className={`calendar-span-bar is-${eventTone(event.eventType)} ${eventPlatformClass(event)}`}
                            style={{ gridColumn: `${startColumn} / ${endColumn + 1}` }}
                            onClick={() => edit(event.id)}
                            type="button"
                            title={`${eventSourceLabel(event)} | ${calendarEventTimeRangeLabel(event)} | ${calendarEventDisplayTitle(event)}`}
                          >
                            <strong>{calendarEventDisplayTitle(event)}</strong>
                            <span>{eventSourceLabel(event)} | {calendarEventTimeRangeLabel(event)}</span>
                          </button>
                        ))}
                        {layout.hiddenCount ? <span className="calendar-more-spans">+{layout.hiddenCount} more spanning</span> : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <aside className="calendar-agenda">
            <div className="calendar-agenda-head">
              <div>
                <span className="calendar-panel-eyebrow">Selected day</span>
                <h3>{selectedDayTitle}</h3>
                <p>{selectedDay} | {selectedEvents.length ? `${selectedEvents.length} event${selectedEvents.length === 1 ? '' : 's'}` : 'No events'}</p>
              </div>
              <button className="btn compact" onClick={() => startNew(selectedDay)}>Add</button>
            </div>
            <div className="calendar-agenda-list">
              {selectedEvents.map(event => (
                <article key={event.id} className={`agenda-item is-${eventTone(event.eventType)} ${eventPlatformClass(event)}`}>
                  <div>
                    <span>{calendarEventTimeRangeLabel(event)}</span>
                    <strong>{calendarEventDisplayTitle(event)}</strong>
                    <em>{eventTypeLabel(event)} | {eventSourceLabel(event)}</em>
                  </div>
                  <div className="calendar-agenda-actions">
                    <button className="btn compact" onClick={() => edit(event.id)}>Details</button>
                    {event.eventType !== 'Game' && !event.linkedGameId ? (
                      <button className="btn compact danger" onClick={() => del(event.id)}>Delete</button>
                    ) : null}
                  </div>
                </article>
              ))}
              {selectedEvents.length === 0 ? (
                <div className="empty-state calendar-empty-day">
                  <h3>Open day</h3>
                  <p>Add blocked time, travel, or admin work here.</p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </section>

      <section className="grid cols2 calendar-side-grid">
        <section className="card calendar-editor-card">
          <h2>{form.id ? 'Edit event' : 'Add calendar event'}</h2>
          <p className="sub">Use this for blocked time, travel, and admin work. Game events come from Games.</p>
          {notice && (
            <p className="small calendar-notice">
              <span className="pill warn">{notice}</span>
              <button className="btn compact" onClick={() => navigate('/games')}>Go to Games</button>
            </p>
          )}

          <div className="row">
            <div className="field">
              <label>Type</label>
              <select value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value as EventType })}>
                <option value="Block">Block</option>
                <option value="Admin">Admin</option>
                <option value="Travel">Travel</option>
              </select>
            </div>
            <div className="field">
              <label>Title</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>All day</label>
              <select value={form.allDay ? 'Yes' : 'No'} onChange={e => setForm({ ...form, allDay: e.target.value === 'Yes' })}>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
            <div className="field">
              <label>Start date</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label>End date</label>
              <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>

          {!form.allDay && (
            <div className="row">
              <div className="field">
                <label>Start time</label>
                <input type="time" step={900} value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="field">
                <label>End time</label>
                <input type="time" step={900} value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
          )}

          <div className="field">
            <label>Assigning platform confirmations</label>
            <div className="calendar-platform-list">
              {db.settings.assigningPlatforms.map(p => (
                <label key={p} className={`platform-chip ${form.platformConfirmations?.[p] ? 'on' : 'off'}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.platformConfirmations?.[p])}
                    onChange={() => togglePlatform(p)}
                  />
                  {p}
                </label>
              ))}
              {db.settings.assigningPlatforms.length === 0 ? <span className="small">No assigning platforms configured yet.</span> : null}
            </div>
          </div>

          <div className="field">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="btnbar">
            <button className="btn primary" onClick={saveBlock} disabled={loading || !form.startDate || !form.endDate}>Save event</button>
            <button className="btn" onClick={() => startNew()} disabled={loading}>New</button>
            {form.id && <button className="btn danger" onClick={() => del(form.id)} disabled={loading}>Delete</button>}
          </div>
        </section>

        <section className="card upcoming-card">
          <h2>Upcoming</h2>
          <div className="upcoming-list">
            {upcomingEvents.map(event => (
              <button key={event.id} className={`upcoming-item is-${eventTone(event.eventType)} ${eventPlatformClass(event)}`} onClick={() => edit(event.id)} type="button">
                <span>{calendarDateKey(event.start, event.timezone)} | {eventSourceLabel(event)} | {calendarEventTimeRangeLabel(event)}</span>
                <strong>{calendarEventDisplayTitle(event)}</strong>
                <em>{event.eventType}</em>
              </button>
            ))}
            {upcomingEvents.length === 0 ? (
              <div className="empty-state">
                <h3>No upcoming calendar events</h3>
                <p>Blocks, travel, admin work, and synced games will appear here.</p>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  )
}
