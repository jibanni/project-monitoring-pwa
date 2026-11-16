export const RPMES_PILOT_SOURCES = {
  'Misamis Oriental': '1PZgYTp4lNwLCgA4p46ecIfMuPdfPqaT31j11Uw6Ubpc',
  'Misamis Occidental': '11m1PigviD0ZNYdKvVNBfe7ZFRNN4HJoG5ZFgmD5Splw',
  Bukidnon: '18qCMLiXRm0C5mxaLzi87Eyea-m73M14l_LW5WcMj7mA',
} as const

export type PilotProvince = keyof typeof RPMES_PILOT_SOURCES
export const RPMES_PILOT_PROVINCES = Object.keys(RPMES_PILOT_SOURCES) as PilotProvince[]

export type StatusEntry = {
  province: PilotProvince
  municipality: string
  barangay: string
  status: string
}

export type LguMetrics = {
  projects: number
  barangays: number
  notStarted: number
  ongoing: number
  completed: number
  completion: number | null
  other: number
  missingBarangay: number
}

export const SUMMARY_COLUMNS = [
  { key: 'projects', label: 'Number of projects' },
  { key: 'barangays', label: 'Number of barangays' },
  { key: 'notStarted', label: 'Not yet started' },
  { key: 'ongoing', label: 'Ongoing implementation' },
  { key: 'completed', label: 'Completed' },
  { key: 'completion', label: '% Completion' },
] as const

export const text = (value: unknown) => String(value ?? '').trim()
export const projectCodeKey = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, '')

export function pilotProvince(value: unknown) {
  return RPMES_PILOT_PROVINCES.find((province) => province.toLowerCase() === text(value).toLowerCase())
}

export function rpmesSpreadsheetId(value: unknown) {
  try {
    const url = new URL(text(value))
    if (url.origin !== 'https://docs.google.com' || url.username || url.password) return ''
    return url.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,128})(?:\/(?:edit|view|preview))?\/?$/)?.[1] ?? ''
  } catch {
    return ''
  }
}

export function rpmesCsvUrl(province: PilotProvince, spreadsheetId: string = RPMES_PILOT_SOURCES[province]) {
  if (!/^[\w-]{20,128}$/.test(spreadsheetId)) throw new Error('Invalid spreadsheet ID')
  const query = new URLSearchParams({
    tqx: 'out:csv', sheet: 'RPMES Form 2', headers: '0', range: 'A5:AB1024',
    tq: 'select A,C,D,E,AB where A is not null',
  })
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${query}`
}

export function parseRpmesValues(rows: unknown[][], province: PilotProvince): StatusEntry[] {
  const usable = rows.filter((row) => Boolean(text(row[0])))
  if (!usable.length || usable.some((row) => !/^SBDP-(?:2025|25)-[A-Z0-9-]+$/.test(projectCodeKey(row[0])) ||
    pilotProvince(row[1]) !== province || !text(row[2]))) {
    throw new Error('The RPMES worksheet does not match the expected FY 2025 SBDP layout.')
  }
  if (new Set(usable.map((row) => projectCodeKey(row[0]))).size !== usable.length) {
    throw new Error('RPMES Form 2 contains duplicate project codes.')
  }
  return usable.map((row) => ({ province, municipality: text(row[2]), barangay: text(row[3]), status: text(row[4]) }))
}

function stage(value: string) {
  const normalized = text(value).toLowerCase().replace(/[‐‑‒–—]/g, '-')
  if (/^(completed?|completion)$/.test(normalized)) return 'completed'
  if (/^(?:ongoing|on[ -]going|under implementation)(?:\b|\s*\()/.test(normalized)) return 'ongoing'
  if (/^(?:under )?(?:procurement|review)\b|^preparation of documents?\b|^(?:not (?:yet )?started|no implementation)$/.test(normalized)) {
    return 'notStarted'
  }
  return 'other'
}

function totals(entries: StatusEntry[]): LguMetrics {
  const barangays = new Set<string>()
  const metrics: LguMetrics = {
    projects: entries.length, barangays: 0, notStarted: 0, ongoing: 0, completed: 0, completion: null, other: 0, missingBarangay: 0,
  }
  for (const entry of entries) {
    const barangay = text(entry.barangay).toLowerCase().replace(/\s+/g, ' ').replace(/^(?:brgy\.?|barangay)\s+/, '')
    if (barangay) barangays.add(barangay)
    else metrics.missingBarangay += 1
    metrics[stage(entry.status)] += 1
  }
  metrics.barangays = barangays.size
  metrics.completion = metrics.projects ? metrics.completed / metrics.projects : null
  return metrics
}

export function summarizeByLgu(
  subay: StatusEntry[],
  rpmes: StatusEntry[],
  canonicalizeLgu: (province: PilotProvince, municipality: string) => string,
) {
  type Group = { key: string; province: PilotProvince; lgu: string; subay: StatusEntry[]; rpmes: StatusEntry[] }
  const groups = new Map<string, Group>()
  for (const [source, entries] of [['subay', subay], ['rpmes', rpmes]] as const) {
    for (const entry of entries) {
      const lgu = canonicalizeLgu(entry.province, entry.municipality) || 'Unknown LGU'
      const key = `${entry.province}:${lgu.toLowerCase()}`
      const group = groups.get(key) ?? { key, province: entry.province, lgu, subay: [], rpmes: [] }
      group[source].push(entry)
      groups.set(key, group)
    }
  }
  return [...groups.values()].map(({ subay: subayRows, rpmes: rpmesRows, ...group }) => ({
    ...group, subay: totals(subayRows), rpmes: totals(rpmesRows),
  })).sort((a, b) => a.province.localeCompare(b.province) || a.lgu.localeCompare(b.lgu))
}
