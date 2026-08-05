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

const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000

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
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      return sortProjects((data || []) as SharedProjectRow[])
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
    const cachedProjects = snapshot.projects.length > 0 ? snapshot.projects : await readDeviceCache()

    if (cachedProjects.length > 0) {
      publish({
        projects: cachedProjects,
        loading: false,
        errorMessage: '',
        source: snapshot.source === 'network' ? 'network' : 'device',
      })

      // Device data is immediately usable; refresh silently after first paint.
      if (navigator.onLine) void refreshSharedProjects()
      return
    }

    if (navigator.onLine) {
      await refreshSharedProjects()
    } else {
      publish({
        projects: [],
        loading: false,
        refreshing: false,
        errorMessage: 'No cached projects are available on this device.',
        source: 'empty',
      })
    }
  })()

  return initialLoadPromise
}

export function useSharedProjects<T = SharedProjectRow>() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    void initializeSharedProjects()
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
    refreshProjects,
  }
}
