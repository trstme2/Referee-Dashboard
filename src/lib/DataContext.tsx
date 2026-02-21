import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { DB, Settings } from './types'
import { loadDB, saveDB } from './storage'
import { supabase, supabaseConfigured } from './supabaseClient'
import type { Session } from '@supabase/supabase-js'

type DataMode = 'local' | 'supabase'
type WriteOptions = { forceFullReplace?: boolean }

type DataContextValue = {
  mode: DataMode
  session: Session | null
  db: DB
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  write: (next: DB, options?: WriteOptions) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<DataContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData must be used within DataProvider')
  return v
}

function nowISO(){ return new Date().toISOString() }

async function ensureUserSettingsRow(userId: string, settings: Settings): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const client = supabase
  const payload = settingsToRow(settings, userId)
  const { error } = await client
    .from('user_settings')
    .upsert([payload], { onConflict: 'user_id', ignoreDuplicates: true })
  if (error) throw new Error(`Ensure user_settings: ${error.message}`)
}

async function fetchAll(userId: string): Promise<DB> {
  if (!supabase) throw new Error('Supabase not configured')
  const client = supabase

  const map = {
    userSettings: 'user_settings',
    games: 'games',
    calendarEvents: 'calendar_events',
    expenses: 'expenses',
    requirementDefinitions: 'requirement_definitions',
    requirementInstances: 'requirement_instances',
    requirementActivities: 'requirement_activities',
    csvImports: 'csv_imports',
    csvImportRows: 'csv_import_rows',
  } as const

  const keys = Object.keys(map) as (keyof typeof map)[]
  const results = await Promise.all(keys.map(async (k) => {
    const t = map[k]
    const { data, error } = await client.from(t).select('*').eq('user_id', userId)
    if (error) throw new Error(`${t}: ${error.message}`)
    return [k, data ?? []] as const
  }))

  const out = loadDB()
  const byKey = Object.fromEntries(results) as any

  const settingsRow = (byKey.userSettings ?? [])[0]
  if (settingsRow) out.settings = rowToSettings(settingsRow)

  out.games = (byKey.games ?? []).map(rowToGame)
  out.calendarEvents = (byKey.calendarEvents ?? []).map(rowToCalendarEvent)
  out.expenses = (byKey.expenses ?? []).map(rowToExpense)
  out.requirementDefinitions = (byKey.requirementDefinitions ?? []).map(rowToReqDef)
  out.requirementInstances = (byKey.requirementInstances ?? []).map(rowToReqInst)
  out.requirementActivities = (byKey.requirementActivities ?? []).map(rowToReqAct)
  out.csvImports = (byKey.csvImports ?? []).map(rowToCsvImport)
  out.csvImportRows = (byKey.csvImportRows ?? []).map(rowToCsvImportRow)
  return out
}

async function replaceAll(userId: string, db: DB): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const client = supabase

  const map = {
    userSettings: 'user_settings',
    games: 'games',
    calendarEvents: 'calendar_events',
    expenses: 'expenses',
    requirementDefinitions: 'requirement_definitions',
    requirementInstances: 'requirement_instances',
    requirementActivities: 'requirement_activities',
    csvImports: 'csv_imports',
    csvImportRows: 'csv_import_rows',
  } as const

  const deleteOrder = ['csvImportRows','csvImports','requirementActivities','requirementInstances','requirementDefinitions','expenses','calendarEvents','games','userSettings'] as const
  for (const k of deleteOrder) {
    const t = (map as any)[k]
    const { error } = await client.from(t).delete().eq('user_id', userId)
    if (error) throw new Error(`Delete ${t}: ${error.message}`)
  }

  const settingsPayload = settingsToRow(db.settings, userId)
  const { error: sErr } = await client
    .from(map.userSettings)
    .upsert([settingsPayload], { onConflict: 'user_id' })
  if (sErr) throw new Error(`Insert user_settings: ${sErr.message}`)

  // Break circular FK between games.calendar_event_id and calendar_events.linked_game_id:
  // insert both tables with link columns null, then backfill links once both sides exist.
  const gameRows = toRows('games', userId, db.games as any[]) as any[]
  const calendarRows = toRows('calendarEvents', userId, db.calendarEvents as any[]) as any[]
  for (const row of gameRows) row.calendar_event_id = null
  for (const row of calendarRows) row.linked_game_id = null

  if (gameRows.length) {
    const { error } = await client.from(map.games).insert(gameRows)
    if (error) throw new Error(`Insert ${map.games}: ${error.message}`)
  }
  if (calendarRows.length) {
    const { error } = await client.from(map.calendarEvents).insert(calendarRows)
    if (error) throw new Error(`Insert ${map.calendarEvents}: ${error.message}`)
  }

  const insertOrder = ['expenses','requirementDefinitions','requirementInstances','requirementActivities','csvImports','csvImportRows'] as const
  for (const k of insertOrder) {
    const t = (map as any)[k]
    const payload = toRows(k as any, userId, (db as any)[k] ?? [])
    if (!payload.length) continue
    const { error } = await client.from(t).insert(payload)
    if (error) throw new Error(`Insert ${t}: ${error.message}`)
  }

  const gameIds = new Set(db.games.map(g => g.id))
  const calendarIds = new Set(db.calendarEvents.map(e => e.id))

  for (const g of db.games) {
    if (!g.calendarEventId) continue
    if (!calendarIds.has(g.calendarEventId)) continue
    const { error } = await client
      .from(map.games)
      .update({ calendar_event_id: g.calendarEventId })
      .eq('user_id', userId)
      .eq('id', g.id)
    if (error) throw new Error(`Link ${map.games}: ${error.message}`)
  }

  for (const e of db.calendarEvents) {
    if (!e.linkedGameId) continue
    if (!gameIds.has(e.linkedGameId)) continue
    const { error } = await client
      .from(map.calendarEvents)
      .update({ linked_game_id: e.linkedGameId })
      .eq('user_id', userId)
      .eq('id', e.id)
    if (error) throw new Error(`Link ${map.calendarEvents}: ${error.message}`)
  }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function diffById<T extends { id: string }>(prev: T[], next: T[]): { upserts: T[]; deletes: string[] } {
  const prevMap = new Map(prev.map((x) => [x.id, x]))
  const nextMap = new Map(next.map((x) => [x.id, x]))

  const upserts: T[] = []
  for (const n of next) {
    const p = prevMap.get(n.id)
    if (!p || !jsonEqual(p, n)) upserts.push(n)
  }

  const deletes: string[] = []
  for (const p of prev) {
    if (!nextMap.has(p.id)) deletes.push(p.id)
  }

  return { upserts, deletes }
}

async function syncIncremental(userId: string, prev: DB, next: DB): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const client = supabase

  const map = {
    userSettings: 'user_settings',
    games: 'games',
    calendarEvents: 'calendar_events',
    expenses: 'expenses',
    requirementDefinitions: 'requirement_definitions',
    requirementInstances: 'requirement_instances',
    requirementActivities: 'requirement_activities',
    csvImports: 'csv_imports',
    csvImportRows: 'csv_import_rows',
  } as const

  if (!jsonEqual(prev.settings, next.settings)) {
    const settingsPayload = settingsToRow(next.settings, userId)
    const { error } = await client.from(map.userSettings).upsert([settingsPayload], { onConflict: 'user_id' })
    if (error) throw new Error(`Upsert ${map.userSettings}: ${error.message}`)
  }

  const gamesDiff = diffById(prev.games, next.games)
  const calendarDiff = diffById(prev.calendarEvents, next.calendarEvents)
  const expensesDiff = diffById(prev.expenses, next.expenses)
  const reqDefsDiff = diffById(prev.requirementDefinitions, next.requirementDefinitions)
  const reqInstDiff = diffById(prev.requirementInstances, next.requirementInstances)
  const reqActsDiff = diffById(prev.requirementActivities, next.requirementActivities)
  const csvImportsDiff = diffById(prev.csvImports, next.csvImports)
  const csvRowsDiff = diffById(prev.csvImportRows, next.csvImportRows)

  const deleteByTable: Array<[string, string[]]> = [
    [map.csvImportRows, csvRowsDiff.deletes],
    [map.csvImports, csvImportsDiff.deletes],
    [map.requirementActivities, reqActsDiff.deletes],
    [map.requirementInstances, reqInstDiff.deletes],
    [map.expenses, expensesDiff.deletes],
    [map.calendarEvents, calendarDiff.deletes],
    [map.games, gamesDiff.deletes],
    [map.requirementDefinitions, reqDefsDiff.deletes],
  ]

  for (const [table, ids] of deleteByTable) {
    if (!ids.length) continue
    const { error } = await client.from(table).delete().eq('user_id', userId).in('id', ids)
    if (error) throw new Error(`Delete ${table}: ${error.message}`)
  }

  const gameRows = toRows('games', userId, gamesDiff.upserts as any[]) as any[]
  const calendarRows = toRows('calendarEvents', userId, calendarDiff.upserts as any[]) as any[]
  const gameLinks = new Map<string, string | null>(gameRows.map((r) => [r.id, r.calendar_event_id ?? null]))
  const calendarLinks = new Map<string, string | null>(calendarRows.map((r) => [r.id, r.linked_game_id ?? null]))
  for (const row of gameRows) row.calendar_event_id = null
  for (const row of calendarRows) row.linked_game_id = null

  if (gameRows.length) {
    const { error } = await client.from(map.games).upsert(gameRows, { onConflict: 'id' })
    if (error) throw new Error(`Upsert ${map.games}: ${error.message}`)
  }
  if (calendarRows.length) {
    const { error } = await client.from(map.calendarEvents).upsert(calendarRows, { onConflict: 'id' })
    if (error) throw new Error(`Upsert ${map.calendarEvents}: ${error.message}`)
  }

  for (const [id, calendarEventId] of gameLinks) {
    const { error } = await client
      .from(map.games)
      .update({ calendar_event_id: calendarEventId })
      .eq('user_id', userId)
      .eq('id', id)
    if (error) throw new Error(`Link ${map.games}: ${error.message}`)
  }
  for (const [id, linkedGameId] of calendarLinks) {
    const { error } = await client
      .from(map.calendarEvents)
      .update({ linked_game_id: linkedGameId })
      .eq('user_id', userId)
      .eq('id', id)
    if (error) throw new Error(`Link ${map.calendarEvents}: ${error.message}`)
  }

  const upsertByTable: Array<[string, any[]]> = [
    [map.requirementDefinitions, toRows('requirementDefinitions', userId, reqDefsDiff.upserts as any[])],
    [map.requirementInstances, toRows('requirementInstances', userId, reqInstDiff.upserts as any[])],
    [map.requirementActivities, toRows('requirementActivities', userId, reqActsDiff.upserts as any[])],
    [map.expenses, toRows('expenses', userId, expensesDiff.upserts as any[])],
    [map.csvImports, toRows('csvImports', userId, csvImportsDiff.upserts as any[])],
    [map.csvImportRows, toRows('csvImportRows', userId, csvRowsDiff.upserts as any[])],
  ]

  for (const [table, rows] of upsertByTable) {
    if (!rows.length) continue
    const { error } = await client.from(table).upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`Upsert ${table}: ${error.message}`)
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => loadDB())
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mode: DataMode = supabaseConfigured ? 'supabase' : 'local'
  const userId = session?.user?.id ?? null
  const settingsRef = useRef(db.settings)

  useEffect(() => {
    settingsRef.current = db.settings
  }, [db.settings])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => { sub.subscription.unsubscribe() }
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    if (mode !== 'supabase') return
    if (!userId) return
    setLoading(true)
    try {
      await ensureUserSettingsRow(userId, settingsRef.current)
      const remote = await fetchAll(userId)
      setDb(remote)
      saveDB(remote)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [mode, userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const write = useCallback(async (next: DB, options?: WriteOptions) => {
    setError(null)
    if (mode !== 'supabase' || !userId) {
      setDb(next)
      saveDB(next)
      return
    }
    setLoading(true)
    try {
      if (options?.forceFullReplace) {
        await replaceAll(userId, next)
      } else {
        await syncIncremental(userId, db, next)
      }
      setDb(next)
      saveDB(next)
    } catch (e: any) {
      setError(String(e?.message ?? e))
      throw e
    } finally {
      setLoading(false)
    }
  }, [mode, userId, db])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ mode, session, db, loading, error, refresh, write, signOut }),
    [mode, session, db, loading, error, refresh, write, signOut]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function rowToSettings(r: any): Settings {
  return {
    homeAddress: r.home_address ?? '399 S. Columbia Ave, Bexley, OH 43209',
    assigningPlatforms: Array.isArray(r.assigning_platforms) ? r.assigning_platforms : (r.assigning_platforms ?? []),
    leagues: Array.isArray(r.leagues) ? r.leagues : (r.leagues ?? []),
  }
}

function rowToGame(r: any) {
  return {
    id: r.id,
    sport: r.sport,
    competitionLevel: r.competition_level,
    league: r.league ?? undefined,
    levelDetail: r.level_detail ?? undefined,
    gameDate: String(r.game_date).slice(0,10),
    startTime: r.start_time ? String(r.start_time).slice(0,5) : undefined,
    locationAddress: r.location_address,
    distanceMiles: r.distance_miles ?? undefined,
    roundtripMiles: r.roundtrip_miles ?? undefined,
    role: r.role ?? undefined,
    status: r.status,
    gameFee: r.game_fee ?? (r.pay_expected ?? undefined),
    paidConfirmed: Boolean(r.paid_confirmed ?? false),
    paidDate: r.paid_date ? String(r.paid_date).slice(0,10) : undefined,
    homeTeam: r.home_team ?? undefined,
    awayTeam: r.away_team ?? undefined,
    notes: r.notes ?? undefined,
    platformConfirmations: r.platform_confirmations ?? {},
    calendarEventId: r.calendar_event_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToCalendarEvent(r: any) {
  return {
    id: r.id,
    eventType: r.event_type,
    title: r.title,
    start: r.start_ts,
    end: r.end_ts,
    allDay: r.all_day,
    timezone: r.timezone,
    locationAddress: r.location_address ?? undefined,
    notes: r.notes ?? undefined,
    source: r.source,
    externalRef: r.external_ref ?? undefined,
    status: r.status,
    linkedGameId: r.linked_game_id ?? undefined,
    platformConfirmations: r.platform_confirmations ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToExpense(r: any) {
  return {
    id: r.id,
    expenseDate: String(r.expense_date).slice(0,10),
    amount: Number(r.amount),
    category: r.category,
    vendor: r.vendor ?? undefined,
    description: r.description ?? undefined,
    taxDeductible: r.tax_deductible,
    gameId: r.game_id ?? undefined,
    miles: r.miles ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToReqDef(r: any) {
  return {
    id: r.id,
    name: r.name,
    governingBody: r.governing_body ?? undefined,
    sport: r.sport ?? undefined,
    competitionLevel: r.competition_level ?? undefined,
    frequency: r.frequency,
    requiredCount: r.required_count ?? undefined,
    evidenceType: r.evidence_type,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToReqInst(r: any) {
  return {
    id: r.id,
    definitionId: r.definition_id,
    seasonName: r.season_name ?? undefined,
    year: r.year ?? undefined,
    dueDate: r.due_date ? String(r.due_date).slice(0,10) : undefined,
    status: r.status,
    completedDate: r.completed_date ? String(r.completed_date).slice(0,10) : undefined,
    completionNotes: r.completion_notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToReqAct(r: any) {
  return {
    id: r.id,
    instanceId: r.instance_id,
    activityDate: String(r.activity_date).slice(0,10),
    quantity: r.quantity,
    result: r.result ?? undefined,
    evidenceLink: r.evidence_link ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToCsvImport(r: any) {
  return {
    id: r.id,
    importType: r.import_type,
    fileName: r.file_name,
    importedAt: r.imported_at,
    rowCount: r.row_count,
    notes: r.notes ?? undefined,
  }
}

function rowToCsvImportRow(r: any) {
  return {
    id: r.id,
    importId: r.import_id,
    rowNumber: r.row_number,
    rawJson: r.raw_json ?? {},
    status: r.status,
    errorMessage: r.error_message ?? undefined,
    createdCalendarEventId: r.created_calendar_event_id ?? undefined,
    createdGameId: r.created_game_id ?? undefined,
  }
}

function settingsToRow(s: Settings, userId: string) {
  return {
    user_id: userId,
    home_address: s.homeAddress,
    assigning_platforms: s.assigningPlatforms,
    leagues: s.leagues,
    updated_at: nowISO(),
  }
}

function toRows(k: keyof DB, userId: string, items: any[]): any[] {
  switch (k) {
    case 'games':
      return items.map((g: any) => ({
        id: g.id,
        user_id: userId,
        sport: g.sport,
        competition_level: g.competitionLevel,
        league: g.league || null,
        level_detail: g.levelDetail || null,
        game_date: g.gameDate,
        start_time: g.startTime || null,
        location_address: g.locationAddress,
        distance_miles: g.distanceMiles ?? null,
        roundtrip_miles: g.roundtripMiles ?? null,
        role: g.role || null,
        status: g.status,
        game_fee: g.gameFee ?? null,
        paid_confirmed: Boolean(g.paidConfirmed),
        paid_date: g.paidDate || null,
        pay_expected: null,
        home_team: g.homeTeam || null,
        away_team: g.awayTeam || null,
        notes: g.notes || null,
        platform_confirmations: g.platformConfirmations ?? {},
        calendar_event_id: g.calendarEventId || null,
        created_at: g.createdAt || nowISO(),
        updated_at: g.updatedAt || nowISO(),
      }))
    case 'calendarEvents':
      return items.map((e: any) => ({
        id: e.id,
        user_id: userId,
        event_type: e.eventType,
        title: e.title,
        start_ts: e.start,
        end_ts: e.end,
        all_day: e.allDay,
        timezone: e.timezone,
        location_address: e.locationAddress || null,
        notes: e.notes || null,
        source: e.source,
        external_ref: e.externalRef || null,
        status: e.status,
        linked_game_id: e.linkedGameId || null,
        platform_confirmations: e.platformConfirmations ?? {},
        created_at: e.createdAt || nowISO(),
        updated_at: e.updatedAt || nowISO(),
      }))
    case 'expenses':
      return items.map((e: any) => ({
        id: e.id,
        user_id: userId,
        expense_date: e.expenseDate,
        amount: e.amount,
        category: e.category,
        vendor: e.vendor || null,
        description: e.description || null,
        tax_deductible: e.taxDeductible,
        game_id: e.gameId || null,
        miles: e.miles ?? null,
        notes: e.notes || null,
        created_at: e.createdAt || nowISO(),
        updated_at: e.updatedAt || nowISO(),
      }))
    case 'requirementDefinitions':
      return items.map((d: any) => ({
        id: d.id,
        user_id: userId,
        name: d.name,
        governing_body: d.governingBody || null,
        sport: d.sport || null,
        competition_level: d.competitionLevel || null,
        frequency: d.frequency,
        required_count: d.requiredCount ?? null,
        evidence_type: d.evidenceType,
        notes: d.notes || null,
        created_at: d.createdAt || nowISO(),
        updated_at: d.updatedAt || nowISO(),
      }))
    case 'requirementInstances':
      return items.map((i: any) => ({
        id: i.id,
        user_id: userId,
        definition_id: i.definitionId,
        season_name: i.seasonName || null,
        year: i.year ?? null,
        due_date: i.dueDate || null,
        status: i.status,
        completed_date: i.completedDate || null,
        completion_notes: i.completionNotes || null,
        created_at: i.createdAt || nowISO(),
        updated_at: i.updatedAt || nowISO(),
      }))
    case 'requirementActivities':
      return items.map((a: any) => ({
        id: a.id,
        user_id: userId,
        instance_id: a.instanceId,
        activity_date: a.activityDate,
        quantity: a.quantity,
        result: a.result || null,
        evidence_link: a.evidenceLink || null,
        notes: a.notes || null,
        created_at: a.createdAt || nowISO(),
        updated_at: a.updatedAt || nowISO(),
      }))
    case 'csvImports':
      return items.map((i: any) => ({
        id: i.id,
        user_id: userId,
        import_type: i.importType,
        file_name: i.fileName,
        imported_at: i.importedAt || nowISO(),
        row_count: i.rowCount,
        notes: i.notes || null,
      }))
    case 'csvImportRows':
      return items.map((r: any) => ({
        id: r.id,
        user_id: userId,
        import_id: r.importId,
        row_number: r.rowNumber,
        raw_json: r.rawJson ?? {},
        status: r.status,
        error_message: r.errorMessage || null,
        created_calendar_event_id: r.createdCalendarEventId || null,
        created_game_id: r.createdGameId || null,
      }))
    default:
      return []
  }
}
