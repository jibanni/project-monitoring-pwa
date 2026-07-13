const LOCATION_EXCLUDE = new Set([
  'ADMIN',
  'ALL',
  'ALL PROJECTS',
  'CANCELLED',
  'COMPLETED',
  'CRITICAL',
  'CRITICAL STATUS',
  'DASHBOARD',
  'DILG',
  'FALGU',
  'FILTER',
  'HIGH',
  'HIGH RISK',
  'LOW',
  'MEDIUM',
  'NONE',
  'NOT STARTED',
  'NOT YET STARTED',
  'ONGOING',
  'PROJECT',
  'PROJECTS',
  'RISK',
  'SUBAYBAYAN',
  'SYNC',
  'TERMINATED',
  'UNDER PROCUREMENT',
  'USERS',
])

const LOCATION_SCOPE_PATTERN =
  /province|municip|city|barangay|brgy|lgu|location|address|chip|pill|badge|meta|place|option/i

function toLocationTitleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[a-zñ]+(?:[-'][a-zñ]+)*/gi, (word) =>
      word
        .split(/([-'])/)
        .map((part) => {
          if (part === '-' || part === "'") return part
          if (!part) return part
          return part.charAt(0).toUpperCase() + part.slice(1)
        })
        .join(''),
    )
}

function isMostlyUppercaseLocationSegment(text: string) {
  const trimmed = text.replace(/\s+/g, ' ').trim()

  if (!trimmed) return false
  if (trimmed.length < 3 || trimmed.length > 90) return false
  if (/[0-9%₱$]/.test(trimmed)) return false

  const upper = trimmed.toUpperCase()

  if (LOCATION_EXCLUDE.has(upper)) return false
  if (upper.includes('PROJECT') || upper.includes('STATUS') || upper.includes('RISK')) return false

  const letters = trimmed.replace(/[^A-Za-zÑñ]/g, '')
  if (letters.length < 3) return false

  const uppercaseLetters = letters.replace(/[^A-ZÑ]/g, '')
  return uppercaseLetters.length / letters.length >= 0.75
}

function normalizeMixedLocationText(text: string) {
  const leading = text.match(/^\s*/)?.[0] ?? ''
  const trailing = text.match(/\s*$/)?.[0] ?? ''
  const core = text.trim()

  if (!core) return text

  const pieces = core.split(/(,|•|\||\/| - )/g)

  const normalized = pieces
    .map((piece) => {
      if (/^(,|•|\||\/| - )$/.test(piece)) return piece

      const segment = piece.trim()
      if (!isMostlyUppercaseLocationSegment(segment)) return piece

      const segmentLeading = piece.match(/^\s*/)?.[0] ?? ''
      const segmentTrailing = piece.match(/\s*$/)?.[0] ?? ''

      return `${segmentLeading}${toLocationTitleCase(segment)}${segmentTrailing}`
    })
    .join('')

  if (normalized !== core) return `${leading}${normalized}${trailing}`

  if (isMostlyUppercaseLocationSegment(core)) {
    return `${leading}${toLocationTitleCase(core)}${trailing}`
  }

  return text
}

function isLocationScope(element: Element) {
  if (element.tagName === 'OPTION') return true

  const meta = [
    element.className,
    element.id,
    element.getAttribute('aria-label'),
    element.getAttribute('data-field'),
    element.getAttribute('data-label'),
    element.getAttribute('name'),
    element.getAttribute('placeholder'),
  ]
    .filter(Boolean)
    .join(' ')

  return LOCATION_SCOPE_PATTERN.test(meta)
}

function normalizeElement(element: Element) {
  if (!(element instanceof HTMLElement)) return
  if (!isLocationScope(element)) return

  element.style.textTransform = 'none'

  const children = Array.from(element.childNodes)

  for (const child of children) {
    if (child.nodeType !== Node.TEXT_NODE) continue

    const original = child.textContent ?? ''
    const normalized = normalizeMixedLocationText(original)

    if (normalized !== original) {
      child.textContent = normalized
    }
  }
}

function normalizeLocationText() {
  const elements = document.querySelectorAll(
    [
      '[class*="province"]',
      '[class*="municip"]',
      '[class*="city"]',
      '[class*="barangay"]',
      '[class*="brgy"]',
      '[class*="lgu"]',
      '[class*="location"]',
      '[class*="address"]',
      '[class*="chip"]',
      '[class*="pill"]',
      '[class*="badge"]',
      '[class*="meta"]',
      '[data-field*="province"]',
      '[data-field*="municip"]',
      '[data-field*="city"]',
      '[data-field*="barangay"]',
      '[data-field*="brgy"]',
      '[data-field*="lgu"]',
      '[data-label*="province"]',
      '[data-label*="municip"]',
      '[data-label*="city"]',
      '[data-label*="barangay"]',
      '[data-label*="brgy"]',
      '[data-label*="lgu"]',
      'option',
    ].join(','),
  )

  elements.forEach(normalizeElement)
}

if (typeof window !== 'undefined') {
  let queued = false

  const queueNormalize = () => {
    if (queued) return

    queued = true

    window.requestAnimationFrame(() => {
      queued = false
      normalizeLocationText()
    })
  }

  queueNormalize()
  window.addEventListener('load', queueNormalize)
  window.addEventListener('popstate', queueNormalize)

  const observer = new MutationObserver(queueNormalize)

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

export {}
