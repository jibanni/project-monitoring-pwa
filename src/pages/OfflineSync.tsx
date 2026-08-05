import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { offlineDb, type OfflineProjectPhoto, type OfflineProjectUpdate } from '../lib/offlineDb'
import * as offlineSyncService from '../services/offlineSyncService'
import { useAuth } from '../context/AuthContext'
import AppDiagnosticsPanel from '../components/AppDiagnosticsPanel'
import { canUpdateProject, type AorProjectLike } from '../utils/aorAccess'
import '../styles/offlineSync.css'
import '../styles/pageHero.css'

type ProjectNameMap = Record<string, string>
type OfflineProjectAorMap = Record<string, AorProjectLike>

type ProjectLookup = {
  names: ProjectNameMap
  aor: OfflineProjectAorMap
}

type HydratedOfflineUpdate = OfflineProjectUpdate & {
  display_project_name?: string
  pending_photo_count?: number
}

type HydratedOfflinePhoto = OfflineProjectPhoto & {
  display_project_name?: string
}

type RemovalDialogState = {
  record: HydratedOfflineUpdate
  preview: offlineSyncService.PendingUpdateRemovalPreview | null
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())

  return Number.isFinite(parsed) ? parsed : 0
}

function formatPercent(value: unknown) {
  return `${toNumber(value).toFixed(2)}%`
}

function formatLongDate(value: unknown) {
  const rawValue = textValue(value)

  if (!rawValue) return 'No date'

  const date = new Date(rawValue.length <= 10 ? `${rawValue}T00:00:00` : rawValue)

  if (Number.isNaN(date.getTime())) return rawValue

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(value: unknown) {
  const rawValue = textValue(value)

  if (!rawValue) return 'No date'

  const date = new Date(rawValue)

  if (Number.isNaN(date.getTime())) return rawValue

  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatFileSize(value: unknown) {
  const size = toNumber(value)

  if (size <= 0) return 'Unknown size'

  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(2)} MB`
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(2)} KB`
  }

  return `${size} B`
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

function hasKey(value: unknown) {
  return value !== null && value !== undefined && textValue(value) !== ''
}

function keysMatch(a: unknown, b: unknown) {
  if (!hasKey(a) || !hasKey(b)) return false
  return String(a) === String(b)
}

function getStatusLabel(record: { synced?: boolean; sync_status?: string; error?: string }) {
  const status = textValue(record.sync_status)

  if (status) {
    if (status === 'pending') return 'Pending'
    if (status === 'syncing') return 'Syncing'
    if (status === 'uploading_photos') return 'Uploading Photos'
    if (status === 'failed') return 'Failed'
    if (status === 'orphaned') return 'Orphaned'
    if (status === 'synced') return 'Synced'

    return status
  }

  if (record.synced === false) return 'Pending'
  if (record.synced === true) return 'Synced'
  if (textValue(record.error)) return 'Failed'

  return 'Pending'
}

function getStatusClass(record: { synced?: boolean; sync_status?: string; error?: string }) {
  const status = getStatusLabel(record).toLowerCase()

  if (status.includes('orphan')) return 'orphaned'
  if (status.includes('sync') || status.includes('success')) return 'synced'
  if (status.includes('fail') || status.includes('error')) return 'failed'
  if (status.includes('upload')) return 'uploading'

  return 'pending'
}

function getUpdateLocalId(record: OfflineProjectUpdate) {
  return textValue(record.local_id) || textValue(record.id)
}

function getUpdateDate(record: OfflineProjectUpdate) {
  return record.inspection_date || record.created_at || record.updated_at
}

function getUpdateTitle(record: HydratedOfflineUpdate) {
  return (
    textValue(record.display_project_name) ||
    textValue(record.project_name) ||
    `Project ${textValue(record.project_id) || 'Update'}`
  )
}

function isOrphanedUpdate(record: OfflineProjectUpdate) {
  const status = textValue(record.sync_status).toLowerCase()
  const error = textValue(record.error).toLowerCase()

  return (
    status === 'orphaned' ||
    error.includes('project_updates_project_id_fkey') ||
    error.includes('key is not present in table \"projects\"') ||
    error.includes('original project no longer exists') ||
    error.includes('original project was deleted')
  )
}

function getPhotoTitle(record: HydratedOfflinePhoto) {
  return textValue(record.file_name) || `Offline Photo ${textValue(record.id) || ''}`.trim()
}

function getPhotoProject(record: HydratedOfflinePhoto) {
  return (
    textValue(record.display_project_name) ||
    textValue(record.project_name) ||
    `Project ${textValue(record.project_id) || 'Photo'}`
  )
}

function getPhotoDate(record: OfflineProjectPhoto) {
  return record.created_at || record.uploaded_at
}

function getPhotoSize(record: OfflineProjectPhoto) {
  return (
    record.file_size ||
    record.file_data?.byteLength ||
    (record.file_blob as Blob | undefined)?.size ||
    (record.file as Blob | undefined)?.size
  )
}

function getLinkedPhotos(update: OfflineProjectUpdate, photos: OfflineProjectPhoto[]) {
  const updateId = update.id
  const localId = getUpdateLocalId(update)

  return photos.filter((photo) => {
    return (
      keysMatch(photo.offline_update_id, updateId) ||
      keysMatch(photo.offline_update_id, localId) ||
      keysMatch(photo.local_update_id, localId) ||
      keysMatch(photo.project_update_id, localId) ||
      keysMatch(photo.project_update_id, update.online_update_id)
    )
  })
}

function getLinkedUpdate(photo: OfflineProjectPhoto, updates: OfflineProjectUpdate[]) {
  return updates.find((update) => {
    const updateId = update.id
    const localId = getUpdateLocalId(update)

    return (
      keysMatch(photo.offline_update_id, updateId) ||
      keysMatch(photo.offline_update_id, localId) ||
      keysMatch(photo.local_update_id, localId) ||
      keysMatch(photo.project_update_id, localId) ||
      keysMatch(photo.project_update_id, update.online_update_id)
    )
  })
}

function getAorProjectFromRecord(
  record: OfflineProjectUpdate | OfflineProjectPhoto,
  projectAorMap: OfflineProjectAorMap,
  allUpdates: OfflineProjectUpdate[] = [],
): AorProjectLike {
  const projectId = textValue(record.project_id)

  if (projectId && projectAorMap[projectId]) {
    return projectAorMap[projectId]
  }

  const linkedUpdate = getLinkedUpdate(record as OfflineProjectPhoto, allUpdates)
  const linkedProjectId = textValue(linkedUpdate?.project_id)

  if (linkedProjectId && projectAorMap[linkedProjectId]) {
    return projectAorMap[linkedProjectId]
  }

  return {
    province: (record as any).province || (linkedUpdate as any)?.province,
    municipality: (record as any).municipality || (linkedUpdate as any)?.municipality,
  }
}

function canSyncOfflineRecord(
  record: OfflineProjectUpdate | OfflineProjectPhoto,
  projectAorMap: OfflineProjectAorMap,
  auth: unknown,
  allUpdates: OfflineProjectUpdate[] = [],
) {
  const project = getAorProjectFromRecord(record, projectAorMap, allUpdates)
  return canUpdateProject(project, auth as any)
}

function canUseOfflineSync(auth: unknown) {
  const currentAuth = auth as any
  return Boolean(
    currentAuth?.isAdmin ||
      currentAuth?.isROEngineer ||
      currentAuth?.isPOEngineer ||
      currentAuth?.isEngineer,
  )
}

function isAdminAuth(auth: unknown) {
  return Boolean((auth as any)?.isAdmin)
}

export default function OfflineSync() {
  const auth = useAuth()

  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastChecked, setLastChecked] = useState('')
  const [lastSyncMessage, setLastSyncMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOfflineScrolled, setIsOfflineScrolled] = useState(false)
  const [blockedPendingCount, setBlockedPendingCount] = useState(0)
  const [removalDialog, setRemovalDialog] = useState<RemovalDialogState | null>(null)
  const [loadingRemovalPreview, setLoadingRemovalPreview] = useState(false)
  const [removingUpdate, setRemovingUpdate] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  const [offlineUpdates, setOfflineUpdates] = useState<HydratedOfflineUpdate[]>([])
  const [offlinePhotos, setOfflinePhotos] = useState<HydratedOfflinePhoto[]>([])
  const autoSyncAttemptRef = useRef(false)

  const userCanUseOfflineSync = useMemo(() => canUseOfflineSync(auth), [auth])
  const userIsAdmin = useMemo(() => isAdminAuth(auth), [auth])

  useEffect(() => {
    refreshOfflineData()

    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      autoSyncAttemptRef.current = false
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!diagnosticsOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDiagnosticsOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [diagnosticsOpen])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      window.requestAnimationFrame(() => {
        setIsOfflineScrolled(window.scrollY > 28)
        ticking = false
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const totalPendingCount = useMemo(() => {
    return offlineUpdates.length + offlinePhotos.length
  }, [offlinePhotos.length, offlineUpdates.length])

  const canSyncCurrentQueue = useMemo(() => {
    if (!userCanUseOfflineSync) return false
    if (userIsAdmin) return true
    return blockedPendingCount === 0
  }, [blockedPendingCount, userCanUseOfflineSync, userIsAdmin])

  async function getProjectLookup(): Promise<ProjectLookup> {
    const projects = await offlineDb.projects.toArray()

    return projects.reduce<ProjectLookup>(
      (lookup, project: any) => {
        const projectId = textValue(project.id)

        if (!projectId) return lookup

        lookup.names[projectId] = project.project_name || `Project ${projectId}`
        lookup.aor[projectId] = {
          province: project.province,
          municipality: project.municipality,
        }

        return lookup
      },
      { names: {}, aor: {} },
    )
  }

  async function refreshOfflineData() {
    try {
      setLoading(true)
      await offlineSyncService.repairLegacyOfflineQueue()
      setErrorMessage('')

      const [projectLookup, allUpdates, allPhotos] = await Promise.all([
        getProjectLookup(),
        offlineDb.project_updates.toArray(),
        offlineDb.project_photos.toArray(),
      ])

      const pendingUpdates = allUpdates.filter(isPendingRecord)
      const pendingPhotos = allPhotos.filter(isPendingRecord)

      const allowedUpdates = pendingUpdates.filter((update) =>
        canSyncOfflineRecord(update, projectLookup.aor, auth),
      )
      const allowedPhotos = pendingPhotos.filter((photo) =>
        canSyncOfflineRecord(photo, projectLookup.aor, auth, pendingUpdates),
      )

      const hiddenPendingCount =
        pendingUpdates.length - allowedUpdates.length + pendingPhotos.length - allowedPhotos.length

      const hydratedUpdates = allowedUpdates.map((update) => {
        const linkedPhotos = getLinkedPhotos(update, allowedPhotos)

        return {
          ...update,
          display_project_name:
            projectLookup.names[update.project_id] || update.project_name || '',
          pending_photo_count: linkedPhotos.length,
        }
      })

      const hydratedPhotos = allowedPhotos.map((photo) => ({
        ...photo,
        display_project_name:
          projectLookup.names[photo.project_id] || photo.project_name || '',
      }))

      setOfflineUpdates(hydratedUpdates)
      setOfflinePhotos(hydratedPhotos)
      setBlockedPendingCount(Math.max(0, hiddenPendingCount))
      setLastChecked(new Date().toISOString())
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load offline records from this device.')
    } finally {
      setLoading(false)
    }
  }

  async function syncNow(automatic = false) {
    try {
      setSyncing(true)
      setErrorMessage('')
      setLastSyncMessage('')

      if (!userCanUseOfflineSync) {
        setErrorMessage('You do not have permission to use Offline Sync.')
        return
      }

      if (!navigator.onLine) {
        setErrorMessage('You are currently offline. Please connect to the internet before syncing.')
        return
      }

      if (!canSyncCurrentQueue) {
        setErrorMessage(
          'This device has pending offline records outside your assigned AOR. For safety, sync is blocked. Please log in using the correct AOR account or an Admin account to sync those records.',
        )
        return
      }

      const result = await offlineSyncService.syncOfflineUpdates()

      await refreshOfflineData()
      setLastSyncMessage(
        result?.message ||
          (automatic
            ? 'Pending offline records synchronized after reconnection.'
            : 'Offline records were synced successfully.'),
      )
    } catch (error: any) {
      console.error(error)
      await refreshOfflineData()
      setErrorMessage(
        error?.message || 'Sync failed. Please check your connection and Supabase permissions.',
      )
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!isOnline || syncing || loading) return
    if (!userCanUseOfflineSync || !canSyncCurrentQueue) return
    if (totalPendingCount === 0 || autoSyncAttemptRef.current) return

    autoSyncAttemptRef.current = true
    const timer = window.setTimeout(() => {
      void syncNow(true)
    }, 1200)

    return () => window.clearTimeout(timer)
    // syncNow is intentionally triggered only once per reconnect cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canSyncCurrentQueue,
    isOnline,
    loading,
    syncing,
    totalPendingCount,
    userCanUseOfflineSync,
  ])

  async function openRemovalDialog(record: HydratedOfflineUpdate) {
    try {
      setLoadingRemovalPreview(true)
      setErrorMessage('')
      setRemovalDialog({ record, preview: null })

      const preview = await offlineSyncService.getPendingUpdateRemovalPreview(record)
      setRemovalDialog({ record, preview })
    } catch (error: any) {
      console.error(error)
      setRemovalDialog(null)
      setErrorMessage(
        error?.message || 'Unable to inspect the local files linked to this pending update.',
      )
    } finally {
      setLoadingRemovalPreview(false)
    }
  }

  function closeRemovalDialog() {
    if (removingUpdate) return
    setRemovalDialog(null)
  }

  async function confirmRemovePendingUpdate() {
    if (!removalDialog?.record) return

    try {
      setRemovingUpdate(true)
      setErrorMessage('')
      setLastSyncMessage('')

      const result = await offlineSyncService.removePendingOfflineUpdate(
        removalDialog.record,
      )

      setRemovalDialog(null)
      await refreshOfflineData()
      setLastSyncMessage(
        result?.message ||
          'The selected pending update and its linked local files were removed from this device.',
      )
    } catch (error: any) {
      console.error(error)
      setErrorMessage(
        error?.message || 'Unable to remove the selected pending update from this device.',
      )
    } finally {
      setRemovingUpdate(false)
    }
  }

  const pendingUpdatesCount = offlineUpdates.length
  const pendingPhotosCount = offlinePhotos.length

  if (!userCanUseOfflineSync) {
    return (
      <div className="offline-sync-page">
        <section className="offline-sync-hero">
          <div>
            <p className="offline-sync-eyebrow">Offline Field Operations</p>
            <h1>Offline Sync</h1>
            <p>Offline Sync is limited to Admin, RO Engineer, and PO Engineer accounts.</p>
          </div>
        </section>

        <section className="offline-sync-loading-card">
          <h2>Access Restricted</h2>
          <p>Your current account can view records based on AOR but cannot sync offline field updates.</p>
        </section>
      </div>
    )
  }

  return (
    <div className={`offline-sync-page ${isOfflineScrolled ? 'is-offline-scrolled' : ''}`}>
      <section className="offline-sync-hero">
        <div>
          <p className="offline-sync-eyebrow">Offline Field Operations</p>
          <h1>Offline Sync</h1>
          <p>
            Review pending inspection updates and photos saved on this device, then
            sync only records allowed under your assigned AOR.
          </p>
        </div>

        <div className={`offline-sync-connection ${isOnline ? 'online' : 'offline'}`}>
          <span className="offline-sync-dot" />
          <div>
            <strong>{isOnline ? 'Online' : 'Offline'}</strong>
            <small>{isOnline ? 'Ready to sync' : 'Waiting for connection'}</small>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="offline-sync-loading-card">
          <div className="offline-sync-loader" />
          <h2>Loading Offline Records</h2>
          <p>Checking pending updates and photos saved on this device...</p>
        </section>
      ) : (
        <>
          <section className="offline-sync-workspace">
            <div className="offline-sync-panel">
              <div className="offline-sync-panel-header">
                <div>
                  <p>OFFLINE QUEUE</p>
                  <h2>Pending Updates</h2>
                  <span>{pendingUpdatesCount} AOR-allowed offline inspection update/s found.</span>
                </div>
              </div>

              {offlineUpdates.length === 0 ? (
                <div className="offline-sync-empty">
                  <h3>No pending offline updates</h3>
                  <p>Inspection updates saved offline within your assigned AOR will appear here before syncing.</p>
                </div>
              ) : (
                <div className="offline-sync-list">
                  {offlineUpdates.map((record, index) => (
                    <article
                      key={textValue(record.id) || textValue(record.local_id) || `update-${index}`}
                      className={`offline-sync-record-card ${isOrphanedUpdate(record) ? 'orphaned' : ''}`}
                    >
                      <div className="offline-sync-record-top">
                        <div>
                          <h3>{getUpdateTitle(record)}</h3>
                          <p>{formatLongDate(getUpdateDate(record))}</p>
                        </div>

                        <span className={`offline-sync-status ${getStatusClass(record)}`}>
                          {getStatusLabel(record)}
                        </span>
                      </div>

                      <div className="offline-sync-record-grid">
                        <span>
                          <strong>Physical</strong>
                          {formatPercent(record.physical_accomplishment)}
                        </span>
                        <span>
                          <strong>Financial</strong>
                          {formatPercent(record.financial_accomplishment)}
                        </span>
                        <span>
                          <strong>Risk</strong>
                          {textValue(record.risk_level) || 'No Risk'}
                        </span>
                        <span>
                          <strong>Photos</strong>
                          {record.pending_photo_count || 0} pending
                        </span>
                      </div>

                      {textValue(record.issues) && (
                        <div className="offline-sync-note">
                          <strong>Issues:</strong> {textValue(record.issues)}
                        </div>
                      )}

                      {textValue(record.error) && (
                        <div className="offline-sync-record-error">
                          {textValue(record.error)}
                        </div>
                      )}

                      {isOrphanedUpdate(record) && (
                        <div className="offline-sync-orphaned-note">
                          <strong>Orphaned Update</strong>
                          <span>
                            The original project no longer exists in PMS10. This update cannot be synchronized.
                          </span>
                        </div>
                      )}

                      <div className="offline-sync-record-actions">
                        <button
                          type="button"
                          className="offline-sync-remove-button"
                          onClick={() => openRemovalDialog(record)}
                          disabled={syncing || removingUpdate}
                        >
                          {isOrphanedUpdate(record)
                            ? 'Remove Pending Update'
                            : 'Remove from Device'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="offline-sync-panel">
              <div className="offline-sync-panel-header">
                <div>
                  <p>PHOTO QUEUE</p>
                  <h2>Pending Photos</h2>
                  <span>{pendingPhotosCount} AOR-allowed offline photo/s found.</span>
                </div>
              </div>

              {offlinePhotos.length === 0 ? (
                <div className="offline-sync-empty">
                  <h3>No pending offline photos</h3>
                  <p>Photos captured during offline inspection within your assigned AOR will appear here.</p>
                </div>
              ) : (
                <div className="offline-sync-list">
                  {offlinePhotos.map((record, index) => (
                    <article
                      key={textValue(record.id) || `photo-${index}`}
                      className="offline-sync-record-card photo"
                    >
                      <div className="offline-sync-record-top">
                        <div>
                          <h3>{getPhotoProject(record)}</h3>
                          <p>{getPhotoTitle(record)}</p>
                        </div>

                        <span className={`offline-sync-status ${getStatusClass(record)}`}>
                          {getStatusLabel(record)}
                        </span>
                      </div>

                      <div className="offline-sync-record-grid">
                        <span>
                          <strong>Date Saved</strong>
                          {formatLongDate(getPhotoDate(record))}
                        </span>
                        <span>
                          <strong>File Size</strong>
                          {formatFileSize(getPhotoSize(record))}
                        </span>
                        <span>
                          <strong>Caption</strong>
                          {textValue(record.caption) || '-'}
                        </span>
                        <span>
                          <strong>Project ID</strong>
                          {textValue(record.project_id) || '-'}
                        </span>
                      </div>

                      {textValue(record.error) && (
                        <div className="offline-sync-record-error">
                          {textValue(record.error)}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="offline-sync-action-card">
            <div>
              <p>SYNC CONTROL</p>
              <h2>Sync Control</h2>
              <span>
                {lastChecked
                  ? `Last checked: ${formatDateTime(lastChecked)}`
                  : 'Offline storage has not been checked yet.'}
              </span>

              <div className="offline-sync-table-tags">
                <span>Updates: project_updates</span>
                <span>Photos: project_photos</span>
                <span>AOR hidden: {blockedPendingCount}</span>
              </div>
            </div>

            <div className="offline-sync-actions">
              <button type="button" className="secondary" onClick={refreshOfflineData}>
                Refresh
              </button>

              <button
                type="button"
                className="primary"
                onClick={() => void syncNow(false)}
                disabled={!isOnline || syncing || totalPendingCount === 0 || !canSyncCurrentQueue}
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </section>

          {blockedPendingCount > 0 && !userIsAdmin && (
            <div className="offline-sync-error">
              <strong>AOR Lock:</strong> {blockedPendingCount} pending offline record/s on this device are outside your assigned AOR. They are hidden and cannot be synced by this account.
            </div>
          )}

          {lastSyncMessage && (
            <div className="offline-sync-success">
              <strong>Success:</strong> {lastSyncMessage}
            </div>
          )}

          {errorMessage && (
            <div className="offline-sync-error">
              <strong>Notice:</strong> {errorMessage}
            </div>
          )}
        </>
      )}

      {createPortal(
        <>
          <button
            type="button"
            className="offline-sync-diagnostics-fab"
            aria-label="Open diagnostics"
            title="Diagnostics"
            aria-expanded={diagnosticsOpen}
            onClick={() => setDiagnosticsOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21.7 19.3 16.9 14.5a4.7 4.7 0 0 1-6-6l2.2 2.2 2.2-2.2-2.2-2.2a4.7 4.7 0 0 1 6 6l4.8 4.8-2.2 2.2ZM6.3 20.5l-2.8-2.8 6.3-6.3 2.8 2.8-6.3 6.3Z" />
            </svg>
          </button>

          {diagnosticsOpen && (
            <div
              className="offline-sync-diagnostics-popover-layer"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setDiagnosticsOpen(false)
              }}
            >
              <div
                className="offline-sync-diagnostics-popover-shell"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <AppDiagnosticsPanel
                  onRetrySync={() => syncNow(false)}
                  retryingSync={syncing}
                  canRetrySync={Boolean(
                    isOnline &&
                      canSyncCurrentQueue &&
                      totalPendingCount > 0 &&
                      !syncing,
                  )}
                  onClose={() => setDiagnosticsOpen(false)}
                />
              </div>
            </div>
          )}
        </>,
        document.body,
      )}

      {removalDialog && (
        <div
          className="offline-sync-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRemovalDialog()
          }}
        >
          <section
            className="offline-sync-remove-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-remove-title"
          >
            <div className="offline-sync-remove-icon" aria-hidden="true">
              !
            </div>

            <p className="offline-sync-remove-eyebrow">Local Queue Cleanup</p>
            <h2 id="offline-remove-title">Remove Pending Update?</h2>
            <p className="offline-sync-remove-copy">
              This removes only the selected offline record and its linked local files from this device. It will not delete an active cloud project or any other pending update.
            </p>

            <div className="offline-sync-remove-summary">
              <div>
                <span>Project</span>
                <strong>{getUpdateTitle(removalDialog.record)}</strong>
              </div>
              <div>
                <span>Inspection Date</span>
                <strong>{formatLongDate(getUpdateDate(removalDialog.record))}</strong>
              </div>
              <div>
                <span>Queued Photos</span>
                <strong>
                  {loadingRemovalPreview
                    ? 'Checking…'
                    : removalDialog.preview?.linkedPhotoCount || 0}
                </strong>
              </div>
              <div>
                <span>Local Aide Memoire</span>
                <strong>
                  {loadingRemovalPreview
                    ? 'Checking…'
                    : removalDialog.preview?.aideMemoireRecordCount
                      ? `${removalDialog.preview.aideMemoireRecordCount} record(s)`
                      : 'None'}
                </strong>
              </div>
              <div>
                <span>Generated PDF</span>
                <strong>
                  {loadingRemovalPreview
                    ? 'Checking…'
                    : removalDialog.preview?.hasLocalPdf
                      ? 'Will be removed'
                      : 'None'}
                </strong>
              </div>
              <div>
                <span>Generated DOCX</span>
                <strong>
                  {loadingRemovalPreview
                    ? 'Checking…'
                    : removalDialog.preview?.hasLocalDocx
                      ? 'Will be removed'
                      : 'None'}
                </strong>
              </div>
            </div>

            {isOrphanedUpdate(removalDialog.record) && (
              <div className="offline-sync-remove-warning">
                The original project was deleted, so this update can never be synchronized.
              </div>
            )}

            <div className="offline-sync-remove-actions">
              <button
                type="button"
                className="secondary"
                onClick={closeRemovalDialog}
                disabled={removingUpdate}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmRemovePendingUpdate}
                disabled={removingUpdate || loadingRemovalPreview}
              >
                {removingUpdate ? 'Removing…' : 'Remove from Device'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
