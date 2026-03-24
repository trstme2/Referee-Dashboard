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
import type { RequirementStatus } from '../lib/types'
import { yyyyMmDd } from '../lib/utils'
import { createRequirementEvidenceSignedUrl, deleteRequirementEvidence, uploadRequirementEvidence } from '../lib/documents'

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

  const instances = useMemo(() => {
    return db.requirementInstances
      .map(i => ({ i, def: defs.find(d => d.id === i.definitionId) }))
      .filter(x => x.def)
      .sort((a, b) => (a.i.updatedAt < b.i.updatedAt ? 1 : -1))
  }, [db.requirementInstances, defs])

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
    if (!confirm('Delete this requirement instance and all its activities?')) return
    const next = deleteRequirementInstanceIn(db, instanceId)
    await write(next)
    if (editingId === instanceId) cancelEdit()
  }

  async function setStatus(instanceId: string, status: any) {
    const next = setRequirementStatusIn(db, instanceId, status)
    await write(next)
  }

  async function addActivity(instanceId: string) {
    const d = prompt('Activity date (YYYY-MM-DD):', yyyyMmDd(new Date()))
    if (!d) return
    const q = prompt('Quantity (default 1):', '1')
    const qty = q ? Math.max(1, Number(q)) : 1
    const notes = prompt('Notes (optional):', '') ?? undefined

    const next = addRequirementActivityIn(db, instanceId, { activityDate: d, quantity: qty, notes })
    await write(next)
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
      alert('File uploads require Supabase mode and a signed-in user.')
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

  const activityByInstance = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const a of db.requirementActivities) {
      m.set(a.instanceId, [...(m.get(a.instanceId) ?? []), a])
    }
    for (const [, v] of m) v.sort((a, b) => (a.activityDate < b.activityDate ? -1 : 1))
    return m
  }, [db.requirementActivities])

  function jumpToDefinitionForm() {
    document.getElementById('requirement-definition-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Create requirement instance</h2>
        <p className="sub">Definitions are reusable. Instances are what you track for a season/year.</p>

        {hasDefinitions ? (
          <>
            <div className="row">
              <div className="field">
                <label>Definition</label>
                <select value={selectedDef} onChange={e => setSelectedDef(e.target.value)}>
                  {defs.map(d => <option key={d.id} value={d.id}>{d.name} ({d.governingBody})</option>)}
                </select>
              </div>
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

            <div className="btnbar">
              <button className="btn primary" onClick={createInstance} disabled={loading || !selectedDef}>Create</button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>No requirement definitions yet</h3>
            <p>Create your first requirement below, then come back here to turn it into a season or annual tracking instance.</p>
            <div className="btnbar">
              <button className="btn primary" onClick={jumpToDefinitionForm}>Create your first requirement</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Requirement tracking</h2>

        <table className="table">
          <thead>
            <tr>
              <th>Requirement</th><th>Season/Year</th><th>Status</th><th>Progress</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map(({ i, def }) => {
              const acts = activityByInstance.get(i.id) ?? []
              const needed = def!.requiredCount ?? 0
              const done = acts.reduce((s, a) => s + (a.quantity ?? 1), 0)
              const progress = needed ? `${done}/${needed}` : `${done}`
              const isEditing = editingId === i.id
              return (
                <tr key={i.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{def!.name}</div>
                    <div className="small">{def!.governingBody} | {def!.frequency}</div>
                    {def!.notes ? <div className="small">{def!.notes}</div> : null}
                  </td>
                  <td>
                    {isEditing ? (
                      <div className="row">
                        <input value={editDraft.seasonName} onChange={e => setEditDraft({ ...editDraft, seasonName: e.target.value })} placeholder="Season" />
                        <input type="number" min={1900} max={2100} step={1} value={editDraft.year} onChange={e => setEditDraft({ ...editDraft, year: e.target.value })} placeholder="Year" />
                        <input type="date" value={editDraft.dueDate} onChange={e => setEditDraft({ ...editDraft, dueDate: e.target.value })} />
                      </div>
                    ) : (
                      <>{i.seasonName ?? ''} {i.year ?? ''}{i.dueDate ? <div className="small">Due {i.dueDate}</div> : null}</>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select value={editDraft.status} onChange={e => setEditDraft({ ...editDraft, status: e.target.value as RequirementStatus })}>
                        <option value="Not Started">Not Started</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Complete">Complete</option>
                        <option value="Waived">Waived</option>
                        <option value="Overdue">Overdue</option>
                      </select>
                    ) : (
                      <span className={`pill ${requirementStatusBadge(i.status).tone}`}>{requirementStatusBadge(i.status).label}</span>
                    )}
                  </td>
                  <td>{progress}</td>
                  <td>
                    <div className="btnbar">
                      {!isEditing && <button className="btn" onClick={() => addActivity(i.id)} disabled={loading}>Add activity</button>}
                      {!isEditing && <button className="btn" onClick={() => setStatus(i.id, 'In Progress')} disabled={loading}>In progress</button>}
                      {!isEditing && <button className="btn primary" onClick={() => setStatus(i.id, 'Complete')} disabled={loading}>Complete</button>}
                      {!isEditing && <button className="btn" onClick={() => startEdit(i.id)} disabled={loading}>Edit</button>}
                      {isEditing && <button className="btn primary" onClick={() => saveEdit(i.id)} disabled={loading}>Save</button>}
                      {isEditing && <button className="btn" onClick={cancelEdit} disabled={loading}>Cancel</button>}
                      <button className="btn danger" onClick={() => delInstance(i.id)} disabled={loading}>Delete</button>
                    </div>
                    {acts.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div className="small">Activities:</div>
                        {acts.map(a => (
                          <div key={a.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                            <span className="pill">{a.activityDate}</span>
                            <span className="pill">x{a.quantity}</span>
                            {a.notes ? <span className="small">{a.notes}</span> : null}
                            {a.evidenceFileName ? <span className="pill ok">{a.evidenceFileName}</span> : null}
                            {a.evidenceStoragePath || a.evidenceLink ? (
                              <button className="btn" onClick={() => openEvidence(a.id)} style={{ padding: '4px 8px' }}>
                                Open evidence
                              </button>
                            ) : null}
                            {mode === 'supabase' && session ? (
                              <input
                                type="file"
                                accept=".pdf,image/jpeg,image/png,image/webp"
                                onChange={e => {
                                  const file = e.target.files?.[0] ?? null
                                  void uploadEvidence(a.id, file)
                                  e.currentTarget.value = ''
                                }}
                                style={{ maxWidth: 220 }}
                              />
                            ) : null}
                            {a.evidenceStoragePath ? (
                              <button className="btn" onClick={() => removeEvidence(a.id)} style={{ padding: '4px 8px' }}>
                                Remove file
                              </button>
                            ) : null}
                            <button className="btn danger" onClick={() => delActivity(a.id)} style={{ padding: '4px 8px' }}>Del</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {instances.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  <div className="empty-state centered">
                    <h3>No requirement instances yet</h3>
                    <p>
                      {hasDefinitions
                        ? 'Pick a definition above and create your first tracked season so activities and document evidence have a place to live.'
                        : 'Start by creating a reusable requirement definition below, then turn it into a tracked season or annual instance.'}
                    </p>
                    <div className="btnbar">
                      {hasDefinitions ? (
                        <button className="btn primary" onClick={createInstance} disabled={loading || !selectedDef}>Create first instance</button>
                      ) : (
                        <button className="btn primary" onClick={jumpToDefinitionForm}>Create a definition first</button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="card" id="requirement-definition-form">
        <h2>New requirement definition</h2>
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input value={newDef.name} onChange={e => setNewDef({ ...newDef, name: e.target.value })} placeholder="e.g., Adult games minimum" />
          </div>
          <div className="field">
            <label>Governing body (optional)</label>
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
          <label>Notes (optional)</label>
          <input value={newDef.notes} onChange={e => setNewDef({ ...newDef, notes: e.target.value })} placeholder="Anything you want to remember about this requirement..." />
        </div>
        <div className="btnbar">
          <button className="btn" onClick={createDefinition} disabled={!newDef.name.trim()}>Create requirement</button>
        </div>
        <p className="small">This creates a reusable requirement you can apply to seasons/years. Not just the two defaults.</p>
        <p className="small">For document evidence, activities can upload files to Supabase Storage so they stay available after restart and on your other signed-in devices.</p>
      </div>
    </div>
  )
}
