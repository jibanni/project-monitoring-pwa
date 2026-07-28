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

    output = next >= 0
      ? output.slice(0, safeStart) + output.slice(next)
      : output.slice(0, safeStart)

    index = output.indexOf(marker)
  }

  return output
}

backup(mapPath, 'map-banner-marker-visibility-fix')
backup(cssPath, 'map-banner-marker-visibility-fix')

let source = fs.readFileSync(mapPath, 'utf8')

/*
  Make the visible marker slightly bigger while keeping it as CircleMarker.
  This avoids returning to DivIcon, which caused ghost markers before.
*/
source = source.replace(/radius=\{\s*\d+(?:\.\d+)?\s*\}/g, 'radius={7}')
source = source.replace(/weight:\s*\d+(?:\.\d+)?\s*,/g, 'weight: 3.5,')

/*
  Keep popup close to marker but not directly covering it.
  The previous offset [0,-1] made the pointer close, but the popup could cover the marker.
*/
source = source.replace(/offset=\{\[\s*0\s*,\s*-?\d+\s*\]\}/g, 'offset={[0, -7]}')

if (!source.includes('offset={[0, -7]}')) {
  source = source.replace(
    /(<Popup[\s\S]*?className="pm-map-project-popup"[\s\S]*?)(\s*>)/,
    (match, before, end) => `${before}\n                          offset={[0, -7]}${end}`,
  )
}

/*
  Keep one popup open and allow Leaflet/custom pan to keep popup visible.
*/
source = source.replace(/autoClose=\{false\}/g, 'autoClose={true}')

fs.writeFileSync(mapPath, source)

let css = fs.readFileSync(cssPath, 'utf8')
const marker = 'PMS10 MAP BANNER MARKER VISIBILITY FIX'
css = removeCssBlock(css, marker)

css += `
/* =========================
   PMS10 MAP BANNER MARKER VISIBILITY FIX
   Fixes mobile GIS banner layout and keeps marker visible with popup.
========================= */

/*
  Mobile map page:
  Disable the sticky/fixed hero behavior on phones. The sticky version was
  overlapping the Leaflet map and making the GIS banner look destroyed.
*/
@media (max-width: 760px) {
  .pm-map-page,
  .pm-map-page.is-map-scrolled {
    display: flex !important;
    flex-direction: column !important;
    padding-top: 0 !important;
    overflow-x: hidden !important;
  }

  .pm-map-hero,
  .pm-map-page.is-map-scrolled .pm-map-hero {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    z-index: 2 !important;

    order: 1 !important;
    width: auto !important;
    min-height: 128px !important;
    height: auto !important;
    max-height: none !important;

    margin: 12px 14px 14px !important;
    padding: 24px 26px 24px !important;

    display: flex !important;
    align-items: flex-end !important;
    justify-content: flex-start !important;

    border-radius: 28px !important;
    overflow: hidden !important;
    box-shadow: 0 16px 34px rgba(15, 48, 87, 0.18) !important;
  }

  .pm-map-page.is-map-scrolled .pm-map-hero::before,
  .pm-map-page.is-map-scrolled .pm-map-hero::after {
    display: block !important;
  }

  .pm-map-page.is-map-scrolled .pm-map-eyebrow,
  .pm-map-page.is-map-scrolled .pm-map-hero p:not(.pm-map-eyebrow) {
    display: block !important;
  }

  .pm-map-hero h1,
  .pm-map-page.is-map-scrolled .pm-map-hero h1 {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0.3rem 0 0.45rem !important;
    overflow: visible !important;

    color: #ffffff !important;
    font-size: clamp(2rem, 8.8vw, 3.05rem) !important;
    line-height: 0.98 !important;
    letter-spacing: -0.045em !important;
    white-space: normal !important;
    text-overflow: unset !important;
  }

  .pm-map-hero p:not(.pm-map-eyebrow),
  .pm-map-page.is-map-scrolled .pm-map-hero p:not(.pm-map-eyebrow) {
    max-width: 100% !important;
    margin: 0 !important;
    color: rgba(255, 255, 255, 0.92) !important;
    font-size: 0.92rem !important;
    line-height: 1.38 !important;
    font-weight: 780 !important;
  }

  .pm-map-shell {
    order: 3 !important;
    position: relative !important;
    z-index: 1 !important;
    margin-top: 0 !important;
  }
}

/*
  Keep the selected CircleMarker visible when popup opens.
  The marker itself is in the SVG overlay pane, while the popup is in popup pane.
  This spacing and marker size prevents the popup from visually swallowing it.
*/
.pm-map-shell .leaflet-popup.pm-map-project-popup {
  margin-bottom: 7px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-tip-container {
  margin-top: -2px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-tip {
  width: 13px !important;
  height: 13px !important;
  margin-top: -7px !important;
}

/* Make CircleMarker tap targets/visibility a bit stronger without reintroducing ghost labels. */
.pm-map-shell svg.leaflet-zoom-animated,
.pm-map-shell .leaflet-overlay-pane svg {
  overflow: visible !important;
}

.pm-map-shell .leaflet-overlay-pane path.leaflet-interactive {
  stroke-width: 3.5px !important;
  cursor: pointer !important;
  pointer-events: auto !important;
}

/* Keep compact popup size from the last accepted design. */
.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content-wrapper {
  width: min(258px, 68vw) !important;
  max-width: min(258px, 68vw) !important;
  border-radius: 15px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-content {
  margin: 8px !important;
}

/* No popup animation/flicker. */
.pm-map-shell .leaflet-popup,
.pm-map-shell .leaflet-popup-content-wrapper,
.pm-map-shell .leaflet-popup-tip {
  transition: none !important;
  animation: none !important;
}
`

fs.writeFileSync(cssPath, css)

console.log('Applied PMS10 map banner and marker visibility fix.')
console.log('Mobile GIS banner is now static/normal, marker radius is 7, and popup is offset so the marker remains visible.')
