import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  collectAppDiagnostics,
  formatDiagnosticBytes,
  refreshServiceWorkerAndAppShellCache,
  type AppDiagnosticsSnapshot,
} from '../lib/appDiagnostics'
import { refreshSharedProjects } from '../lib/projectDataCache'
import '../styles/appDiagnostics.css'

type AppDiagnosticsPanelProps = {
  onRetrySync?: () => Promise<void> | void
  retryingSync?: boolean
  canRetrySync?: boolean
}

type ActionState = 'idle' | 'loading' | 'success' | 'error'

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function formatDateTime(value: unknown) {
  const raw = textValue(value)
  if (!raw) return 'Not yet available'

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function shortenCommit(value: string) {
  const clean = textValue(value)
  if (!clean) return 'Local build'
  if (clean === 'local') return 'Local build'
  return clean.slice(0, 12)
}

function getAorSummary(auth: ReturnType<typeof useAuth>) {
  if (auth.isAdmin) return 'Regional Office 10 / All AORs'

  if (auth.isROEngineer) {
    const provinces = auth.roEngineerProvinceAssignments
      .map((assignment) => textValue(assignment.province))
      .filter(Boolean)

    return provinces.length > 0 ? provinces.join(', ') : textValue(auth.profile?.province) || 'RO Engineer AOR'
  }

  if (auth.isPOEngineer || auth.isEngineer) {
    const assignments = auth.poEngineerLguAssignments
      .map((assignment) => {
        const province = textValue(assignment.province)
        const municipality = textValue(assignment.municipality)
        return [municipality, province].filter(Boolean).join(', ')
      })
      .filter(Boolean)

    if (assignments.length > 0) return assignments.join(' · ')
  }

  return (
    [auth.profile?.municipality || auth.profile?.city || auth.profile?.huc, auth.profile?.province]
      .map(textValue)
      .filter(Boolean)
      .join(', ') || 'No AOR assignment cached'
  )
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()

  if (!copied) throw new Error('Copy is not supported on this device.')
}

export default function AppDiagnosticsPanel({
  onRetrySync,
  retryingSync = false,
  canRetrySync = false,
}: AppDiagnosticsPanelProps) {
  const auth = useAuth()
  const [diagnostics, setDiagnostics] = useState<AppDiagnosticsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [actionMessage, setActionMessage] = useState('')

  const userName = textValue(auth.profile?.full_name) || textValue(auth.user?.email) || 'Unknown user'
  const userEmail = textValue(auth.profile?.email) || textValue(auth.user?.email) || 'No email cached'
  const role = textValue(auth.profile?.role) || 'Unknown role'
  const aorSummary = useMemo(() => getAorSummary(auth), [auth])

  const loadDiagnostics = useCallback(async () => {
    try {
      setLoading(true)
      const next = await collectAppDiagnostics()
      setDiagnostics(next)
      return next
    } catch (error) {
      console.error('Unable to collect PMS10 diagnostics.', error)
      setActionState('error')
      setActionMessage('Unable to read diagnostics from this device.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDiagnostics()
  }, [loadDiagnostics])

  useEffect(() => {
    function handleConnectionChange() {
      void loadDiagnostics()
    }

    window.addEventListener('online', handleConnectionChange)
    window.addEventListener('offline', handleConnectionChange)
    return () => {
      window.removeEventListener('online', handleConnectionChange)
      window.removeEventListener('offline', handleConnectionChange)
    }
  }, [loadDiagnostics])

  async function handleRefreshProjects() {
    try {
      setActionState('loading')
      setActionMessage('Refreshing the shared project cache...')
      const projects = await refreshSharedProjects({ force: true })
      await loadDiagnostics()
      setActionState('success')
      setActionMessage(
        navigator.onLine
          ? `${projects.length} project record(s) are ready in the shared cache.`
          : `${projects.length} cached project record(s) remain available offline.`,
      )
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage('Unable to refresh the project cache.')
    }
  }

  async function handleRetrySync() {
    if (!onRetrySync || !canRetrySync) return

    try {
      setActionState('loading')
      setActionMessage('Retrying pending offline records...')
      await onRetrySync()
      await loadDiagnostics()
      setActionState('success')
      setActionMessage('Offline queue check completed. Review the pending counts below.')
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage('The offline queue retry did not complete successfully.')
    }
  }

  function buildDiagnosticReport(snapshot: AppDiagnosticsSnapshot | null = diagnostics) {
    if (!snapshot) return ''

    const lines = [
      'PMS10 Diagnostic Report',
      `Generated: ${formatDateTime(snapshot.capturedAt)}`,
      '',
      `Version: ${snapshot.version}`,
      `Build date: ${formatDateTime(snapshot.buildDate)}`,
      `Commit: ${snapshot.commit}`,
      `Mode: ${snapshot.mode}`,
      `Platform: ${snapshot.platform}`,
      `Connection: ${snapshot.online ? 'Online' : 'Offline'}`,
      '',
      `User: ${userName}`,
      `Email: ${userEmail}`,
      `Role: ${role}`,
      `AOR: ${aorSummary}`,
      '',
      `Cached projects: ${snapshot.cachedProjects}`,
      `Pending updates: ${snapshot.pendingUpdates}`,
      `Pending photos: ${snapshot.pendingPhotos}`,
      `Failed/orphaned updates: ${snapshot.failedUpdates}`,
      `Failed photos: ${snapshot.failedPhotos}`,
      `Local Aide Memoire records: ${snapshot.localAideMemoires}`,
      `Local generated documents: ${snapshot.localDocuments}`,
      `Last successful sync: ${formatDateTime(snapshot.lastSuccessfulSync?.at)}`,
      '',
      `Service worker: ${snapshot.serviceWorkerState}`,
      `Service worker controlled: ${snapshot.serviceWorkerControlled ? 'Yes' : 'No'}`,
      `Service worker script: ${snapshot.serviceWorkerScript || 'Unavailable'}`,
      `Cache Storage entries: ${snapshot.cacheNames.length}`,
      `Storage used: ${formatDiagnosticBytes(snapshot.storageUsedBytes)}`,
      `Storage quota: ${formatDiagnosticBytes(snapshot.storageQuotaBytes)}`,
    ]

    return lines.join('\n')
  }

  async function handleCopyReport() {
    try {
      const snapshot = diagnostics || (await loadDiagnostics())
      const report = buildDiagnosticReport(snapshot)
      if (!report) throw new Error('Diagnostics are still loading.')
      await copyText(report)
      setActionState('success')
      setActionMessage('Diagnostic report copied to the clipboard.')
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage(error instanceof Error ? error.message : 'Unable to copy the diagnostic report.')
    }
  }

  async function handleRefreshAppCache() {
    if (!navigator.onLine) {
      setActionState('error')
      setActionMessage('Connect to the internet before refreshing the app-shell cache.')
      return
    }

    const confirmed = window.confirm(
      'Refresh the PMS10 app-shell cache? Pending updates, photos, drafts, cached projects, and Aide Memoire files will not be deleted. The app will reload after the cache is refreshed.',
    )

    if (!confirmed) return

    try {
      setActionState('loading')
      setActionMessage('Refreshing the PMS10 app-shell cache...')
      await refreshServiceWorkerAndAppShellCache()
      window.setTimeout(() => window.location.reload(), 250)
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage('Unable to refresh the app-shell cache on this device.')
    }
  }

  const lastSyncLabel = diagnostics?.lastSuccessfulSync
    ? formatDateTime(diagnostics.lastSuccessfulSync.at)
    : 'No successful offline sync recorded on this device'

  return (
    <section className="app-diagnostics-card" aria-labelledby="pms10-diagnostics-title">
      <div className="app-diagnostics-header">
        <div>
          <p>RELEASE READINESS</p>
          <h2 id="pms10-diagnostics-title">App Diagnostics</h2>
          <span>Device, cache, synchronization, and installed-build information.</span>
        </div>

        <button
          type="button"
          className="app-diagnostics-toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      <div className="app-diagnostics-summary">
        <div>
          <span>Version</span>
          <strong>{diagnostics?.version || 'Loading…'}</strong>
          <small>{shortenCommit(diagnostics?.commit || '')}</small>
        </div>
        <div>
          <span>Installed Mode</span>
          <strong>{diagnostics?.mode || 'Loading…'}</strong>
          <small>{diagnostics?.platform || 'Checking device'}</small>
        </div>
        <div>
          <span>Project Cache</span>
          <strong>{loading ? '…' : diagnostics?.cachedProjects ?? 0}</strong>
          <small>records on this device</small>
        </div>
        <div>
          <span>Pending Queue</span>
          <strong>
            {loading
              ? '…'
              : (diagnostics?.pendingUpdates || 0) + (diagnostics?.pendingPhotos || 0)}
          </strong>
          <small>
            {diagnostics?.failedUpdates || diagnostics?.failedPhotos
              ? `${(diagnostics?.failedUpdates || 0) + (diagnostics?.failedPhotos || 0)} failed/orphaned`
              : 'no recorded failures'}
          </small>
        </div>
      </div>

      {expanded && diagnostics && (
        <div className="app-diagnostics-details">
          <div className="app-diagnostics-section">
            <h3>Build and Runtime</h3>
            <dl>
              <div><dt>Build date</dt><dd>{formatDateTime(diagnostics.buildDate)}</dd></div>
              <div><dt>Commit</dt><dd>{diagnostics.commit}</dd></div>
              <div><dt>Connection</dt><dd>{diagnostics.online ? 'Online' : 'Offline'}</dd></div>
              <div><dt>Service worker</dt><dd>{diagnostics.serviceWorkerState}</dd></div>
              <div><dt>Controlled by SW</dt><dd>{diagnostics.serviceWorkerControlled ? 'Yes' : 'No'}</dd></div>
              <div><dt>App-shell caches</dt><dd>{diagnostics.cacheNames.length}</dd></div>
            </dl>
          </div>

          <div className="app-diagnostics-section">
            <h3>User and AOR</h3>
            <dl>
              <div><dt>User</dt><dd>{userName}</dd></div>
              <div><dt>Email</dt><dd>{userEmail}</dd></div>
              <div><dt>Role</dt><dd>{role}</dd></div>
              <div><dt>Assigned AOR</dt><dd>{aorSummary}</dd></div>
            </dl>
          </div>

          <div className="app-diagnostics-section">
            <h3>Local Data</h3>
            <dl>
              <div><dt>Pending updates</dt><dd>{diagnostics.pendingUpdates}</dd></div>
              <div><dt>Pending photos</dt><dd>{diagnostics.pendingPhotos}</dd></div>
              <div><dt>Aide Memoire records</dt><dd>{diagnostics.localAideMemoires}</dd></div>
              <div><dt>Generated documents</dt><dd>{diagnostics.localDocuments}</dd></div>
              <div><dt>Storage used</dt><dd>{formatDiagnosticBytes(diagnostics.storageUsedBytes)}</dd></div>
              <div><dt>Storage quota</dt><dd>{formatDiagnosticBytes(diagnostics.storageQuotaBytes)}</dd></div>
            </dl>
          </div>

          <div className="app-diagnostics-section">
            <h3>Synchronization</h3>
            <dl>
              <div><dt>Last successful sync</dt><dd>{lastSyncLabel}</dd></div>
              <div><dt>Last synced updates</dt><dd>{diagnostics.lastSuccessfulSync?.syncedUpdates ?? 0}</dd></div>
              <div><dt>Last synced photos</dt><dd>{diagnostics.lastSuccessfulSync?.syncedPhotos ?? 0}</dd></div>
            </dl>
          </div>
        </div>
      )}

      <div className="app-diagnostics-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void handleRetrySync()}
          disabled={!canRetrySync || retryingSync || actionState === 'loading'}
        >
          {retryingSync ? 'Retrying Sync…' : 'Retry Sync'}
        </button>
        <button
          type="button"
          onClick={() => void handleRefreshProjects()}
          disabled={actionState === 'loading'}
        >
          Refresh Project Cache
        </button>
        <button
          type="button"
          onClick={() => void handleCopyReport()}
          disabled={loading || actionState === 'loading'}
        >
          Copy Diagnostic Report
        </button>
        <button
          type="button"
          className="warning"
          onClick={() => void handleRefreshAppCache()}
          disabled={actionState === 'loading' || diagnostics?.online === false}
        >
          Refresh App Cache
        </button>
      </div>

      <p className="app-diagnostics-safety-note">
        Refresh App Cache requires an internet connection and clears only downloaded app-shell files.
        It does not delete pending updates, photos, drafts, cached projects, or locally generated Aide Memoire files.
      </p>

      {actionMessage && (
        <div className={`app-diagnostics-message ${actionState}`} role="status">
          {actionMessage}
        </div>
      )}
    </section>
  )
}
