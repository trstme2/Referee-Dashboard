import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import HomePage from './pages/HomePage'
import GamesPage from './pages/GamesPage'
import CalendarPage from './pages/CalendarPage'
import ExpensesPage from './pages/ExpensesPage'
import RequirementsPage from './pages/RequirementsPage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'
import AuthPage from './pages/AuthPage'
import SyncPage from './pages/SyncPage'
import { useData } from './lib/DataContext'

export default function App() {
  const { mode, session, error } = useData()
  const requireAuth = mode === 'supabase'

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          <h1>Referee Career Dashboard</h1>
          <p>Games, expenses, compliance, calendar. Humanity: still winging it.</p>
        </div>
        <Nav />
      </header>

      {error && (
        <div className="card" style={{marginTop: 14}}>
          <h2>Sync/Error</h2>
          <p className="small"><span className="pill bad">{error}</span></p>
        </div>
      )}

      <Routes>
        <Route path="/auth" element={<AuthPage />} />

        {/* Guard routes when in supabase mode */}
        <Route path="/" element={requireAuth && !session ? <Navigate to="/auth" /> : <HomePage />} />
        <Route path="/games" element={requireAuth && !session ? <Navigate to="/auth" /> : <GamesPage />} />
        <Route path="/calendar" element={requireAuth && !session ? <Navigate to="/auth" /> : <CalendarPage />} />
        <Route path="/expenses" element={requireAuth && !session ? <Navigate to="/auth" /> : <ExpensesPage />} />
        <Route path="/requirements" element={requireAuth && !session ? <Navigate to="/auth" /> : <RequirementsPage />} />
        <Route path="/import" element={requireAuth && !session ? <Navigate to="/auth" /> : <ImportPage />} />
        <Route path="/sync" element={requireAuth && !session ? <Navigate to="/auth" /> : <SyncPage />} />
        <Route path="/settings" element={requireAuth && !session ? <Navigate to="/auth" /> : <SettingsPage />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}
