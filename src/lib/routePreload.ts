import type { ComponentType } from 'react'

type PageModule = {
  default: ComponentType<any>
}

type PageLoader = () => Promise<PageModule>

/**
 * One shared loader per route keeps React.lazy and proactive preloading on the
 * same browser module cache entry. Calling a loader early downloads and parses
 * the route chunk without mounting the page.
 */
export const routeLoaders = {
  dashboard: () => import('../pages/Dashboard'),
  projects: () => import('../pages/Projects'),
  projectDetails: () => import('../pages/ProjectDetails'),
  projectUpdates: () => import('../pages/ProjectUpdates'),
  aideMemoirePdfViewer: () => import('../pages/AideMemoirePdfViewer'),
  createProject: () => import('../pages/CreateProject'),
  editProject: () => import('../pages/EditProject'),
  projectMap: () => import('../pages/ProjectMap'),
  offlineSync: () => import('../pages/OfflineSync'),
  reports: () => import('../pages/Reports'),
  userManagement: () => import('../pages/UserManagement'),
  userAccess: () => import('../pages/UserAccess'),
  subayImport: () => import('../pages/SubayImport'),
} satisfies Record<string, PageLoader>

const preloadPromises = new Map<PageLoader, Promise<PageModule>>()

function preload(loader: PageLoader) {
  const existing = preloadPromises.get(loader)
  if (existing) return existing

  const promise = loader().catch((error) => {
    // Permit a later retry after a temporary connection/cache failure.
    preloadPromises.delete(loader)
    throw error
  })

  preloadPromises.set(loader, promise)
  return promise
}

function getRouteLoader(pathname: string): PageLoader | null {
  const path = pathname.split('?')[0].split('#')[0]

  if (path === '/' || path === '/dashboard') return routeLoaders.dashboard
  if (path === '/projects') return routeLoaders.projects
  if (path === '/projects/create') return routeLoaders.createProject
  if (path === '/projects/import-subaybayan') return routeLoaders.subayImport
  if (/^\/projects\/[^/]+\/updates\/?$/.test(path)) return routeLoaders.projectUpdates
  if (/^\/projects\/[^/]+\/aide-memoire\/pdf\/?$/.test(path)) {
    return routeLoaders.aideMemoirePdfViewer
  }
  if (/^\/projects\/[^/]+\/edit\/?$/.test(path)) return routeLoaders.editProject
  if (/^\/projects\/[^/]+\/?$/.test(path)) return routeLoaders.projectDetails
  if (path === '/map') return routeLoaders.projectMap
  if (path === '/reports') return routeLoaders.reports
  if (path === '/offline-sync') return routeLoaders.offlineSync
  if (/^\/users\/[^/]+\/access\/?$/.test(path)) return routeLoaders.userAccess
  if (path === '/users') return routeLoaders.userManagement

  return null
}

/** Preload a route because the user showed navigation intent. */
export function preloadRoute(pathname: string) {
  const loader = getRouteLoader(pathname)
  if (!loader) return Promise.resolve()

  return preload(loader).then(
    () => undefined,
    () => undefined,
  )
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number
  cancelIdleCallback?: (handle: number) => void
}

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean
  }
}

/**
 * Warm visible navbar routes after the first paint. Work is staggered so the
 * current page remains responsive and mobile data is not hit with one burst.
 */
export function scheduleRoutePreloads(paths: string[]) {
  if (typeof window === 'undefined') return () => undefined

  const network = navigator as NavigatorWithConnection
  if (network.connection?.saveData) return () => undefined

  const uniquePaths = Array.from(new Set(paths))
  let cancelled = false
  let idleHandle: number | null = null
  let timerHandle: number | null = null

  const run = () => {
    let index = 0

    const preloadNext = () => {
      if (cancelled || index >= uniquePaths.length) return

      void preloadRoute(uniquePaths[index])
      index += 1
      timerHandle = window.setTimeout(preloadNext, 600)
    }

    preloadNext()
  }

  const idleWindow = window as IdleWindow

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleHandle = idleWindow.requestIdleCallback(run, { timeout: 2500 })
  } else {
    // Safari/iOS fallback.
    timerHandle = window.setTimeout(run, 1800)
  }

  return () => {
    cancelled = true

    if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') {
      idleWindow.cancelIdleCallback(idleHandle)
    }

    if (timerHandle !== null) {
      window.clearTimeout(timerHandle)
    }
  }
}
