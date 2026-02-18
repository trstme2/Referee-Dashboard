import { NavLink } from 'react-router-dom'
import { useData } from '../lib/DataContext'

export default function Nav() {
  const { mode, session, signOut, loading } = useData()
  const linkClass = ({ isActive }: { isActive: boolean }) => isActive ? 'active' : ''
  return (
    <nav className="nav">
      <NavLink to="/" className={linkClass}>Home</NavLink>
      <NavLink to="/games" className={linkClass}>Games</NavLink>
      <NavLink to="/calendar" className={linkClass}>Calendar</NavLink>
      <NavLink to="/expenses" className={linkClass}>Expenses</NavLink>
      <NavLink to="/requirements" className={linkClass}>Requirements</NavLink>
      <NavLink to="/import" className={linkClass}>CSV Import</NavLink>
      <NavLink to="/settings" className={linkClass}>Settings</NavLink>
      {mode === 'supabase' && (
        <NavLink to="/auth" className={linkClass}>Auth</NavLink>
      )}
      {mode === 'supabase' && session && (
        <a href="#" onClick={(e) => { e.preventDefault(); signOut() }} title="Sign out">
          {loading ? 'Syncing…' : 'Sign out'}
        </a>
      )}
    </nav>
  )
}
