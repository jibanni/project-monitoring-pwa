const FORM_DRAFT_PREFIX = 'pms10:form-draft:v1'

type StoredFormDraft<T> = {
  version: 1
  updatedAt: string
  data: T
}

function getStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function createFormDraftKey(scope: string, recordId: string, ownerId = 'local-user') {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `${FORM_DRAFT_PREFIX}:${clean(scope)}:${clean(recordId)}:${clean(ownerId)}`
}

export function loadFormDraft<T>(key: string): T | null {
  if (!key) return null

  const storage = getStorage()
  if (!storage) return null

  try {
    const rawValue = storage.getItem(key)
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue) as Partial<StoredFormDraft<T>>
    if (parsed.version !== 1 || parsed.data === undefined || parsed.data === null) {
      storage.removeItem(key)
      return null
    }

    return parsed.data
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      // Storage can become unavailable while iOS is suspending the page.
    }
    return null
  }
}

export function saveFormDraft<T>(key: string, data: T) {
  if (!key) return false

  const storage = getStorage()
  if (!storage) return false

  try {
    const record: StoredFormDraft<T> = {
      version: 1,
      updatedAt: new Date().toISOString(),
      data,
    }
    storage.setItem(key, JSON.stringify(record))
    return true
  } catch {
    return false
  }
}

export function clearFormDraft(key: string) {
  if (!key) return

  const storage = getStorage()
  if (!storage) return

  try {
    storage.removeItem(key)
  } catch {
    // Clearing a safety copy should never block navigation or saving.
  }
}
