const VIEW_PREFIX = 'pms10:view:'

function getStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readPageView<T>(key: string, fallback: T): T {
  const storage = getStorage()
  if (!storage) return fallback

  try {
    const raw = storage.getItem(`${VIEW_PREFIX}${key}`)
    if (!raw) return fallback

    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writePageView<T>(key: string, value: T) {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(`${VIEW_PREFIX}${key}`, JSON.stringify(value))
  } catch {
    // Ignore storage quota / private-mode failures. View memory is best-effort.
  }
}

export function removePageView(key: string) {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.removeItem(`${VIEW_PREFIX}${key}`)
  } catch {
    // Best-effort only.
  }
}
