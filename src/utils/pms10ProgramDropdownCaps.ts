const PROGRAM_OPTION_LABELS: Record<string, string> = {
  'all programs': 'All Programs',
  'all program': 'All Programs',
  'all funding sources': 'All Funding Sources',
  'all funding source': 'All Funding Sources',
  'select program': 'Select Program',
  'select funding source': 'Select Funding Source',
  falgu: 'FALGU',
  gef: 'GEF',
  ggg: 'GGG',
  rapid: 'RAPID',
  safpb: 'SAFPB',
  sbdp: 'SBDP',
  salintubig: 'SALINTUBIG',
  cmgp: 'CMGP',
  kalsada: 'KALSADA',
  lgff: 'LGFF',
  lgsf: 'LGSF',
  fmr: 'FMR',
  'lgsf-falgu': 'LGSF-FALGU',
  'lgsf gef': 'LGSF GEF',
  'lgsf-gef': 'LGSF-GEF',
  'lgsf sbdp': 'LGSF SBDP',
  'lgsf-sbdp': 'LGSF-SBDP',
  'lgsf safpb': 'LGSF SAFPB',
  'lgsf-safpb': 'LGSF-SAFPB',
}

const PROGRAM_KEYWORDS = [
  'falgu',
  'gef',
  'ggg',
  'rapid',
  'safpb',
  'sbdp',
  'salintubig',
  'cmgp',
  'kalsada',
  'lgff',
  'lgsf',
  'fmr',
]

function compact(value: unknown) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function keyOf(value: unknown) {
  return compact(value).toLowerCase()
}

function upperProgramOptionLabel(option: HTMLOptionElement) {
  const originalText = compact(option.textContent || option.text || option.label || option.value)
  const originalValue = compact(option.value)

  const mapped =
    PROGRAM_OPTION_LABELS[keyOf(originalText)] ||
    PROGRAM_OPTION_LABELS[keyOf(originalValue)] ||
    ''

  if (mapped) return mapped

  const candidate = originalText || originalValue
  const candidateKey = keyOf(candidate)

  if (
    PROGRAM_KEYWORDS.some(
      (keyword) =>
        candidateKey === keyword ||
        candidateKey.startsWith(`${keyword} `) ||
        candidateKey.startsWith(`${keyword}-`) ||
        candidateKey.includes(` ${keyword}`) ||
        candidateKey.includes(`-${keyword}`),
    )
  ) {
    return candidate.toUpperCase()
  }

  return ''
}

function applyProgramCapsToSelect(select: HTMLSelectElement) {
  Array.from(select.options).forEach((option) => {
    const nextLabel = upperProgramOptionLabel(option)
    if (!nextLabel) return

    if (option.text !== nextLabel) option.text = nextLabel
    if (option.label !== nextLabel) option.label = nextLabel
    if (option.textContent !== nextLabel) option.textContent = nextLabel
  })
}

function applyProgramCaps() {
  document.querySelectorAll<HTMLSelectElement>('select').forEach(applyProgramCapsToSelect)
}

export function initPms10ProgramDropdownCaps() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  applyProgramCaps()

  const runForSelect = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      applyProgramCaps()
      return
    }

    const select = target.closest('select')
    if (select instanceof HTMLSelectElement) {
      applyProgramCapsToSelect(select)
    }
  }

  document.addEventListener('pointerdown', runForSelect, { capture: true, passive: true })
  document.addEventListener('focusin', runForSelect, { capture: true })
  window.addEventListener('pageshow', applyProgramCaps, { passive: true })

  window.setTimeout(applyProgramCaps, 100)
  window.setTimeout(applyProgramCaps, 350)
  window.setTimeout(applyProgramCaps, 900)
}
