import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { useData } from '../lib/DataContext'
import { addCsvImportIn, addCsvImportRowIn, rollbackImportIn, upsertCalendarEventIn, upsertGameIn } from '../lib/mutate'
import { normalizeHeader, safeNumber, toISOFromDateTime } from '../lib/utils'
import type { CompetitionLevel, DB, Role, Sport } from '../lib/types'

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

type PreparedGameRow = {
  kind: 'game'
  rowNumber: number
  rawJson: Record<string, any>
  summary: string
  sport: Sport
  competitionLevel: CompetitionLevel
  league?: string
  levelDetail?: string
  gameDate: string
  startTime?: string
  locationAddress: string
  role?: Role
  gameFee?: number
  paidConfirmed: boolean
  roundtripMiles?: number
}

type PreparedBlockRow = {
  kind: 'block'
  rowNumber: number
  rawJson: Record<string, any>
  summary: string
  title: string
  start: string
  end: string
  allDay: boolean
  notes?: string
}

type ConflictRow = {
  rowNumber: number
  summary: string
  reason: string
}

type ImportPreview = {
  fileName: string
  importType: 'Games' | 'Blocks'
  totalRows: number
  readyRows: Array<PreparedGameRow | PreparedBlockRow>
  errorRows: Array<{ rowNumber: number; summary: string; error: string; rawJson: Record<string, any> }>
  conflictRows: ConflictRow[]
}

function normalizeLocationForMatch(s: string | undefined): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function locationsMatch(a: string | undefined, b: string | undefined): boolean {
  const aa = normalizeLocationForMatch(a)
  const bb = normalizeLocationForMatch(b)
  if (!aa || !bb) return false
  return aa.includes(bb) || bb.includes(aa)
}

function summarizeGameRow(gameDate: string, locationAddress: string, league?: string, startTime?: string): string {
  return [gameDate, startTime, league, locationAddress].filter(Boolean).join(' | ')
}

function summarizeBlockRow(title: string, start: string): string {
  return `${title} | ${new Date(start).toLocaleString()}`
}

function detectImportConflicts(db: DB, importType: 'Games' | 'Blocks', readyRows: Array<PreparedGameRow | PreparedBlockRow>): ConflictRow[] {
  const conflicts: ConflictRow[] = []
  const seenKeys = new Map<string, number>()

  if (importType === 'Games') {
    for (const row of readyRows as PreparedGameRow[]) {
      const key = [row.gameDate, row.startTime ?? '', normalizeLocationForMatch(row.locationAddress)].join('|')
      const duplicateRow = seenKeys.get(key)
      if (duplicateRow != null) {
        conflicts.push({
          rowNumber: row.rowNumber,
          summary: row.summary,
          reason: `Possible duplicate inside this CSV (matches row ${duplicateRow}).`,
        })
      } else {
        seenKeys.set(key, row.rowNumber)
      }

      const existingMatches = db.games.filter((g) =>
        g.gameDate === row.gameDate &&
        (g.startTime ?? '') === (row.startTime ?? '') &&
        locationsMatch(g.locationAddress, row.locationAddress) &&
        g.status !== 'Canceled'
      )

      if (existingMatches.length > 0) {
        conflicts.push({
          rowNumber: row.rowNumber,
          summary: row.summary,
          reason: `Possible duplicate of ${existingMatches.length} existing game${existingMatches.length > 1 ? 's' : ''}.`,
        })
      }
    }
  } else {
    for (const row of readyRows as PreparedBlockRow[]) {
      const key = [row.start, row.end, row.title.toLowerCase()].join('|')
      const duplicateRow = seenKeys.get(key)
      if (duplicateRow != null) {
        conflicts.push({
          rowNumber: row.rowNumber,
          summary: row.summary,
          reason: `Possible duplicate inside this CSV (matches row ${duplicateRow}).`,
        })
      } else {
        seenKeys.set(key, row.rowNumber)
      }

      const existingMatches = db.calendarEvents.filter((e) =>
        e.eventType === 'Block' &&
        e.start === row.start &&
        e.end === row.end &&
        String(e.title).trim().toLowerCase() === row.title.trim().toLowerCase() &&
        e.status !== 'Canceled'
      )

      if (existingMatches.length > 0) {
        conflicts.push({
          rowNumber: row.rowNumber,
          summary: row.summary,
          reason: `Possible duplicate of ${existingMatches.length} existing block${existingMatches.length > 1 ? 's' : ''}.`,
        })
      }
    }
  }

  return conflicts
}

export default function ImportPage() {
  const { db, write, loading } = useData()
  const [importType, setImportType] = useState<'Games'|'Blocks'>('Games')
  const [importSport, setImportSport] = useState<'Soccer'|'Lacrosse'>('Soccer')
  const [log, setLog] = useState<string>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const imports = useMemo(() => [...db.csvImports].sort((a,b) => (a.importedAt < b.importedAt ? 1 : -1)), [db.csvImports])

  async function handleFile(file: File) {
    setLog('')
    setPreview(null)
    const text = await fileToText(file)
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
    const rows = (parsed.data as any[]).filter(Boolean)
    const readyRows: Array<PreparedGameRow | PreparedBlockRow> = []
    const errorRows: Array<{ rowNumber: number; summary: string; error: string; rawJson: Record<string, any> }> = []

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
          readyRows.push({
            kind: 'block',
            rowNumber: idx + 1,
            rawJson: r,
            summary: summarizeBlockRow(title, startIso),
            title,
            start: startIso,
            end: endIso,
            allDay,
            notes: r.notes ? String(r.notes) : undefined,
          })
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
          readyRows.push({
            kind: 'game',
            rowNumber: idx + 1,
            rawJson: r,
            summary: summarizeGameRow(gameDate, locationAddress, league || undefined, startTime),
            sport: sport as Sport,
            competitionLevel: competitionLevel as CompetitionLevel,
            league: league || undefined,
            levelDetail: levelDetail || undefined,
            gameDate,
            startTime,
            locationAddress,
            role: roleNorm ? roleNorm as Role : undefined,
            gameFee,
            paidConfirmed,
            roundtripMiles,
          })
        }
      } catch (e: any) {
        errorRows.push({
          rowNumber: idx + 1,
          summary: `Row ${idx + 1}`,
          error: String(e?.message ?? e),
          rawJson: r,
        })
      }
    }

    const conflictRows = detectImportConflicts(db, importType, readyRows)
    setPreview({
      fileName: file.name,
      importType,
      totalRows: rows.length,
      readyRows,
      errorRows,
      conflictRows,
    })
  }

  async function applyPreviewImport() {
    if (!preview) return

    let next = db
    next = addCsvImportIn(next, preview.importType, preview.fileName, preview.totalRows)
    const importId = next.csvImports[0].id

    for (const row of preview.readyRows) {
      if (row.kind === 'block') {
        next = upsertCalendarEventIn(next, {
          eventType: 'Block',
          title: row.title,
          start: row.start,
          end: row.end,
          allDay: row.allDay,
          notes: row.notes,
          source: 'CSV Import',
          status: 'Scheduled',
        })
        const createdId = next.calendarEvents[0]?.id
        next = addCsvImportRowIn(next, {
          importId,
          rowNumber: row.rowNumber,
          rawJson: row.rawJson,
          status: 'Imported',
          createdCalendarEventId: createdId,
        })
        continue
      }

      next = upsertGameIn(next, {
        sport: row.sport,
        competitionLevel: row.competitionLevel,
        league: row.league,
        levelDetail: row.levelDetail,
        gameDate: row.gameDate,
        startTime: row.startTime,
        locationAddress: row.locationAddress,
        role: row.role,
        status: 'Scheduled',
        gameFee: row.gameFee,
        paidConfirmed: row.paidConfirmed,
        roundtripMiles: row.roundtripMiles,
      })
      const createdGameId = next.games[0]?.id
      next = addCsvImportRowIn(next, {
        importId,
        rowNumber: row.rowNumber,
        rawJson: row.rawJson,
        status: 'Imported',
        createdGameId,
      })
    }

    for (const row of preview.errorRows) {
      next = addCsvImportRowIn(next, {
        importId,
        rowNumber: row.rowNumber,
        rawJson: row.rawJson,
        status: 'Error',
        errorMessage: row.error,
      })
    }

    await write(next)
    setLog(`Imported: ${preview.readyRows.length} | Errors: ${preview.errorRows.length} | Conflicts flagged: ${preview.conflictRows.length} | Total rows: ${preview.totalRows}`)
    setPreview(null)
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
            <div className="small">Selecting a file now opens a review step before anything is imported.</div>
          </div>
        </div>

        {log && <p className="small"><span className="pill ok">{log}</span></p>}

        {preview && (
          <div className="card" style={{ marginTop: 12 }}>
            <h2>Import Review</h2>
            <p className="small">
              File: {preview.fileName} | Ready: {preview.readyRows.length} | Errors: {preview.errorRows.length} | Conflicts flagged: {preview.conflictRows.length}
            </p>
            {preview.conflictRows.length > 0 ? (
              <p className="small"><span className="pill warn">Review flagged rows before importing.</span></p>
            ) : (
              <p className="small"><span className="pill ok">No likely conflicts detected.</span></p>
            )}
            <div className="btnbar" style={{ marginBottom: 10 }}>
              <button className="btn primary" onClick={applyPreviewImport} disabled={loading || preview.readyRows.length === 0}>
                {loading ? 'Importing...' : 'Import Reviewed File'}
              </button>
              <button className="btn" onClick={() => setPreview(null)} disabled={loading}>Clear Review</button>
            </div>
            {preview.conflictRows.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {preview.conflictRows.slice(0, 12).map((row) => (
                  <p key={`${row.rowNumber}-${row.reason}`} className="small">
                    <span className="pill warn">Row {row.rowNumber}</span> {row.summary} | {row.reason}
                  </p>
                ))}
                {preview.conflictRows.length > 12 ? <p className="small">Showing 12 of {preview.conflictRows.length} flagged rows.</p> : null}
              </div>
            )}
            {preview.errorRows.length > 0 && (
              <div>
                {preview.errorRows.slice(0, 8).map((row) => (
                  <p key={`error-${row.rowNumber}`} className="small">
                    <span className="pill bad">Row {row.rowNumber}</span> {row.error}
                  </p>
                ))}
                {preview.errorRows.length > 8 ? <p className="small">Showing 8 of {preview.errorRows.length} error rows.</p> : null}
              </div>
            )}
          </div>
        )}

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

