const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const mapPath = path.join(projectRoot, 'src/pages/ProjectMap.tsx')
const cssPath = path.join(projectRoot, 'src/styles/projectMap.css')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(mapPath)) fail('Missing file: src/pages/ProjectMap.tsx')
if (!fs.existsSync(cssPath)) fail('Missing file: src/styles/projectMap.css')

function backup(filePath, suffix) {
  if (!fs.existsSync(filePath)) return

  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function removeCssBlock(css, marker) {
  let output = css
  let index = output.indexOf(marker)

  while (index >= 0) {
    const start = output.lastIndexOf('/*', index)
    const safeStart = start >= 0 ? start : index
    const next = output.indexOf('/* =========================', index + marker.length)

    output = next >= 0
      ? output.slice(0, safeStart) + output.slice(next)
      : output.slice(0, safeStart)

    index = output.indexOf(marker)
  }

  return output
}

backup(mapPath, 'gis-banner-stack-order-final')
backup(cssPath, 'gis-banner-stack-order-final')
backup(layoutCssPath, 'gis-banner-stack-order-final')

let source = fs.readFileSync(mapPath, 'utf8')

/*
  The GIS hero gets broken by the scroll-compact class.
  Remove the scroll state and the scroll listener from ProjectMap.
*/
source = source.replace(/\n\s*const \[isMapScrolled,\s*setIsMapScrolled\]\s*=\s*useState\(false\)/, '')

source = source.replace(
  /\n\s*useEffect\(\(\) => \{\n\s*let ticking = false\n\s*const scrollThreshold = 44[\s\S]*?\n\s*\}, \[\]\)\n/,
  '\n',
)

source = source.replace(
  /<main className=\{`pm-map-page \$\{isMapScrolled \? 'is-map-scrolled' : ''\}`\}>/g,
  '<main className="pm-map-page">',
)

source = source.replace(
  /<main className=\{`pm-map-page \$\{isMapScrolled \? "is-map-scrolled" : ""\}`\}>/g,
  '<main className="pm-map-page">',
)

source = source.replace(
  /<main className=\{['"]pm-map-page['"]\}>/g,
  '<main className="pm-map-page">',
)

fs.writeFileSync(mapPath, source)

let css = fs.readFileSync(cssPath, 'utf8')

const markersToRemove = [
  'PMS10 MAP BANNER MARKER VISIBILITY FIX',
  'PMS10 RESTORE GIS BANNER MOBILE FIX',
  'PMS10 GIS BANNER STACK ORDER FINAL FIX',
]

for (const marker of markersToRemove) {
  css = removeCssBlock(css, marker)
}

css += `
/* =========================
   PMS10 GIS BANNER STACK ORDER FINAL FIX
   Restores normal GIS page flow: header -> hero -> cards -> filters -> map.
========================= */

/*
  Do not let the GIS hero become sticky/fixed. That compact scroll behavior
  caused the hero to overlap the statistic cards and look destroyed.
*/
.pm-map-page,
.pm-map-page.is-map-scrolled {
  display: block !important;
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 auto !important;
  padding-top: 0 !important;
  overflow-x: hidden !important;
}

/* The GIS hero must stay in normal document flow. */
.pm-map-hero,
.pm-map-page.is-map-scrolled .pm-map-hero {
  position: relative !important;
  inset: auto !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  z-index: 1 !important;

  display: flex !important;
  align-items: flex-end !important;
  justify-content: space-between !important;
  gap: 20px !important;

  width: auto !important;
  max-width: 100% !important;
  min-height: 132px !important;
  height: auto !important;
  max-height: none !important;

  margin: 0 0 18px !important;
  padding: 30px 32px !important;

  transform: none !important;
  translate: none !important;

  border-radius: 30px !important;
  overflow: hidden !important;
  color: #ffffff !important;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 34%),
    radial-gradient(circle at 86% 3%, rgba(255, 255, 255, 0.14), transparent 42%),
    linear-gradient(135deg, #123f73 0%, #18599d 56%, #2368b5 100%) !important;
  box-shadow: 0 22px 48px rgba(15, 48, 87, 0.18) !important;
}

/* Restore decorative circles and all hero text even if old is-map-scrolled CSS exists. */
.pm-map-hero::before,
.pm-map-hero::after,
.pm-map-page.is-map-scrolled .pm-map-hero::before,
.pm-map-page.is-map-scrolled .pm-map-hero::after {
  display: block !important;
  pointer-events: none !important;
}

.pm-map-eyebrow,
.pm-map-page.is-map-scrolled .pm-map-eyebrow,
.pm-map-hero p:not(.pm-map-eyebrow),
.pm-map-page.is-map-scrolled .pm-map-hero p:not(.pm-map-eyebrow) {
  display: block !important;
}

.pm-map-eyebrow,
.pm-map-page.is-map-scrolled .pm-map-eyebrow {
  margin: 0 !important;
  color: #fbbf24 !important;
  font-size: 0.72rem !important;
  font-weight: 900 !important;
  letter-spacing: 0.12em !important;
  text-transform: uppercase !important;
}

.pm-map-hero h1,
.pm-map-page.is-map-scrolled .pm-map-hero h1 {
  display: block !important;
  width: 100% !important;
  max-width: 900px !important;
  margin: 0.35rem 0 0.5rem !important;
  overflow: visible !important;
  color: #ffffff !important;
  font-size: clamp(2.25rem, 7vw, 4rem) !important;
  font-weight: 950 !important;
  line-height: 0.98 !important;
  letter-spacing: -0.045em !important;
  white-space: normal !important;
  text-overflow: unset !important;
}

.pm-map-hero p:not(.pm-map-eyebrow),
.pm-map-page.is-map-scrolled .pm-map-hero p:not(.pm-map-eyebrow) {
  max-width: 720px !important;
  margin: 0 !important;
  color: rgba(255, 255, 255, 0.92) !important;
  font-size: clamp(0.96rem, 3.5vw, 1.2rem) !important;
  font-weight: 780 !important;
  line-height: 1.45 !important;
}

/* Force correct vertical order and prevent overlap. */
.pm-map-alert,
.pm-map-summary-grid,
.pm-map-selected-card,
.pm-map-filter-card,
.pm-map-workspace,
.pm-map-main-card,
.pm-map-side-panel {
  position: relative !important;
  top: auto !important;
  bottom: auto !important;
  z-index: 1 !important;
  clear: both !important;
  transform: none !important;
  translate: none !important;
}

.pm-map-summary-grid {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 14px !important;
  width: 100% !important;
  margin: 0 0 18px !important;
}

.pm-map-summary-card {
  min-width: 0 !important;
  order: initial !important;
}

/* Mobile: compact normal stack, no sticky, no fixed, no overlap. */
@media (max-width: 760px) {
  .pm-map-page,
  .pm-map-page.is-map-scrolled {
    display: block !important;
    padding-top: 0 !important;
    padding-bottom: 126px !important;
    overflow-x: hidden !important;
  }

  .pm-map-hero,
  .pm-map-page.is-map-scrolled .pm-map-hero {
    position: relative !important;
    inset: auto !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;

    width: auto !important;
    min-height: 164px !important;
    height: auto !important;
    max-height: none !important;

    margin: 12px 14px 14px !important;
    padding: 24px 22px 24px !important;

    display: flex !important;
    align-items: flex-end !important;
    justify-content: flex-start !important;

    border-radius: 28px !important;
  }

  .pm-map-hero h1,
  .pm-map-page.is-map-scrolled .pm-map-hero h1 {
    max-width: 100% !important;
    margin: 0.3rem 0 0.45rem !important;
    font-size: clamp(2.05rem, 8.8vw, 3rem) !important;
    line-height: 0.98 !important;
    white-space: normal !important;
  }

  .pm-map-hero p:not(.pm-map-eyebrow),
  .pm-map-page.is-map-scrolled .pm-map-hero p:not(.pm-map-eyebrow) {
    max-width: 100% !important;
    font-size: 0.92rem !important;
    line-height: 1.38 !important;
  }

  .pm-map-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 12px !important;
    margin: 0 14px 16px !important;
    width: auto !important;
  }

  .pm-map-filter-card,
  .pm-map-card,
  .pm-map-list-card,
  .pm-map-review-card,
  .pm-map-selected-card {
    margin-left: 14px !important;
    margin-right: 14px !important;
  }

  .pm-map-main-card {
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  .pm-map-shell {
    position: relative !important;
    z-index: 1 !important;
    margin-top: 0 !important;
  }
}

/* Keep accepted marker/popup behavior intact. */
.pm-map-shell .leaflet-popup,
.pm-map-shell .leaflet-popup-content-wrapper,
.pm-map-shell .leaflet-popup-tip {
  transition: none !important;
  animation: none !important;
}
`

fs.writeFileSync(cssPath, css)

if (fs.existsSync(layoutCssPath)) {
  let layoutCss = fs.readFileSync(layoutCssPath, 'utf8')
  const markers = [
    'PMS10 MAP BANNER MARKER VISIBILITY FIX',
    'PMS10 RESTORE GIS BANNER MOBILE FIX',
    'PMS10 GIS BANNER STACK ORDER FINAL FIX',
  ]

  for (const marker of markers) {
    layoutCss = removeCssBlock(layoutCss, marker)
  }

  fs.writeFileSync(layoutCssPath, layoutCss)
}

console.log('Applied GIS banner stack/order final fix.')
console.log('Removed GIS scroll-compact hero state and forced normal page order.')
