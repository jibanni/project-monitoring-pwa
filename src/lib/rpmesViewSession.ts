import type { RpmesProvince, RpmesSourceKey, RpmesSourceLinks, StatusEntry } from '../utils/rpmesStatusComparison'

export type RpmesSheetData = { rows: StatusEntry[]; checkedAt: Date; spreadsheetId: string }

type RpmesView = {
  reportingYear: string
  isUa: boolean
  selected: RpmesProvince | ''
  sheets: Partial<Record<RpmesSourceKey, RpmesSheetData>>
  errors: RpmesSourceKey[]
  loading: boolean
  differencesOnly: boolean
  links?: RpmesSourceLinks
}

export function createRpmesViewSession() {
  // Owned by the authenticated workspace. Changing sections keeps the results
  // in memory, but reloading the app or signing in again starts a fresh view.
  let view: RpmesView = {
    reportingYear: '', isUa: false, selected: '', sheets: {}, errors: [], loading: false, differencesOnly: false,
  }
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update(next: Partial<RpmesView> | ((previous: RpmesView) => Partial<RpmesView>)) {
      view = { ...view, ...(typeof next === 'function' ? next(view) : next) }
      listeners.forEach((listener) => listener())
    },
  }
}

export type RpmesViewSession = ReturnType<typeof createRpmesViewSession>
