const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const dashboardCssPath = path.join(projectRoot, 'src/styles/dashboard.css')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${path.relative(projectRoot, filePath)}`)
    process.exit(1)
  }
}

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function appendOrReplace(filePath, marker, cssBlock) {
  let css = fs.readFileSync(filePath, 'utf8')

  const oldIndex = css.indexOf(marker)
  if (oldIndex >= 0) {
    const start = css.lastIndexOf('/*', oldIndex)
    const safeStart = start >= 0 ? start : oldIndex
    const next = css.indexOf('/* =========================', oldIndex + marker.length)
    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
  }

  css += cssBlock
  fs.writeFileSync(filePath, css)
  console.log(`Updated ${path.relative(projectRoot, filePath)}`)
}

requireFile(dashboardCssPath)
requireFile(layoutCssPath)

backup(dashboardCssPath, 'mobile-spacing-glass-nav')
backup(layoutCssPath, 'mobile-spacing-glass-nav')

const dashboardCss = `
/* =========================
   PMS10 MOBILE HERO/FILTER SPACING FIX
   Mobile only. Reduces the space between hero banner and filter bar.
========================= */

@media (max-width: 700px) {
  .dashboard-page {
    gap: 10px !important;
  }

  .dashboard-hero {
    margin-bottom: 10px !important;
  }

  .dashboard-filter-panel {
    margin-top: 0 !important;
    margin-bottom: 10px !important;
  }

  .dashboard-hero + .dashboard-filter-panel {
    margin-top: -2px !important;
  }

  .dashboard-filter-bar {
    min-height: 42px !important;
  }

  .dashboard-filter-summary-icon {
    width: 34px !important;
    height: 34px !important;
    flex-basis: 34px !important;
  }

  .dashboard-filter-toggle {
    min-height: 36px !important;
    border-radius: 16px !important;
  }

  .dashboard-stat-grid {
    margin-top: 2px !important;
  }
}

@media (max-width: 420px) {
  .dashboard-hero {
    margin-bottom: 8px !important;
  }

  .dashboard-filter-panel {
    margin-bottom: 8px !important;
  }
}
`

const layoutCss = `
/* =========================
   PMS10 MOBILE GLASS NAV BAR
   iPhone-style glass bottom navigation. Mobile only.
========================= */

@media (max-width: 900px) {
  .app-mobile-nav {
    left: max(8px, env(safe-area-inset-left)) !important;
    right: max(8px, env(safe-area-inset-right)) !important;
    bottom: calc(8px + env(safe-area-inset-bottom)) !important;
    width: auto !important;
    max-width: 680px !important;
    margin: 0 auto !important;
    padding: 7px 8px !important;
    border: 1px solid rgba(255, 255, 255, 0.62) !important;
    border-radius: 28px !important;
    background: rgba(255, 255, 255, 0.68) !important;
    -webkit-backdrop-filter: blur(22px) saturate(185%) !important;
    backdrop-filter: blur(22px) saturate(185%) !important;
    box-shadow:
      0 18px 44px rgba(15, 23, 42, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.72) !important;
    overflow: hidden !important;
  }

  .app-mobile-nav::before {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    border-radius: inherit !important;
    pointer-events: none !important;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.44), rgba(255, 255, 255, 0.12)) !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link {
    position: relative !important;
    z-index: 1 !important;
    border-radius: 22px !important;
    min-height: 58px !important;
  }

  .app-mobile-nav a.active,
  .app-mobile-nav-link.active,
  .app-mobile-nav .active {
    background: rgba(255, 107, 44, 0.12) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.72),
      0 10px 24px rgba(255, 107, 44, 0.12) !important;
  }

  .app-mobile-nav svg {
    filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.72)) !important;
  }

  .app-main {
    padding-bottom: calc(108px + env(safe-area-inset-bottom)) !important;
  }
}

@media (max-width: 420px) {
  .app-mobile-nav {
    left: max(6px, env(safe-area-inset-left)) !important;
    right: max(6px, env(safe-area-inset-right)) !important;
    bottom: calc(7px + env(safe-area-inset-bottom)) !important;
    border-radius: 26px !important;
    padding: 6px !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link {
    min-height: 56px !important;
    border-radius: 20px !important;
  }
}
`

appendOrReplace(
  dashboardCssPath,
  'PMS10 MOBILE HERO/FILTER SPACING FIX',
  dashboardCss,
)

appendOrReplace(
  layoutCssPath,
  'PMS10 MOBILE GLASS NAV BAR',
  layoutCss,
)

console.log('Mobile hero/filter spacing and glass nav fix applied.')
