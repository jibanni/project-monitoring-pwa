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

function optionLabel(option: HTMLOptionElement) {
  const text = compact(option.textContent || option.text || option.label || option.value)
  const value = compact(option.value)

  const textKey = keyOf(text)
  const valueKey = keyOf(value)

  const mapped = PROGRAM_OPTION_LABELS[textKey] || PROGRAM_OPTION_LABELS[valueKey]
  if (mapped) return mapped

  const candidate = text || value
  const candidateKey = keyOf(candidate)

  const isProgram = PROGRAM_KEYWORDS.some(
    (keyword) =>
      candidateKey === keyword ||
      candidateKey.startsWith(`${keyword} `) ||
      candidateKey.startsWith(`${keyword}-`) ||
      candidateKey.includes(` ${keyword}`) ||
      candidateKey.includes(`-${keyword}`),
  )

  return isProgram ? candidate.toUpperCase() : ''
}

function applyToSelect(select: HTMLSelectElement) {
  Array.from(select.options).forEach((option) => {
    const nextLabel = optionLabel(option)
    if (!nextLabel) return

    if (option.text !== nextLabel) option.text = nextLabel
    if (option.label !== nextLabel) option.label = nextLabel
    if (option.textContent !== nextLabel) option.textContent = nextLabel
  })
}

function applyProgramCaps() {
  document.querySelectorAll<HTMLSelectElement>('select').forEach(applyToSelect)
}

let rafId = 0

function scheduleApply() {
  if (rafId) return

  rafId = window.requestAnimationFrame(() => {
    rafId = 0
    applyProgramCaps()
  })
}

export function initPms10ProgramDropdownCaps() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  applyProgramCaps()

  const observer = new MutationObserver(scheduleApply)

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  const applyBeforeOpen = (event: Event) => {
    const target = event.target

    if (target instanceof Element) {
      const select = target.closest('select')
      if (select instanceof HTMLSelectElement) {
        applyToSelect(select)
        return
      }
    }

    applyProgramCaps()
  }

  document.addEventListener('touchstart', applyBeforeOpen, { capture: true, passive: true })
  document.addEventListener('pointerdown', applyBeforeOpen, { capture: true, passive: true })
  document.addEventListener('mousedown', applyBeforeOpen, { capture: true, passive: true })
  document.addEventListener('focusin', applyBeforeOpen, { capture: true })

  window.addEventListener('pageshow', scheduleApply, { passive: true })

  window.setTimeout(applyProgramCaps, 100)
  window.setTimeout(applyProgramCaps, 350)
  window.setTimeout(applyProgramCaps, 900)
  window.setTimeout(applyProgramCaps, 1500)
}
