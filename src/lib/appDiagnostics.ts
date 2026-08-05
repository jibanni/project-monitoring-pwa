import { Capacitor } from '@capacitor/core'
import { offlineDb } from './offlineDb'

export const PMS10_LAST_SUCCESSFUL_SYNC_KEY = 'pms10:last-successful-sync'

export type LastSuccessfulSync = {
  at: string
  syncedUpdates: number
  syncedPhotos: number
  message: string
}

export type AppRuntimeMode = 'Android APK' | 'Installed PWA' | 'Web Browser'

export type AppDiagnosticsSnapshot = {
  version: string
  buildDate: string
  commit: string
  mode: AppRuntimeMode
  platform: string
  online: boolean
  cachedProjects: number
  pendingUpdates: number
  pendingPhotos: number
  failedUpdates: number
  failedPhotos: number
  localAideMemoires: number
  localDocuments: number
  storageUsedBytes: number | null
  storageQuotaBytes: number | null
  serviceWorkerState: string
  serviceWorkerControlled: boolean
  serviceWorkerScript: string
  cacheNames: string[]
  lastSuccessfulSync: LastSuccessfulSync | null
  capturedAt: string
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function isPendingRecord(record: {
  synced?: boolean
  sync_status?: string
  is_offline?: boolean
}) {
  const status = textValue(record.sync_status).toLowerCase()

  return (
    record.synced === false ||
    record.is_offline === true ||
    status === '' ||
    status === 'pending' ||
    status === 'failed' ||
    status === 'syncing' ||
    status === 'uploading_photos' ||
    status === 'orphaned'
  )
}

function isFailedRecord(record: { sync_status?: string; error?: string }) {
  const status = textValue(record.sync_status).toLowerCase()
  return status === 'failed' || status === 'orphaned' || Boolean(textValue(record.error))
}

export function getPms10Version() {
  return typeof __PMS10_APP_VERSION__ === 'string' ? __PMS10_APP_VERSION__ : 'development'
}

export function getPms10BuildDate() {
  return typeof __PMS10_BUILD_DATE__ === 'string' ? __PMS10_BUILD_DATE__ : ''
}

export function getPms10Commit() {
  return typeof __PMS10_GIT_COMMIT__ === 'string' ? __PMS10_GIT_COMMIT__ : 'local'
}

export function getAppRuntimeMode(): AppRuntimeMode {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return 'Android APK'
  }

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  return standalone ? 'Installed PWA' : 'Web Browser'
}

export function getPlatformLabel() {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    return platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : platform
  }

  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS / iPadOS'
  if (userAgent.includes('android')) return 'Android'
  if (userAgent.includes('mac os')) return 'macOS'
  if (userAgent.includes('windows')) return 'Windows'
  if (userAgent.includes('linux')) return 'Linux'
  return navigator.platform || 'Unknown platform'
}

export function getLastSuccessfulSync(): LastSuccessfulSync | null {
  try {
    const raw = window.localStorage.getItem(PMS10_LAST_SUCCESSFUL_SYNC_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<LastSuccessfulSync>
    if (!parsed.at) return null

    return {
      at: String(parsed.at),
      syncedUpdates: Number(parsed.syncedUpdates || 0),
      syncedPhotos: Number(parsed.syncedPhotos || 0),
      message: String(parsed.message || ''),
    }
  } catch (error) {
    console.warn('Unable to read the last successful sync record.', error)
    return null
  }
}

export function recordSuccessfulSync(params: {
  syncedUpdates: number
  syncedPhotos: number
  message: string
}) {
  const record: LastSuccessfulSync = {
    at: new Date().toISOString(),
    syncedUpdates: Math.max(0, Number(params.syncedUpdates || 0)),
    syncedPhotos: Math.max(0, Number(params.syncedPhotos || 0)),
    message: String(params.message || ''),
  }

  try {
    window.localStorage.setItem(PMS10_LAST_SUCCESSFUL_SYNC_KEY, JSON.stringify(record))
  } catch (error) {
    console.warn('Unable to save the last successful sync record.', error)
  }

  return record
}

async function getServiceWorkerDiagnostics() {
  if (!('serviceWorker' in navigator)) {
    return {
      state: 'Unsupported',
      controlled: false,
      script: '',
    }
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const worker = registration?.active || registration?.waiting || registration?.installing

    return {
      state: worker?.state || (registration ? 'Registered' : 'Not registered'),
      controlled: Boolean(navigator.serviceWorker.controller),
      script: worker?.scriptURL || navigator.serviceWorker.controller?.scriptURL || '',
    }
  } catch (error) {
    console.warn('Unable to inspect the service worker.', error)
    return {
      state: 'Unavailable',
      controlled: Boolean(navigator.serviceWorker.controller),
      script: navigator.serviceWorker.controller?.scriptURL || '',
    }
  }
}

async function getCacheNames() {
  if (!('caches' in window)) return []

  try {
    return await window.caches.keys()
  } catch (error) {
    console.warn('Unable to inspect Cache Storage.', error)
    return []
  }
}

async function getStorageEstimate() {
  if (!navigator.storage?.estimate) {
    return { usage: null, quota: null }
  }

  try {
    const estimate = await navigator.storage.estimate()
    return {
      usage: typeof estimate.usage === 'number' ? estimate.usage : null,
      quota: typeof estimate.quota === 'number' ? estimate.quota : null,
    }
  } catch (error) {
    console.warn('Unable to estimate device storage.', error)
    return { usage: null, quota: null }
  }
}

export async function collectAppDiagnostics(): Promise<AppDiagnosticsSnapshot> {
  const [projects, updates, photos, aideMemoires, localDocuments, sw, cacheNames, storage] =
    await Promise.all([
      offlineDb.projects.count(),
      offlineDb.project_updates.toArray(),
      offlineDb.project_photos.toArray(),
      offlineDb.aide_memoires.count(),
      offlineDb.aide_memoire_documents.count(),
      getServiceWorkerDiagnostics(),
      getCacheNames(),
      getStorageEstimate(),
    ])

  return {
    version: getPms10Version(),
    buildDate: getPms10BuildDate(),
    commit: getPms10Commit(),
    mode: getAppRuntimeMode(),
    platform: getPlatformLabel(),
    online: navigator.onLine,
    cachedProjects: projects,
    pendingUpdates: updates.filter(isPendingRecord).length,
    pendingPhotos: photos.filter(isPendingRecord).length,
    failedUpdates: updates.filter(isFailedRecord).length,
    failedPhotos: photos.filter(isFailedRecord).length,
    localAideMemoires: aideMemoires,
    localDocuments,
    storageUsedBytes: storage.usage,
    storageQuotaBytes: storage.quota,
    serviceWorkerState: sw.state,
    serviceWorkerControlled: sw.controlled,
    serviceWorkerScript: sw.script,
    cacheNames,
    lastSuccessfulSync: getLastSuccessfulSync(),
    capturedAt: new Date().toISOString(),
  }
}

export async function refreshServiceWorkerAndAppShellCache() {
  const deletedCaches: string[] = []

  if ('caches' in window) {
    const names = await window.caches.keys()
    for (const name of names) {
      const deleted = await window.caches.delete(name)
      if (deleted) deletedCaches.push(name)
    }
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)))
  }

  return deletedCaches
}

export function formatDiagnosticBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'Unavailable'
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`
  return `${value} B`
}
