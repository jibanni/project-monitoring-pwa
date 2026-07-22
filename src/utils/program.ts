const PROGRAM_SORT_ORDER = [
  'FALGU',
  'GEF',
  'GREEN, GREEN, GREEN',
  'RAPID',
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

  const upper = normalizedUpperProgramText(raw)
  const compact = compactProgramText(raw)

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
    compact === 'GEF' ||
    compact.startsWith('LGSFGEF') ||
    compact.includes('GROWTHEQUITYFUND')
  ) {
    return 'GEF'
  }

  if (
    compact === 'SBDP' ||
    compact.startsWith('LGSFSBDP') ||
    compact.includes('SUPPORTTOTHEBARANGAYDEVELOPMENTPROGRAM') ||
    compact.includes('SUPPORTTOBARANGAYDEVELOPMENTPROGRAM') ||
    compact.includes('BARANGAYDEVELOPMENTPROGRAM')
  ) {
    return 'SBDP'
  }

  if (
    compact === 'SAFPB' ||
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
    compact === 'RAPID' ||
    compact.startsWith('RAPIDGROWTH') ||
    compact.includes('RAPIDGROWTH') ||
    compact.includes('RURALAGROENTERPRISEPARTNERSHIP') ||
    compact.includes('INVESTMENTDEVELOPMENT')
  ) {
    return 'RAPID'
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

  return raw
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
    const normalizedProgram = normalizeProgramName(value)

    if (normalizedProgram) {
      programSet.add(normalizedProgram)
    }
  }

  return Array.from(programSet).sort((a, b) => {
    const aIndex = PROGRAM_SORT_ORDER.indexOf(a)
    const bIndex = PROGRAM_SORT_ORDER.indexOf(b)

    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
    if (aIndex >= 0) return -1
    if (bIndex >= 0) return 1

    return a.localeCompare(b)
  })
}
