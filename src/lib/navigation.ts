import { getLastProtectedRoute } from './navigationMemory'

type ReturnLocation = {
  pathname?: unknown
  search?: unknown
  hash?: unknown
}

function isSafeInternalPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
}

export function getSafeReturnPath(
  state: unknown,
  fallback = getLastProtectedRoute('/dashboard'),
) {
  const candidate = (state as { from?: ReturnLocation | string } | null)?.from

  if (typeof candidate === 'string') {
    return isSafeInternalPath(candidate) ? candidate : fallback
  }

  if (!candidate || typeof candidate !== 'object') return fallback

  const pathname = typeof candidate.pathname === 'string' ? candidate.pathname : ''
  const search = typeof candidate.search === 'string' ? candidate.search : ''
  const hash = typeof candidate.hash === 'string' ? candidate.hash : ''
  const returnPath = `${pathname}${search}${hash}`

  return isSafeInternalPath(returnPath) ? returnPath : fallback
}
