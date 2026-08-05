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
  onClose: () => void
}

type ActionState = 'idle' | 'loading' | 'success' | 'error'

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function formatDateTime(value: unknown) {
  const raw = textValue(value)
  if (!raw) return 'Not yet'

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function shortenCommit(value: string) {
  const clean = textValue(value)
  if (!clean || clean === 'local') return 'Local build'
  return clean.slice(0, 8)
}

function getAorSummary(auth: ReturnType<typeof useAuth>) {
  if (auth.isAdmin) return 'Regional Office 10 / All AORs'

  if (auth.isROEngineer) {
    const provinces = auth.roEngineerProvinceAssignments
      .map((assignment) => textValue(assignment.province))
      .filter(Boolean)

    return provinces.length > 0
      ? provinces.join(', ')
      : textValue(auth.profile?.province) || 'RO Engineer AOR'
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
  onClose,
}: AppDiagnosticsPanelProps) {
  const auth = useAuth()
  const [diagnostics, setDiagnostics] = useState<AppDiagnosticsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
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

  function buildDiagnosticReport(snapshot: AppDiagnosticsSnapshot | null = diagnostics) {
    if (!snapshot) return ''

    return [
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
    ].join('\n')
  }

  async function handleRetrySync() {
    if (!onRetrySync || !canRetrySync) return

    try {
      setActionState('loading')
      setActionMessage('Retrying pending records…')
      await onRetrySync()
      await loadDiagnostics()
      setActionState('success')
      setActionMessage('Offline queue checked.')
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage(error instanceof Error ? error.message : 'Retry did not complete.')
    }
  }

  async function handleRefreshProjects() {
    try {
      setActionState('loading')
      setActionMessage('Refreshing project cache…')
      const projects = await refreshSharedProjects({ force: true })
      await loadDiagnostics()
      setActionState('success')
      setActionMessage(`${projects.length} project record(s) ready.`)
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage('Unable to refresh project cache.')
    }
  }

  async function handleCopyReport() {
    try {
      const snapshot = diagnostics || (await loadDiagnostics())
      const report = buildDiagnosticReport(snapshot)
      if (!report) throw new Error('Diagnostics are still loading.')
      await copyText(report)
      setActionState('success')
      setActionMessage('Diagnostic report copied.')
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage(error instanceof Error ? error.message : 'Unable to copy report.')
    }
  }

  async function handleRefreshAppCache() {
    if (!navigator.onLine) {
      setActionState('error')
      setActionMessage('Connect to the internet first.')
      return
    }

    const confirmed = window.confirm(
      'Refresh PMS10 app files? Pending updates, photos, drafts, cached projects, and Aide Memoire files will not be deleted.',
    )

    if (!confirmed) return

    try {
      setActionState('loading')
      setActionMessage('Refreshing app files…')
      await refreshServiceWorkerAndAppShellCache()
      window.setTimeout(() => window.location.reload(), 250)
    } catch (error) {
      console.error(error)
      setActionState('error')
      setActionMessage('Unable to refresh app files.')
    }
  }

  const pendingTotal =
    (diagnostics?.pendingUpdates || 0) + (diagnostics?.pendingPhotos || 0)
  const failedTotal =
    (diagnostics?.failedUpdates || 0) + (diagnostics?.failedPhotos || 0)

  return (
    <section
      className="app-diagnostics-popover-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pms10-diagnostics-title"
    >
      <header className="app-diagnostics-popover-header">
        <div className="app-diagnostics-popover-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M13.4 2.7a1 1 0 0 0-1.8 0l-.7 1.6a8.2 8.2 0 0 0-1.4.6L7.9 4.3a1 1 0 0 0-1.2.4L4.8 6.6a1 1 0 0 0-.2 1.2l.7 1.6a8.2 8.2 0 0 0-.6 1.4l-1.7.7a1 1 0 0 0-.6.9v2.7a1 1 0 0 0 .6.9l1.7.7c.2.5.4 1 .6 1.4l-.7 1.6a1 1 0 0 0 .2 1.2l1.9 1.9a1 1 0 0 0 1.2.2l1.6-.7c.5.3.9.5 1.4.6l.7 1.6a1 1 0 0 0 .9.6h2.7a1 1 0 0 0 .9-.6l.7-1.6c.5-.2 1-.4 1.4-.6l1.6.7a1 1 0 0 0 1.2-.2l1.9-1.9a1 1 0 0 0 .2-1.2l-.7-1.6c.3-.5.5-.9.6-1.4l1.6-.7a1 1 0 0 0 .6-.9v-2.7a1 1 0 0 0-.6-.9l-1.6-.7a8.2 8.2 0 0 0-.6-1.4l.7-1.6a1 1 0 0 0-.2-1.2l-1.9-1.9a1 1 0 0 0-1.2-.2l-1.6.7a8.2 8.2 0 0 0-1.4-.6l-.7-1.6a1 1 0 0 0-.9-.6h-2.7Zm1.4 10.7a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0Z" />
          </svg>
        </div>

        <div>
          <h2 id="pms10-diagnostics-title">Diagnostics</h2>
          <p>Quick device and sync check</p>
        </div>

        <button
          type="button"
          className="app-diagnostics-popover-close"
          onClick={onClose}
          aria-label="Close diagnostics"
        >
          ×
        </button>
      </header>

      <div className="app-diagnostics-popover-status">
        <span className={diagnostics?.online ? 'online' : 'offline'}>
          {diagnostics?.online ? 'Online' : 'Offline'}
        </span>
        <span>{diagnostics?.mode || 'Checking mode…'}</span>
      </div>

      <div className="app-diagnostics-popover-metrics">
        <div>
          <span>Version</span>
          <strong>{diagnostics?.version || '…'}</strong>
          <small>{shortenCommit(diagnostics?.commit || '')}</small>
        </div>
        <div>
          <span>Pending</span>
          <strong>{loading ? '…' : pendingTotal}</strong>
          <small>{failedTotal > 0 ? `${failedTotal} failed` : 'queue records'}</small>
        </div>
        <div>
          <span>Projects</span>
          <strong>{loading ? '…' : diagnostics?.cachedProjects ?? 0}</strong>
          <small>cached</small>
        </div>
        <div>
          <span>Last Sync</span>
          <strong className="date-value">
            {loading ? '…' : formatDateTime(diagnostics?.lastSuccessfulSync?.at)}
          </strong>
          <small>this device</small>
        </div>
      </div>

      <div className="app-diagnostics-popover-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void handleRetrySync()}
          disabled={!canRetrySync || retryingSync || actionState === 'loading'}
        >
          {retryingSync ? 'Retrying…' : 'Retry Sync'}
        </button>
        <button
          type="button"
          onClick={() => void handleRefreshProjects()}
          disabled={actionState === 'loading'}
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void handleCopyReport()}
          disabled={loading || actionState === 'loading'}
        >
          Copy Report
        </button>
        <button
          type="button"
          onClick={() => void handleRefreshAppCache()}
          disabled={actionState === 'loading' || diagnostics?.online === false}
        >
          App Cache
        </button>
      </div>

      {actionMessage && (
        <div className={`app-diagnostics-popover-message ${actionState}`} role="status">
          {actionMessage}
        </div>
      )}
    </section>
  )
}
