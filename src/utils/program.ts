const PROGRAM_SORT_ORDER = [
  'FALGU',
  'GEF',
  'SGLGIF',
  'GREEN, GREEN, GREEN',
  'RAPID Growth Project',
  'SAFPB',
  'SBDP',
  'CMGP',
  'KALSADA',
  'SALINTUBIG',
  'LRBIP',
  'RBIS',
  'LIME-20',
]

export const CANONICAL_PROGRAMS = [...PROGRAM_SORT_ORDER]

function cleanProgramText(value: unknown) {
  if (value === null || value === undefined) return ''

  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactProgramText(value: unknown) {
  return cleanProgramText(value)
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '')
    .trim()
}

function normalizedUpperProgramText(value: unknown) {
  return cleanProgramText(value)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeProgramName(value: unknown) {
  const raw = cleanProgramText(value)

  if (!raw) return ''

  const withoutFundingYear = raw
    .replace(/^FY\s*\d{4}\s*[•\-–—:|/]*\s*/i, '')
    .replace(/^\d{4}\s*[•\-–—:|/]*\s*/i, '')
    .trim()

  const upper = normalizedUpperProgramText(withoutFundingYear)
  const compact = compactProgramText(withoutFundingYear)

  if (!compact) return ''

  /*
    PMS10 canonical funding source names.

    This prevents SubayBAYAN long names and acronyms from appearing as separate
    programs in dashboard/report/map/project filters.

    User-approved prevailing values:
    - FALGU prevails over Financial Assistance to Local Government Unit Program
    - GREEN, GREEN, GREEN prevails over GGG / Green Green Green
    - GEF prevails over Growth Equity Fund
    - SBDP prevails over Support to the Barangay Development Program
    - SAFPB prevails over Support and Assistance Fund to Participatory Budgeting
  */

  if (
    /^LGSFFALGU/.test(compact) ||
    /^FALGU/.test(compact) ||
    compact.includes('FINANCIALASSISTANCETOLOCALGOVERNMENTUNIT') ||
    compact.includes('FINANCIALASSISTANCETOLOCALGOVERNMENTUNITS')
  ) {
    return 'FALGU'
  }

  if (
    compact === 'GGG' ||
    compact.includes('GREENGREENGREEN') ||
    upper.includes('GREEN GREEN GREEN') ||
    upper.includes('GREEN, GREEN, GREEN')
  ) {
    return 'GREEN, GREEN, GREEN'
  }

  if (
    compact === 'GEF' || compact.includes('GEF') ||
    compact.startsWith('LGSFGEF') ||
    compact.includes('GROWTHEQUITYFUND')
  ) {
    return 'GEF'
  }

  if (
    compact === 'SGLGIF' ||
    compact.startsWith('LGSFSGLGIF') ||
    compact.includes('SEALOFGOODLOCALGOVERNANCEINCENTIVEFUND') ||
    compact.includes('SEALOFGOODLOCALGOVERNANCEINCENTIVE') ||
    compact.includes('SGLGINCENTIVEFUND')
  ) {
    return 'SGLGIF'
  }

  if (
    compact === 'SBDP' || compact.includes('SBDP') ||
    compact.startsWith('LGSFSBDP') ||
    compact.includes('SUPPORTTOTHEBARANGAYDEVELOPMENTPROGRAM') ||
    compact.includes('SUPPORTTOBARANGAYDEVELOPMENTPROGRAM') ||
    compact.includes('BARANGAYDEVELOPMENTPROGRAM')
  ) {
    return 'SBDP'
  }

  if (
    compact === 'SAFPB' || compact.includes('SAFPB') ||
    compact.startsWith('LGSFSAFPB') ||
    compact.includes('SUPPORTANDASSISTANCEFUNDTOPARTICIPATORYBUDGETING') ||
    compact.includes('SUPPORTASSISTANCEFUNDTOPARTICIPATORYBUDGETING') ||
    compact.includes('PARTICIPATORYBUDGETING')
  ) {
    return 'SAFPB'
  }

  if (
    compact === 'CMGP' ||
    compact.startsWith('LGSFCMGP') ||
    compact.includes('CONDITIONALMATCHINGGRANTTOPROVINCES') ||
    compact.includes('CONDITIONALMATCHINGGRANT') ||
    compact.includes('KALSADACMGP')
  ) {
    return 'CMGP'
  }

  if (
    compact === 'KALSADA' ||
    compact.startsWith('LGSFKALSADA') ||
    compact.includes('KONKRETONGAYOSLAMANGANATDALUYAN') ||
    compact.includes('KALSADA')
  ) {
    return 'KALSADA'
  }

  if (
    compact === 'RAPID' || compact.includes('RAPID') ||
    compact.startsWith('RAPIDGROWTH') ||
    compact.includes('RAPIDGROWTH') ||
    compact.includes('RURALAGROENTERPRISEPARTNERSHIP') ||
    compact.includes('INVESTMENTDEVELOPMENT')
  ) {
    return 'RAPID Growth Project'
  }

  if (
    compact === 'SALINTUBIG' ||
    compact.includes('SALINTUBIG') ||
    compact.includes('SAGANANGPATUBIG') ||
    compact.includes('WATERSUPPLY')
  ) {
    return 'SALINTUBIG'
  }

  if (
    compact === 'LRBIP' ||
    compact.includes('LOCALROADANDBRIDGESINFORMATIONPROJECT') ||
    compact.includes('LOCALROADSANDBRIDGESINFORMATIONPROJECT') ||
    compact.includes('LOCALROADANDBRIDGEINFORMATIONPROJECT')
  ) {
    return 'LRBIP'
  }

  if (compact === 'RBIS' || compact.includes('ROADSANDBRIDGESINFORMATIONSYSTEM')) {
    return 'RBIS'
  }

  if (
    compact === 'LIME20' ||
    compact === 'LIME' ||
    compact.includes('LIME20') ||
    compact.includes('LOCALINFRASTRUCTUREMANAGEMENT')
  ) {
    return 'LIME-20'
  }

  // Preserve already-clean acronyms not listed above.
  if (/^[A-Z0-9-]{2,20}$/.test(upper)) {
    return upper
  }

  return withoutFundingYear || raw
}

// UA is a funding classification, separate from the base program and fiscal year.
export const UA_PROGRAM_SUFFIX = '-UA'

const PROGRAM_CODE_ALIASES: Record<string, string[]> = {
  'GREEN, GREEN, GREEN': ['GGG', '3GP'],
  'RAPID Growth Project': ['RAPID'],
}

export function fundingProgramCodePrefixes(program: string) {
  return PROGRAM_CODE_ALIASES[program] ?? [program.toUpperCase()]
}

const UA_MARKER = /\b(?:UA|UNPROGRAMMED(?:\s+(?:APPROPRIATIONS?|FUNDS?))?)\b/gi

export function baseFundingProgram(value: string) {
  return value.endsWith(UA_PROGRAM_SUFFIX) ? value.slice(0, -UA_PROGRAM_SUFFIX.length) : value
}

export function hasUaDesignation(value: unknown) {
  return Boolean(cleanProgramText(value).match(UA_MARKER))
}

export function projectCodeHasUa(value: unknown) {
  return /(?:^|-)UA(?:-|$)/i.test(cleanProgramText(value).replace(/\s+/g, '').replace(/[‐‑‒–—]/g, '-'))
}

export function normalizeFundingProgramName(value: unknown, officialProjectCode?: unknown) {
  const raw = cleanProgramText(value)
  const explicitUa = hasUaDesignation(raw)
  // Strip the funding type before resolving aliases such as GGG and RBIS.
  const base = normalizeProgramName(explicitUa
    ? raw.replace(UA_MARKER, ' ').replace(/\(\s*\)/g, ' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    : raw)
  if (!base || /^subaybayan$/i.test(base)) {
    const prefix = cleanProgramText(officialProjectCode).toUpperCase().replace(/\s+/g, '').replace(/[‐‑‒–—]/g, '-')
    const fromCode = CANONICAL_PROGRAMS.find((program) => {
      const code = prefix.replace(/^LGSF-/, '').replace(/^UA-/, '')
      return fundingProgramCodePrefixes(program).some((alias) => code.startsWith(alias + '-'))
    })
    if (fromCode) return explicitUa || projectCodeHasUa(officialProjectCode) ? fromCode + UA_PROGRAM_SUFFIX : fromCode
  }
  if (!base) return ''
  return explicitUa || projectCodeHasUa(officialProjectCode) ? base + UA_PROGRAM_SUFFIX : base
}

export function getProjectFundingProgram(project: {
  funding_source?: unknown
  project_type?: unknown
  subaybayan_project_code?: unknown
}) {
  return normalizeFundingProgramName(project.funding_source || project.project_type, project.subaybayan_project_code)
}

// Use the existing form labels, and offer a UA variant for each named program.
const EXISTING_FORM_PROGRAMS = [
  'RAPID Growth Project', 'LGSF-FALGU', 'LGSF-GEF', 'LGSF-SBDP', 'LGSF-SAFPB',
  'SGLGIF', 'SALINTUBIG', 'CMGP / KALSADA',
]

export const PROJECT_FORM_FUNDING_SOURCES = [
  ...EXISTING_FORM_PROGRAMS, 'Other',
  ...EXISTING_FORM_PROGRAMS.filter((program) => program !== 'CMGP / KALSADA')
    .map((program) => program + UA_PROGRAM_SUFFIX),
  'KALSADA-UA',
  ...CANONICAL_PROGRAMS
    .filter((program) => !EXISTING_FORM_PROGRAMS.some((label) => normalizeProgramName(label) === program))
    .flatMap((program) => [program, program + UA_PROGRAM_SUFFIX]),
]

export function projectFormFundingSources(current: string) {
  return current && !PROJECT_FORM_FUNDING_SOURCES.includes(current)
    ? [...PROJECT_FORM_FUNDING_SOURCES, current]
    : PROJECT_FORM_FUNDING_SOURCES
}

export function buildProgramFilterOptions(
  values: Iterable<unknown>,
  includeCanonicalPrograms = false,
) {
  const programSet = new Set<string>()

  if (includeCanonicalPrograms) {
    CANONICAL_PROGRAMS.forEach((program) => programSet.add(program))
  }

  for (const value of values) {
    const normalizedProgram = normalizeFundingProgramName(value)

    if (normalizedProgram) {
      programSet.add(normalizedProgram)
    }
  }

  return Array.from(programSet).sort((a, b) => {
    const aIndex = PROGRAM_SORT_ORDER.indexOf(baseFundingProgram(a))
    const bIndex = PROGRAM_SORT_ORDER.indexOf(baseFundingProgram(b))

    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex || a.localeCompare(b)
    if (aIndex >= 0) return -1
    if (bIndex >= 0) return 1

    return a.localeCompare(b)
  })
}
