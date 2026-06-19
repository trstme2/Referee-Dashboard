import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { desktopNavItems, mobilePrimaryNavItems, mobileSecondaryNavItems, routeIsInItems } from '../lib/navigation'

type NavProps = {
  variant: 'desktop' | 'mobile'
}

export default function Nav({ variant }: NavProps) {
  const { mode, session, signOut, loading } = useData()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const linkClass = ({ isActive }: { isActive: boolean }) => isActive ? 'active' : ''

  if (variant === 'desktop') {
    return (
      <nav className="nav nav-desktop">
        {desktopNavItems.map(item => (
          <NavLink key={item.path} to={item.path} className={linkClass}>{item.label}</NavLink>
        ))}
        {mode === 'supabase' && (
          <NavLink to="/auth" className={linkClass}>Account</NavLink>
        )}
        {mode === 'supabase' && session && (
          <a href="#" onClick={(e) => { e.preventDefault(); void signOut() }} title="Sign out">
            {loading ? 'Syncing...' : 'Sign out'}
          </a>
        )}
      </nav>
    )
  }

  const moreActive =
    routeIsInItems(location.pathname, mobileSecondaryNavItems) ||
    (mode === 'supabase' && location.pathname === '/auth')

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {mobilePrimaryNavItems.map(item => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>
            <span>{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`mobile-nav-link mobile-nav-more${moreOpen || moreActive ? ' active' : ''}`}
          onClick={() => setMoreOpen(open => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-nav-more-sheet"
        >
          <span>More</span>
        </button>
      </nav>

      {moreOpen ? <button type="button" className="mobile-nav-scrim" aria-label="Close navigation menu" onClick={() => setMoreOpen(false)} /> : null}

      <section
        id="mobile-nav-more-sheet"
        className={`mobile-nav-sheet${moreOpen ? ' open' : ''}`}
        aria-hidden={!moreOpen}
      >
        <div className="mobile-nav-sheet-handle" />
        <div className="mobile-nav-sheet-head">
          <div>
            <h2>More</h2>
            <p className="small">Everything outside the core bottom tabs.</p>
          </div>
          <button type="button" className="btn compact" onClick={() => setMoreOpen(false)}>Close</button>
        </div>

        <div className="mobile-nav-sheet-grid">
          {mobileSecondaryNavItems.map(item => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `mobile-sheet-link${isActive ? ' active' : ''}`}>
              <strong>{item.label}</strong>
              <span>{item.subtitle}</span>
            </NavLink>
          ))}

          {mode === 'supabase' ? (
            <NavLink to="/auth" className={({ isActive }) => `mobile-sheet-link${isActive ? ' active' : ''}`}>
              <strong>Account</strong>
              <span>Sign-in, export, and lifecycle controls.</span>
            </NavLink>
          ) : null}
        </div>

        {mode === 'supabase' && session ? (
          <div className="mobile-nav-sheet-foot">
            <button type="button" className="btn danger" onClick={() => void signOut()}>
              {loading ? 'Syncing...' : 'Sign out'}
            </button>
          </div>
        ) : null}
      </section>
    </>
  )
}
