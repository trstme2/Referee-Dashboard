import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
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
import AuthCallbackPage from './pages/AuthCallbackPage'
import SyncPage from './pages/SyncPage'
import TaxPage from './pages/TaxPage'
import LandingPage from './pages/LandingPage'
import RequestAccessPage from './pages/RequestAccessPage'
import OnboardingPage from './pages/OnboardingPage'
import DataPrivacyPage from './pages/DataPrivacyPage'
import AdminPage from './pages/AdminPage'
import { useData } from './lib/DataContext'
import { shouldStartOnboarding } from './lib/onboarding'
import { routeMetaForPath } from './lib/navigation'
import { errorMetadata, recordPlatformEvent, safeRoutePath } from './lib/platformEvents'
import logo from './assets/logo.png'

export default function App() {
  const { mode, session, authReady, hydrating, error, db, loading } = useData()
  const requireAuth = mode === 'supabase'
  const location = useLocation()
  const authMissing = requireAuth && authReady && !session
  const authRestoring = requireAuth && (!authReady || hydrating)
  const isPublicMarketingRoute = location.pathname === '/' || location.pathname === '/request-access'
  const showLanding = authMissing && isPublicMarketingRoute
  const isAuthRoute = location.pathname === '/auth' || location.pathname === '/auth/callback'
  const showAppShell = !showLanding && !isAuthRoute
  const onboardingRequired = !hydrating && !loading && authReady && Boolean(session) && shouldStartOnboarding(db)
  const onboardingBypassRoute = location.pathname === '/admin'
  const routeMeta = routeMetaForPath(location.pathname)

  useEffect(() => {
    if (!session?.access_token || authMissing || isAuthRoute) return
    void recordPlatformEvent(session.access_token, 'page_view', {
      route: safeRoutePath(location.pathname),
      mode,
    })
  }, [authMissing, isAuthRoute, location.pathname, mode, session?.access_token])

  useEffect(() => {
    if (!session?.access_token || authMissing) return undefined
    const route = safeRoutePath(location.pathname)
    const onError = (event: ErrorEvent) => {
      void recordPlatformEvent(session.access_token, 'client_error', errorMetadata(event.error || event.message, {
        route,
        kind: 'window_error',
      }))
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void recordPlatformEvent(session.access_token, 'client_error', errorMetadata(event.reason, {
        route,
        kind: 'unhandled_rejection',
      }))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [authMissing, location.pathname, session?.access_token])

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
    if (onboardingRequired && location.pathname !== '/onboarding' && !onboardingBypassRoute) {
      return <Navigate to="/onboarding" replace />
    }
    return authMissing ? <Navigate to="/auth" replace /> : element
  }

  return (
    <div className={showLanding ? 'landing-container' : 'container app-shell'}>
      {showAppShell && (
        <>
          <header className="topbar accent-frame app-desktop-topbar">
            <div className="brand-wrap">
              <img src={logo} alt="Whistle Keeper logo" className="brand-logo" />
              <div className="brand">
                <h1>Whistle Keeper</h1>
                <p>Keep assignments, pay, mileage, and requirements in one place.</p>
              </div>
            </div>
            <Nav variant="desktop" />
          </header>

          <header className="mobile-topbar">
            <div className="mobile-topbar-brand">
              <img src={logo} alt="Whistle Keeper logo" className="mobile-topbar-logo" />
              <div>
                <strong>{routeMeta.label}</strong>
                <span>{routeMeta.subtitle}</span>
              </div>
            </div>
            {loading ? <span className="pill warn">Syncing</span> : null}
          </header>
        </>
      )}

      {error && (
        <div className="card" style={{marginTop: 14}}>
          <h2>Sync/Error</h2>
          <p className="small"><span className="pill bad">{error}</span></p>
        </div>
      )}

      <div key={location.pathname} className={`route-shell${showAppShell ? ' app-route-shell' : ''}`}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/request-access" element={<RequestAccessPage />} />

          {/* Guard routes when in supabase mode */}
          <Route path="/" element={authMissing ? <LandingPage /> : onboardingRequired ? <Navigate to="/onboarding" replace /> : <HomePage />} />
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

      {showAppShell ? <Nav key={`mobile-${location.pathname}`} variant="mobile" /> : null}
    </div>
  )
}
