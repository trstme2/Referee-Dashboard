import { useMemo, useState } from 'react'
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
import type { RequirementActivity, RequirementInstance, RequirementStatus } from '../lib/types'
import { yyyyMmDd } from '../lib/utils'
import { createRequirementEvidenceSignedUrl, deleteRequirementEvidence, uploadRequirementEvidence } from '../lib/documents'

const statusOptions: RequirementStatus[] = ['Not Started', 'In Progress', 'Complete', 'Waived', 'Overdue']

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
    notes: '',
  })

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
    const dueSoonDate = yyyyMmDd(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    const dueSoon = active.filter(({ i }) => i.dueDate && i.dueDate >= today && i.dueDate <= dueSoonDate)
    const overdue = active.filter(({ i }) => i.dueDate && i.dueDate < today)
    const evidence = db.requirementActivities.filter(a => a.evidenceFileName || a.evidenceStoragePath || a.evidenceLink)
    return { active: active.length, complete: complete.length, dueSoon: dueSoon.length, overdue: overdue.length, evidence: evidence.length }
  }, [db.requirementActivities, instances, today])

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

  async function createInstance() {
    if (!selectedDef) return
    const next = createRequirementInstanceIn(db, selectedDef, seasonName || undefined, parseOptionalYear(year), dueDate || undefined)
    await write(next)
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
    setActivityDraft({ activityDate: yyyyMmDd(new Date()), quantity: '1', notes: '' })
  }

  async function saveActivity(instanceId: string) {
    if (!activityDraft.activityDate) return
    const qty = Math.max(1, Number(activityDraft.quantity || 1))
    const next = addRequirementActivityIn(db, instanceId, {
      activityDate: activityDraft.activityDate,
      quantity: Number.isFinite(qty) ? qty : 1,
      notes: activityDraft.notes.trim() || undefined,
    })
    await write(next)
    setActivityFor(null)
    setActivityDraft({ activityDate: yyyyMmDd(new Date()), quantity: '1', notes: '' })
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

  function visibleStatus(instance: RequirementInstance): RequirementStatus {
    if (instance.status !== 'Complete' && instance.status !== 'Waived' && instance.dueDate && instance.dueDate < today) {
      return 'Overdue'
    }
    return instance.status
  }

  function progressValue(done: number, needed: number) {
    if (!needed) return 0
    return Math.min(100, Math.round((done / needed) * 100))
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
            <h2>Requirement Tracking</h2>
            <p className="sub">Stay ahead of seasons, annual renewals, activities, and supporting evidence.</p>
          </div>
          <button className="btn primary" onClick={jumpToDefinitionForm}>New requirement</button>
        </div>
        <div className="kpi compact-kpi requirement-kpi">
          <div className="box">
            <div className="label">Active</div>
            <div className="value">{requirementStats.active}</div>
          </div>
          <div className="box">
            <div className="label">Complete</div>
            <div className="value">{requirementStats.complete}</div>
          </div>
          <div className="box">
            <div className="label">Due soon</div>
            <div className="value">{requirementStats.dueSoon}</div>
          </div>
          <div className="box">
            <div className="label">Evidence files</div>
            <div className="value">{requirementStats.evidence}</div>
          </div>
        </div>
        {requirementStats.overdue > 0 ? <p className="small"><span className="pill bad">{requirementStats.overdue} overdue</span></p> : null}
      </section>

      <section className="grid cols2 requirement-setup-grid">
        <div className="card">
          <h2>Create tracked requirement</h2>
          <p className="sub">Start from a reusable definition, then track it for a season or year.</p>

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
          <h2>New requirement definition</h2>
          <p className="sub">Create the reusable rule once, then apply it to any season or year.</p>
          <div className="row">
            <div className="field">
              <label>Name</label>
              <input value={newDef.name} onChange={e => setNewDef({ ...newDef, name: e.target.value })} placeholder="e.g., Adult games minimum" />
            </div>
            <div className="field">
              <label>Governing body</label>
              <input value={newDef.governingBody} onChange={e => setNewDef({ ...newDef, governingBody: e.target.value })} placeholder="e.g., US Soccer, Local Association" />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Sport</label>
              <select value={newDef.sport} onChange={e => setNewDef({ ...newDef, sport: e.target.value as any })}>
                <option value="Any">Any</option>
                <option value="Soccer">Soccer</option>
                <option value="Lacrosse">Lacrosse</option>
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

      <section className="card requirement-tracker-card">
        <h2>Tracked requirements</h2>
        <div className="requirement-card-list">
          {instances.map(({ i, def }) => {
            const acts = activityByInstance.get(i.id) ?? []
            const needed = def!.requiredCount ?? 0
            const done = acts.reduce((s, a) => s + (a.quantity ?? 1), 0)
            const progress = needed ? `${done}/${needed}` : `${done}`
            const pct = progressValue(done, needed)
            const isEditing = editingId === i.id
            const badge = requirementStatusBadge(visibleStatus(i))

            return (
              <article key={i.id} className="requirement-card">
                <div className="requirement-card-head">
                  <div>
                    <div className="requirement-title">{def!.name}</div>
                    <div className="requirement-meta">
                      {[def!.governingBody, def!.frequency, def!.sport, def!.competitionLevel].filter(Boolean).join(' | ')}
                    </div>
                  </div>
                  <span className={`pill ${badge.tone}`}>{badge.label}</span>
                </div>

                <div className="requirement-progress-row">
                  <div>
                    <div className="small">Progress</div>
                    <strong>{progress}</strong>
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
                    <div className="expanded-label">Status</div>
                    {isEditing ? (
                      <select value={editDraft.status} onChange={e => setEditDraft({ ...editDraft, status: e.target.value as RequirementStatus })}>
                        {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    ) : (
                      <div className="expanded-value">{i.status}</div>
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
                        <label>Quantity</label>
                        <input type="number" min={1} value={activityDraft.quantity} onChange={e => setActivityDraft({ ...activityDraft, quantity: e.target.value })} />
                      </div>
                    </div>
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
          {instances.length === 0 && (
            <div className="empty-state centered requirement-empty-state">
              <h3>No tracked requirements yet</h3>
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
