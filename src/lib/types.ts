export type Sport = 'Soccer' | 'Lacrosse'
export type CompetitionLevel = 'High School' | 'College' | 'Club'
export type FeedPlatform = 'RefQuest' | 'DragonFly'

export type GameStatus = 'Scheduled' | 'Completed' | 'Canceled'
export type EventType = 'Game' | 'Block' | 'Admin' | 'Travel'

export type ExpenseCategory =
  | 'Mileage' | 'Gear' | 'Uniform' | 'Dues/Registration'
  | 'Tolls' | 'Parking' | 'Training' | 'Meals' | 'Lodging'
  | 'Supplies' | 'Phone/App' | 'Other'

export type RequirementStatus = 'Not Started' | 'In Progress' | 'Complete' | 'Waived' | 'Overdue'

export type SoccerRole = 'Center' | 'AR' | '4th' | 'Dual'
export type LacrosseRole = 'Lead' | 'Ref'
export type Role = SoccerRole | LacrosseRole

export interface Settings {
  homeAddress: string
  assigningPlatforms: string[]
  leagues: string[]
}

export interface Game {
  id: string
  sport: Sport
  competitionLevel: CompetitionLevel

  league?: string
  levelDetail?: string
  gameDate: string
  startTime?: string

  locationAddress: string
  distanceMiles?: number
  roundtripMiles?: number

  role?: Role
  status: GameStatus
  gameFee?: number
  paidConfirmed: boolean
  paidDate?: string

  homeTeam?: string
  awayTeam?: string
  notes?: string

  platformConfirmations: Record<string, boolean>

  calendarEventId?: string
  createdAt: string
  updatedAt: string
}

export interface CalendarEvent {
  id: string
  eventType: EventType
  title: string
  start: string
  end: string
  allDay: boolean
  timezone: string
  locationAddress?: string
  notes?: string
  source: 'Manual' | 'CSV Import'
  externalRef?: string
  status: 'Scheduled' | 'Canceled'
  linkedGameId?: string

  platformConfirmations: Record<string, boolean>

  createdAt: string
  updatedAt: string
}

export interface Expense {
  id: string
  expenseDate: string
  amount: number
  category: ExpenseCategory
  vendor?: string
  description?: string
  taxDeductible: boolean
  gameId?: string
  miles?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface RequirementDefinition {
  id: string
  name: string
  governingBody?: string
  sport?: Sport | 'Any'
  competitionLevel?: CompetitionLevel | 'Any'
  frequency: 'Season' | 'Annual' | 'One-time'
  requiredCount?: number
  evidenceType: 'None' | 'Attendance' | 'PassFail' | 'Document' | 'Score' | 'Text'
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface RequirementInstance {
  id: string
  definitionId: string
  seasonName?: string
  year?: number
  dueDate?: string
  status: RequirementStatus
  completedDate?: string
  completionNotes?: string
  createdAt: string
  updatedAt: string
}

export interface RequirementActivity {
  id: string
  instanceId: string
  activityDate: string
  quantity: number
  result?: string
  evidenceLink?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface CsvImport {
  id: string
  importType: 'Games' | 'Blocks'
  fileName: string
  importedAt: string
  rowCount: number
  notes?: string
}

export interface CsvImportRow {
  id: string
  importId: string
  rowNumber: number
  rawJson: Record<string, any>
  status: 'Imported' | 'Skipped' | 'Error'
  errorMessage?: string
  createdCalendarEventId?: string
  createdGameId?: string
}

export interface CalendarFeed {
  id: string
  platform: FeedPlatform
  name: string
  enabled: boolean
  sport?: Sport
  defaultLeague?: string
  lastSyncedAt?: string
  createdAt: string
  updatedAt: string
  maskedFeedUrl?: string
}

export interface SyncIcsResult {
  createdEvents: number
  updatedEvents: number
  createdGames: number
  updatedGames: number
  errors: string[]
}

export interface DB {
  settings: Settings
  games: Game[]
  calendarEvents: CalendarEvent[]
  expenses: Expense[]
  requirementDefinitions: RequirementDefinition[]
  requirementInstances: RequirementInstance[]
  requirementActivities: RequirementActivity[]
  csvImports: CsvImport[]
  csvImportRows: CsvImportRow[]
}
