const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const indexPath = path.join(projectRoot, 'index.html')
const mainPath = path.join(projectRoot, 'src/main.tsx')
const stylesDir = path.join(projectRoot, 'src/styles')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')
const utilsDir = path.join(projectRoot, 'src/utils')
const zoomGuardPath = path.join(utilsDir, 'disableAppZoomExceptMap.ts')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(indexPath)) fail('Missing file: index.html')
if (!fs.existsSync(mainPath)) fail('Missing file: src/main.tsx')
if (!fs.existsSync(stylesDir)) fs.mkdirSync(stylesDir, { recursive: true })
if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true })
if (!fs.existsSync(layoutCssPath)) fs.writeFileSync(layoutCssPath, '')

function backup(filePath, suffix) {
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

backup(indexPath, 'disable-app-zoom-except-map')
backup(mainPath, 'disable-app-zoom-except-map')
backup(layoutCssPath, 'disable-app-zoom-except-map')
if (fs.existsSync(zoomGuardPath)) backup(zoomGuardPath, 'disable-app-zoom-except-map')

let indexHtml = fs.readFileSync(indexPath, 'utf8')

const viewportContent =
  'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, viewport-fit=cover, user-scalable=no'

if (/<meta\s+name=["']viewport["'][^>]*>/i.test(indexHtml)) {
  indexHtml = indexHtml.replace(
    /<meta\s+name=["']viewport["'][^>]*>/i,
    `<meta name="viewport" content="${viewportContent}" />`,
  )
} else {
  indexHtml = indexHtml.replace(
    /<head[^>]*>/i,
    (match) => `${match}\n    <meta name="viewport" content="${viewportContent}" />`,
  )
}

fs.writeFileSync(indexPath, indexHtml)

const zoomGuardSource = `const MAP_SELECTOR = '.leaflet-container, .leaflet-container *'

function isInsideMap(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(MAP_SELECTOR))
}

function preventNonMapGesture(event: Event) {
  if (isInsideMap(event.target)) return
  event.preventDefault()
}

function preventNonMapWheelZoom(event: WheelEvent) {
  if (isInsideMap(event.target)) return

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
  }
}

let lastTouchEnd = 0

function preventNonMapDoubleTapZoom(event: TouchEvent) {
  if (isInsideMap(event.target)) return

  const now = Date.now()

  if (now - lastTouchEnd <= 360) {
    event.preventDefault()
  }

  lastTouchEnd = now
}

function ensureViewportZoomLocked() {
  const content =
    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, viewport-fit=cover, user-scalable=no'

  let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')

  if (!viewport) {
    viewport = document.createElement('meta')
    viewport.name = 'viewport'
    document.head.appendChild(viewport)
  }

  if (viewport.content !== content) {
    viewport.content = content
  }
}

if (typeof window !== 'undefined') {
  ensureViewportZoomLocked()

  document.addEventListener('gesturestart', preventNonMapGesture, { passive: false })
  document.addEventListener('gesturechange', preventNonMapGesture, { passive: false })
  document.addEventListener('gestureend', preventNonMapGesture, { passive: false })

  document.addEventListener('wheel', preventNonMapWheelZoom, { passive: false })
  document.addEventListener('touchend', preventNonMapDoubleTapZoom, { passive: false })

  window.addEventListener('pageshow', ensureViewportZoomLocked)
  window.addEventListener('orientationchange', () => {
    window.setTimeout(ensureViewportZoomLocked, 250)
  })
}

export {}
`

fs.writeFileSync(zoomGuardPath, zoomGuardSource)

let mainSource = fs.readFileSync(mainPath, 'utf8')

if (!mainSource.includes('./utils/disableAppZoomExceptMap')) {
  const importLine = "import './utils/disableAppZoomExceptMap'\n"
  const firstNonImport = mainSource.search(/^(?!import\s)/m)

  if (firstNonImport > 0) {
    mainSource = `${mainSource.slice(0, firstNonImport)}${importLine}${mainSource.slice(firstNonImport)}`
  } else {
    mainSource = `${importLine}${mainSource}`
  }

  fs.writeFileSync(mainPath, mainSource)
  console.log('Added zoom guard import to src/main.tsx')
} else {
  console.log('Zoom guard import already exists in src/main.tsx')
}

let css = fs.readFileSync(layoutCssPath, 'utf8')
const marker = 'PMS10 DISABLE APP ZOOM EXCEPT MAP'
css = removeCssBlock(css, marker)

css += `
/* =========================
   PMS10 DISABLE APP ZOOM EXCEPT MAP
   Prevent app/page zoom while preserving Leaflet map pinch/drag zoom.
========================= */

html,
body,
#root {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-x: hidden !important;
  -webkit-text-size-adjust: 100% !important;
  text-size-adjust: 100% !important;
}

/* Prevent browser double-tap zoom on the app shell. */
body {
  touch-action: manipulation;
}

/* Keep form controls at 16px or larger to stop iOS input-focus zoom. */
input,
select,
textarea,
button {
  font-size: max(16px, 1rem);
}

/* Do not constrain Leaflet gestures. Leaflet handles pinch/drag zoom internally. */
.leaflet-container,
.leaflet-container * {
  touch-action: auto !important;
}

/* Avoid accidental horizontal layout zoom/overflow from wide children. */
.app-shell,
.main-content,
.page-content,
.dashboard-page,
.projects-page,
.project-details-page,
.project-update-page,
.pm-map-page,
.pm-map-shell {
  max-width: 100% !important;
  overflow-x: hidden !important;
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Applied PMS10 disable app zoom except map patch.')
console.log('Page/app zoom is disabled. Leaflet map pinch/drag zoom remains allowed.')
