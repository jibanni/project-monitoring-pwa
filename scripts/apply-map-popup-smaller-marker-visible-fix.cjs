const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const mapPath = path.join(projectRoot, 'src/pages/ProjectMap.tsx')
const cssPath = path.join(projectRoot, 'src/styles/projectMap.css')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(mapPath)) fail('Missing file: src/pages/ProjectMap.tsx')
if (!fs.existsSync(cssPath)) fail('Missing file: src/styles/projectMap.css')

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

    output = next >= 0 ? output.slice(0, safeStart) + output.slice(next) : output.slice(0, safeStart)
    index = output.indexOf(marker)
  }

  return output
}

backup(mapPath, 'popup-smaller-marker-visible-fix')
backup(cssPath, 'popup-smaller-marker-visible-fix')

let source = fs.readFileSync(mapPath, 'utf8')

// Make CircleMarker popup compact and prevent map pan/flicker that can hide the marker.
source = source.replace(/minWidth=\{\s*\d+\s*\}/g, 'minWidth={220}')
source = source.replace(/maxWidth=\{\s*\d+\s*\}/g, 'maxWidth={260}')
source = source.replace(/autoClose=\{false\}/g, 'autoClose={true}')
source = source.replace(/autoClose=\{true\}/g, 'autoClose={true}')
source = source.replace(/\s+autoPan\b(?!\s*=)/g, '\n                          autoPan={false}')
source = source.replace(/autoPan=\{true\}/g, 'autoPan={false}')
source = source.replace(/autoPan=\{false\}/g, 'autoPan={false}')
source = source.replace(/\s+keepInView\b(?!\s*=)/g, '\n                          keepInView={false}')
source = source.replace(/keepInView=\{true\}/g, 'keepInView={false}')
source = source.replace(/keepInView=\{false\}/g, 'keepInView={false}')

// Add offset so the popup floats a little above the marker and the marker remains visible.
if (!source.includes('offset={[0, -18]}')) {
  source = source.replace(
    /(<Popup[\s\S]*?className="pm-map-project-popup"[\s\S]*?)(\s*>)/,
    (match, before, end) => {
      if (/offset=\{/.test(match)) return match.replace(/offset=\{[^}]+\}/, 'offset={[0, -18]}')
      return `${before}\n                          offset={[0, -18]}${end}`
    },
  )
}

// Radius currently okay, but keep visible dot modest.
source = source.replace(/radius=\{\s*\d+\s*\}/g, 'radius={5}')

fs.writeFileSync(mapPath, source)

let css = fs.readFileSync(cssPath, 'utf8')
css = removeCssBlock(css, 'PMS10 MAP POPUP SMALLER MARKER VISIBLE FIX')

css += `
/* =========================
   PMS10 MAP POPUP SMALLER MARKER VISIBLE FIX
   Compact anchored popup that does not cover the selected marker.
========================= */

/* Popup is intentionally smaller and raised above the marker. */
.pm-map-shell .leaflet-popup.pm-map-project-popup {
  margin-bottom: 18px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content-wrapper {
  width: min(258px, 68vw) !important;
  max-width: min(258px, 68vw) !important;
  min-width: 0 !important;
  border-radius: 15px !important;
  background: rgba(255, 255, 255, 0.985) !important;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.2) !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content {
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  margin: 8px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-tip {
  width: 12px !important;
  height: 12px !important;
}

/* Small close button */
.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-close-button {
  top: 7px !important;
  right: 7px !important;
  display: grid !important;
  place-items: center !important;
  width: 24px !important;
  height: 24px !important;
  border-radius: 999px !important;
  color: #334155 !important;
  background: #e2e8f0 !important;
  font-size: 1rem !important;
  font-weight: 950 !important;
  line-height: 1 !important;
  text-decoration: none !important;
}

/* Compact content */
.pm-map-project-popup .pm-map-popup {
  width: 100% !important;
  max-width: 100% !important;
  max-height: none !important;
  overflow: visible !important;
}

.pm-map-project-popup .pm-map-popup h3 {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  margin: 0 30px 4px 0 !important;
  overflow: hidden !important;
  color: #0f172a !important;
  font-size: 0.72rem !important;
  font-weight: 950 !important;
  line-height: 1.08 !important;
  letter-spacing: -0.015em !important;
}

.pm-map-project-popup .pm-map-popup p {
  display: -webkit-box !important;
  -webkit-line-clamp: 1 !important;
  -webkit-box-orient: vertical !important;
  margin: 0 30px 6px 0 !important;
  overflow: hidden !important;
  color: #475569 !important;
  font-size: 0.58rem !important;
  font-weight: 820 !important;
  line-height: 1.15 !important;
  text-transform: none !important;
}

.pm-map-project-popup .pm-map-popup-badges {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 4px !important;
  margin: 0 0 6px !important;
}

.pm-map-project-popup .pm-map-popup-badges span,
.pm-map-project-popup .pm-map-popup [class*='pm-status'],
.pm-map-project-popup .pm-map-popup [class*='pm-risk'] {
  min-height: 18px !important;
  padding: 3px 7px !important;
  border-radius: 999px !important;
  font-size: 0.48rem !important;
  line-height: 1 !important;
  letter-spacing: 0.05em !important;
  font-weight: 950 !important;
}

/* Tiny but readable cards */
.pm-map-project-popup .pm-map-popup dl {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 4px !important;
  margin: 0 !important;
}

.pm-map-project-popup .pm-map-popup dl div {
  display: block !important;
  min-width: 0 !important;
  min-height: 38px !important;
  padding: 5px 6px !important;
  border: 1px solid rgba(226, 232, 240, 0.9) !important;
  border-radius: 9px !important;
  background: #f8fafc !important;
}

.pm-map-project-popup .pm-map-popup dt {
  margin: 0 0 2px !important;
  color: #64748b !important;
  font-size: 0.45rem !important;
  font-weight: 950 !important;
  line-height: 1 !important;
  letter-spacing: 0.1em !important;
  text-transform: uppercase !important;
}

.pm-map-project-popup .pm-map-popup dd {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  min-width: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  color: #0f172a !important;
  font-size: 0.56rem !important;
  font-weight: 900 !important;
  line-height: 1.08 !important;
  overflow-wrap: anywhere !important;
}

.pm-map-project-popup .pm-map-popup a {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-height: 28px !important;
  margin-top: 6px !important;
  border-radius: 9px !important;
  color: #ffffff !important;
  background: linear-gradient(135deg, #16467a, #1d64a8) !important;
  font-size: 0.66rem !important;
  font-weight: 950 !important;
  text-decoration: none !important;
}

/* Keep selected marker visible above map paths and below popup. */
.pm-map-shell .leaflet-overlay-pane svg path.leaflet-interactive {
  stroke-width: 3px !important;
}

.pm-map-shell .leaflet-popup-pane {
  pointer-events: auto !important;
}

/* Do not animate popup open/close; less flicker. */
.pm-map-shell .leaflet-popup,
.pm-map-shell .leaflet-popup-content-wrapper,
.pm-map-shell .leaflet-popup-tip {
  transition: none !important;
  animation: none !important;
}

@media (max-width: 430px) {
  .pm-map-shell .leaflet-popup.pm-map-project-popup {
    margin-bottom: 20px !important;
  }

  .pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content-wrapper {
    width: min(248px, 66vw) !important;
    max-width: min(248px, 66vw) !important;
    border-radius: 14px !important;
  }

  .pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content {
    margin: 7px !important;
  }

  .pm-map-project-popup .pm-map-popup h3 {
    font-size: 0.68rem !important;
  }

  .pm-map-project-popup .pm-map-popup p {
    font-size: 0.54rem !important;
  }

  .pm-map-project-popup .pm-map-popup dl div {
    min-height: 36px !important;
    padding: 5px !important;
  }

  .pm-map-project-popup .pm-map-popup dt {
    font-size: 0.42rem !important;
  }

  .pm-map-project-popup .pm-map-popup dd {
    font-size: 0.52rem !important;
  }
}
`

fs.writeFileSync(cssPath, css)

console.log('Applied smaller map popup and marker visible fix.')
console.log('Popup is smaller, raised above the marker, and auto-closes previous popup when another marker opens.')
