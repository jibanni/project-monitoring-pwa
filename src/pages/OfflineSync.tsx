import { useEffect, useMemo, useState } from 'react'
import { offlineDb, type OfflineProjectPhoto, type OfflineProjectUpdate } from '../lib/offlineDb'
import * as offlineSyncService from '../services/offlineSyncService'
import '../styles/offlineSync.css'
import '../styles/pageHero.css'

type ProjectNameMap = Record<string, string>

type HydratedOfflineUpdate = OfflineProjectUpdate & {
  display_project_name?: string
  pending_photo_count?: number
}

type HydratedOfflinePhoto = OfflineProjectPhoto & {
  display_project_name?: string
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
    status === 'uploading_photos'
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
  return record.file_size || (record.file_blob as Blob | undefined)?.size || (record.file as Blob | undefined)?.size
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

export default function OfflineSync() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastChecked, setLastChecked] = useState('')
  const [lastSyncMessage, setLastSyncMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOfflineScrolled, setIsOfflineScrolled] = useState(false)

  const [offlineUpdates, setOfflineUpdates] = useState<HydratedOfflineUpdate[]>([])
  const [offlinePhotos, setOfflinePhotos] = useState<HydratedOfflinePhoto[]>([])

  useEffect(() => {
    refreshOfflineData()

    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
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

  async function getProjectNameMap(): Promise<ProjectNameMap> {
    const projects = await offlineDb.projects.toArray()

    return projects.reduce<ProjectNameMap>((map, project) => {
      map[project.id] = project.project_name || `Project ${project.id}`
      return map
    }, {})
  }

  async function refreshOfflineData() {
    try {
      setLoading(true)
      setErrorMessage('')

      const [projectNameMap, allUpdates, allPhotos] = await Promise.all([
        getProjectNameMap(),
        offlineDb.project_updates.toArray(),
        offlineDb.project_photos.toArray(),
      ])

      const pendingUpdates = allUpdates.filter(isPendingRecord)
      const pendingPhotos = allPhotos.filter(isPendingRecord)

      const hydratedUpdates = pendingUpdates.map((update) => {
        const linkedPhotos = getLinkedPhotos(update, pendingPhotos)

        return {
          ...update,
          display_project_name:
            projectNameMap[update.project_id] || update.project_name || '',
          pending_photo_count: linkedPhotos.length,
        }
      })

      const hydratedPhotos = pendingPhotos.map((photo) => ({
        ...photo,
        display_project_name:
          projectNameMap[photo.project_id] || photo.project_name || '',
      }))

      setOfflineUpdates(hydratedUpdates)
      setOfflinePhotos(hydratedPhotos)
      setLastChecked(new Date().toISOString())
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load offline records from this device.')
    } finally {
      setLoading(false)
    }
  }

  async function syncNow() {
    try {
      setSyncing(true)
      setErrorMessage('')
      setLastSyncMessage('')

      if (!navigator.onLine) {
        setErrorMessage('You are currently offline. Please connect to the internet before syncing.')
        return
      }

      const result = await offlineSyncService.syncOfflineUpdates()

      await refreshOfflineData()
      setLastSyncMessage(result?.message || 'Offline records were synced successfully.')
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

  const pendingUpdatesCount = offlineUpdates.length
  const pendingPhotosCount = offlinePhotos.length

  return (
    <div className={`offline-sync-page ${isOfflineScrolled ? 'is-offline-scrolled' : ''}`}>
      <section className="offline-sync-hero">
        <div>
          <p className="offline-sync-eyebrow">Offline Field Operations</p>
          <h1>Offline Sync</h1>
          <p>
            Review pending inspection updates and photos saved on this device, then
            sync them to Supabase when internet connection is available.
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
                  <span>{pendingUpdatesCount} offline inspection update/s found.</span>
                </div>
              </div>

              {offlineUpdates.length === 0 ? (
                <div className="offline-sync-empty">
                  <h3>No pending offline updates</h3>
                  <p>Inspection updates saved offline will appear here before syncing.</p>
                </div>
              ) : (
                <div className="offline-sync-list">
                  {offlineUpdates.map((record, index) => (
                    <article
                      key={textValue(record.id) || textValue(record.local_id) || `update-${index}`}
                      className="offline-sync-record-card"
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
                  <span>{pendingPhotosCount} offline photo/s found.</span>
                </div>
              </div>

              {offlinePhotos.length === 0 ? (
                <div className="offline-sync-empty">
                  <h3>No pending offline photos</h3>
                  <p>Photos captured during offline inspection will appear here.</p>
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
              </div>
            </div>

            <div className="offline-sync-actions">
              <button type="button" className="secondary" onClick={refreshOfflineData}>
                Refresh
              </button>

              <button
                type="button"
                className="primary"
                onClick={syncNow}
                disabled={!isOnline || syncing || totalPendingCount === 0}
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </section>

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
    </div>
  )
}
