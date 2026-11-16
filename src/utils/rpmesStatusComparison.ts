export const RPMES_PROVINCES = ['Bukidnon', 'Camiguin', 'Lanao del Norte', 'Misamis Occidental', 'Misamis Oriental'] as const
export type RpmesProvince = (typeof RPMES_PROVINCES)[number]
export const RPMES_COHORTS = ['2024', '2024-UA', '2025', '2025-UA', '2026', '2026-UA', '2027', '2027-UA'] as const
export type RpmesCohort = (typeof RPMES_COHORTS)[number]
export const DEFAULT_RPMES_COHORT: RpmesCohort = '2025'

const DEFAULT_2025_SOURCES: Partial<Record<RpmesProvince, string>> = {
  'Misamis Oriental': '1PZgYTp4lNwLCgA4p46ecIfMuPdfPqaT31j11Uw6Ubpc',
  'Misamis Occidental': '11m1PigviD0ZNYdKvVNBfe7ZFRNN4HJoG5ZFgmD5Splw',
  Bukidnon: '18qCMLiXRm0C5mxaLzi87Eyea-m73M14l_LW5WcMj7mA',
}

export function defaultRpmesSheet(cohort: RpmesCohort, province: RpmesProvince) {
  return cohort === DEFAULT_RPMES_COHORT ? DEFAULT_2025_SOURCES[province] : undefined
}

export function rpmesSourceKey(cohort: RpmesCohort, province: RpmesProvince) {
  return `${cohort}:${province}` as const
}

export type RpmesSourceKey = ReturnType<typeof rpmesSourceKey>
export type RpmesSourceLinks = Partial<Record<RpmesSourceKey, string>>

export type StatusEntry = {
  province: RpmesProvince
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

export function rpmesProvince(value: unknown) {
  const normalized = text(value).replace(/^province\s+of\s+/i, '').replace(/\s+/g, ' ').toLowerCase()
  return RPMES_PROVINCES.find((province) => province.toLowerCase() === normalized)
}

export function sbdpCodeCohort(value: unknown): RpmesCohort | undefined {
  const parts = projectCodeKey(value).split('-')
  if (parts.shift() !== 'SBDP') return undefined
  const yearIndex = parts[0] === 'UA' ? 1 : 0
  const first = parts[yearIndex]
  const identifiers = parts.slice(yearIndex + 1).filter((part) => part !== 'UA')
  if (!/^(?:20)?2[4-7]$/.test(first ?? '') || !identifiers.length ||
    !identifiers.every((part) => /^[A-Z0-9]+$/.test(part)) || !identifiers.some((part) => /\d/.test(part))) return undefined
  const year = first.length === 2 ? `20${first}` : first
  return (parts.includes('UA') ? `${year}-UA` : year) as RpmesCohort
}

export function sbdpOfficialCohort(project: Record<string, unknown>): RpmesCohort | undefined {
  const code = sbdpCodeCohort(project.subaybayan_project_code)
  if (!code || project.pms10_progress_source === 'onsite' || text(project.funding_year) !== code.slice(0, 4)) return undefined
  const explicitUa = /(?:^|[^a-z])ua(?:[^a-z]|$)|unprogrammed/i.test(text(project.funding_source))
  return explicitUa ? `${code.slice(0, 4)}-UA` as RpmesCohort : code
}

export function readRpmesSourceLinks(current: unknown, legacy: unknown): RpmesSourceLinks {
  const read = (input: unknown, key: string) => {
    const value = input && typeof input === 'object' && Object.hasOwn(input, key)
      ? (input as Record<string, unknown>)[key] : undefined
    return typeof value === 'string' && /^[\w-]{20,128}$/.test(value) ? value : undefined
  }
  const links: RpmesSourceLinks = {}
  for (const province of RPMES_PROVINCES) {
    for (const cohort of RPMES_COHORTS) {
      const key = rpmesSourceKey(cohort, province)
      const id = read(current, key) ?? (cohort === DEFAULT_RPMES_COHORT ? read(legacy, province) : undefined)
      if (id) links[key] = id
    }
  }
  return links
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

export function rpmesCsvUrl(spreadsheetId: string) {
  if (!/^[\w-]{20,128}$/.test(spreadsheetId)) throw new Error('Invalid spreadsheet ID')
  const query = new URLSearchParams({
    tqx: 'out:csv', sheet: 'RPMES Form 2', headers: '0', range: 'A5:AB1024',
    tq: 'select A,C,D,E,AB where A is not null',
  })
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${query}`
}

export function parseRpmesValues(rows: unknown[][], province: RpmesProvince, cohort: RpmesCohort): StatusEntry[] {
  const usable = rows.filter((row) => Boolean(text(row[0])))
  if (!usable.length || usable.some((row) => rpmesProvince(row[1]) !== province || !text(row[2]))) {
    throw new Error(`RPMES Form 2 must contain project rows for ${province} with an LGU on each row.`)
  }
  if (usable.some((row) => sbdpCodeCohort(row[0]) !== cohort)) {
    throw new Error(`The project codes in RPMES Form 2 do not all match SBDP ${cohort}. Check the year and UA designation.`)
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
  canonicalizeLgu: (province: RpmesProvince, municipality: string) => string,
) {
  type Group = { key: string; province: RpmesProvince; lgu: string; subay: StatusEntry[]; rpmes: StatusEntry[] }
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
