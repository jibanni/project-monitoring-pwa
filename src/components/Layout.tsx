import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import '../styles/layout.css'
import '../styles/pageHero.css'

type LayoutProps = {
  children: ReactNode
}

type NavItem = {
  label: string
  to: string
  adminOnly?: boolean
  adminOrEngineerOnly?: boolean
}

const PUBLIC_ROUTES = ['/login', '/register', '/pending-approval', '/unauthorized']

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Projects', to: '/projects' },
  { label: 'Create Project', to: '/projects/create', adminOnly: true },
  { label: 'GIS Map', to: '/map' },
  { label: 'Reports', to: '/reports' },
  { label: 'Offline Sync', to: '/offline-sync', adminOrEngineerOnly: true },
  { label: 'User Management', to: '/users', adminOnly: true },
]

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getInitials(name: string, email: string) {
  const cleanName = textValue(name)

  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean)

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase()
    }

    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
  }

  const cleanEmail = textValue(email)

  if (cleanEmail) {
    return cleanEmail.slice(0, 2).toUpperCase()
  }

  return 'PM'
}

function isRouteActive(pathname: string, item: NavItem) {
  if (item.to === '/') {
    return pathname === '/'
  }

  if (item.to === '/projects/create') {
    return pathname === '/projects/create'
  }

  if (item.to === '/projects') {
    return (
      pathname === '/projects' ||
      (pathname.startsWith('/projects/') && pathname !== '/projects/create')
    )
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()

  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname)

  if (isPublicRoute) {
    return <>{children}</>
  }

  const profile = auth?.profile
  const user = auth?.user

  const isAdmin = Boolean(auth?.isAdmin)
  const isEngineer = Boolean(auth?.isEngineer)

  const displayName =
    textValue(profile?.full_name) ||
    textValue(user?.user_metadata?.full_name) ||
    textValue(user?.email) ||
    'PDMU User'

  const displayEmail = textValue(profile?.email) || textValue(user?.email)
  const displayRole = textValue(profile?.role) || 'User'
  const initials = getInitials(displayName, displayEmail)

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.adminOrEngineerOnly && !isAdmin && !isEngineer) return false
    return true
  })

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand-block">
            <div className="app-logo-row">
              <img src="/dilg-logo.png" alt="DILG Logo" className="app-logo dilg" />
              <img
                src="/bagong-pilipinas-logo.png"
                alt="Bagong Pilipinas Logo"
                className="app-logo bagong"
              />
            </div>

            <div className="app-title-block">
              <h1>DILG - PDMU PROJECT MONITORING SYSTEM</h1>
              <p>Department of the Interior and Local Government Region X</p>
              <p>Project Development and Management Unit</p>
            </div>
          </div>

          <div className="app-user-card">
            <div className="app-user-avatar">{initials}</div>
            <div>
              <strong>{displayName}</strong>
              <span>{displayRole}</span>
            </div>
          </div>
        </div>

        <div className="app-nav-row">
          <nav className="app-nav" aria-label="Main navigation">
            {visibleNavItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={isRouteActive(location.pathname, item) ? 'active' : ''}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button type="button" className="app-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="app-main">
        <div key={location.pathname} className="app-page-transition">
          {children}
        </div>
      </main>
    </div>
  )
}