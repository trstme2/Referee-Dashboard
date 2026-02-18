import { useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import { addRequirementActivityIn, addRequirementDefinitionIn, createRequirementInstanceIn, deleteRequirementActivityIn, setRequirementStatusIn } from '../lib/mutate'
import { yyyyMmDd } from '../lib/utils'

export default function RequirementsPage() {
  const { db, write, loading } = useData()
  const [selectedDef, setSelectedDef] = useState(db.requirementDefinitions[0]?.id ?? '')
  const [seasonName, setSeasonName] = useState('Spring 2026')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [dueDate, setDueDate] = useState('')

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

  const instances = useMemo(() => {
    return db.requirementInstances
      .map(i => ({ i, def: defs.find(d => d.id === i.definitionId) }))
      .filter(x => x.def)
      .sort((a,b) => (a.i.updatedAt < b.i.updatedAt ? 1 : -1))
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
    const next = createRequirementInstanceIn(db, selectedDef, seasonName || undefined, year ? Number(year) : undefined, dueDate || undefined)
    await write(next)
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
    const next = deleteRequirementActivityIn(db, id)
    await write(next)
  }

  const activityByInstance = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const a of db.requirementActivities) {
      m.set(a.instanceId, [...(m.get(a.instanceId) ?? []), a])
    }
    for (const [k,v] of m) v.sort((a,b) => (a.activityDate < b.activityDate ? -1 : 1))
    return m
  }, [db.requirementActivities])

  return (
    <div className="grid">
      <section className="card">
        <h2>Create requirement instance</h2>
        <p className="sub">Definitions are reusable. Instances are what you track for a season/year.</p>

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
            <input value={year} onChange={e => setYear(e.target.value)} />
          </div>
          <div className="field">
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="btnbar">
          <button className="btn primary" onClick={createInstance} disabled={loading || !selectedDef}>Create</button>
        </div>
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
              const done = acts.reduce((s,a) => s + (a.quantity ?? 1), 0)
              const progress = needed ? `${done}/${needed}` : `${done}`
              return (
                <tr key={i.id}>
                  <td>
                    <div style={{fontWeight: 600}}>{def!.name}</div>
                    <div className="small">{def!.governingBody} • {def!.frequency}</div>
                    {def!.notes ? <div className="small">{def!.notes}</div> : null}
                  </td>
                  <td>{i.seasonName ?? ''} {i.year ?? ''}{i.dueDate ? <div className="small">Due {i.dueDate}</div> : null}</td>
                  <td><span className={"pill " + (i.status === 'Complete' ? 'ok' : i.status === 'Overdue' ? 'bad' : '')}>{i.status}</span></td>
                  <td>{progress}</td>
                  <td>
                    <div className="btnbar">
                      <button className="btn" onClick={() => addActivity(i.id)} disabled={loading}>Add activity</button>
                      <button className="btn" onClick={() => setStatus(i.id, 'In Progress')} disabled={loading}>In progress</button>
                      <button className="btn primary" onClick={() => setStatus(i.id, 'Complete')} disabled={loading}>Complete</button>
                    </div>
                    {acts.length > 0 && (
                      <div style={{marginTop: 10}}>
                        <div className="small">Activities:</div>
                        {acts.map(a => (
                          <div key={a.id} className="small" style={{display:'flex', gap: 8, alignItems:'center', marginTop: 6}}>
                            <span className="pill">{a.activityDate}</span>
                            <span className="pill">x{a.quantity}</span>
                            {a.notes ? <span className="small">{a.notes}</span> : null}
                            <button className="btn danger" onClick={() => delActivity(a.id)} style={{padding:'4px 8px'}}>Del</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {instances.length === 0 && <tr><td colSpan={5} className="small">No requirement instances yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <div className="card">
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
          <input value={newDef.notes} onChange={e => setNewDef({ ...newDef, notes: e.target.value })} placeholder="Anything you want to remember about this requirement…" />
        </div>
        <div className="btnbar">
          <button className="btn" onClick={createDefinition} disabled={!newDef.name.trim()}>Create requirement</button>
        </div>
        <p className="small">This creates a reusable requirement you can apply to seasons/years. Not just the two defaults.</p>
      </div>
    </div>
  )
}

