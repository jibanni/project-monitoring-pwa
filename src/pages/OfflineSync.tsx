import { useEffect, useState } from 'react'
import { offlineDb } from '../lib/offlineDb'
import * as offlineSyncService from '../services/offlineSyncService'
import '../styles/offlineSync.css'
import '../styles/pageHero.css'

type AnyRecord = Record<string, unknown>

type OfflineUpdateRecord = AnyRecord & {
  id?: string | number
  project_id?: string
  project_name?: string
  inspection_date?: string
  physical_accomplishment?: number | string
  financial_accomplishment?: number | string
  risk_level?: string
  issues?: string
  recommendations?: string
  remarks?: string
  created_at?: string
  updated_at?: string
  status?: string
  sync_status?: string
  error?: string
}

type OfflinePhotoRecord = AnyRecord & {
  id?: string | number
  project_id?: string
  project_update_id?: string
  project_name?: string
  filename?: string
  file_name?: string
  name?: string
  caption?: string
  size?: number
  file_size?: number
  created_at?: string
  uploaded_at?: string
  status?: string
  sync_status?: string
  error?: string
}

type TableInfo = {
  name: string
  table: {
    toArray: () => Promise<AnyRecord[]>
    count?: () => Promise<number>
  }
}

const UPDATE_TABLE_CANDIDATES = [
  'pendingUpdates',
  'offlineUpdates',
  'projectUpdates',
  'project_updates',
  'updates',
]

const PHOTO_TABLE_CANDIDATES = [
  'pendingPhotos',
  'offlinePhotos',
  'projectPhotos',
  'project_photos',
  'photos',
]

const SYNC_ALL_FUNCTION_CANDIDATES = [
  'syncAllOfflineData',
  'syncOfflineData',
  'syncPendingOfflineData',
  'syncPendingData',
  'syncAll',
]

const SYNC_UPDATE_FUNCTION_CANDIDATES = [
  'syncPendingUpdates',
  'syncOfflineUpdates',
  'syncProjectUpdates',
  'syncUpdates',
]

const SYNC_PHOTO_FUNCTION_CANDIDATES = [
  'syncPendingPhotos',
  'syncOfflinePhotos',
  'syncProjectPhotos',
  'syncPhotos',
]

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

  const date = new Date(rawValue)

  if (Number.isNaN(date.getTime())) return 'No date'

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

  if (Number.isNaN(date.getTime())) return 'No date'

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

function getStatusLabel(record: AnyRecord) {
  const status = textValue(record.status || record.sync_status)

  if (status) return status

  if (textValue(record.error)) return 'Failed'

  return 'Pending'
}

function getStatusClass(record: AnyRecord) {
  const status = getStatusLabel(record).toLowerCase()

  if (status.includes('sync') || status.includes('success')) return 'synced'
  if (status.includes('fail') || status.includes('error')) return 'failed'
  if (status.includes('upload')) return 'uploading'

  return 'pending'
}

function getNestedText(record: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const directValue = textValue(record[key])

    if (directValue) return directValue
  }

  const payload = record.payload as AnyRecord | undefined
  const data = record.data as AnyRecord | undefined
  const project = record.project as AnyRecord | undefined

  for (const source of [payload, data, project]) {
    if (!source) continue

    for (const key of keys) {
      const nestedValue = textValue(source[key])

      if (nestedValue) return nestedValue
    }
  }

  return ''
}

function findDexieTable(candidateNames: string[]): TableInfo | null {
  const db = offlineDb as unknown as Record<string, unknown>

  for (const name of candidateNames) {
    const possibleTable = db[name] as TableInfo['table'] | undefined

    if (possibleTable && typeof possibleTable.toArray === 'function') {
      return {
        name,
        table: possibleTable,
      }
    }
  }

  return null
}

async function readTable(tableInfo: TableInfo | null) {
  if (!tableInfo) return []

  try {
    const rows = await tableInfo.table.toArray()
    return rows
  } catch (error) {
    console.error(`Unable to read offline table: ${tableInfo.name}`, error)
    return []
  }
}

function getServiceObjects() {
  const moduleObject = offlineSyncService as unknown as Record<string, unknown>
  const defaultObject = moduleObject.default as Record<string, unknown> | undefined

  return [moduleObject, defaultObject].filter(Boolean) as Record<string, unknown>[]
}

function findServiceFunction(candidateNames: string[]) {
  const serviceObjects = getServiceObjects()

  for (const serviceObject of serviceObjects) {
    for (const name of candidateNames) {
      const possibleFunction = serviceObject[name]

      if (typeof possibleFunction === 'function') {
        return possibleFunction as () => Promise<unknown>
      }
    }
  }

  return null
}

function getUpdateTitle(record: OfflineUpdateRecord) {
  return (
    getNestedText(record, ['project_name', 'name', 'title']) ||
    `Project ${textValue(record.project_id) || 'Update'}`
  )
}

function getUpdateDate(record: OfflineUpdateRecord) {
  return (
    record.inspection_date ||
    record.created_at ||
    record.updated_at ||
    getNestedText(record, ['inspection_date', 'created_at', 'updated_at'])
  )
}

function getUpdateRisk(record: OfflineUpdateRecord) {
  return getNestedText(record, ['risk_level']) || 'No Risk'
}

function getUpdatePhysical(record: OfflineUpdateRecord) {
  return getNestedText(record, ['physical_accomplishment'])
}

function getUpdateFinancial(record: OfflineUpdateRecord) {
  return getNestedText(record, ['financial_accomplishment'])
}

function getPhotoTitle(record: OfflinePhotoRecord) {
  return (
    getNestedText(record, ['filename', 'file_name', 'name']) ||
    `Offline Photo ${textValue(record.id) || ''}`.trim()
  )
}

function getPhotoProject(record: OfflinePhotoRecord) {
  return (
    getNestedText(record, ['project_name', 'project_title']) ||
    `Project ${textValue(record.project_id) || 'Photo'}`
  )
}

function getPhotoDate(record: OfflinePhotoRecord) {
  return (
    record.created_at ||
    record.uploaded_at ||
    getNestedText(record, ['created_at', 'uploaded_at'])
  )
}

function getPhotoSize(record: OfflinePhotoRecord) {
  return record.size || record.file_size || getNestedText(record, ['size', 'file_size'])
}

export default function OfflineSync() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastChecked, setLastChecked] = useState('')
  const [lastSyncMessage, setLastSyncMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOfflineScrolled, setIsOfflineScrolled] = useState(false)

  const [updateTableName, setUpdateTableName] = useState('')
  const [photoTableName, setPhotoTableName] = useState('')
  const [offlineUpdates, setOfflineUpdates] = useState<OfflineUpdateRecord[]>([])
  const [offlinePhotos, setOfflinePhotos] = useState<OfflinePhotoRecord[]>([])

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

  async function refreshOfflineData() {
    try {
      setLoading(true)
      setErrorMessage('')

      const updateTable = findDexieTable(UPDATE_TABLE_CANDIDATES)
      const photoTable = findDexieTable(PHOTO_TABLE_CANDIDATES)

      setUpdateTableName(updateTable?.name || '')
      setPhotoTableName(photoTable?.name || '')

      const [updates, photos] = await Promise.all([
        readTable(updateTable),
        readTable(photoTable),
      ])

      setOfflineUpdates(updates as OfflineUpdateRecord[])
      setOfflinePhotos(photos as OfflinePhotoRecord[])
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

      const syncAllFunction = findServiceFunction(SYNC_ALL_FUNCTION_CANDIDATES)

      if (syncAllFunction) {
        await syncAllFunction()
      } else {
        const syncUpdatesFunction = findServiceFunction(SYNC_UPDATE_FUNCTION_CANDIDATES)
        const syncPhotosFunction = findServiceFunction(SYNC_PHOTO_FUNCTION_CANDIDATES)

        if (!syncUpdatesFunction && !syncPhotosFunction) {
          setErrorMessage(
            'No compatible sync function was found in offlineSyncService.ts. Please check the service export name.',
          )
          return
        }

        if (syncUpdatesFunction) {
          await syncUpdatesFunction()
        }

        if (syncPhotosFunction) {
          await syncPhotosFunction()
        }
      }

      await refreshOfflineData()
      setLastSyncMessage('Offline records were synced successfully.')
    } catch (error) {
      console.error(error)
      setErrorMessage('Sync failed. Please check your connection and Supabase permissions.')
    } finally {
      setSyncing(false)
    }
  }

  const pendingUpdatesCount = offlineUpdates.length
  const pendingPhotosCount = offlinePhotos.length
  const totalPendingCount = pendingUpdatesCount + pendingPhotosCount

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
                      key={textValue(record.id) || `update-${index}`}
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
                          {formatPercent(getUpdatePhysical(record))}
                        </span>
                        <span>
                          <strong>Financial</strong>
                          {formatPercent(getUpdateFinancial(record))}
                        </span>
                        <span>
                          <strong>Risk</strong>
                          {getUpdateRisk(record)}
                        </span>
                        <span>
                          <strong>Project ID</strong>
                          {textValue(record.project_id) || '-'}
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
                          <h3>{getPhotoTitle(record)}</h3>
                          <p>{getPhotoProject(record)}</p>
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

              {(updateTableName || photoTableName) && (
                <div className="offline-sync-table-tags">
                  {updateTableName && <span>Updates: {updateTableName}</span>}
                  {photoTableName && <span>Photos: {photoTableName}</span>}
                </div>
              )}
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

          {!updateTableName && !photoTableName && (
            <div className="offline-sync-warning">
              <strong>Offline storage notice:</strong> No compatible offline update/photo
              tables were detected from offlineDb.ts. The page is ready, but table names may
              need to be aligned with your Dexie setup.
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
    </div>
  )
}