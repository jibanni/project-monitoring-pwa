import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { offlineDb } from './offlineDb'
import { supabase } from './supabase'

export type SharedProjectRow = {
  id: string
  updated_at?: string | null
  cached_at?: string | null
  [key: string]: unknown
}

type ProjectDataSnapshot = {
  projects: SharedProjectRow[]
  loading: boolean
  refreshing: boolean
  errorMessage: string
  source: 'memory' | 'device' | 'network' | 'empty'
  loadedAt: number
}

type RefreshOptions = {
  force?: boolean
}

const PROJECT_CACHE_TTL_MS = 60 * 1000
const PROJECT_REVALIDATE_MS = 30 * 1000
const PROJECT_FETCH_PAGE_SIZE = 1000

let snapshot: ProjectDataSnapshot = {
  projects: [],
  loading: true,
  refreshing: false,
  errorMessage: '',
  source: 'empty',
  loadedAt: 0,
}

let initialLoadPromise: Promise<void> | null = null
let networkRequest: Promise<SharedProjectRow[]> | null = null
const listeners = new Set<() => void>()

function getProjectTime(project: SharedProjectRow) {
  const value = project.updated_at
  if (!value) return 0

  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function sortProjects(projects: SharedProjectRow[]) {
  return [...projects].sort((left, right) => getProjectTime(right) - getProjectTime(left))
}

function publish(next: Partial<ProjectDataSnapshot>) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return snapshot
}

async function readDeviceCache() {
  try {
    const cached = (await offlineDb.projects.toArray()) as unknown as SharedProjectRow[]
    return sortProjects(cached.filter((project) => Boolean(project?.id)))
  } catch (error) {
    console.error('Unable to read the shared project cache.', error)
    return []
  }
}

async function writeDeviceCache(projects: SharedProjectRow[]) {
  const cachedAt = new Date().toISOString()
  const rows = projects.map((project) => ({ ...project, cached_at: cachedAt }))

  try {
    await offlineDb.transaction('rw', offlineDb.projects, async () => {
      await offlineDb.projects.clear()
      if (rows.length > 0) await offlineDb.projects.bulkPut(rows as any[])
    })
  } catch (error) {
    console.error('Unable to update the shared project cache.', error)
  }
}

function hasFreshNetworkData() {
  return (
    snapshot.source === 'network' &&
    snapshot.projects.length > 0 &&
    Date.now() - snapshot.loadedAt < PROJECT_CACHE_TTL_MS
  )
}

async function requestProjectsFromNetwork() {
  if (networkRequest) return networkRequest

  networkRequest = (async (): Promise<SharedProjectRow[]> => {
    try {
      const allProjects: SharedProjectRow[] = []
      let from = 0

      while (true) {
        const to = from + PROJECT_FETCH_PAGE_SIZE - 1

        // Supabase/PostgREST commonly caps a single response at 1,000 rows.
        // Fetch deterministic ID-ordered pages so every device receives the
        // complete project registry rather than a moving "latest 1,000" slice.
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('id', { ascending: true })
          .range(from, to)

        if (error) throw error

        const page = (data || []) as SharedProjectRow[]
        allProjects.push(...page)

        if (page.length < PROJECT_FETCH_PAGE_SIZE) break
        from += PROJECT_FETCH_PAGE_SIZE
      }

      // Defensive de-duplication by project ID.
      const byId = new Map<string, SharedProjectRow>()

      allProjects.forEach((project) => {
        const id = String(project?.id || '').trim()
        if (!id) return

        const existing = byId.get(id)
        if (!existing || getProjectTime(project) >= getProjectTime(existing)) {
          byId.set(id, project)
        }
      })

      return sortProjects(Array.from(byId.values()))
    } finally {
      networkRequest = null
    }
  })()

  return networkRequest
}

export async function refreshSharedProjects(options: RefreshOptions = {}) {
  const force = Boolean(options.force)

  if (!navigator.onLine) {
    if (snapshot.projects.length === 0) {
      const cachedProjects = await readDeviceCache()
      publish({
        projects: cachedProjects,
        loading: false,
        refreshing: false,
        errorMessage:
          cachedProjects.length > 0 ? '' : 'No cached projects are available on this device.',
        source: cachedProjects.length > 0 ? 'device' : 'empty',
      })
    } else {
      publish({ loading: false, refreshing: false })
    }

    return snapshot.projects
  }

  if (!force && hasFreshNetworkData()) return snapshot.projects

  publish({
    loading: snapshot.projects.length === 0,
    refreshing: true,
    errorMessage: '',
  })

  try {
    const projects = await requestProjectsFromNetwork()
    const loadedAt = Date.now()

    publish({
      projects,
      loading: false,
      refreshing: false,
      errorMessage: '',
      source: 'network',
      loadedAt,
    })

    void writeDeviceCache(projects)
    return projects
  } catch (error) {
    console.error('Shared project refresh failed.', error)

    let fallbackProjects = snapshot.projects
    if (fallbackProjects.length === 0) fallbackProjects = await readDeviceCache()

    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to load projects. Please check your connection.'

    publish({
      projects: fallbackProjects,
      loading: false,
      refreshing: false,
      errorMessage: fallbackProjects.length > 0 ? '' : errorMessage,
      source: fallbackProjects.length > 0 ? 'device' : 'empty',
    })

    return fallbackProjects
  }
}

export function initializeSharedProjects() {
  if (initialLoadPromise) return initialLoadPromise

  initialLoadPromise = (async () => {
    // While online, network data is authoritative. Avoid first publishing an
    // old device snapshot that can make dashboard totals differ between devices.
    if (navigator.onLine) {
      await refreshSharedProjects({ force: true })
      return
    }

    const cachedProjects =
      snapshot.projects.length > 0 ? snapshot.projects : await readDeviceCache()

    publish({
      projects: cachedProjects,
      loading: false,
      refreshing: false,
      errorMessage:
        cachedProjects.length > 0
          ? ''
          : 'No cached projects are available on this device.',
      source: cachedProjects.length > 0 ? 'device' : 'empty',
      loadedAt: snapshot.loadedAt,
    })
  })()

  return initialLoadPromise
}

export async function updateSharedProjectCache(
  projectId: string,
  patch: Partial<SharedProjectRow>,
) {
  const currentProjects = snapshot.projects.length > 0
    ? snapshot.projects
    : await readDeviceCache()

  const existingIndex = currentProjects.findIndex(
    (project) => String(project.id) === String(projectId),
  )

  if (existingIndex < 0) return

  const nextProjects = [...currentProjects]
  nextProjects[existingIndex] = {
    ...nextProjects[existingIndex],
    ...patch,
    id: projectId,
    cached_at: new Date().toISOString(),
  }

  const sortedProjects = sortProjects(nextProjects)

  publish({
    projects: sortedProjects,
    loading: false,
    refreshing: false,
    errorMessage: '',
    source: snapshot.source === 'empty' ? 'device' : snapshot.source,
  })

  try {
    await offlineDb.projects.put(nextProjects[existingIndex] as any)
  } catch (error) {
    console.error('Unable to patch the shared project cache.', error)
  }
}

export function useSharedProjects<T = SharedProjectRow>() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    let disposed = false

    const refreshIfNeeded = () => {
      if (disposed || !navigator.onLine) return

      const age = Date.now() - snapshot.loadedAt
      const needsRefresh =
        snapshot.source !== 'network' ||
        snapshot.loadedAt <= 0 ||
        age >= PROJECT_REVALIDATE_MS

      if (needsRefresh) {
        void refreshSharedProjects({ force: true })
      }
    }

    void initializeSharedProjects().then(refreshIfNeeded)

    const handleFocus = () => refreshIfNeeded()
    const handleOnline = () => {
      void refreshSharedProjects({ force: true })
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfNeeded()
    }
    const handlePageShow = () => refreshIfNeeded()

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const refreshProjects = useCallback(async () => {
    await refreshSharedProjects({ force: true })
  }, [])

  return {
    projects: current.projects as T[],
    loading: current.loading,
    refreshing: current.refreshing,
    errorMessage: current.errorMessage,
    source: current.source,
    loadedAt: current.loadedAt,
    refreshProjects,
  }
}
