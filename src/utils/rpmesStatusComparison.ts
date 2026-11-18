import { baseFundingProgram, CANONICAL_PROGRAMS, fundingProgramCodePrefixes, getProjectFundingProgram, projectCodeHasUa, UA_PROGRAM_SUFFIX } from './program.ts'

export const RPMES_PROVINCES = ['Bukidnon', 'Camiguin', 'Lanao del Norte', 'Misamis Occidental', 'Misamis Oriental'] as const
export type RpmesProvince = (typeof RPMES_PROVINCES)[number]
export const RPMES_COHORTS = ['2024', '2024-UA', '2025', '2025-UA', '2026', '2026-UA', '2027', '2027-UA'] as const
export type RpmesCohort = `${number}` | `${number}-UA`
export const RPMES_PROGRAMS = CANONICAL_PROGRAMS
export const DEFAULT_RPMES_PROGRAM = 'SBDP'
export const DEFAULT_RPMES_COHORT: RpmesCohort = '2025'

const DEFAULT_2025_SOURCES: Partial<Record<RpmesProvince, string>> = {
  'Misamis Oriental': '1PZgYTp4lNwLCgA4p46ecIfMuPdfPqaT31j11Uw6Ubpc',
  'Misamis Occidental': '11m1PigviD0ZNYdKvVNBfe7ZFRNN4HJoG5ZFgmD5Splw',
  Bukidnon: '18qCMLiXRm0C5mxaLzi87Eyea-m73M14l_LW5WcMj7mA',
}

export function defaultRpmesSheet(cohort: RpmesCohort, province: RpmesProvince, program = DEFAULT_RPMES_PROGRAM) {
  return program === DEFAULT_RPMES_PROGRAM && cohort === DEFAULT_RPMES_COHORT ? DEFAULT_2025_SOURCES[province] : undefined
}

export function rpmesSourceKey(cohort: RpmesCohort, province: RpmesProvince, program = DEFAULT_RPMES_PROGRAM) {
  // Keep the existing SBDP keys so previously saved links still work.
  return program === DEFAULT_RPMES_PROGRAM ? `${cohort}:${province}` : `${program}:${cohort}:${province}`
}

export type RpmesSourceKey = ReturnType<typeof rpmesSourceKey>
// null explicitly removes a link, including built-in and migrated links.
export type RpmesSourceLinks = Partial<Record<RpmesSourceKey, string | null>>

export function resolveRpmesSheet(links: RpmesSourceLinks, cohort: RpmesCohort, province: RpmesProvince, program = DEFAULT_RPMES_PROGRAM) {
  const id = links[rpmesSourceKey(cohort, province, program)]
  return id === null ? undefined : id ?? defaultRpmesSheet(cohort, province, program)
}

export const RPMES_LINK_VARIANTS = [
  { label: 'SBDP', suffix: '' },
  { label: 'SBDP-UA', suffix: '-UA' },
] as const

export function rpmesLinkSlots(year: string) {
  if (!/^20\d{2}$/.test(year)) return []
  return RPMES_PROVINCES.flatMap((province) => RPMES_LINK_VARIANTS.map(({ label, suffix }) => {
    const cohort = (year + suffix) as RpmesCohort
    return { province, year, label, cohort, key: rpmesSourceKey(cohort, province) }
  }))
}

export type RpmesLinkSlot = ReturnType<typeof rpmesLinkSlots>[number]

export function rpmesSheetLink(id: string | undefined) {
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : ''
}

export function prepareRpmesLinkSettings(links: RpmesSourceLinks, slots: RpmesLinkSlot[], drafts: Partial<Record<RpmesSourceKey, string>>) {
  const next = { ...links }
  const changed: RpmesSourceKey[] = []
  const invalid: RpmesLinkSlot[] = []
  for (const slot of slots) {
    const draft = drafts[slot.key]
    if (draft === undefined) continue
    const value = text(draft)
    const id = value ? rpmesSpreadsheetId(value) : undefined
    if (value && !id) {
      invalid.push(slot)
    } else if (id !== resolveRpmesSheet(links, slot.cohort, slot.province)) {
      next[slot.key] = id ?? null
      changed.push(slot.key)
    }
  }
  return { next, changed, invalid }
}

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
export const projectCodeKey = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, '').replace(/[‐‑‒–—]/g, '-')

export function rpmesProvince(value: unknown) {
  const normalized = text(value).replace(/^province\s+of\s+/i, '').replace(/\s+/g, ' ').toLowerCase()
  return RPMES_PROVINCES.find((province) => province.toLowerCase() === normalized)
}

function validRpmesCohort(value: string): value is RpmesCohort {
  return /^20\d{2}(?:-UA)?$/.test(value)
}

export function rpmesCodeCohort(value: unknown, program = DEFAULT_RPMES_PROGRAM): RpmesCohort | undefined {
  const code = projectCodeKey(value).replace(/^LGSF-/, '')
  const withoutLeadingUa = code.replace(/^UA-/, '')
  const prefix = fundingProgramCodePrefixes(program).find((alias) => withoutLeadingUa.startsWith(alias + '-'))
  if (!prefix) return undefined
  const parts = withoutLeadingUa.slice(prefix.length + 1).split('-')
  if (parts[0] === 'UA') parts.shift()
  const [first, ...rest] = parts
  const identifiers = rest.filter((part) => part !== 'UA')
  if (!/^(?:20)?\d{2}$/.test(first ?? '') || (first.length === 4 && !first.startsWith('20')) ||
    !identifiers.length || !identifiers.every((part) => /^[A-Z0-9]+$/.test(part)) ||
    !identifiers.some((part) => /\d/.test(part))) return undefined
  const year = first.length === 2 ? `20${first}` : first
  const cohort = projectCodeHasUa(code) ? year + UA_PROGRAM_SUFFIX : year
  return validRpmesCohort(cohort) ? cohort : undefined
}

export const sbdpCodeCohort = (value: unknown) => rpmesCodeCohort(value)

export function rpmesOfficialCohort(project: Record<string, unknown>, program = DEFAULT_RPMES_PROGRAM): RpmesCohort | undefined {
  const code = rpmesCodeCohort(project.subaybayan_project_code, program)
  if (!code || project.pms10_progress_source === 'onsite' || text(project.funding_year) !== code.slice(0, 4)) return undefined
  const fundingProgram = getProjectFundingProgram(project)
  if (baseFundingProgram(fundingProgram) !== program) return undefined
  const cohort = fundingProgram.endsWith(UA_PROGRAM_SUFFIX) ? code.slice(0, 4) + UA_PROGRAM_SUFFIX : code
  return validRpmesCohort(cohort) ? cohort : undefined
}

export const sbdpOfficialCohort = (project: Record<string, unknown>) => rpmesOfficialCohort(project)

export function rpmesYearOptions(projects: Record<string, unknown>[], program: string) {
  const years = new Set(RPMES_COHORTS.map((cohort) => cohort.slice(0, 4)))
  for (const project of projects) {
    if (baseFundingProgram(getProjectFundingProgram(project)) !== program) continue
    const year = text(project.funding_year)
    if (/^20\d{2}$/.test(year)) years.add(year)
  }
  return Array.from(years).sort().flatMap((year) => [year, year + UA_PROGRAM_SUFFIX]).filter(validRpmesCohort)
}

export function readRpmesSourceLinks(current: unknown, legacy: unknown): RpmesSourceLinks {
  const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{20,128}$/.test(value)
  const links: RpmesSourceLinks = {}
  if (current && typeof current === 'object') {
    for (const [key, id] of Object.entries(current)) {
      if (id !== null && !validId(id)) continue
      const parts = key.split(':')
      if (parts.length !== 2 && parts.length !== 3) continue
      const [cohort, province] = parts.slice(-2)
      const program = parts.length === 3 ? parts[0] : DEFAULT_RPMES_PROGRAM
      if (validRpmesCohort(cohort) && RPMES_PROVINCES.includes(province as RpmesProvince) && RPMES_PROGRAMS.includes(program)) {
        links[rpmesSourceKey(cohort, province as RpmesProvince, program)] = id
      }
    }
  }
  if (legacy && typeof legacy === 'object') {
    for (const province of RPMES_PROVINCES) {
      const id = Object.hasOwn(legacy, province) ? (legacy as Record<string, unknown>)[province] : undefined
      const key = rpmesSourceKey(DEFAULT_RPMES_COHORT, province)
      if (validId(id) && !Object.hasOwn(links, key)) links[key] = id
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

export function parseRpmesValues(rows: unknown[][], province: RpmesProvince, cohort: RpmesCohort, program = DEFAULT_RPMES_PROGRAM): StatusEntry[] {
  const usable = rows.filter((row) => Boolean(text(row[0])))
  if (!usable.length || usable.some((row) => rpmesProvince(row[1]) !== province || !text(row[2]))) {
    throw new Error(`RPMES Form 2 must contain project rows for ${province} with an LGU on each row.`)
  }
  const coded = usable.map((row) => ({ row, selection: rpmesCodeCohort(row[0], program) }))
  const year = cohort.slice(0, 4)
  if (coded.some(({ selection }) => selection?.slice(0, 4) !== year)) {
    throw new Error(`RPMES Form 2 contains codes that do not match ${program} ${year}. Check the program, year and UA designation.`)
  }
  const matching = coded.filter(({ selection }) => selection === cohort).map(({ row }) => row)
  if (!matching.length) {
    throw new Error(`No ${program} ${cohort} project codes were found in RPMES Form 2. Check the reporting year and UA designation.`)
  }
  if (new Set(matching.map((row) => projectCodeKey(row[0]))).size !== matching.length) {
    throw new Error('RPMES Form 2 contains duplicate project codes for this selection.')
  }
  return matching.map((row) => ({ province, municipality: text(row[2]), barangay: text(row[3]), status: text(row[4]) }))
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
