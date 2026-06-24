import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/layout.css'

type LayoutProps = {
  children?: ReactNode
}

type AppIconProps = {
  type: 'home' | 'projects' | 'create' | 'map' | 'reports' | 'sync' | 'users'
}

type NavItem = {
  key: string
  label: string
  mobileLabel: string
  to: string
  icon: AppIconProps['type']
  adminOnly?: boolean
  adminOrEngineerOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    mobileLabel: 'Home',
    to: '/dashboard',
    icon: 'home',
  },
  {
    key: 'projects',
    label: 'Projects',
    mobileLabel: 'Projects',
    to: '/projects',
    icon: 'projects',
  },
  {
    key: 'map',
    label: 'GIS Map',
    mobileLabel: 'Map',
    to: '/map',
    icon: 'map',
  },
  {
    key: 'reports',
    label: 'Reports',
    mobileLabel: 'Reports',
    to: '/reports',
    icon: 'reports',
  },
  {
    key: 'sync',
    label: 'Offline Sync',
    mobileLabel: 'Sync',
    to: '/offline-sync',
    icon: 'sync',
    adminOrEngineerOnly: true,
  },
  {
    key: 'users',
    label: 'User Management',
    mobileLabel: 'Users',
    to: '/users',
    icon: 'users',
    adminOnly: true,
  },
]

function getInitials(name: string) {
  const cleanName = name.replace(/[^a-zA-Z\s.]/g, ' ').replace(/\s+/g, ' ').trim()
  const lowerName = cleanName.toLowerCase()

  if (
    lowerName.includes('jay') &&
    lowerName.includes('vanny') &&
    lowerName.includes('orabao')
  ) {
    return 'JVSO'
  }

  const words = cleanName
    .split(' ')
    .map((word) => word.replace('.', '').trim())
    .filter(Boolean)

  return (
    words
      .slice(0, 4)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase() || 'DU'
  )
}

function isProjectDetailsPath(pathname: string) {
  return /^\/projects\/[^/]+$/.test(pathname) && pathname !== '/projects/create'
}

function isProjectUpdatePath(pathname: string) {
  return /^\/projects\/[^/]+\/updates/.test(pathname)
}

function isProjectEditPath(pathname: string) {
  return /^\/projects\/[^/]+\/edit/.test(pathname)
}

function AppIcon({ type }: AppIconProps) {
  if (type === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5v7.2a1.3 1.3 0 0 1-1.3 1.3h-4.1v-5.4H9.4V20H5.3A1.3 1.3 0 0 1 4 18.7v-7.2Z" />
      </svg>
    )
  }

  if (type === 'projects') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4Zm9 0A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4Zm-9 9A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4Zm9 0a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" />
      </svg>
    )
  }

  if (type === 'create') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5Z" />
      </svg>
    )
  }

  if (type === 'map') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a7 7 0 0 0-7 7c0 5.25 7 11 7 11s7-5.75 7-11a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 7a2.5 2.5 0 0 1 0 5.5Z" />
      </svg>
    )
  }

  if (type === 'reports') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3.5h9.2L19 7.3v13.2H6V3.5Zm8.4 1.8v3h3l-3-3ZM8 11h8v1.6H8V11Zm0 3.4h8V16H8v-1.6Zm0 3.4h5.5v1.6H8v-1.6Z" />
      </svg>
    )
  }

  if (type === 'sync') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.7 7.2A7.8 7.8 0 0 0 4.5 11h2.2a5.7 5.7 0 0 1 9.5-2.3L13.7 11H20V4.7l-2.3 2.5ZM6.3 16.8A7.8 7.8 0 0 0 19.5 13h-2.2a5.7 5.7 0 0 1-9.5 2.3l2.5-2.3H4v6.3l2.3-2.5Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0H5Z" />
    </svg>
  )
}


function normalizeRoleValue(role: unknown) {
  return String(role ?? '').trim().toLowerCase()
}

function isRole(role: unknown, allowed: string[]) {
  const current = normalizeRoleValue(role)
  return allowed.some((item) => current === normalizeRoleValue(item))
}

function getCompactRoleLabel(role: unknown, fallback: string) {
  const current = normalizeRoleValue(role || fallback)

  if (current === 'admin') return 'Admin'
  if (current === 'ro engineer' || current === 'ro engineers') return 'RO'
  if (current === 'po engineer' || current === 'po engineers' || current === 'engineer') return 'PO'
  if (current === 'regional director' || current === 'rd') return 'RD'
  if (current === 'assistant regional director' || current === 'ard') return 'ARD'
  if (current === 'pdmu chief' || current === 'pdmu chief/head' || current === 'pdmu head') {
    return 'Chief'
  }
  if (current === 'provincial director' || current === 'pd') return 'PD'
  if (current === 'city director' || current === 'cd') return 'CD'
  if (current === 'clgoo') return 'CLGOO'
  if (current === 'mlgoo') return 'MLGOO'
  if (current === 'project evaluation officer' || current === 'peo') return 'PEO'
  if (current === 'viewer') return 'Viewer'

  return fallback || 'User'
}

export default function Layout({ children }: LayoutProps) {
  const auth = useAuth() as any
  const navigate = useNavigate()
  const location = useLocation()
  const headerRef = useRef<HTMLElement | null>(null)
  const lastMobilePointerNavRef = useRef(0)

  const user = auth?.user
  const profile = auth?.profile

  const profileRole = profile?.role || user?.user_metadata?.role || ''

  const isAdmin = Boolean(auth?.isAdmin) || isRole(profileRole, ['Admin'])
  const isEngineer =
    Boolean(auth?.isEngineer) ||
    Boolean(auth?.isPOEngineer) ||
    Boolean(auth?.isROEngineer) ||
    isRole(profileRole, ['Engineer', 'PO Engineer', 'PO Engineers', 'RO Engineer', 'RO Engineers'])

  const signOutFn = auth?.signOut || auth?.logout

  const [isScrolled, setIsScrolled] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(74)
  const [pendingMobilePath, setPendingMobilePath] = useState('')
  const [headerPortalReady, setHeaderPortalReady] = useState(false)

  useEffect(() => {
    setHeaderPortalReady(true)
  }, [])

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useLayoutEffect(() => {
    const measureHeader = () => {
      const nextHeight = Math.ceil(headerRef.current?.getBoundingClientRect().height || 74)

      setHeaderHeight((current) => (current === nextHeight ? current : nextHeight))
    }

    measureHeader()

    const headerElement = headerRef.current
    let observer: ResizeObserver | null = null

    if (headerElement && 'ResizeObserver' in window) {
      observer = new ResizeObserver(measureHeader)
      observer.observe(headerElement)
    }

    window.addEventListener('resize', measureHeader)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measureHeader)
    }
  }, [headerPortalReady])

  useEffect(() => {
    setPendingMobilePath('')

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto',
      })

      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [location.pathname])

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (ticking) return

      ticking = true

      window.requestAnimationFrame(() => {
        const scrollY = window.scrollY

        setIsScrolled((current) => {
          if (current) {
            return scrollY > 10
          }

          return scrollY > 36
        })

        ticking = false
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.adminOnly) return isAdmin
      if (item.adminOrEngineerOnly) return isAdmin || isEngineer
      return true
    })
  }, [isAdmin, isEngineer])

  const displayName =
    profile?.full_name ||
    profile?.name ||
    profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email ||
    'DILG User'

  const displayRole = getCompactRoleLabel(
    profileRole,
    isAdmin ? 'Admin' : isEngineer ? 'PO' : 'Viewer',
  )

  const initials = getInitials(String(displayName))

  const isItemActive = (item: NavItem) => {
    const path = location.pathname

    if (pendingMobilePath === item.to) return true

    if (item.key === 'dashboard') {
      return path === '/' || path === '/dashboard'
    }

    if (item.key === 'projects') {
      return (
        path === '/projects' ||
        (path.startsWith('/projects/') && !path.startsWith('/projects/create'))
      )
    }

    if (item.key === 'create') {
      return path.startsWith('/projects/create')
    }

    if (item.key === 'map') {
      return path === '/map'
    }

    if (item.key === 'reports') {
      return path.startsWith('/reports')
    }

    if (item.key === 'sync') {
      return path.startsWith('/offline-sync')
    }

    if (item.key === 'users') {
      return path.startsWith('/users')
    }

    return path === item.to
  }

  const navigateMobile = (item: NavItem) => {
    const path = location.pathname
    const isSameDashboard = item.key === 'dashboard' && (path === '/' || path === '/dashboard')
    const isSamePath = path === item.to || isSameDashboard

    if (isSamePath) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth',
      })
      return
    }

    setPendingMobilePath(item.to)
    navigate(item.to)
  }

  const shellClassName = [
    'app-shell',
    isScrolled ? 'app-scrolled' : '',
    location.pathname === '/projects' ? 'app-projects-route' : '',
    location.pathname === '/projects/create' ? 'app-project-create-route' : '',
    isProjectDetailsPath(location.pathname) ? 'app-project-details-route' : '',
    isProjectUpdatePath(location.pathname) ? 'app-project-updates-route' : '',
    isProjectEditPath(location.pathname) ? 'app-project-edit-route' : '',
    location.pathname === '/map' ? 'app-map-route' : '',
    location.pathname.startsWith('/reports') ? 'app-reports-route' : '',
    location.pathname.startsWith('/offline-sync') ? 'app-offline-sync-route' : '',
    location.pathname.startsWith('/users') ? 'app-users-route' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const shellStyle = {
    '--app-header-live-h': `${headerHeight}px`,
  } as CSSProperties

  const handleLogout = async () => {
    try {
      if (typeof signOutFn === 'function') {
        await signOutFn()
      }
    } finally {
      navigate('/login', { replace: true })
    }
  }

  const appHeader = (
    <header
      ref={headerRef}
      className={['app-header', isScrolled ? 'app-header-scrolled' : '']
        .filter(Boolean)
        .join(' ')}
      style={shellStyle}
    >
      <div className="app-header-inner">
        <NavLink to="/dashboard" end className="app-brand" aria-label="Go to dashboard">
          <span className="app-brand-logo-wrap">
            <img src="/dilg-logo.png" alt="DILG Logo" className="app-brand-logo" />
          </span>

          <span className="app-brand-text">
            <span className="app-brand-title">DILG X - PDMU</span>
            <span className="app-brand-subtitle">Project Monitoring System</span>
            <span className="app-brand-unit">Project Development and Management Unit</span>
          </span>
        </NavLink>

        <nav className="app-desktop-nav" aria-label="Main navigation">
          {visibleNavItems.map((item) => {
            const active = isItemActive(item)

            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.key === 'dashboard' || item.key === 'projects'}
                className={['app-nav-link', active ? 'active' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                <span className="app-nav-icon">
                  <AppIcon type={item.icon} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="app-user-area">
          <div className="app-user-avatar" aria-hidden="true">
            {initials}
          </div>

          <div className="app-user-text">
            <span className="app-user-name">{displayName}</span>
            <span className="app-user-role">{displayRole}</span>

            <button
              type="button"
              className="app-user-logout-inline"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>

          <button type="button" className="app-logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    </header>
  )

  return (
    <>
      {headerPortalReady ? createPortal(appHeader, document.body) : appHeader}

      <div className={shellClassName} style={shellStyle}>
        <main className="app-main">{children || <Outlet />}</main>
      </div>

      <nav className="app-mobile-nav" aria-label="Mobile navigation">
        <div className="app-mobile-nav-scroll">
          {visibleNavItems.map((item) => {
            const active = isItemActive(item)

            return (
              <button
                key={item.key}
                type="button"
                className={['app-mobile-nav-item', active ? 'active' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                onPointerDown={(event) => {
                  if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                    lastMobilePointerNavRef.current = Date.now()
                  }
                }}
                onClick={() => {
                  navigateMobile(item)
                }}
              >
                <span className="app-mobile-nav-icon">
                  <AppIcon type={item.icon} />
                </span>
                <span className="app-mobile-nav-label">{item.mobileLabel}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}