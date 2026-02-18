import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { useData } from '../lib/DataContext'
import { addCsvImportIn, addCsvImportRowIn, rollbackImportIn, upsertCalendarEventIn, upsertGameIn } from '../lib/mutate'
import { normalizeHeader, safeNumber, toISOFromDateTime } from '../lib/utils'

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsText(file)
  })
}

function getAny(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return row[key]
  }
  return undefined
}

function getAnyPrefix(row: Record<string, any>, prefixes: string[]) {
  for (const k of Object.keys(row)) {
    const v = row[k]
    if (v == null || String(v).trim() === '') continue
    if (prefixes.some(p => k.startsWith(p))) return v
  }
  return undefined
}

function parseMoney(value: unknown): number | undefined {
  if (value == null) return undefined
  const s = String(value).replace(/[$,\s]/g, '').trim()
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function parseTimeToHHmm(value: unknown): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  if (!s) return undefined

  const match = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([aApP][mM])?$/)
  if (!match) return undefined

  let hour = Number(match[1])
  const minute = Number(match[2] ?? '00')
  const meridiem = (match[3] ?? '').toUpperCase()
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return undefined

  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined
    hour = hour % 12
    if (meridiem === 'PM') hour += 12
  } else if (hour < 0 || hour > 23) {
    return undefined
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export default function ImportPage() {
  const { db, write, loading } = useData()
  const [importType, setImportType] = useState<'Games'|'Blocks'>('Games')
  const [importSport, setImportSport] = useState<'Soccer'|'Lacrosse'>('Soccer')
  const [log, setLog] = useState<string>('')

  const imports = useMemo(() => [...db.csvImports].sort((a,b) => (a.importedAt < b.importedAt ? 1 : -1)), [db.csvImports])

  async function handleFile(file: File) {
    setLog('')
    const text = await fileToText(file)
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
    const rows = (parsed.data as any[]).filter(Boolean)

    let next = db
    next = addCsvImportIn(next, importType, file.name, rows.length)
    const importId = next.csvImports[0].id

    let imported = 0, errors = 0

    for (let idx = 0; idx < rows.length; idx++) {
      const r0 = rows[idx] ?? {}
      const r: any = {}
      for (const k of Object.keys(r0)) r[normalizeHeader(k)] = r0[k]

      try {
        if (importType === 'Blocks') {
          const title = String(r.title ?? 'Blocked')
          const sd = String(r.start_datetime ?? r.start_date ?? '').slice(0,10)
          const st = parseTimeToHHmm(r.start_time)
          const ed = String(r.end_datetime ?? r.end_date ?? sd).slice(0,10)
          const et = parseTimeToHHmm(r.end_time)
          const allDay = String(r.all_day ?? 'true').toLowerCase() === 'true'
          if (!sd) throw new Error('Missing start date')

          const startIso = allDay ? new Date(`${sd}T00:00:00`).toISOString() : toISOFromDateTime(sd, st || '00:00')
          const endIso = allDay ? new Date(`${ed}T23:59:00`).toISOString() : toISOFromDateTime(ed, et || '23:59')

          next = upsertCalendarEventIn(next, {
            eventType: 'Block',
            title,
            start: startIso,
            end: endIso,
            allDay,
            timezone: 'America/New_York',
            notes: r.notes ? String(r.notes) : undefined,
            source: 'CSV Import',
            status: 'Scheduled',
          })
          const createdId = next.calendarEvents[0]?.id
          next = addCsvImportRowIn(next, {
            importId,
            rowNumber: idx + 1,
            rawJson: r,
            status: 'Imported',
            createdCalendarEventId: createdId,
          })
          imported++
        } else {
          // Accept either the app's template headers or the yearly referee report headers.
          const rawDate = String(getAny(r, ['game_date','date','Date']) ?? '').trim()
          const gameDate = rawDate.slice(0,10)

          const league = String(getAny(r, ['league','League']) ?? '').trim()
          const levelDetail = String(getAny(r, ['level_detail','level detail','Level detail','level','Level']) ?? '').trim()
          const competitionRaw =
            getAny(r, ['competition_level','competition','competitionlevel']) ??
            getAnyPrefix(r, ['competiti'])
          const competitionFromCsv = String(competitionRaw ?? '').trim()

          const role = String(getAny(r, ['role','position','Position']) ?? '').trim()
          const locationAddress = String(getAny(r, ['location_address','location','Location','location_name']) ?? '').trim()
          const startTimeRaw = getAny(r, ['start_time','start time','time','Time'])
          const startTime = parseTimeToHHmm(startTimeRaw)
          if (startTimeRaw != null && String(startTimeRaw).trim() !== '' && !startTime) throw new Error('Invalid start time')

          const roundtripMilesRaw =
            getAny(r, ['roundtrip_mi','roundtrip_miles','roundtrip mi','Roundtrip Mi','roundtrip miles','miles','Miles']) ??
            getAnyPrefix(r, ['roundtrip'])
          const roundtripMiles = roundtripMilesRaw != null && String(roundtripMilesRaw).trim() !== '' ? safeNumber(roundtripMilesRaw, 0) : undefined

          const payRaw = getAny(r, ['pay','Pay','fee','Fee','game fee','Game fee','gamefee','game_fee'])
          const gameFee = parseMoney(payRaw) ?? (payRaw != null && String(payRaw).trim() !== '' ? safeNumber(payRaw, 0) : undefined)

          const paidConfirmedRaw =
            getAny(r, ['paid','paid_confirmed','paid confirmed','Paid confirmed']) ??
            getAnyPrefix(r, ['paid_confi'])
          const paidConfirmed = ['true','yes','y','1','paid','green'].includes(String(paidConfirmedRaw ?? '').toLowerCase())

          // Sport: use CSV sport column if present, otherwise fall back to the selector.
          const sportRaw = String(getAny(r, ['sport','Sport']) ?? '').trim()
          const sport = sportRaw ? (sportRaw.charAt(0).toUpperCase() + sportRaw.slice(1).toLowerCase()) : importSport

          if (!gameDate) throw new Error('Missing date')
          if (!locationAddress) throw new Error('Missing location')

          const competitionLevel = (() => {
            const csv = competitionFromCsv.toLowerCase()
            if (csv.includes('high') || csv.includes('hs') || csv.includes('school')) return 'High School'
            if (csv.includes('college') || csv.includes('ncaa') || csv.includes('naia') || csv.includes('juco')) return 'College'
            if (csv.includes('club') || csv.includes('adult') || csv.includes('youth')) return 'Club'

            const u = (levelDetail || '').toUpperCase()
            if (u.startsWith('VAR') || u.startsWith('JV') || u === 'MS') return 'High School'
            if (u.startsWith('COL')) return 'College'
            if (u.startsWith('ADULT') || u.startsWith('U')) return 'Club'
            return 'Club'
          })()

          const roleNorm = (() => {
            const u = role.toUpperCase()
            if (u === '2PER' || u === '2-PER' || u === 'TWO-PERSON' || u === 'DUAL') return 'Dual'
            if (u === 'CENTER') return 'Center'
            if (u === 'AR') return 'AR'
            if (u === '4TH') return '4th'
            if (u === 'LEAD') return 'Lead'
            if (u === 'REF') return 'Ref'
            return role
          })()

          next = upsertGameIn(next, {
            sport: (sport as any),
            competitionLevel: competitionLevel as any,
            league: league ? league : undefined,
            levelDetail: levelDetail ? levelDetail : undefined,
            gameDate,
            startTime,
            locationAddress,
            role: roleNorm ? roleNorm as any : undefined,
            status: 'Scheduled' as any,
            gameFee,
            paidConfirmed,
            roundtripMiles,
          })
          const createdGameId = next.games[0]?.id
          next = addCsvImportRowIn(next, {
            importId,
            rowNumber: idx + 1,
            rawJson: r,
            status: 'Imported',
            createdGameId,
          })
          imported++
        }
      } catch (e: any) {
        errors++
        next = addCsvImportRowIn(next, {
          importId,
          rowNumber: idx + 1,
          rawJson: r,
          status: 'Error',
          errorMessage: String(e?.message ?? e),
        })
      }
    }

    await write(next)
    setLog(`Imported: ${imported} | Errors: ${errors} | Total rows: ${rows.length}`)
  }

  async function rollback(importId: string) {
    const next = rollbackImportIn(db, importId)
    await write(next)
  }

  return (
    <div className="grid cols2">
      <section className="card">
        <h2>CSV Import</h2>
        <p className="sub">Import games and blocked time from CSV.</p>

        <div className="row">
          <div className="field">
            <label>Import type</label>
            <select value={importType} onChange={e => setImportType(e.target.value as any)}>
              <option value="Games">Games</option>
              <option value="Blocks">Blocks</option>
            </select>
          </div>
          {importType === 'Games' && (
            <div className="field">
              <label>Sport for this CSV</label>
              <select value={importSport} onChange={e => setImportSport(e.target.value as any)}>
                <option value="Soccer">Soccer</option>
                <option value="Lacrosse">Lacrosse</option>
              </select>
            </div>
          )}
          <div className="field">
            <label>CSV file</label>
            <input type="file" accept=".csv,text/csv" onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }} />
          </div>
        </div>

        {log && <p className="small"><span className="pill ok">{log}</span></p>}

        <div className="card" style={{marginTop: 12}}>
          <h2>Templates</h2>
          <p className="small"><b>Blocks CSV:</b> title,start_datetime,end_datetime,all_day,notes</p>
          <p className="small"><b>Games CSV (template):</b> sport,competition_level,league,level_detail,game_date,start_time,location_address,home_team,away_team,role,game_fee,paid_confirmed,paid_date,roundtrip_miles,status,notes</p>
          <p className="small"><b>Referee report headers also accepted (sport honored if present):</b> Date, League, Level, Position, Location, Roundtrip Mi, Pay</p>
          <p className="small">Dates: <code>YYYY-MM-DD</code> | Times: <code>HH:mm</code> (15-min increments)</p>
        </div>
      </section>

      <section className="card">
        <h2>Import history</h2>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Type</th><th>File</th><th>Rows</th><th></th></tr>
          </thead>
          <tbody>
            {imports.map(i => (
              <tr key={i.id}>
                <td>{new Date(i.importedAt).toLocaleString()}</td>
                <td>{i.importType}</td>
                <td>{i.fileName}</td>
                <td>{i.rowCount}</td>
                <td>
                  <button className="btn danger" onClick={() => rollback(i.id)} disabled={loading}>Rollback</button>
                </td>
              </tr>
            ))}
            {imports.length === 0 && <tr><td colSpan={5} className="small">No imports yet.</td></tr>}
          </tbody>
        </table>

        <div className="footer-note">
          Rollback removes game/events created by that import using stored import row IDs.
        </div>
      </section>
    </div>
  )
}

