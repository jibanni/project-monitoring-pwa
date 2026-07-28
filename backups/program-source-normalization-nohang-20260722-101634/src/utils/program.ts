

export function normalizeProgramName(value: unknown) {
  if (value === null || value === undefined) return ''

  const raw = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!raw) return ''

  const upper = raw.toUpperCase().replace(/\s+/g, ' ').trim()

  // SubayBAYAN sometimes exports FALGU with suffixes such as:
  // FALGU-NI, FALGU NI, FALGU_NI, FALGU/NI, FALGU-NP, etc.
  // For PMS10 grouping/filtering, use the main program name only.
  if (/^(LGSF[\s-]*)?FALGU($|[\s/_-])/.test(upper)) {
    return 'FALGU'
  }

  return upper
}

export function formatProgramDropdownLabel(value: unknown) {
  return normalizeProgramName(value)
}
