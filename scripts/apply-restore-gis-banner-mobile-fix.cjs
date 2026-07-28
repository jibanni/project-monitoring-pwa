const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const cssPath = path.join(projectRoot, 'src/styles/projectMap.css')

function fail(message) {
  console.error(message)
  process.exit(1)
}

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

backup(cssPath, 'restore-gis-banner-mobile-fix')

let css = fs.readFileSync(cssPath, 'utf8')

const oldMarkers = [
  'PMS10 MAP BANNER MARKER VISIBILITY FIX',
  'PMS10 RESTORE GIS BANNER MOBILE FIX',
]

for (const marker of oldMarkers) {
  css = removeCssBlock(css, marker)
}

css += `
/* =========================
   PMS10 RESTORE GIS BANNER MOBILE FIX
   Restores normal GIS banner layout without touching the accepted map popup.
========================= */

/*
  The previous mobile map banner patch forced flex ordering/sticky overrides.
  That created a large broken gap and caused the GIS hero to overlap visually.
  This restores the GIS Map hero as a normal page banner.
*/

.pm-map-page {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
}

/* Disable compact/fixed scrolled hero behavior on the GIS page */
.pm-map-page.is-map-scrolled {
  padding-top: 0 !important;
}

/* Normal desktop/tablet hero */
.pm-map-hero,
.pm-map-page.is-map-scrolled .pm-map-hero {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  z-index: 2 !important;

  width: auto !important;
  max-width: 100% !important;
  min-height: 132px !important;
  height: auto !important;
  max-height: none !important;

  margin: 0 0 18px !important;
  padding: 30px 32px !important;

  display: flex !important;
  align-items: flex-end !important;
  justify-content: space-between !important;
  gap: 20px !important;

  border-radius: 30px !important;
  overflow: hidden !important;
  color: #ffffff !important;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 34%),
    radial-gradient(circle at 86% 3%, rgba(255, 255, 255, 0.14), transparent 42%),
    linear-gradient(135deg, #123f73 0%, #18599d 56%, #2368b5 100%) !important;
  box-shadow: 0 22px 48px rgba(15, 48, 87, 0.18) !important;
}

/* Restore decorative circles */
.pm-map-page.is-map-scrolled .pm-map-hero::before,
.pm-map-page.is-map-scrolled .pm-map-hero::after {
  display: block !important;
}

.pm-map-hero::before,
.pm-map-hero::after {
  pointer-events: none !important;
}

/* Restore eyebrow/subtitle */
.pm-map-page.is-map-scrolled .pm-map-eyebrow,
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
  display: block !important;
  max-width: 720px !important;
  margin: 0 !important;
  color: rgba(255, 255, 255, 0.92) !important;
  font-size: clamp(0.96rem, 3.5vw, 1.2rem) !important;
  font-weight: 780 !important;
  line-height: 1.45 !important;
}

/* Mobile hero: compact but not sticky/fixed */
@media (max-width: 760px) {
  .pm-map-page,
  .pm-map-page.is-map-scrolled {
    display: block !important;
    padding-top: 0 !important;
    overflow-x: hidden !important;
  }

  .pm-map-hero,
  .pm-map-page.is-map-scrolled .pm-map-hero {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;

    width: auto !important;
    min-height: 172px !important;
    height: auto !important;
    max-height: none !important;

    margin: 12px 14px 14px !important;
    padding: 24px 26px 24px !important;

    display: flex !important;
    align-items: flex-end !important;
    justify-content: flex-start !important;

    border-radius: 28px !important;
  }

  .pm-map-hero h1,
  .pm-map-page.is-map-scrolled .pm-map-hero h1 {
    max-width: 100% !important;
    margin: 0.3rem 0 0.45rem !important;
    font-size: clamp(2.05rem, 8.6vw, 3rem) !important;
    line-height: 0.98 !important;
    white-space: normal !important;
  }

  .pm-map-hero p:not(.pm-map-eyebrow),
  .pm-map-page.is-map-scrolled .pm-map-hero p:not(.pm-map-eyebrow) {
    max-width: 100% !important;
    font-size: 0.92rem !important;
    line-height: 1.38 !important;
  }

  .pm-map-shell {
    position: relative !important;
    z-index: 1 !important;
    margin-top: 0 !important;
  }
}

/* Keep accepted marker/popup behavior intact */
.pm-map-shell .leaflet-popup,
.pm-map-shell .leaflet-popup-content-wrapper,
.pm-map-shell .leaflet-popup-tip {
  transition: none !important;
  animation: none !important;
}
`

fs.writeFileSync(cssPath, css)

console.log('Restored GIS banner mobile layout.')
console.log('This patch only changes src/styles/projectMap.css and does not touch ProjectMap.tsx marker/popup logic.')
