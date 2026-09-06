export type PmsNavigationSection =
  | 'dashboard'
  | 'projects'
  | 'map'
  | 'reports'
  | 'sync'
  | 'users'

const LAST_ROUTE_KEY = 'pms10:navigation:last-protected-route'
const PREVIOUS_ROUTE_KEY = 'pms10:navigation:previous-protected-route'
const SECTION_ROUTE_PREFIX = 'pms10:navigation:section:'
const SCROLL_PREFIX = 'pms10:navigation:scroll:'

function getStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function normalizeInternalRoute(route: unknown) {
  const value = String(route ?? '').trim()

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return ''
  }

  try {
    const parsed = new URL(value, 'https://pms10.local')
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return ''
  }
}

export function getPathnameFromRoute(route: string) {
  const normalized = normalizeInternalRoute(route)
  if (!normalized) return ''

  try {
    return new URL(normalized, 'https://pms10.local').pathname
  } catch {
    return normalized.split('?')[0].split('#')[0]
  }
}

export function getNavigationSection(pathname: string): PmsNavigationSection | null {
  if (pathname === '/' || pathname === '/dashboard') return 'dashboard'
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return 'projects'
  if (pathname === '/map' || pathname.startsWith('/map/')) return 'map'
  if (pathname === '/reports' || pathname.startsWith('/reports/')) return 'reports'
  if (pathname === '/offline-sync' || pathname.startsWith('/offline-sync/')) return 'sync'
  if (pathname === '/users' || pathname.startsWith('/users/')) return 'users'
  return null
}

export function isRouteInSection(route: string, section: PmsNavigationSection) {
  const pathname = getPathnameFromRoute(route)
  if (!pathname) return false
  return getNavigationSection(pathname) === section
}

export function getRouteFromLocation(location: {
  pathname: string
  search?: string
  hash?: string
}) {
  return normalizeInternalRoute(
    `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`,
  )
}

export function rememberProtectedRoute(route: string) {
  const storage = getStorage()
  const normalized = normalizeInternalRoute(route)
  if (!storage || !normalized) return

  const pathname = getPathnameFromRoute(normalized)
  // The root URL is only a transient resume route. Never let it overwrite the
  // user's actual last PMS10 working page before App redirects them there.
  if (pathname === '/') return

  const section = getNavigationSection(pathname)
  if (!section) return

  const previousLastRoute = normalizeInternalRoute(storage.getItem(LAST_ROUTE_KEY))

  if (previousLastRoute && previousLastRoute !== normalized) {
    storage.setItem(PREVIOUS_ROUTE_KEY, previousLastRoute)
  }

  storage.setItem(LAST_ROUTE_KEY, normalized)
  storage.setItem(`${SECTION_ROUTE_PREFIX}${section}`, normalized)
}

export function getRememberedSectionRoute(
  section: PmsNavigationSection,
  fallbackRoute: string,
) {
  const storage = getStorage()
  const fallback = normalizeInternalRoute(fallbackRoute) || '/dashboard'
  if (!storage) return fallback

  const candidate = normalizeInternalRoute(
    storage.getItem(`${SECTION_ROUTE_PREFIX}${section}`),
  )
  const candidatePathname = getPathnameFromRoute(candidate)

  return candidate && candidatePathname !== '/' && isRouteInSection(candidate, section)
    ? candidate
    : fallback
}

export function getLastProtectedRoute(fallbackRoute = '/dashboard') {
  const storage = getStorage()
  const fallback = normalizeInternalRoute(fallbackRoute) || '/dashboard'
  if (!storage) return fallback

  const candidate = normalizeInternalRoute(storage.getItem(LAST_ROUTE_KEY))
  const candidatePathname = getPathnameFromRoute(candidate)

  return candidate && candidatePathname !== '/' && getNavigationSection(candidatePathname)
    ? candidate
    : fallback
}

export function getPreviousProtectedRoute(
  currentRoute: string,
  fallbackRoute = '/dashboard',
) {
  const storage = getStorage()
  const current = normalizeInternalRoute(currentRoute)
  const fallback = normalizeInternalRoute(fallbackRoute) || '/dashboard'
  if (!storage) return fallback

  const candidate = normalizeInternalRoute(storage.getItem(PREVIOUS_ROUTE_KEY))

  if (
    candidate &&
    candidate !== current &&
    getNavigationSection(getPathnameFromRoute(candidate))
  ) {
    return candidate
  }

  return fallback
}

function getScrollStorageKey(route: string) {
  const normalized = normalizeInternalRoute(route)
  return normalized ? `${SCROLL_PREFIX}${encodeURIComponent(normalized)}` : ''
}

export function saveRouteScroll(route: string, scrollY: number) {
  const storage = getStorage()
  const key = getScrollStorageKey(route)
  if (!storage || !key) return

  const safeScroll = Number.isFinite(scrollY) ? Math.max(0, Math.round(scrollY)) : 0
  storage.setItem(key, String(safeScroll))
}

export function getRouteScroll(route: string) {
  const storage = getStorage()
  const key = getScrollStorageKey(route)
  if (!storage || !key) return 0

  const value = Number(storage.getItem(key))
  return Number.isFinite(value) && value >= 0 ? value : 0
}


/**
 * Clears protected-route memory when an authentication transition must start
 * from a neutral page (for example after password recovery).
 *
 * This prevents one account from inheriting another account's remembered
 * admin/project route on a shared browser.
 */
export function clearProtectedNavigationMemory() {
  const storage = getStorage()
  if (!storage) return

  const keysToRemove: string[] = []

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith('pms10:navigation:')) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key))
}
