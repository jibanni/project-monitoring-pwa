export const RPMES_PILOT_SOURCES = {
  'Misamis Oriental': '1PZgYTp4lNwLCgA4p46ecIfMuPdfPqaT31j11Uw6Ubpc',
  'Misamis Occidental': '11m1PigviD0ZNYdKvVNBfe7ZFRNN4HJoG5ZFgmD5Splw',
  Bukidnon: '18qCMLiXRm0C5mxaLzi87Eyea-m73M14l_LW5WcMj7mA',
} as const

export type PilotProvince = keyof typeof RPMES_PILOT_SOURCES
export const RPMES_PILOT_PROVINCES = Object.keys(RPMES_PILOT_SOURCES) as PilotProvince[]

export type StatusEntry = {
  code: string
  province: PilotProvince
  municipality: string
  title: string
  status: string
  physical?: number | null
}

export type ComparisonResult = 'Match' | 'Status mismatch' | 'Progress band mismatch' | 'Needs review' |
  'RPMES only' | 'SubayBAYAN only' | 'Duplicate code' | 'Missing code'

export type StatusComparison = {
  key: string
  code: string
  province: PilotProvince
  municipality: string
  title: string
  rpmes: StatusEntry[]
  subay: StatusEntry[]
  result: ComparisonResult
  note: string
}

export const text = (value: unknown) => String(value ?? '').trim()
export const projectCodeKey = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, '')

export function pilotProvince(value: unknown) {
  return RPMES_PILOT_PROVINCES.find((province) => province.toLowerCase() === text(value).toLowerCase())
}

export function toPhysical(value: unknown) {
  const clean = text(value).replace(/%$/, '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(clean)) return null
  const valueNumber = Number(clean)
  return valueNumber >= 0 && valueNumber <= 100 ? valueNumber : null
}

export function rpmesCsvUrl(province: PilotProvince) {
  const query = new URLSearchParams({
    tqx: 'out:csv', sheet: 'RPMES Form 2', headers: '0', range: 'A5:AB1024',
    tq: 'select A,C,D,F,AB where A is not null',
  })
  return `https://docs.google.com/spreadsheets/d/${RPMES_PILOT_SOURCES[province]}/gviz/tq?${query}`
}

export function parseRpmesValues(rows: unknown[][], province: PilotProvince): StatusEntry[] {
  const usable = rows.filter((row) => Boolean(text(row[0])))
  if (!usable.length || usable.some((row) => !/^SBDP-(?:2025|25)-[A-Z0-9-]+$/.test(projectCodeKey(row[0])) ||
    pilotProvince(row[1]) !== province || !text(row[2]) || !text(row[3]))) {
    throw new Error('The RPMES worksheet does not match the expected FY 2025 SBDP layout.')
  }
  return usable.map((row) => ({ code: text(row[0]), province, municipality: text(row[2]), title: text(row[3]), status: text(row[4]) }))
}

function stage(value: string) {
  const normalized = text(value).toLowerCase().replace(/[‐‑‒–—]/g, '-')
  if (/^(completed?|completion)$/.test(normalized)) return 'completed'
  if (/^(?:ongoing|on[ -]going|under implementation)(?:\b|\s*\()/.test(normalized)) return 'ongoing'
  if (/^(?:under )?procurement\b/.test(normalized)) return 'procurement'
  if (/^preparation of (?:documents|document)\b/.test(normalized)) return 'preparation'
  if (/^(?:not (?:yet )?started|no implementation)$/.test(normalized)) return 'not started'
  if (/^suspend(?:ed|sion)?\b/.test(normalized)) return 'suspended'
  if (/^terminat(?:ed|ion)\b/.test(normalized)) return 'terminated'
  if (/^cancel(?:led|ed|lation)\b/.test(normalized)) return 'cancelled'
  return ''
}

function evaluate(rpmes: StatusEntry[], subay: StatusEntry[]): [ComparisonResult, string] {
  if (rpmes.length > 1 || subay.length > 1) return ['Duplicate code', 'More than one record has this code. No automatic pairing was made.']
  if (!rpmes.length) return ['SubayBAYAN only', 'No identical project code was found in RPMES Form 2.']
  if (!subay.length) return ['RPMES only', 'No identical project code was found in the PMS10 SubayBAYAN records.']
  const r = rpmes[0], s = subay[0]
  const left = stage(r.status), right = stage(s.status)
  if (!left || !right) return ['Needs review', 'A status is missing or has no comparison rule.']
  if (['procurement', 'preparation', 'not started'].includes(left) && ['procurement', 'preparation', 'not started'].includes(right)) {
    if (left !== right || (left === 'procurement' && r.status.includes('(') && r.status.toLowerCase() !== s.status.toLowerCase())) {
      return ['Needs review', 'Both are pre-implementation, but the SubayBAYAN status does not confirm the RPMES stage.']
    }
  }
  if (left !== right) return ['Status mismatch', 'The two sources report different implementation stages.']
  if (left === 'ongoing') {
    const band = r.status.match(/\(\s*(\d{1,3})\s*[-‐‑‒–—]\s*(\d{1,3})\s*%\s*\)/)
    if (band) {
      const low = Number(band[1]), high = Number(band[2]), physical = s.physical
      if (low > high || high > 100 || physical == null) return ['Needs review', 'The progress band cannot be checked without a valid SubayBAYAN physical percentage.']
      // Integer labels in the form are upper-bound bands. For example, 30.1% belongs in 31–60%.
      if ((low === 0 ? physical < low : physical <= low - 1) || physical > high) {
        return ['Progress band mismatch', `SubayBAYAN reports ${physical}%, outside the RPMES ${low}–${high}% band.`]
      }
    }
  }
  return ['Match', 'The comparable stage and any reported RPMES progress band agree.']
}

export function compareRpmesStatus(rpmes: StatusEntry[], subay: StatusEntry[]): StatusComparison[] {
  const groups = new Map<string, { code: string; rpmes: StatusEntry[]; subay: StatusEntry[] }>()
  for (const [source, entries] of [['rpmes', rpmes], ['subay', subay]] as const) {
    entries.forEach((entry, index) => {
      const code = projectCodeKey(entry.code)
      const key = `${entry.province}:${code || `${source}-missing-${index}`}`
      const group = groups.get(key) ?? { code, rpmes: [], subay: [] }
      group[source].push(entry)
      groups.set(key, group)
    })
  }
  return [...groups].map(([key, group]) => {
    const primary = group.rpmes[0] ?? group.subay[0]
    const [result, note]: [ComparisonResult, string] = group.code ? evaluate(group.rpmes, group.subay)
      : ['Missing code', 'This PMS10 record has no SubayBAYAN project code. No automatic pairing was made.']
    return { key, ...group, province: primary.province, municipality: primary.municipality, title: primary.title, result, note }
  }).sort((a, b) => Number(a.result === 'Match') - Number(b.result === 'Match') || a.province.localeCompare(b.province)
    || a.municipality.localeCompare(b.municipality) || a.code.localeCompare(b.code))
}

export const statusLabels = (entries: StatusEntry[]) => entries.map(({ status }) => status || 'Not recorded').join(' / ') || '—'
export const physicalLabels = (entries: StatusEntry[]) => entries.map(({ physical }) => physical == null ? '—' : `${physical}%`).join(' / ') || '—'
