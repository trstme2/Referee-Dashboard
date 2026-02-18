import { useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import { addDays, endOfMonth, startOfMonth, yyyyMmDd } from '../lib/utils'
import { upsertCalendarEventIn, deleteCalendarEventIn } from '../lib/mutate'

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function CalendarPage() {
  const { db, write, loading } = useData()
  const [cursor, setCursor] = useState(() => new Date())
  const [form, setForm] = useState({
    id: '',
    eventType: 'Block' as any,
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

  const gridStart = useMemo(() => {
    const s = new Date(monthStart)
    s.setDate(1 - s.getDay())
    return s
  }, [monthStart])

  const days = useMemo(() => {
    const arr: Date[] = []
    for (let i=0; i<42; i++) arr.push(addDays(gridStart, i))
    return arr
  }, [gridStart])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const e of db.calendarEvents) {
      const d = yyyyMmDd(new Date(e.start))
      map.set(d, [...(map.get(d) ?? []), e])
    }
    for (const [, v] of map) v.sort((a,b) => (a.start < b.start ? -1 : 1))
    return map
  }, [db.calendarEvents])

  function startNew() {
    setForm({
      id: '',
      eventType: 'Block',
      title: 'Blocked',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      allDay: true,
      notes: '',
      platformConfirmations: {},
    })
  }

  function togglePlatform(p: string) {
    setForm(prev => ({
      ...prev,
      platformConfirmations: { ...(prev.platformConfirmations ?? {}), [p]: !prev.platformConfirmations?.[p] }
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
      timezone: 'America/New_York',
      notes: form.notes || undefined,
      source: 'Manual',
      status: 'Scheduled',
      platformConfirmations: form.platformConfirmations,
    })
    await write(next)
    startNew()
  }

  async function edit(id: string) {
    const e = db.calendarEvents.find(x => x.id === id)
    if (!e) return
    const sd = yyyyMmDd(new Date(e.start))
    const ed = yyyyMmDd(new Date(e.end))
    setForm({
      id: e.id,
      eventType: e.eventType,
      title: e.title,
      startDate: sd,
      startTime: new Date(e.start).toISOString().slice(11,16),
      endDate: ed,
      endTime: new Date(e.end).toISOString().slice(11,16),
      allDay: e.allDay,
      notes: e.notes ?? '',
      platformConfirmations: e.platformConfirmations ?? {},
    })
  }

  async function del(id: string) {
    const next = deleteCalendarEventIn(db, id)
    await write(next)
    if (form.id === id) startNew()
  }

  return (
    <div className="grid cols2">
      <section className="card">
        <h2>Calendar</h2>
        <div className="btnbar" style={{justifyContent:'space-between'}}>
          <div className="btnbar">
            <button className="btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))}>Prev</button>
            <button className="btn" onClick={() => setCursor(new Date())}>Today</button>
            <button className="btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))}>Next</button>
          </div>
          <span className="pill">{cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span>
        </div>

        <div className="calhead">
          {DOW.map(d => <div key={d}>{d}</div>)}
        </div>

        <div className="calendar">
          {days.map(d => {
            const ymd = yyyyMmDd(d)
            const inMonth = d >= monthStart && d <= monthEnd
            const items = eventsByDay.get(ymd) ?? []
            return (
              <div key={ymd} className="day" style={{opacity: inMonth ? 1 : 0.45}}>
                <div className="d">
                  <span>{d.getDate()}</span>
                  <span className="small">{items.length ? `${items.length}` : ''}</span>
                </div>
                <div className="items">
                  {items.slice(0,3).map((e:any) => (
                    <div key={e.id} className="item" onClick={() => edit(e.id)} style={{cursor:'pointer'}}>
                      <div className="t">{e.eventType}: {e.title}</div>
                      <div className="m">{new Date(e.start).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    </div>
                  ))}
                  {items.length > 3 && <div className="small">+{items.length - 3} more</div>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="footer-note">
          Games auto-create calendar events. Use this page for blocks/admin/travel and confirm you entered blocks in the assigning systems.
        </div>
      </section>

      <section className="card">
        <h2>{form.id ? 'Edit event' : 'Add block/admin'}</h2>

        <div className="row">
          <div className="field">
            <label>Type</label>
            <select value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })}>
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
              <label>Start time (15-min increments)</label>
              <input type="time" step={900} value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="field">
              <label>End time (15-min increments)</label>
              <input type="time" step={900} value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
        )}

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
          <button className="btn primary" onClick={saveBlock} disabled={loading || !form.startDate || !form.endDate}>Save</button>
          <button className="btn" onClick={startNew} disabled={loading}>New</button>
          {form.id && <button className="btn danger" onClick={() => del(form.id)} disabled={loading}>Delete</button>}
        </div>
      </section>
    </div>
  )
}
