import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppDiagnosticsPanel from '../components/AppDiagnosticsPanel'
import { useAuth } from '../context/AuthContext'
import {
  inspectOfflineQueueAccess,
  type OfflineQueueAccessSnapshot,
} from '../lib/offlineQueueAccess'
import * as offlineSyncService from '../services/offlineSyncService'
import '../styles/appDiagnostics.css'

export default function OfflineSyncDiagnostics() {
  const auth = useAuth()
  const [queueAccess, setQueueAccess] = useState<OfflineQueueAccessSnapshot | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  const refreshQueueAccess = useCallback(async () => {
    const snapshot = await inspectOfflineQueueAccess(auth)
    setQueueAccess(snapshot)
    return snapshot
  }, [auth])

  useEffect(() => {
    void refreshQueueAccess()
  }, [refreshQueueAccess])

  useEffect(() => {
    function handleConnectionChange() {
      setIsOnline(navigator.onLine)
      void refreshQueueAccess()
    }

    window.addEventListener('online', handleConnectionChange)
    window.addEventListener('offline', handleConnectionChange)

    return () => {
      window.removeEventListener('online', handleConnectionChange)
      window.removeEventListener('offline', handleConnectionChange)
    }
  }, [refreshQueueAccess])

  async function retryOfflineSync() {
    setSyncing(true)

    try {
      const access = await refreshQueueAccess()

      if (!navigator.onLine) {
        throw new Error('Connect to the internet before retrying the offline queue.')
      }

      if (!access.canUseOfflineSync) {
        throw new Error('Your account does not have permission to synchronize field updates.')
      }

      if (access.totalPendingCount === 0) {
        return
      }

      if (!access.canSyncCurrentQueue) {
        throw new Error(
          'This device contains pending records outside your assigned AOR. Open Offline Sync using the correct AOR account or an Admin account before retrying.',
        )
      }

      await offlineSyncService.syncOfflineUpdates()
      await refreshQueueAccess()
    } finally {
      setSyncing(false)
    }
  }

  const canRetrySync = Boolean(
    isOnline &&
      queueAccess?.canUseOfflineSync &&
      queueAccess.canSyncCurrentQueue &&
      queueAccess.totalPendingCount > 0,
  )

  return (
    <div className="offline-diagnostics-page">
      <section className="offline-diagnostics-hero">
        <div>
          <p>OFFLINE SYNC TOOLS</p>
          <h1>App Diagnostics</h1>
          <span>
            Review the installed PMS10 build, device cache, local records, and synchronization health.
          </span>
        </div>

        <Link to="/offline-sync" className="offline-diagnostics-back-link">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H19a1 1 0 1 1 0 2h-8.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" />
          </svg>
          <span>Back to Offline Sync</span>
        </Link>
      </section>

      {queueAccess && queueAccess.blockedPendingCount > 0 && !auth.isAdmin && (
        <div className="offline-diagnostics-aor-notice" role="status">
          <strong>AOR safety lock:</strong> {queueAccess.blockedPendingCount} pending local record(s)
          are outside your assigned AOR. Retry Sync remains disabled for this account.
        </div>
      )}

      <AppDiagnosticsPanel
        onRetrySync={retryOfflineSync}
        retryingSync={syncing}
        canRetrySync={canRetrySync}
        defaultExpanded
      />
    </div>
  )
}
