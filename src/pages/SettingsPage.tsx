import { useState } from 'react'
import { useData } from '../lib/DataContext'
import { resetDB } from '../lib/storage'

function parseList(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}
function toListString(arr: string[]): string {
  return (arr ?? []).join(', ')
}

export default function SettingsPage() {
  const { mode, session, refresh, db, write, loading } = useData()

  const [home, setHome] = useState(db.settings.homeAddress)
  const [platforms, setPlatforms] = useState(toListString(db.settings.assigningPlatforms))
  const [leagues, setLeagues] = useState(toListString(db.settings.leagues))

  async function wipeLocal() {
    if (!confirm('Wipe local cache?')) return
    resetDB()
    location.reload()
  }

  async function pushLocalToCloud() {
    if (mode !== 'supabase') return
    if (!confirm('Overwrite cloud snapshot with your current local cache?')) return
    await write(db, { forceFullReplace: true })
  }

  async function saveSettings() {
    const next = {
      ...db,
      settings: {
        homeAddress: home.trim() || db.settings.homeAddress,
        assigningPlatforms: parseList(platforms),
        leagues: parseList(leagues).sort(),
      },
    }
    await write(next)
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Settings</h2>
        <p className="sub">Stuff you change once, not every time you add a game.</p>

        <div className="row">
          <div className="card" style={{flex:1}}>
            <h2>Preferences</h2>

            <div className="field">
              <label>Home address (for distance calculations)</label>
              <input value={home} onChange={e => setHome(e.target.value)} />
            </div>

            <div className="field">
              <label>Assigning platforms (comma-separated)</label>
              <input value={platforms} onChange={e => setPlatforms(e.target.value)} placeholder="DragonFly, RefQuest, ..." />
              <div className="small">Used as checkboxes on Games and Calendar blocks.</div>
            </div>

            <div className="field">
              <label>League/assignor suggestions (comma-separated)</label>
              <input value={leagues} onChange={e => setLeagues(e.target.value)} placeholder="OCC, USYS, ..." />
              <div className="small">Used as suggestions in the League field on Games. You can still type anything.</div>
            </div>

            <div className="btnbar">
              <button className="btn primary" onClick={saveSettings} disabled={loading}>Save settings</button>
              <button className="btn" onClick={refresh} disabled={loading || mode !== 'supabase'}>Refresh from cloud</button>
              <button className="btn" onClick={pushLocalToCloud} disabled={loading || mode !== 'supabase' || !session}>Push local -&gt; cloud</button>
            </div>

            <div className="footer-note">
              Distance uses <code>/api/distance</code> and requires <code>GOOGLE_MAPS_API_KEY</code> in Vercel env vars.
            </div>
          </div>

          <div className="card" style={{flex:1}}>
            <h2>Local cache</h2>
            <p className="small">Wiping local cache will not delete cloud data.</p>
            <button className="btn danger" onClick={wipeLocal}>Wipe local cache</button>
          </div>
        </div>

        <div className="footer-note">
          Default sync is incremental upserts/deletes. Use Push local to cloud only when you want a full overwrite.
        </div>
      </section>
    </div>
  )
}
