import { useCallback, useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import {
  addRequirementActivityIn,
  addRequirementDefinitionIn,
  createRequirementInstanceIn,
  deleteRequirementActivityIn,
  deleteRequirementInstanceIn,
  editRequirementInstanceIn,
  setRequirementStatusIn,
  updateRequirementActivityIn,
} from '../lib/mutate'
import { trackedSportsFor } from '../lib/preferences'
import type { RequirementActivity, RequirementDefinition, RequirementInstance, RequirementStatus } from '../lib/types'
import { yyyyMmDd } from '../lib/utils'
import { createRequirementEvidenceSignedUrl, deleteRequirementEvidence, uploadRequirementEvidence } from '../lib/documents'
import { recordPlatformEvent } from '../lib/platformEvents'

const statusOptions: RequirementStatus[] = ['Not Started', 'In Progress', 'Complete', 'Waived', 'Overdue']
const DAY_MS = 24 * 60 * 60 * 1000

type RequirementTemplate = Pick<RequirementDefinition, 'name' | 'frequency' | 'requiredCount' | 'evidenceType' | 'notes'> & {
  id: string
  governingBody?: string
}

const requirementTemplates: RequirementTemplate[] = [
  { id: 'registration', name: 'Registration', frequency: 'Season', requiredCount: 1, evidenceType: 'Document', notes: 'Track annual or seasonal registration confirmation.' },
  { id: 'dues', name: 'Dues / Payment', frequency: 'Season', requiredCount: 1, evidenceType: 'Document', notes: 'Track association, chapter, league, or platform dues.' },
  { id: 'background-check', name: 'Background Check', frequency: 'Annual', requiredCount: 1, evidenceType: 'Document', notes: 'Record completion and attach proof or reference if available.' },
  { id: 'concussion', name: 'Concussion Certificate', frequency: 'Annual', requiredCount: 1, evidenceType: 'Document', notes: 'Record certificate completion. A later credential model can reuse this across sports.' },
  { id: 'safesport', name: 'SafeSport', frequency: 'Annual', requiredCount: 1, evidenceType: 'Document', notes: 'Record SafeSport completion, certificate, or renewal reference.' },
  { id: 'rules-video', name: 'Rules Video', frequency: 'Season', requiredCount: 1, evidenceType: 'PassFail', notes: 'Track required rules video completion.' },
  { id: 'rules-test', name: 'Rules Test', frequency: 'Season', requiredCount: 1, evidenceType: 'Score', notes: 'Track test score, pass/fail result, or confirmation number.' },
  { id: 'recertification', name: 'Recertification Course', frequency: 'Annual', requiredCount: 1, evidenceType: 'Document', notes: 'Track annual or seasonal recertification coursework.' },
  { id: 'fitness', name: 'Fitness Test', frequency: 'Season', requiredCount: 1, evidenceType: 'PassFail', notes: 'Track fitness test date, result, and proof if needed.' },
  { id: 'assessment', name: 'On-field Assessment', frequency: 'Season', requiredCount: 1, evidenceType: 'Text', notes: 'Track assessment date, evaluator, result, and follow-up notes.' },
  { id: 'meetings', name: 'Local Meetings', frequency: 'Season', requiredCount: 4, evidenceType: 'Attendance', notes: 'Track each meeting as an activity instead of creating separate requirements.' },
  { id: 'clinic', name: 'Clinic', frequency: 'Season', requiredCount: 1, evidenceType: 'Attendance', notes: 'Track required clinic attendance.' },
  { id: 'membership', name: 'Membership', frequency: 'Annual', requiredCount: 1, evidenceType: 'Document', notes: 'Track membership renewal and proof.' },
  { id: 'custom', name: 'Custom requirement', frequency: 'Season', requiredCount: 1, evidenceType: 'Text', notes: '' },
]

function parseOptionalYear(input: string): number | undefined {
  const s = input.trim()
  if (!s) return undefined
  const n = Number(s)
  if (!Number.isInteger(n)) return undefined
  if (n < 1900 || n > 2100) return undefined
  return n
}

function requirementStatusBadge(status: RequirementStatus) {
  if (status === 'Complete') return { label: 'Complete', tone: 'ok' }
  if (status === 'Overdue') return { label: 'Overdue', tone: 'bad' }
  if (status === 'In Progress') return { label: 'In Progress', tone: 'warn' }
  if (status === 'Waived') return { label: 'Waived', tone: 'muted' }
  return { label: 'Not Started', tone: 'info' }
}

function addOneYear(date: string): string | undefined {
  if (!date) return undefined
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

function replaceYearText(value: string | undefined, fromYear: number | undefined, toYear: number) {
  const fallback = `Season ${toYear}`
  if (!value?.trim()) return fallback
  if (fromYear) return value.replace(String(fromYear), String(toYear))
  return `${value} ${toYear}`
}

export default function RequirementsPage() {
  const { db, write, loading, mode, session } = useData()
  const [selectedDef, setSelectedDef] = useState(db.requirementDefinitions[0]?.id ?? '')
  const [seasonName, setSeasonName] = useState('Spring 2026')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [dueDate, setDueDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    seasonName: '',
    year: '',
    dueDate: '',
    status: 'Not Started' as RequirementStatus,
  })
  const [activityFor, setActivityFor] = useState<string | null>(null)
  const [activityDraft, setActivityDraft] = useState({
    activityDate: yyyyMmDd(new Date()),
    quantity: '1',
    result: '',
    notes: '',
  })
  const [duplicateTargets, setDuplicateTargets] = useState<Record<string, { seasonName: string; year: string }>>({})
  const [selectedReadinessKey, setSelectedReadinessKey] = useState<string | null>(null)

  const [newDef, setNewDef] = useState({
    name: '',
    governingBody: '',
    sport: 'Any' as any,
    competitionLevel: 'Any' as any,
    frequency: 'Season' as any,
    requiredCount: '1',
    evidenceType: 'Attendance' as any,
    notes: '',
  })

  const defs = db.requirementDefinitions
  const hasDefinitions = defs.length > 0
  const today = yyyyMmDd(new Date())
  const sportOptions = useMemo(
    () => trackedSportsFor(db.settings.trackedSports, defs.map(d => d.sport).filter((sport): sport is string => Boolean(sport && sport !== 'Any'))),
    [db.settings.trackedSports, defs]
  )

  const instances = useMemo(() => {
    return db.requirementInstances
      .map(i => ({ i, def: defs.find(d => d.id === i.definitionId) }))
      .filter(x => x.def)
      .sort((a, b) => {
        const ad = a.i.dueDate ?? '9999-12-31'
        const bd = b.i.dueDate ?? '9999-12-31'
        if (ad !== bd) return ad < bd ? -1 : 1
        return a.i.updatedAt < b.i.updatedAt ? 1 : -1
      })
  }, [db.requirementInstances, defs])

  const activityByInstance = useMemo(() => {
    const m = new Map<string, RequirementActivity[]>()
    for (const a of db.requirementActivities) {
      m.set(a.instanceId, [...(m.get(a.instanceId) ?? []), a])
    }
    for (const [, v] of m) v.sort((a, b) => (a.activityDate < b.activityDate ? -1 : 1))
    return m
  }, [db.requirementActivities])

  const requirementStats = useMemo(() => {
    const active = instances.filter(({ i }) => i.status !== 'Complete' && i.status !== 'Waived')
    const complete = instances.filter(({ i }) => i.status === 'Complete')
    const dueSoonDate = yyyyMmDd(new Date(new Date(today).getTime() + 30 * DAY_MS))
    const dueSoon = active.filter(({ i }) => i.dueDate && i.dueDate >= today && i.dueDate <= dueSoonDate)
    const overdue = active.filter(({ i }) => i.dueDate && i.dueDate < today)
    const evidence = db.requirementActivities.filter(a => a.evidenceFileName || a.evidenceStoragePath || a.evidenceLink)
    const inProgress = active.filter(({ i }) => i.status === 'In Progress').length
    const noDueDate = active.filter(({ i }) => !i.dueDate).length
    return { active: active.length, complete: complete.length, dueSoon: dueSoon.length, overdue: overdue.length, evidence: evidence.length, inProgress, noDueDate }
  }, [db.requirementActivities, instances, today])

  const visibleStatus = useCallback((instance: RequirementInstance): RequirementStatus => {
    if (instance.status !== 'Complete' && instance.status !== 'Waived' && instance.dueDate && instance.dueDate < today) {
      return 'Overdue'
    }
    return instance.status
  }, [today])

  const readinessGroups = useMemo(() => {
    const dueSoonDate = yyyyMmDd(new Date(new Date(today).getTime() + 30 * DAY_MS))
    const groups = new Map<string, {
      key: string
      title: string
      subtitle: string
      seasonName?: string
      year?: number
      sport: string
      competitionLevel: string
      governingBody: string
      items: Array<{ i: RequirementInstance; def: RequirementDefinition }>
      total: number
      complete: number
      waived: number
      overdue: number
      dueSoon: number
      remaining: number
      noDueDate: number
      status: { label: string; tone: string }
    }>()

    for (const { i, def } of instances) {
      if (!def) continue
      const sport = def.sport && def.sport !== 'Any' ? def.sport : 'Any sport'
      const competitionLevel = def.competitionLevel && def.competitionLevel !== 'Any' ? def.competitionLevel : 'Any level'
      const governingBody = def.governingBody || 'Independent'
      const season = i.seasonName || 'Unassigned season'
      const yearLabel = i.year ? String(i.year) : 'No year'
      const key = [sport, competitionLevel, governingBody, season, yearLabel].join('::')
      const existing = groups.get(key)
      if (existing) {
        existing.items.push({ i, def })
      } else {
        groups.set(key, {
          key,
          title: `${sport} ${i.year ?? ''}`.trim(),
          subtitle: [competitionLevel, governingBody, season].filter(Boolean).join(' | '),
          seasonName: i.seasonName,
          year: i.year,
          sport,
          competitionLevel,
          governingBody,
          items: [{ i, def }],
          total: 0,
          complete: 0,
          waived: 0,
          overdue: 0,
          dueSoon: 0,
          remaining: 0,
          noDueDate: 0,
          status: { label: 'Not configured', tone: 'info' },
        })
      }
    }

    return Array.from(groups.values())
      .map((group) => {
        let complete = 0
        let waived = 0
        let overdue = 0
        let dueSoon = 0
        let noDueDate = 0
        for (const { i } of group.items) {
          const visible = visibleStatus(i)
          if (i.status === 'Complete') complete += 1
          else if (i.status === 'Waived') waived += 1
          else {
            if (!i.dueDate) noDueDate += 1
            if (visible === 'Overdue') overdue += 1
            else if (i.dueDate && i.dueDate >= today && i.dueDate <= dueSoonDate) dueSoon += 1
          }
        }
        const total = group.items.length
        const remaining = Math.max(0, total - complete - waived)
        let status = { label: `${remaining} remaining`, tone: remaining ? 'warn' : 'ok' }
        if (remaining === 0) status = { label: 'Ready to officiate', tone: 'ok' }
        else if (overdue > 0) status = { label: 'Blocked', tone: 'bad' }
        else if (dueSoon > 0) status = { label: 'Due soon', tone: 'warn' }
        else if (noDueDate > 0) status = { label: 'Needs dates', tone: 'info' }
        return { ...group, total, complete, waived, overdue, dueSoon, remaining, noDueDate, status }
      })
      .sort((a, b) => {
        const priority = (g: typeof a) => g.overdue ? 0 : g.dueSoon ? 1 : g.remaining ? 2 : 3
        const pa = priority(a)
        const pb = priority(b)
        if (pa !== pb) return pa - pb
        return a.title.localeCompare(b.title)
      })
  }, [instances, today, visibleStatus])

  const readinessStats = useMemo(() => {
    const ready = readinessGroups.filter(g => g.remaining === 0).length
    const blocked = readinessGroups.filter(g => g.overdue > 0).length
    const dueSoon = readinessGroups.filter(g => g.dueSoon > 0 && g.overdue === 0).length
    const needsAttention = readinessGroups.filter(g => g.remaining > 0).length
    return { groups: readinessGroups.length, ready, blocked, dueSoon, needsAttention }
  }, [readinessGroups])

  const selectedReadinessGroup = useMemo(
    () => readinessGroups.find(group => group.key === selectedReadinessKey) ?? null,
    [readinessGroups, selectedReadinessKey]
  )

  const displayedInstances = useMemo(() => {
    if (!selectedReadinessGroup) return instances
    const ids = new Set(selectedReadinessGroup.items.map(({ i }) => i.id))
    return instances.filter(({ i }) => ids.has(i.id))
  }, [instances, selectedReadinessGroup])

  const requirementInsights = useMemo(() => {
    return instances.flatMap(({ i, def }) => {
      if (!def) return []
      const acts = activityByInstance.get(i.id) ?? []
      const needed = def.requiredCount ?? 0
      const done = acts.reduce((s, a) => s + (a.quantity ?? 1), 0)
      const evidenceCount = acts.filter(a => a.evidenceFileName || a.evidenceStoragePath || a.evidenceLink).length
      const visible = visibleStatus(i)
      const items: Array<{ id: string; tone: string; title: string; detail: string; instanceId: string }> = []

      if (visible === 'Overdue') {
        items.push({
          id: `${i.id}:overdue`,
          tone: 'bad',
          title: `${def.name} is overdue`,
          detail: i.dueDate ? `Due ${i.dueDate}. Update the status, add activity, or adjust the due date if your records changed.` : 'This requirement is overdue.',
          instanceId: i.id,
        })
      } else if (i.dueDate) {
        const days = Math.ceil((new Date(i.dueDate).getTime() - new Date(today).getTime()) / DAY_MS)
        if (days >= 0 && days <= 30 && i.status !== 'Complete' && i.status !== 'Waived') {
          items.push({
            id: `${i.id}:due-soon`,
            tone: 'warn',
            title: `${def.name} is due soon`,
            detail: `${days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`}.`,
            instanceId: i.id,
          })
        }
      } else if (i.status !== 'Complete' && i.status !== 'Waived') {
        items.push({
          id: `${i.id}:no-due`,
          tone: 'info',
          title: `${def.name} needs a due date`,
          detail: 'Adding a due date lets Whistle Keeper surface it before it becomes a scramble.',
          instanceId: i.id,
        })
      }

      if (needed > 0 && done >= needed && i.status !== 'Complete' && i.status !== 'Waived') {
        items.push({
          id: `${i.id}:ready-complete`,
          tone: 'ok',
          title: `${def.name} appears ready to complete`,
          detail: `${done}/${needed} activities are logged. Confirm the requirement and mark it complete if appropriate.`,
          instanceId: i.id,
        })
      }

      if (def.evidenceType !== 'None' && acts.length > 0 && evidenceCount === 0 && i.status !== 'Complete' && i.status !== 'Waived') {
        items.push({
          id: `${i.id}:missing-evidence`,
          tone: 'warn',
          title: `${def.name} has no evidence attached`,
          detail: `Expected evidence type: ${def.evidenceType}. Upload a file or keep a note if external proof lives elsewhere.`,
          instanceId: i.id,
        })
      }

      return items
    }).slice(0, 6)
  }, [activityByInstance, instances, today, visibleStatus])

  async function createDefinition() {
    const name = newDef.name.trim()
    if (!name) return
    const next = addRequirementDefinitionIn(db, {
      name,
      governingBody: newDef.governingBody.trim() || undefined,
      sport: newDef.sport,
      competitionLevel: newDef.competitionLevel,
      frequency: newDef.frequency,
      requiredCount: newDef.requiredCount ? Number(newDef.requiredCount) : undefined,
      evidenceType: newDef.evidenceType,
      notes: newDef.notes.trim() || undefined,
    })
    await write(next)
    setSelectedDef(next.requirementDefinitions[0].id)
    setNewDef({
      name: '',
      governingBody: '',
      sport: 'Any' as any,
      competitionLevel: 'Any' as any,
      frequency: 'Season' as any,
      requiredCount: '1',
      evidenceType: 'Attendance' as any,
      notes: '',
    })
  }

  function applyTemplate(templateId: string) {
    const template = requirementTemplates.find(t => t.id === templateId)
    if (!template) return
    setNewDef({
      name: template.id === 'custom' ? '' : template.name,
      governingBody: template.governingBody ?? newDef.governingBody,
      sport: newDef.sport,
      competitionLevel: newDef.competitionLevel,
      frequency: template.frequency as any,
      requiredCount: String(template.requiredCount ?? 1),
      evidenceType: template.evidenceType as any,
      notes: template.notes ?? '',
    })
  }

  async function createInstance() {
    if (!selectedDef) return
    const next = createRequirementInstanceIn(db, selectedDef, seasonName || undefined, parseOptionalYear(year), dueDate || undefined)
    await write(next)
    const definition = db.requirementDefinitions.find((item) => item.id === selectedDef)
    void recordPlatformEvent(session?.access_token, 'readiness_group_created', {
      action: 'create_tracker',
      evidenceType: definition?.evidenceType ?? 'unknown',
      frequency: definition?.frequency ?? 'unknown',
      hasDueDate: Boolean(dueDate),
      hasYear: Boolean(parseOptionalYear(year)),
    })
  }

  function duplicateTargetFor(group: (typeof readinessGroups)[number]) {
    const existing = duplicateTargets[group.key]
    if (existing) return existing
    const nextYear = (group.year ?? new Date().getFullYear()) + 1
    return {
      seasonName: replaceYearText(group.seasonName, group.year, nextYear),
      year: String(nextYear),
    }
  }

  function setDuplicateTarget(groupKey: string, patch: Partial<{ seasonName: string; year: string }>) {
    const group = readinessGroups.find(g => g.key === groupKey)
    if (!group) return
    const current = duplicateTargetFor(group)
    setDuplicateTargets({ ...duplicateTargets, [groupKey]: { ...current, ...patch } })
  }

  async function duplicateReadinessGroup(group: (typeof readinessGroups)[number]) {
    const target = duplicateTargetFor(group)
    const targetYear = parseOptionalYear(target.year)
    if (!targetYear) {
      alert('Enter a valid target year before duplicating this season.')
      return
    }
    const targetSeasonName = target.seasonName.trim() || `Season ${targetYear}`
    const existingKeys = new Set(
      db.requirementInstances.map((instance) => `${instance.definitionId}:${instance.seasonName ?? ''}:${instance.year ?? ''}`)
    )
    let next = db
    let created = 0
    for (const { i } of group.items) {
      const duplicateKey = `${i.definitionId}:${targetSeasonName}:${targetYear}`
      if (existingKeys.has(duplicateKey)) continue
      next = createRequirementInstanceIn(next, i.definitionId, targetSeasonName, targetYear, i.dueDate ? addOneYear(i.dueDate) : undefined)
      existingKeys.add(duplicateKey)
      created += 1
    }
    if (!created) {
      alert('That season already has matching requirement trackers.')
      return
    }
    await write(next)
    void recordPlatformEvent(session?.access_token, 'readiness_group_created', {
      action: 'duplicate_season',
      created,
      targetYear,
    })
  }

  function groupProgressText(group: (typeof readinessGroups)[number]) {
    const completeLike = group.complete + group.waived
    return `${completeLike} of ${group.total} ready`
  }

  function groupProgressPct(group: (typeof readinessGroups)[number]) {
    if (!group.total) return 0
    return Math.round(((group.complete + group.waived) / group.total) * 100)
  }

  function startEdit(instanceId: string) {
    const inst = db.requirementInstances.find(i => i.id === instanceId)
    if (!inst) return
    setEditingId(instanceId)
    setEditDraft({
      seasonName: inst.seasonName ?? '',
      year: inst.year != null ? String(inst.year) : '',
      dueDate: inst.dueDate ?? '',
      status: inst.status,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({ seasonName: '', year: '', dueDate: '', status: 'Not Started' })
  }

  async function saveEdit(instanceId: string) {
    const next = editRequirementInstanceIn(db, instanceId, {
      seasonName: editDraft.seasonName.trim() || undefined,
      year: parseOptionalYear(editDraft.year),
      dueDate: editDraft.dueDate || undefined,
      status: editDraft.status,
    })
    await write(next)
    cancelEdit()
  }

  async function delInstance(instanceId: string) {
    if (!confirm('Delete this tracked requirement and all its activities?')) return
    const next = deleteRequirementInstanceIn(db, instanceId)
    await write(next)
    if (editingId === instanceId) cancelEdit()
  }

  async function setStatus(instanceId: string, status: RequirementStatus) {
    const next = setRequirementStatusIn(db, instanceId, status)
    await write(next)
  }

  function startActivity(instanceId: string) {
    setActivityFor(instanceId)
    setActivityDraft({ activityDate: yyyyMmDd(new Date()), quantity: '1', result: '', notes: '' })
  }

  async function saveActivity(instanceId: string) {
    if (!activityDraft.activityDate) return
    const qty = Math.max(1, Number(activityDraft.quantity || 1))
    const next = addRequirementActivityIn(db, instanceId, {
      activityDate: activityDraft.activityDate,
      quantity: Number.isFinite(qty) ? qty : 1,
      result: activityDraft.result.trim() || undefined,
      notes: activityDraft.notes.trim() || undefined,
    })
    await write(next)
    setActivityFor(null)
    setActivityDraft({ activityDate: yyyyMmDd(new Date()), quantity: '1', result: '', notes: '' })
  }

  async function delActivity(id: string) {
    const activity = db.requirementActivities.find(a => a.id === id)
    if (activity?.evidenceStoragePath && mode === 'supabase') {
      try {
        await deleteRequirementEvidence(activity.evidenceStoragePath)
      } catch (e: any) {
        alert(`Could not delete evidence file: ${String(e?.message ?? e)}`)
        return
      }
    }
    const next = deleteRequirementActivityIn(db, id)
    await write(next)
  }

  async function uploadEvidence(activityId: string, file: File | null) {
    if (!file) return
    if (mode !== 'supabase' || !session?.user?.id) {
      alert('Sign in to upload supporting files.')
      return
    }
    const activity = db.requirementActivities.find(a => a.id === activityId)
    if (!activity) return
    try {
      if (activity.evidenceStoragePath) {
        await deleteRequirementEvidence(activity.evidenceStoragePath)
      }
      const uploaded = await uploadRequirementEvidence(session.user.id, activityId, file)
      const next = updateRequirementActivityIn(db, activityId, {
        evidenceStoragePath: uploaded.path,
        evidenceFileName: uploaded.fileName,
        evidenceMimeType: uploaded.mimeType,
        evidenceSizeBytes: uploaded.sizeBytes,
      })
      await write(next)
    } catch (e: any) {
      alert(`Evidence upload failed: ${String(e?.message ?? e)}`)
    }
  }

  async function openEvidence(activityId: string) {
    const activity = db.requirementActivities.find(a => a.id === activityId)
    if (!activity) return
    try {
      if (activity.evidenceStoragePath) {
        const url = await createRequirementEvidenceSignedUrl(activity.evidenceStoragePath)
        window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      if (activity.evidenceLink) {
        window.open(activity.evidenceLink, '_blank', 'noopener,noreferrer')
      }
    } catch (e: any) {
      alert(`Could not open evidence: ${String(e?.message ?? e)}`)
    }
  }

  async function removeEvidence(activityId: string) {
    const activity = db.requirementActivities.find(a => a.id === activityId)
    if (!activity) return
    try {
      if (activity.evidenceStoragePath && mode === 'supabase') {
        await deleteRequirementEvidence(activity.evidenceStoragePath)
      }
      const next = updateRequirementActivityIn(db, activityId, {
        evidenceStoragePath: '',
        evidenceFileName: '',
        evidenceMimeType: '',
        evidenceSizeBytes: undefined,
      })
      await write(next)
    } catch (e: any) {
      alert(`Could not remove evidence: ${String(e?.message ?? e)}`)
    }
  }

  function jumpToDefinitionForm() {
    document.getElementById('requirement-definition-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function openReadinessGroup(groupKey: string) {
    setSelectedReadinessKey(groupKey)
    window.setTimeout(() => {
      document.getElementById('requirement-tracker-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function progressValue(done: number, needed: number) {
    if (!needed) return 0
    return Math.min(100, Math.round((done / needed) * 100))
  }

  function dueText(instance: RequirementInstance) {
    if (!instance.dueDate) return 'No due date'
    const days = Math.ceil((new Date(instance.dueDate).getTime() - new Date(today).getTime()) / DAY_MS)
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
    if (days === 0) return 'Due today'
    if (days <= 30) return `Due in ${days} day${days === 1 ? '' : 's'}`
    return `Due ${instance.dueDate}`
  }

  function cleanMeta(parts: Array<string | undefined>) {
    return parts.filter((part) => part && part !== 'Any').join(' | ') || 'Custom requirement'
  }

  function evidenceExpectation(def: NonNullable<(typeof instances)[number]['def']>) {
    if (def.evidenceType === 'None') return 'No evidence expected'
    return `${def.evidenceType} evidence expected`
  }

  function activityResultLabel(def: NonNullable<(typeof instances)[number]['def']>) {
    if (def.evidenceType === 'PassFail') return 'Result'
    if (def.evidenceType === 'Score') return 'Score'
    if (def.evidenceType === 'Text') return 'Text result'
    return 'Result / reference'
  }

  function evidenceControls(activity: RequirementActivity) {
    return (
      <div className="requirement-evidence-actions">
        {activity.evidenceFileName ? <span className="pill ok requirement-evidence-name">{activity.evidenceFileName}</span> : null}
        {activity.evidenceStoragePath || activity.evidenceLink ? (
          <button className="btn compact" onClick={() => openEvidence(activity.id)}>Open evidence</button>
        ) : null}
        {mode === 'supabase' && session ? (
          <label className="btn compact receipt-upload-trigger">
            Upload file
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={e => {
                const file = e.target.files?.[0] ?? null
                void uploadEvidence(activity.id, file)
                e.currentTarget.value = ''
              }}
            />
          </label>
        ) : null}
        {activity.evidenceStoragePath ? (
          <button className="btn compact" onClick={() => removeEvidence(activity.id)}>Remove file</button>
        ) : null}
        <button className="btn compact danger" onClick={() => delActivity(activity.id)}>Delete</button>
      </div>
    )
  }

  return (
    <div className="grid requirements-page">
      <section className="card requirement-overview-card">
        <div className="page-section-head">
          <div>
            <h2>Readiness</h2>
            <p className="sub">Track whether you are ready to officiate by sport, level, governing body, and season.</p>
          </div>
          <button className="btn primary" onClick={jumpToDefinitionForm}>Add requirement</button>
        </div>
        <div className="kpi compact-kpi requirement-kpi">
          <div className="box">
            <div className="label">Readiness groups</div>
            <div className="value">{readinessStats.groups}</div>
          </div>
          <div className="box">
            <div className="label">Ready</div>
            <div className="value">{readinessStats.ready}</div>
          </div>
          <div className="box">
            <div className="label">Needs attention</div>
            <div className="value">{readinessStats.needsAttention}</div>
          </div>
          <div className="box">
            <div className="label">Blocked</div>
            <div className="value">{readinessStats.blocked}</div>
          </div>
          <div className="box">
            <div className="label">Evidence files</div>
            <div className="value">{requirementStats.evidence}</div>
          </div>
        </div>
        <p className="small requirement-overview-note">
          <span className={`pill ${requirementStats.overdue ? 'bad' : 'ok'}`}>{requirementStats.overdue} overdue</span>{' '}
          <span className={`pill ${readinessStats.dueSoon ? 'warn' : 'ok'}`}>{readinessStats.dueSoon} season group{readinessStats.dueSoon === 1 ? '' : 's'} due soon</span>{' '}
          <span className={`pill ${requirementStats.noDueDate ? 'warn' : 'ok'}`}>{requirementStats.noDueDate} missing due date</span>
        </p>
      </section>

      <section className="card readiness-dashboard-card">
        <div className="page-section-head">
          <div>
            <h2>Season Readiness</h2>
            <p className="sub">Each group answers the practical question: am I cleared for this sport, level, body, and season?</p>
          </div>
          <span className={`pill ${readinessStats.blocked ? 'bad' : readinessStats.needsAttention ? 'warn' : 'ok'}`}>
            {readinessStats.blocked ? `${readinessStats.blocked} blocked` : readinessStats.needsAttention ? `${readinessStats.needsAttention} not ready` : 'Ready'}
          </span>
        </div>
        {readinessGroups.length ? (
          <div className="readiness-group-grid">
            {readinessGroups.map((group) => {
              const target = duplicateTargetFor(group)
              return (
                <article
                  key={group.key}
                  className={`readiness-group-card ${selectedReadinessKey === group.key ? 'selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openReadinessGroup(group.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openReadinessGroup(group.key)
                    }
                  }}
                  aria-label={`Open requirements for ${group.title} ${group.subtitle}`}
                >
                  <div className="readiness-group-head">
                    <div>
                      <h3>{group.title}</h3>
                      <p>{group.subtitle}</p>
                    </div>
                    <span className={`pill ${group.status.tone}`}>{group.status.label}</span>
                  </div>
                  <div className="requirement-progress-row">
                    <div>
                      <div className="small">Readiness</div>
                      <strong>{groupProgressText(group)}</strong>
                    </div>
                    <div className="requirement-progress-track" aria-label={`${groupProgressText(group)}`}>
                      <span style={{ width: `${groupProgressPct(group)}%` }} />
                    </div>
                  </div>
                  <div className="readiness-remaining-list">
                    {group.items
                      .filter(({ i }) => i.status !== 'Complete' && i.status !== 'Waived')
                      .slice(0, 4)
                      .map(({ i, def }) => (
                        <div key={i.id}>
                          <span>{def.name}</span>
                          <span className={`pill ${visibleStatus(i) === 'Overdue' ? 'bad' : i.dueDate ? 'warn' : 'info'}`}>{dueText(i)}</span>
                        </div>
                      ))}
                    {group.remaining === 0 ? <p className="small">All tracked items are complete or waived.</p> : null}
                    {group.remaining > 4 ? <p className="small">+{group.remaining - 4} more remaining</p> : null}
                  </div>
                  <div className="readiness-duplicate-panel" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <div className="expanded-label">Duplicate this season</div>
                    <div className="row">
                      <div className="field">
                        <label>New season</label>
                        <input value={target.seasonName} onChange={e => setDuplicateTarget(group.key, { seasonName: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Year</label>
                        <input type="number" min={1900} max={2100} step={1} value={target.year} onChange={e => setDuplicateTarget(group.key, { year: e.target.value })} />
                      </div>
                    </div>
                    <button className="btn compact" onClick={() => duplicateReadinessGroup(group)} disabled={loading}>Create next season</button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-state centered requirement-empty-state">
            <h3>No readiness groups yet</h3>
            <p>Add requirement trackers for a sport, level, governing body, and season. Whistle Keeper will turn them into readiness cards automatically.</p>
            <button className="btn primary" onClick={jumpToDefinitionForm}>Add first requirement</button>
          </div>
        )}
      </section>

      <section className="card requirement-attention-card">
        <div className="page-section-head">
          <div>
            <h2>Needs Attention</h2>
            <p className="sub">A quick queue of items that could block certification, season readiness, or clean recordkeeping.</p>
          </div>
          <span className={`pill ${requirementInsights.length ? 'warn' : 'ok'}`}>{requirementInsights.length} item{requirementInsights.length === 1 ? '' : 's'}</span>
        </div>
        {requirementInsights.length ? (
          <div className="requirement-insight-list">
            {requirementInsights.map((item) => (
              <div key={item.id} className="requirement-insight-row">
                <span className={`pill ${item.tone}`}>{item.tone === 'bad' ? 'Urgent' : item.tone === 'warn' ? 'Review' : item.tone === 'ok' ? 'Ready' : 'Plan'}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <button className="btn compact" onClick={() => startActivity(item.instanceId)}>Add activity</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state centered requirement-empty-state">
            <h3>Nothing urgent right now</h3>
            <p>Your tracked requirements have no overdue, due-soon, missing due date, or evidence follow-up prompts.</p>
          </div>
        )}
      </section>

      <section className="grid cols2 requirement-setup-grid">
        <div className="card">
          <h2>Add to a readiness group</h2>
          <p className="sub">Apply a reusable requirement to a specific sport season, certification year, or governing body.</p>

          {hasDefinitions ? (
            <>
              <div className="field">
                <label>Definition</label>
                <select value={selectedDef} onChange={e => setSelectedDef(e.target.value)}>
                  {defs.map(d => <option key={d.id} value={d.id}>{d.name}{d.governingBody ? ` (${d.governingBody})` : ''}</option>)}
                </select>
              </div>
              <div className="row">
                <div className="field">
                  <label>Season</label>
                  <input value={seasonName} onChange={e => setSeasonName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Year</label>
                  <input type="number" min={1900} max={2100} step={1} value={year} onChange={e => setYear(e.target.value)} />
                </div>
                <div className="field">
                  <label>Due date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <button className="btn primary" onClick={createInstance} disabled={loading || !selectedDef}>Create tracker</button>
            </>
          ) : (
            <div className="empty-state">
              <h3>No definitions yet</h3>
              <p>Create a reusable requirement first, then turn it into a season or annual tracker.</p>
              <button className="btn primary" onClick={jumpToDefinitionForm}>Create definition</button>
            </div>
          )}
        </div>

        <div className="card" id="requirement-definition-form">
          <h2>Requirement template</h2>
          <p className="sub">Start from a common official requirement, then customize it for your association or sport.</p>
          <div className="field">
            <label>Common template</label>
            <select defaultValue="" onChange={e => applyTemplate(e.target.value)}>
              <option value="" disabled>Choose a template...</option>
              {requirementTemplates.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <div className="field">
              <label>Name</label>
              <input value={newDef.name} onChange={e => setNewDef({ ...newDef, name: e.target.value })} placeholder="e.g., Rules Test, Registration, Local Meetings" />
            </div>
            <div className="field">
              <label>Governing body</label>
              <input value={newDef.governingBody} onChange={e => setNewDef({ ...newDef, governingBody: e.target.value })} placeholder="e.g., OHSAA, US Soccer, NISOA, local association" />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Sport</label>
              <select value={newDef.sport} onChange={e => setNewDef({ ...newDef, sport: e.target.value as any })}>
                <option value="Any">Any</option>
                {sportOptions.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Competition level</label>
              <select value={newDef.competitionLevel} onChange={e => setNewDef({ ...newDef, competitionLevel: e.target.value as any })}>
                <option value="Any">Any</option>
                <option value="High School">High School</option>
                <option value="College">College</option>
                <option value="Club">Club</option>
              </select>
            </div>
            <div className="field">
              <label>Frequency</label>
              <select value={newDef.frequency} onChange={e => setNewDef({ ...newDef, frequency: e.target.value as any })}>
                <option value="Season">Season</option>
                <option value="Annual">Annual</option>
                <option value="One-time">One-time</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Required count</label>
              <input type="number" min={0} value={newDef.requiredCount} onChange={e => setNewDef({ ...newDef, requiredCount: e.target.value })} />
            </div>
            <div className="field">
              <label>Evidence type</label>
              <select value={newDef.evidenceType} onChange={e => setNewDef({ ...newDef, evidenceType: e.target.value as any })}>
                <option value="Attendance">Attendance</option>
                <option value="PassFail">Pass/Fail</option>
                <option value="Score">Score</option>
                <option value="Document">Document</option>
                <option value="Text">Text</option>
                <option value="None">None</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={newDef.notes} onChange={e => setNewDef({ ...newDef, notes: e.target.value })} placeholder="Anything you want to remember about this requirement" />
          </div>
          <button className="btn primary" onClick={createDefinition} disabled={!newDef.name.trim()}>Create requirement</button>
        </div>
      </section>

      <section className="card requirement-tracker-card" id="requirement-tracker-card">
        <div className="page-section-head">
          <div>
            <h2>{selectedReadinessGroup ? selectedReadinessGroup.title : 'Tracked requirements'}</h2>
            <p className="sub">
              {selectedReadinessGroup
                ? `${selectedReadinessGroup.subtitle} | ${displayedInstances.length} requirement${displayedInstances.length === 1 ? '' : 's'}`
                : 'All tracked requirement records across every readiness group.'}
            </p>
          </div>
          {selectedReadinessGroup ? (
            <button className="btn" onClick={() => setSelectedReadinessKey(null)}>Show all requirements</button>
          ) : null}
        </div>
        <div className="requirement-card-list">
          {displayedInstances.map(({ i, def }) => {
            const acts = activityByInstance.get(i.id) ?? []
            const needed = def!.requiredCount ?? 0
            const done = acts.reduce((s, a) => s + (a.quantity ?? 1), 0)
            const progress = needed ? `${done}/${needed}` : `${done}`
            const pct = progressValue(done, needed)
            const isEditing = editingId === i.id
            const visible = visibleStatus(i)
            const badge = requirementStatusBadge(visible)
            const evidenceCount = acts.filter(a => a.evidenceFileName || a.evidenceStoragePath || a.evidenceLink).length
            const dueTone = visible === 'Overdue' ? 'bad' : i.dueDate && dueText(i).startsWith('Due in') ? 'warn' : i.dueDate ? 'ok' : 'info'

            return (
              <article key={i.id} className="requirement-card">
                <div className="requirement-card-head">
                  <div>
                    <div className="requirement-title">{def!.name}</div>
                    <div className="requirement-meta">
                      {cleanMeta([def!.governingBody, def!.frequency, def!.sport, def!.competitionLevel])}
                    </div>
                  </div>
                  <div className="requirement-card-badges">
                    <span className={`pill ${dueTone}`}>{dueText(i)}</span>
                    <span className={`pill ${badge.tone}`}>{badge.label}</span>
                  </div>
                </div>

                <div className="requirement-progress-row">
                  <div>
                    <div className="small">Progress</div>
                    <strong>{progress}</strong>
                    {needed > 0 && done >= needed && i.status !== 'Complete' ? <div className="small">Ready for review</div> : null}
                  </div>
                  <div className="requirement-progress-track" aria-label={`Progress ${progress}`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="requirement-detail-grid">
                  <div>
                    <div className="expanded-label">Season / Year</div>
                    {isEditing ? (
                      <div className="requirement-edit-grid">
                        <input value={editDraft.seasonName} onChange={e => setEditDraft({ ...editDraft, seasonName: e.target.value })} placeholder="Season" />
                        <input type="number" min={1900} max={2100} step={1} value={editDraft.year} onChange={e => setEditDraft({ ...editDraft, year: e.target.value })} placeholder="Year" />
                        <input type="date" value={editDraft.dueDate} onChange={e => setEditDraft({ ...editDraft, dueDate: e.target.value })} />
                      </div>
                    ) : (
                      <div className="expanded-value">{i.seasonName ?? 'Season not set'} {i.year ?? ''}{i.dueDate ? <div className="small">Due {i.dueDate}</div> : null}</div>
                    )}
                  </div>
                  <div>
                    <div className="expanded-label">{isEditing ? 'Status' : 'Evidence'}</div>
                    {isEditing ? (
                      <select value={editDraft.status} onChange={e => setEditDraft({ ...editDraft, status: e.target.value as RequirementStatus })}>
                        {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    ) : (
                      <div className="expanded-value">
                        {evidenceExpectation(def!)}
                        <div className="small">{evidenceCount} file/link{evidenceCount === 1 ? '' : 's'} attached</div>
                      </div>
                    )}
                  </div>
                </div>

                {def!.notes ? <p className="small requirement-notes">{def!.notes}</p> : null}

                <div className="btnbar requirement-actions">
                  {!isEditing && <button className="btn" onClick={() => startActivity(i.id)} disabled={loading}>Add activity</button>}
                  {!isEditing && <button className="btn" onClick={() => setStatus(i.id, 'In Progress')} disabled={loading}>In progress</button>}
                  {!isEditing && <button className="btn primary" onClick={() => setStatus(i.id, 'Complete')} disabled={loading}>Complete</button>}
                  {!isEditing && <button className="btn" onClick={() => startEdit(i.id)} disabled={loading}>Edit</button>}
                  {isEditing && <button className="btn primary" onClick={() => saveEdit(i.id)} disabled={loading}>Save</button>}
                  {isEditing && <button className="btn" onClick={cancelEdit} disabled={loading}>Cancel</button>}
                  <button className="btn danger" onClick={() => delInstance(i.id)} disabled={loading}>Delete</button>
                </div>

                {activityFor === i.id ? (
                  <div className="requirement-activity-form">
                    <div className="row">
                      <div className="field">
                        <label>Activity date</label>
                        <input type="date" value={activityDraft.activityDate} onChange={e => setActivityDraft({ ...activityDraft, activityDate: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Quantity / count</label>
                        <input type="number" min={1} value={activityDraft.quantity} onChange={e => setActivityDraft({ ...activityDraft, quantity: e.target.value })} />
                      </div>
                    </div>
                    {def!.evidenceType !== 'Attendance' && def!.evidenceType !== 'None' ? (
                      <div className="field">
                        <label>{activityResultLabel(def!)}</label>
                        <input value={activityDraft.result} onChange={e => setActivityDraft({ ...activityDraft, result: e.target.value })} placeholder="Pass, score, certificate ID, or reference" />
                      </div>
                    ) : null}
                    <div className="field">
                      <label>Notes</label>
                      <input value={activityDraft.notes} onChange={e => setActivityDraft({ ...activityDraft, notes: e.target.value })} placeholder="Clinic, assessment, match count, score, or reminder" />
                    </div>
                    <div className="btnbar">
                      <button className="btn primary" onClick={() => saveActivity(i.id)} disabled={loading || !activityDraft.activityDate}>Save activity</button>
                      <button className="btn" onClick={() => setActivityFor(null)} disabled={loading}>Cancel</button>
                    </div>
                  </div>
                ) : null}

                {acts.length > 0 ? (
                  <div className="requirement-activity-list">
                    <div className="expanded-label">Activities</div>
                    {acts.map(a => (
                      <div key={a.id} className="requirement-activity-row">
                        <div>
                          <strong>{a.activityDate}</strong>
                          <span>x{a.quantity}</span>
                          {a.result ? <p><b>Result:</b> {a.result}</p> : null}
                          {a.notes ? <p>{a.notes}</p> : null}
                        </div>
                        {evidenceControls(a)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="small requirement-no-activity">No activities logged yet.</p>
                )}
              </article>
            )
          })}
          {displayedInstances.length === 0 && (
            <div className="empty-state centered requirement-empty-state">
              <h3>{selectedReadinessGroup ? 'No requirements in this group' : 'No tracked requirements yet'}</h3>
              <p>
                {hasDefinitions
                  ? 'Pick a definition above and create your first tracked season so activities and document evidence have a place to live.'
                  : 'Start by creating a reusable requirement definition, then turn it into a tracked season or annual instance.'}
              </p>
              {hasDefinitions ? (
                <button className="btn primary" onClick={createInstance} disabled={loading || !selectedDef}>Create first tracker</button>
              ) : (
                <button className="btn primary" onClick={jumpToDefinitionForm}>Create a definition first</button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
