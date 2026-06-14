import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import TaxPage from './pages/TaxPage'
import LandingPage from './pages/LandingPage'
import OnboardingPage from './pages/OnboardingPage'
import DataPrivacyPage from './pages/DataPrivacyPage'
import AdminPage from './pages/AdminPage'
import { useData } from './lib/DataContext'
import { shouldStartOnboarding } from './lib/onboarding'
import logo from './assets/logo.png'

export default function App() {
  const { mode, session, error, db, loading } = useData()
  const requireAuth = mode === 'supabase'
  const location = useLocation()
  const showLanding = requireAuth && !session && location.pathname === '/'
  const startOnboarding = !loading && Boolean(session) && shouldStartOnboarding(db)

  return (
    <div className={showLanding ? 'landing-container' : 'container'}>
      {!showLanding && (
        <header className="topbar accent-frame">
          <div className="brand-wrap">
            <img src={logo} alt="Whistle Keeper logo" className="brand-logo" />
            <div className="brand">
              <h1>Whistle Keeper</h1>
              <p>Keep assignments, pay, mileage, and requirements in one place.</p>
            </div>
          </div>
          <Nav />
        </header>
      )}

      {error && (
        <div className="card" style={{marginTop: 14}}>
          <h2>Sync/Error</h2>
          <p className="small"><span className="pill bad">{error}</span></p>
        </div>
      )}

      <div key={location.pathname} className="route-shell">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />

          {/* Guard routes when in supabase mode */}
          <Route path="/" element={requireAuth && !session ? <LandingPage /> : startOnboarding ? <Navigate to="/onboarding" replace /> : <HomePage />} />
          <Route path="/onboarding" element={requireAuth && !session ? <Navigate to="/auth" /> : <OnboardingPage />} />
          <Route path="/games" element={requireAuth && !session ? <Navigate to="/auth" /> : <GamesPage />} />
          <Route path="/calendar" element={requireAuth && !session ? <Navigate to="/auth" /> : <CalendarPage />} />
          <Route path="/expenses" element={requireAuth && !session ? <Navigate to="/auth" /> : <ExpensesPage />} />
          <Route path="/tax" element={requireAuth && !session ? <Navigate to="/auth" /> : <TaxPage />} />
          <Route path="/requirements" element={requireAuth && !session ? <Navigate to="/auth" /> : <RequirementsPage />} />
          <Route path="/import" element={requireAuth && !session ? <Navigate to="/auth" /> : <ImportPage />} />
          <Route path="/sync" element={requireAuth && !session ? <Navigate to="/auth" /> : <SyncPage />} />
          <Route path="/settings" element={requireAuth && !session ? <Navigate to="/auth" /> : <SettingsPage />} />
          <Route path="/privacy" element={requireAuth && !session ? <Navigate to="/auth" /> : <DataPrivacyPage />} />
          <Route path="/admin" element={requireAuth && !session ? <Navigate to="/auth" /> : <AdminPage />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  )
}
