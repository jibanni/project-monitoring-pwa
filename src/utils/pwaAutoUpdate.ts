const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000
const UPDATE_CHECK_THROTTLE_MS = 60 * 1000
const SAFE_RELOAD_POLL_MS = 2000
const RELOAD_GUARD_MS = 15 * 1000

const RELOAD_GUARD_KEY = 'pms10:pwa:last-auto-reload'
const UPDATE_PENDING_KEY = 'pms10:pwa:update-pending'

const SENSITIVE_ROUTE_PATTERNS: RegExp[] = [
  /^\/login(?:\/|$)/,
  /^\/register(?:\/|$)/,
  /^\/forgot-password(?:\/|$)/,
  /^\/reset-password(?:\/|$)/,
  /^\/offline-sync(?:\/|$)/,
  /^\/projects\/create(?:\/|$)/,
  /^\/projects\/[^/]+\/edit(?:\/|$)/,
  /^\/projects\/[^/]+\/updates(?:\/|$)/,
  /^\/users(?:\/|$)/,
]

let initialized = false
let updatePending = false
let lastUpdateCheckAt = 0
let pendingReloadTimer: number | null = null
let periodicUpdateTimer: number | null = null
let hadControllerAtBoot = false

function isSensitiveRoute(pathname = window.location.pathname) {
  return SENSITIVE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
}

function isUserActivelyEditing() {
  const active = document.activeElement

  if (!(active instanceof HTMLElement)) return false

  if (active.matches('input, textarea, select')) return true
  return active.isContentEditable
}

function wasJustAutoReloaded() {
  try {
    const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0')
    return Number.isFinite(lastReload) && Date.now() - lastReload < RELOAD_GUARD_MS
  } catch {
    return false
  }
}

function rememberAutoReload() {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // Session storage can be unavailable in restrictive browser modes.
  }
}

function persistUpdatePending(value: boolean) {
  updatePending = value

  try {
    if (value) {
      sessionStorage.setItem(UPDATE_PENDING_KEY, '1')
    } else {
      sessionStorage.removeItem(UPDATE_PENDING_KEY)
    }
  } catch {
    // The in-memory flag is sufficient when sessionStorage is unavailable.
  }
}

function restoreUpdatePending() {
  try {
    updatePending = sessionStorage.getItem(UPDATE_PENDING_KEY) === '1'
  } catch {
    updatePending = false
  }
}

function clearPendingReloadTimer() {
  if (pendingReloadTimer !== null) {
    window.clearInterval(pendingReloadTimer)
    pendingReloadTimer = null
  }
}

function reloadWhenSafe() {
  if (!updatePending) {
    clearPendingReloadTimer()
    return
  }

  if (isSensitiveRoute() || isUserActivelyEditing()) return
  if (wasJustAutoReloaded()) return

  clearPendingReloadTimer()
  persistUpdatePending(false)
  rememberAutoReload()
  window.location.reload()
}

function scheduleReloadWhenSafe() {
  reloadWhenSafe()

  if (!updatePending || pendingReloadTimer !== null) return

  pendingReloadTimer = window.setInterval(reloadWhenSafe, SAFE_RELOAD_POLL_MS)
}

async function checkForServiceWorkerUpdate(force = false) {
  if (!navigator.onLine || !('serviceWorker' in navigator)) return

  const now = Date.now()
  if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_THROTTLE_MS) return
  lastUpdateCheckAt = now

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  } catch (error) {
    console.debug('PMS10 service-worker update check skipped.', error)
  }
}

function handleControllerChange() {
  // The first controllerchange on a device can simply be the first PWA install.
  // Reload only when the page was already controlled by an older PMS10 worker.
  if (!hadControllerAtBoot) {
    hadControllerAtBoot = true
    return
  }

  persistUpdatePending(true)
  scheduleReloadWhenSafe()
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return

  void checkForServiceWorkerUpdate(true)
  scheduleReloadWhenSafe()
}

function handleWindowFocus() {
  void checkForServiceWorkerUpdate()
  scheduleReloadWhenSafe()
}

function handleOnline() {
  void checkForServiceWorkerUpdate(true)
  scheduleReloadWhenSafe()
}

/**
 * Keeps installed PMS10 clients moving to the newest deployment without
 * clearing IndexedDB/Dexie or forcing reloads while a user is working in a
 * form, project update, offline sync, or user-access screen.
 */
export function initPms10PwaAutoUpdate() {
  if (initialized || !('serviceWorker' in navigator)) return
  initialized = true

  hadControllerAtBoot = Boolean(navigator.serviceWorker.controller)
  restoreUpdatePending()

  navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('online', handleOnline)

  window.addEventListener(
    'load',
    () => {
      window.setTimeout(() => {
        void checkForServiceWorkerUpdate(true)
        scheduleReloadWhenSafe()
      }, 1500)
    },
    { once: true },
  )

  periodicUpdateTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void checkForServiceWorkerUpdate()
      scheduleReloadWhenSafe()
    }
  }, UPDATE_CHECK_INTERVAL_MS)

  // Keep the variable referenced for future teardown support and to make the
  // interval ownership explicit. PMS10 currently initializes once per page.
  void periodicUpdateTimer
}
