import { v4 as uuid } from 'uuid'
import type { DB, CalendarEvent, Expense, Game, RequirementActivity, RequirementInstance, RequirementDefinition, CsvImport, CsvImportRow } from './types'
import { toISOFromDateTime } from './utils'

function nowISO() { return new Date().toISOString() }

function addHoursToTime(time: string, hours: number): string {
  const [hS, mS] = time.split(':')
  const h = Number(hS); const m = Number(mS)
  const total = h * 60 + m + hours * 60
  const hh = String(Math.floor((total / 60) % 24)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function normalizePlatformConfirmations(platforms: string[], current?: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const p of platforms) out[p] = Boolean(current?.[p])
  return out
}

export function upsertGameIn(db: DB, input: Partial<Game> & Pick<Game, 'sport'|'competitionLevel'|'gameDate'|'status'|'locationAddress'> & { id?: string }): DB {
  const now = nowISO()
  const id = input.id ?? uuid()
  const existing = db.games.find(g => g.id === id)

  const platformConfirmations = normalizePlatformConfirmations(
    db.settings.assigningPlatforms,
    input.platformConfirmations ?? existing?.platformConfirmations
  )

  const merged: Game = {
    id,
    sport: input.sport,
    competitionLevel: input.competitionLevel,
    league: input.league ?? existing?.league,
    gameDate: input.gameDate,
    startTime: input.startTime ?? existing?.startTime,
    locationAddress: input.locationAddress,
    distanceMiles: input.distanceMiles ?? existing?.distanceMiles,
    roundtripMiles: input.roundtripMiles ?? existing?.roundtripMiles,
    role: input.role ?? existing?.role,
    status: input.status,
    gameFee: input.gameFee ?? existing?.gameFee,
    paidConfirmed: (input.paidConfirmed ?? existing?.paidConfirmed) ?? false,
    paidDate: input.paidDate ?? existing?.paidDate,
    homeTeam: input.homeTeam ?? existing?.homeTeam,
    awayTeam: input.awayTeam ?? existing?.awayTeam,
    notes: input.notes ?? existing?.notes,
    platformConfirmations,
    calendarEventId: existing?.calendarEventId ?? input.calendarEventId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  let next: DB = { ...db, games: existing ? db.games.map(g => g.id===id ? merged : g) : [merged, ...db.games] }

  if (merged.status !== 'Canceled') {
    const title = `${merged.sport} (${merged.competitionLevel})${merged.homeTeam && merged.awayTeam ? `: ${merged.homeTeam} vs ${merged.awayTeam}` : ''}`
    const st = merged.startTime ?? '17:00'
    const endT = addHoursToTime(st, 2)
    const startIso = toISOFromDateTime(merged.gameDate, st)
    const endIso = toISOFromDateTime(merged.gameDate, endT)

    const ceId = merged.calendarEventId ?? uuid()
    const existingCe = next.calendarEvents.find(e => e.id === ceId)

    const ce: CalendarEvent = {
      id: ceId,
      eventType: 'Game',
      title,
      start: startIso,
      end: endIso,
      allDay: false,
      timezone: 'America/New_York',
      locationAddress: merged.locationAddress,
      notes: merged.notes,
      source: existingCe?.source ?? 'Manual',
      externalRef: existingCe?.externalRef,
      status: 'Scheduled',
      linkedGameId: merged.id,
      platformConfirmations: normalizePlatformConfirmations(db.settings.assigningPlatforms, existingCe?.platformConfirmations),
      createdAt: existingCe?.createdAt ?? now,
      updatedAt: now,
    }

    next = {
      ...next,
      calendarEvents: existingCe ? next.calendarEvents.map(e => e.id===ceId ? ce : e) : [ce, ...next.calendarEvents],
      games: next.games.map(g => g.id===id ? { ...g, calendarEventId: ceId } : g),
    }
  }

  if (merged.league) {
    const s = merged.league.trim()
    if (s && !next.settings.leagues.includes(s)) {
      next = { ...next, settings: { ...next.settings, leagues: [...next.settings.leagues, s].sort() } }
    }
  }

  return next
}

export function deleteGameIn(db: DB, gameId: string): DB {
  const g = db.games.find(x => x.id === gameId)
  let next: DB = { ...db, games: db.games.filter(x => x.id !== gameId) }
  if (g?.calendarEventId) next = { ...next, calendarEvents: next.calendarEvents.filter(e => e.id !== g.calendarEventId) }
  return next
}

export function upsertCalendarEventIn(db: DB, input: Partial<CalendarEvent> & Pick<CalendarEvent, 'eventType'|'title'|'start'|'end'|'allDay'|'timezone'|'source'|'status'> & { id?: string }): DB {
  const now = nowISO()
  const id = input.id ?? uuid()
  const existing = db.calendarEvents.find(e => e.id === id)

  const platformConfirmations = normalizePlatformConfirmations(
    db.settings.assigningPlatforms,
    input.platformConfirmations ?? existing?.platformConfirmations
  )

  const merged: CalendarEvent = {
    id,
    eventType: input.eventType,
    title: input.title,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    timezone: input.timezone,
    locationAddress: input.locationAddress ?? existing?.locationAddress,
    notes: input.notes ?? existing?.notes,
    source: input.source,
    externalRef: input.externalRef ?? existing?.externalRef,
    status: input.status,
    linkedGameId: input.linkedGameId ?? existing?.linkedGameId,
    platformConfirmations,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  return { ...db, calendarEvents: existing ? db.calendarEvents.map(e => e.id===id ? merged : e) : [merged, ...db.calendarEvents] }
}

export function deleteCalendarEventIn(db: DB, id: string): DB {
  const ev = db.calendarEvents.find(e => e.id === id)
  let next: DB = { ...db, calendarEvents: db.calendarEvents.filter(e => e.id !== id) }
  if (ev?.linkedGameId) next = { ...next, games: next.games.map(g => g.id === ev.linkedGameId ? { ...g, calendarEventId: undefined } : g) }
  return next
}

export function upsertExpenseIn(db: DB, input: Partial<Expense> & Pick<Expense, 'expenseDate'|'amount'|'category'|'taxDeductible'> & { id?: string }): DB {
  const now = nowISO()
  const id = input.id ?? uuid()
  const existing = db.expenses.find(e => e.id === id)
  const merged: Expense = {
    id,
    expenseDate: input.expenseDate,
    amount: input.amount,
    category: input.category,
    vendor: input.vendor,
    description: input.description,
    taxDeductible: input.taxDeductible,
    gameId: input.gameId,
    miles: input.miles,
    notes: input.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  return { ...db, expenses: existing ? db.expenses.map(e => e.id===id ? merged : e) : [merged, ...db.expenses] }
}

export function deleteExpenseIn(db: DB, id: string): DB { return { ...db, expenses: db.expenses.filter(e => e.id !== id) } }


export function addRequirementDefinitionIn(db: DB, input: Omit<RequirementDefinition,'id'|'createdAt'|'updatedAt'>): DB {
  const now = nowISO()
  const def: RequirementDefinition = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    ...input,
  }
  return {
    ...db,
    requirementDefinitions: [def, ...db.requirementDefinitions],
  }
}

export function createRequirementInstanceIn(db: DB, definitionId: string, seasonName?: string, year?: number, dueDate?: string): DB {
  const now = nowISO()
  const inst: RequirementInstance = { id: uuid(), definitionId, seasonName, year, dueDate, status: 'Not Started', createdAt: now, updatedAt: now }
  return { ...db, requirementInstances: [inst, ...db.requirementInstances] }
}

export function setRequirementStatusIn(db: DB, instanceId: string, status: RequirementInstance['status'], completedDate?: string, completionNotes?: string): DB {
  const now = nowISO()
  const today = new Date().toISOString().slice(0,10)
  return {
    ...db,
    requirementInstances: db.requirementInstances.map(i => i.id===instanceId ? ({
      ...i,
      status,
      completedDate: completedDate ?? (status === 'Complete' ? today : i.completedDate),
      completionNotes,
      updatedAt: now,
    }) : i)
  }
}

export function addRequirementActivityIn(db: DB, instanceId: string, activity: Omit<RequirementActivity, 'id'|'instanceId'|'createdAt'|'updatedAt'>): DB {
  const now = nowISO()
  const a: RequirementActivity = { id: uuid(), instanceId, ...activity, createdAt: now, updatedAt: now }
  return { ...db, requirementActivities: [a, ...db.requirementActivities] }
}
export function deleteRequirementActivityIn(db: DB, id: string): DB {
  return { ...db, requirementActivities: db.requirementActivities.filter(a => a.id !== id) }
}

export function addCsvImportIn(db: DB, importType: CsvImport['importType'], fileName: string, rowCount: number, notes?: string): DB {
  const imp: CsvImport = { id: uuid(), importType, fileName, importedAt: nowISO(), rowCount, notes }
  return { ...db, csvImports: [imp, ...db.csvImports] }
}
export function addCsvImportRowIn(db: DB, row: Omit<CsvImportRow,'id'>): DB {
  const r: CsvImportRow = { id: uuid(), ...row }
  return { ...db, csvImportRows: [r, ...db.csvImportRows] }
}
export function rollbackImportIn(db: DB, importId: string): DB {
  const rows = db.csvImportRows.filter(r => r.importId === importId)
  const gameIds = rows.map(r => r.createdGameId).filter(Boolean) as string[]
  const eventIds = rows.map(r => r.createdCalendarEventId).filter(Boolean) as string[]
  return {
    ...db,
    games: db.games.filter(g => !gameIds.includes(g.id)),
    calendarEvents: db.calendarEvents.filter(e => !eventIds.includes(e.id)),
    csvImportRows: db.csvImportRows.filter(r => r.importId !== importId),
    csvImports: db.csvImports.filter(i => i.id !== importId),
  }
}
