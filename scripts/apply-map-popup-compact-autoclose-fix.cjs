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

backup(mapPath, 'popup-compact-autoclose-fix')
backup(cssPath, 'popup-compact-autoclose-fix')
backup(layoutCssPath, 'popup-compact-autoclose-fix')

let source = fs.readFileSync(mapPath, 'utf8')

// Let Leaflet close the previous popup automatically when another marker popup opens.
source = source.replace(/autoClose=\{false\}/g, 'autoClose={true}')

// Reduce popup size in JSX so Leaflet does not reserve an oversized popup width.
source = source.replace(/minWidth=\{\s*\d+\s*\}/g, 'minWidth={250}')
source = source.replace(/maxWidth=\{\s*\d+\s*\}/g, 'maxWidth={290}')

// Keep popup anchored to the marker, but reduce pan/jump. The close button remains.
if (!source.includes('autoClose={true}')) {
  source = source.replace(
    /<Popup([\s\S]*?)>/,
    (match) => match.replace(/>/, '\n                          autoClose={true}>'),
  )
}

fs.writeFileSync(mapPath, source)

let css = fs.readFileSync(cssPath, 'utf8')

css = removeCssBlock(css, 'PMS10 MAP POPUP COMPACT AUTOCLOSE FIX')

css += `
/* =========================
   PMS10 MAP POPUP COMPACT AUTOCLOSE FIX
   Smaller anchored popup + only one project popup open at a time.
========================= */

/* Keep the popup anchored to the selected marker, but make it reasonably sized. */
.pm-map-shell .leaflet-popup.pm-map-project-popup {
  margin-bottom: 4px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content-wrapper {
  width: min(292px, 76vw) !important;
  max-width: min(292px, 76vw) !important;
  border-radius: 18px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.22) !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content {
  width: auto !important;
  max-width: 100% !important;
  margin: 10px 10px 11px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-tip {
  width: 15px !important;
  height: 15px !important;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.15) !important;
}

/* Move close button slightly inside and make it smaller. */
.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-close-button {
  top: 8px !important;
  right: 8px !important;
  display: grid !important;
  place-items: center !important;
  width: 30px !important;
  height: 30px !important;
  border-radius: 999px !important;
  color: #334155 !important;
  background: #e2e8f0 !important;
  font-size: 1.25rem !important;
  font-weight: 950 !important;
  line-height: 1 !important;
}

/* Compact popup content */
.pm-map-popup {
  width: 100% !important;
  max-width: 100% !important;
}

.pm-map-popup h3 {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  margin: 0 38px 5px 0 !important;
  overflow: hidden !important;
  color: #0f172a !important;
  font-size: 0.84rem !important;
  font-weight: 950 !important;
  line-height: 1.08 !important;
  letter-spacing: -0.02em !important;
}

.pm-map-popup p {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  margin: 0 38px 8px 0 !important;
  overflow: hidden !important;
  color: #475569 !important;
  font-size: 0.68rem !important;
  font-weight: 820 !important;
  line-height: 1.22 !important;
  text-transform: none !important;
}

.pm-map-popup-badges {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 5px !important;
  margin: 0 0 8px !important;
}

.pm-map-popup-badges span,
.pm-map-popup .pm-status-completed,
.pm-map-popup .pm-status-ongoing,
.pm-map-popup .pm-status-not-started,
.pm-map-popup .pm-status-suspended,
.pm-map-popup .pm-status-cancelled,
.pm-map-popup .pm-status-neutral,
.pm-map-popup .pm-risk-high,
.pm-map-popup .pm-risk-moderate,
.pm-map-popup .pm-risk-low,
.pm-map-popup .pm-risk-neutral {
  min-height: 22px !important;
  padding: 4px 8px !important;
  font-size: 0.58rem !important;
  letter-spacing: 0.05em !important;
}

.pm-map-popup dl {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 6px !important;
  margin: 0 !important;
}

.pm-map-popup dl div {
  display: block !important;
  min-width: 0 !important;
  min-height: 52px !important;
  padding: 8px 9px !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 12px !important;
  background: #f8fafc !important;
}

.pm-map-popup dt {
  margin: 0 0 3px !important;
  color: #64748b !important;
  font-size: 0.58rem !important;
  font-weight: 950 !important;
  letter-spacing: 0.12em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
}

.pm-map-popup dd {
  min-width: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  color: #0f172a !important;
  font-size: 0.7rem !important;
  font-weight: 900 !important;
  line-height: 1.1 !important;
  overflow-wrap: anywhere !important;
}

.pm-map-popup .pm-map-variance {
  font-weight: 950 !important;
}

.pm-map-popup a {
  min-height: 34px !important;
  margin-top: 8px !important;
  border-radius: 11px !important;
  font-size: 0.78rem !important;
  font-weight: 950 !important;
}

/* Keep only one popup visually prominent and prevent old popups from stacking on tap. */
.pm-map-shell .leaflet-popup {
  transition: none !important;
  animation: none !important;
}

@media (max-width: 430px) {
  .pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content-wrapper {
    width: min(282px, 74vw) !important;
    max-width: min(282px, 74vw) !important;
  }

  .pm-map-popup h3 {
    font-size: 0.8rem !important;
  }

  .pm-map-popup p {
    font-size: 0.64rem !important;
  }

  .pm-map-popup dl {
    gap: 5px !important;
  }

  .pm-map-popup dl div {
    min-height: 48px !important;
    padding: 7px 8px !important;
    border-radius: 11px !important;
  }

  .pm-map-popup dt {
    font-size: 0.54rem !important;
  }

  .pm-map-popup dd {
    font-size: 0.66rem !important;
  }
}
`

fs.writeFileSync(cssPath, css)

// Remove old map experimental blocks from layout.css if present.
if (fs.existsSync(layoutCssPath)) {
  let layoutCss = fs.readFileSync(layoutCssPath, 'utf8')

  const oldMarkers = [
    'PMS10 MAP LABEL CLICK AND FLICKER FIX',
    'PMS10 MAP POPUP STABLE LABEL FIX',
    'PMS10 MAP MARKER GHOST TAP RESET FIX',
    'PMS10 MAP FINAL MARKER PANEL FIX',
    'PMS10 MAP ANCHORED POPUP FINAL FIX',
  ]

  for (const marker of oldMarkers) {
    layoutCss = removeCssBlock(layoutCss, marker)
  }

  fs.writeFileSync(layoutCssPath, layoutCss)
}

console.log('Applied compact anchored popup and auto-close fix.')
console.log('Previous marker popup should now close when another marker is pressed.')
