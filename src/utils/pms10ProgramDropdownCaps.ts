const PROGRAM_OPTION_KEYWORDS = [
  'falgu',
  'gef',
  'ggg',
  'rapid',
  'safpb',
  'sbdp',
  'salintubig',
  'cmgp',
  'kalsada',
  'lgsf',
  'lgff',
  'fmr',
]

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function getDirectLabelText(select: HTMLSelectElement) {
  const label = select.closest('label')
  if (!label) return ''

  const directSpan = label.querySelector(':scope > span')
  if (directSpan) return normalizeText(directSpan.textContent)

  const directLabel = Array.from(label.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
    .join(' ')

  return directLabel
}

function looksLikeProgramSelect(select: HTMLSelectElement) {
  const labelText = getDirectLabelText(select)
  const attributes = [
    select.name,
    select.id,
    select.className,
    select.getAttribute('aria-label'),
    select.getAttribute('title'),
    labelText,
  ]
    .map((value) => normalizeText(String(value ?? '')).toLowerCase())
    .join(' ')

  if (
    attributes.includes('program') ||
    attributes.includes('funding source') ||
    attributes.includes('funding program')
  ) {
    return true
  }

  const optionTexts = Array.from(select.options).map((option) =>
    normalizeText(option.textContent).toLowerCase(),
  )

  const programMatches = optionTexts.filter((text) =>
    PROGRAM_OPTION_KEYWORDS.some((keyword) => text === keyword || text.includes(keyword)),
  )

  return programMatches.length >= 2
}

function toProgramOptionLabel(text: string) {
  const clean = normalizeText(text)
  if (!clean) return clean

  if (/^all\s+programs?$/i.test(clean)) return 'ALL PROGRAMS'
  if (/^all\s+funding\s+sources?$/i.test(clean)) return 'ALL FUNDING SOURCES'
  if (/^select\s+funding\s+source$/i.test(clean)) return 'SELECT FUNDING SOURCE'
  if (/^select\s+program$/i.test(clean)) return 'SELECT PROGRAM'

  return clean.toUpperCase()
}

function uppercaseProgramSelectOptions(select: HTMLSelectElement) {
  if (!looksLikeProgramSelect(select)) return

  Array.from(select.options).forEach((option) => {
    const nextLabel = toProgramOptionLabel(option.textContent || option.label || option.value)

    if (!nextLabel) return

    if (option.textContent !== nextLabel) {
      option.textContent = nextLabel
    }

    if (option.label !== nextLabel) {
      option.label = nextLabel
    }
  })
}

function uppercaseAllProgramSelects() {
  document.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
    uppercaseProgramSelectOptions(select)
  })
}

let timer: number | undefined

function scheduleUppercase() {
  window.clearTimeout(timer)
  timer = window.setTimeout(uppercaseAllProgramSelects, 40)
}

export function initPms10ProgramDropdownCaps() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  uppercaseAllProgramSelects()

  const observer = new MutationObserver(scheduleUppercase)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const select = target.closest('select')
      if (select instanceof HTMLSelectElement) {
        uppercaseProgramSelectOptions(select)
      }
    },
    { capture: true, passive: true },
  )

  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target
      if (target instanceof HTMLSelectElement) {
        uppercaseProgramSelectOptions(target)
      }
    },
    { capture: true },
  )

  window.setTimeout(uppercaseAllProgramSelects, 100)
  window.setTimeout(uppercaseAllProgramSelects, 350)
  window.setTimeout(uppercaseAllProgramSelects, 900)
}
