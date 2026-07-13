const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')
const mainTsxPath = path.join(projectRoot, 'src/main.tsx')
const utilsDir = path.join(projectRoot, 'src/utils')
const titleCaseUtilPath = path.join(utilsDir, 'titleCaseLocationsDom.ts')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(layoutCssPath)) fail('Missing file: src/styles/layout.css')
if (!fs.existsSync(mainTsxPath)) fail('Missing file: src/main.tsx')
if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true })

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function removeCssBlocks(css, markers) {
  let output = css

  for (const marker of markers) {
    let oldIndex = output.indexOf(marker)

    while (oldIndex >= 0) {
      const start = output.lastIndexOf('/*', oldIndex)
      const safeStart = start >= 0 ? start : oldIndex
      const next = output.indexOf('/* =========================', oldIndex + marker.length)

      output = next >= 0 ? output.slice(0, safeStart) + output.slice(next) : output.slice(0, safeStart)
      oldIndex = output.indexOf(marker)
    }
  }

  return output
}

backup(layoutCssPath, 'update-hero-pills-titlecase-final')
backup(mainTsxPath, 'update-hero-pills-titlecase-final')
if (fs.existsSync(titleCaseUtilPath)) {
  backup(titleCaseUtilPath, 'update-hero-pills-titlecase-final')
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

css = removeCssBlocks(css, [
  'PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX',
  'PMS10 PROJECT UPDATE HERO SWIPEABLE TITLE',
  'PMS10 REMOVE PROJECT UPDATE HERO BANNER',
  'PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX',
  'PMS10 PROJECT UPDATE TITLE PILL READABLE FIX',
  'PMS10 PROJECT UPDATE RETURN BLUE HERO BIGGER FONT',
  'PMS10 PROJECT UPDATE BLUE HERO CLEAN FIX',
  'PMS10 PROJECT UPDATE MINIMAL BLUE HERO FIX',
  'PMS10 PROJECT UPDATE HERO PILLS FINAL FIX',
  'PMS10 UPDATE HERO PILLS TITLECASE FINAL FIX',
])

css += `
/* =========================
   PMS10 UPDATE HERO PILLS TITLECASE FINAL FIX
   Repaired Project Update hero pills + location title-case display support.
========================= */

/* Project Update blue hero */
.pu-update-hero-card {
  display: block !important;
  position: relative !important;
  min-height: 232px !important;
  max-height: 320px !important;
  height: auto !important;
  margin: 10px 14px 12px !important;
  padding: 26px 30px 24px !important;
  border: 0 !important;
  border-radius: 28px !important;
  color: #ffffff !important;
  background: linear-gradient(135deg, #0d3f78 0%, #155fa9 58%, #2373c4 100%) !important;
  box-shadow: 0 16px 34px rgba(15, 79, 143, 0.2) !important;
  overflow: hidden !important;
}

.pu-update-hero-card::before,
.pu-update-hero-card::after {
  display: none !important;
  content: none !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.pu-update-hero-card * {
  position: relative !important;
  z-index: 1 !important;
  text-shadow: none !important;
}

/* Eyebrow */
.pu-update-hero-card p:first-child,
.pu-update-hero-card [class*='eyebrow'],
.pu-update-hero-card [class*='kicker'] {
  margin: 0 0 13px !important;
  color: #ffb020 !important;
  font-size: 0.76rem !important;
  line-height: 1.05 !important;
  font-weight: 950 !important;
  letter-spacing: 0.18em !important;
  text-transform: uppercase !important;
}

/* Project title */
.pu-update-hero-title,
.pu-update-hero-card h1 {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 0 14px !important;
  padding: 0 !important;
  overflow: hidden !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;
  color: #ffffff !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  font-size: clamp(1.72rem, 8vw, 2.72rem) !important;
  line-height: 1.04 !important;
  letter-spacing: -0.055em !important;
  font-weight: 950 !important;
}

/* Reset wrapper rows so they never become the outer bubble. */
.pu-update-hero-card [class*='meta'],
.pu-update-hero-card [class*='actions'],
.pu-update-hero-card [class*='summary'],
.pu-update-hero-card [class*='location'],
.pu-update-hero-card [class*='chips'],
.pu-update-hero-card [class*='badges'],
.pu-update-hero-card [class*='pills'] {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 8px !important;
  width: auto !important;
  max-width: 100% !important;
  min-height: 0 !important;
  margin-top: 10px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

/* Reset parent wrappers that contain children. Supported in modern iOS Safari. */
.pu-update-hero-card [class*='status']:has(> *),
.pu-update-hero-card [class*='complete']:has(> *),
.pu-update-hero-card [class*='completed']:has(> *),
.pu-update-hero-card [class*='risk']:has(> *),
.pu-update-hero-card [class*='progress']:has(> *),
.pu-update-hero-card [class*='high']:has(> *),
.pu-update-hero-card [class*='medium']:has(> *),
.pu-update-hero-card [class*='low']:has(> *) {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 8px !important;
  width: auto !important;
  max-width: 100% !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

/* Real pill elements only. Avoid containers like "chips", "badges", and "pills". */
.pu-update-hero-card [class*='-chip']:not([class*='chips']),
.pu-update-hero-card [class*='_chip']:not([class*='chips']),
.pu-update-hero-card [class*=' chip']:not([class*='chips']),
.pu-update-hero-card [class*='-pill']:not([class*='pills']),
.pu-update-hero-card [class*='_pill']:not([class*='pills']),
.pu-update-hero-card [class*=' pill']:not([class*='pills']),
.pu-update-hero-card [class*='-badge']:not([class*='badges']),
.pu-update-hero-card [class*='_badge']:not([class*='badges']),
.pu-update-hero-card [class*=' badge']:not([class*='badges']),
.pu-update-hero-card [class*='status']:not(:has(> *)),
.pu-update-hero-card [class*='complete']:not(:has(> *)),
.pu-update-hero-card [class*='completed']:not(:has(> *)),
.pu-update-hero-card [class*='risk']:not(:has(> *)),
.pu-update-hero-card [class*='progress']:not(:has(> *)),
.pu-update-hero-card [class*='high']:not(:has(> *)),
.pu-update-hero-card [class*='medium']:not(:has(> *)),
.pu-update-hero-card [class*='low']:not(:has(> *)) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex: 0 0 auto !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: max-content !important;
  min-height: 32px !important;
  margin: 0 !important;
  padding: 7px 13px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(255, 255, 255, 0.28) !important;
  background: rgba(255, 255, 255, 0.14) !important;
  box-shadow: none !important;
  color: rgba(255, 255, 255, 0.94) !important;
  font-size: 0.72rem !important;
  line-height: 1 !important;
  font-weight: 950 !important;
  letter-spacing: 0.03em !important;
  white-space: nowrap !important;
  text-transform: none !important;
}

/* Remove previous separator dots */
.pu-update-hero-card [class*='-chip']::after,
.pu-update-hero-card [class*='_chip']::after,
.pu-update-hero-card [class*=' chip']::after,
.pu-update-hero-card [class*='-pill']::after,
.pu-update-hero-card [class*='_pill']::after,
.pu-update-hero-card [class*=' pill']::after,
.pu-update-hero-card [class*='-badge']::after,
.pu-update-hero-card [class*='_badge']::after,
.pu-update-hero-card [class*=' badge']::after {
  display: none !important;
  content: none !important;
}

/* Individual pill colors */
.pu-update-hero-card [class*='complete']:not(:has(> *)),
.pu-update-hero-card [class*='completed']:not(:has(> *)) {
  color: #166534 !important;
  background: #dcfce7 !important;
  border-color: rgba(34, 197, 94, 0.28) !important;
}

.pu-update-hero-card [class*='progress']:not(:has(> *)) {
  color: #1d4ed8 !important;
  background: #eff6ff !important;
  border-color: rgba(59, 130, 246, 0.3) !important;
}

.pu-update-hero-card [class*='high']:not(:has(> *)),
.pu-update-hero-card [class*='risk']:not(:has(> *)) {
  color: #b91c1c !important;
  background: #fee2e2 !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
}

.pu-update-hero-card [class*='medium']:not(:has(> *)) {
  color: #c2410c !important;
  background: #ffedd5 !important;
  border-color: rgba(249, 115, 22, 0.3) !important;
}

.pu-update-hero-card [class*='low']:not(:has(> *)) {
  color: #854d0e !important;
  background: #fef9c3 !important;
  border-color: rgba(234, 179, 8, 0.3) !important;
}

/* Location display: stop CSS from forcing all caps in location-related fields. */
[class*='province'],
[class*='municip'],
[class*='city'],
[class*='barangay'],
[class*='brgy'],
[class*='lgu'],
[class*='location'],
[class*='address'],
[data-field*='province'],
[data-field*='municip'],
[data-field*='city'],
[data-field*='barangay'],
[data-field*='brgy'],
[data-field*='lgu'],
[data-label*='province'],
[data-label*='municip'],
[data-label*='city'],
[data-label*='barangay'],
[data-label*='brgy'],
[data-label*='lgu'] {
  text-transform: none !important;
}

@media (min-width: 901px) {
  .pu-update-hero-card {
    min-height: 236px !important;
    max-height: 320px !important;
    padding: 28px 34px 26px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(2.05rem, 4.4vw, 3.62rem) !important;
  }
}

@media (max-width: 900px) {
  .pu-update-hero-card {
    min-height: 226px !important;
    max-height: 310px !important;
    margin: 10px 14px 12px !important;
    padding: 25px 28px 23px !important;
    border-radius: 27px !important;
  }

  .pu-update-hero-card p:first-child,
  .pu-update-hero-card [class*='eyebrow'],
  .pu-update-hero-card [class*='kicker'] {
    font-size: 0.72rem !important;
    margin-bottom: 12px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(1.66rem, 7.8vw, 2.46rem) !important;
    line-height: 1.04 !important;
    -webkit-line-clamp: 3 !important;
  }
}

@media (max-width: 420px) {
  .pu-update-hero-card {
    min-height: 216px !important;
    max-height: 294px !important;
    margin: 9px 12px 11px !important;
    padding: 23px 24px 22px !important;
    border-radius: 25px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(1.46rem, 7vw, 2.06rem) !important;
    -webkit-line-clamp: 3 !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

const titleCaseUtil = `const LOCATION_EXCLUDE = new Set([
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
    .replace(/\\s+/g, ' ')
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
  const trimmed = text.replace(/\\s+/g, ' ').trim()

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
  const leading = text.match(/^\\s*/)?.[0] ?? ''
  const trailing = text.match(/\\s*$/)?.[0] ?? ''
  const core = text.trim()

  if (!core) return text

  const pieces = core.split(/(,|•|\\||\\/| - )/g)

  const normalized = pieces
    .map((piece) => {
      if (/^(,|•|\\||\\/| - )$/.test(piece)) return piece

      const segment = piece.trim()
      if (!isMostlyUppercaseLocationSegment(segment)) return piece

      const segmentLeading = piece.match(/^\\s*/)?.[0] ?? ''
      const segmentTrailing = piece.match(/\\s*$/)?.[0] ?? ''

      return \`\${segmentLeading}\${toLocationTitleCase(segment)}\${segmentTrailing}\`
    })
    .join('')

  if (normalized !== core) return \`\${leading}\${normalized}\${trailing}\`

  if (isMostlyUppercaseLocationSegment(core)) {
    return \`\${leading}\${toLocationTitleCase(core)}\${trailing}\`
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
`

fs.writeFileSync(titleCaseUtilPath, titleCaseUtil)

let mainTsx = fs.readFileSync(mainTsxPath, 'utf8')
if (!mainTsx.includes('./utils/titleCaseLocationsDom')) {
  const importLine = "import './utils/titleCaseLocationsDom'\n"
  const firstNonImport = mainTsx.search(/^(?!import\s)/m)

  if (firstNonImport > 0) {
    mainTsx = `${mainTsx.slice(0, firstNonImport)}${importLine}${mainTsx.slice(firstNonImport)}`
  } else {
    mainTsx = `${importLine}${mainTsx}`
  }

  fs.writeFileSync(mainTsxPath, mainTsx)
  console.log('Added title-case location normalizer import to src/main.tsx')
} else {
  console.log('Title-case location normalizer import already exists.')
}

console.log('Applied final update hero pill repair and robust location title-case display.')
