import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
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
  const { mode, session, authReady, error, db, loading } = useData()
  const requireAuth = mode === 'supabase'
  const location = useLocation()
  const authMissing = requireAuth && authReady && !session
  const authRestoring = requireAuth && !authReady
  const showLanding = authMissing && location.pathname === '/'
  const startOnboarding = !loading && authReady && Boolean(session) && shouldStartOnboarding(db)
  const protectedElement = (element: ReactNode) => {
    if (authRestoring) {
      return (
        <div className="grid">
          <section className="card">
            <h2>Checking sign-in</h2>
            <p className="small">Restoring your secure session...</p>
          </section>
        </div>
      )
    }
    return authMissing ? <Navigate to="/auth" replace /> : element
  }

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
          <Route path="/" element={authMissing ? <LandingPage /> : startOnboarding ? <Navigate to="/onboarding" replace /> : <HomePage />} />
          <Route path="/onboarding" element={protectedElement(<OnboardingPage />)} />
          <Route path="/games" element={protectedElement(<GamesPage />)} />
          <Route path="/calendar" element={protectedElement(<CalendarPage />)} />
          <Route path="/expenses" element={protectedElement(<ExpensesPage />)} />
          <Route path="/tax" element={protectedElement(<TaxPage />)} />
          <Route path="/requirements" element={protectedElement(<RequirementsPage />)} />
          <Route path="/import" element={protectedElement(<ImportPage />)} />
          <Route path="/sync" element={protectedElement(<SyncPage />)} />
          <Route path="/settings" element={protectedElement(<SettingsPage />)} />
          <Route path="/privacy" element={protectedElement(<DataPrivacyPage />)} />
          <Route path="/admin" element={protectedElement(<AdminPage />)} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  )
}
