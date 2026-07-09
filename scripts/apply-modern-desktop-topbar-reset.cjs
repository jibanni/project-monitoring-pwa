const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()

const files = {
  layoutCss: path.join(projectRoot, 'src/styles/layout.css'),
  dashboardCss: path.join(projectRoot, 'src/styles/dashboard.css'),
  projectsCss: path.join(projectRoot, 'src/styles/projects.css'),
}

function backup(filePath) {
  if (!fs.existsSync(filePath)) return
  const backupPath = `${filePath}.modern-topbar.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function stripMarkedBlocks(css) {
  const markers = [
    'PMS10 DESKTOP SIDEBAR NAVIGATION',
    'PMS10 COLLAPSIBLE DESKTOP SIDEBAR',
    'PMS10 POLISHED DESKTOP SIDEBAR',
    'PMS10 SIDEBAR FINAL WIDTH OVERRIDE',
    'PMS10 SIDEBAR POLISH FIX',
    'PMS10 MODERN DESKTOP DESIGN RESET',
    'PMS10 MODERN DESKTOP TOPBAR RESET',
  ]

  let output = css

  for (const marker of markers) {
    let markerIndex = output.indexOf(marker)

    while (markerIndex >= 0) {
      const blockStart = output.lastIndexOf('/*', markerIndex)
      const safeStart = blockStart >= 0 ? blockStart : markerIndex
      const nextBlock = output.indexOf('/* =========================', markerIndex + marker.length)

      output =
        nextBlock >= 0
          ? output.slice(0, safeStart) + output.slice(nextBlock)
          : output.slice(0, safeStart)

      markerIndex = output.indexOf(marker)
    }
  }

  return output
}

function appendReset(filePath, cssBlock) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipped missing file: ${path.relative(projectRoot, filePath)}`)
    return
  }

  backup(filePath)

  let css = fs.readFileSync(filePath, 'utf8')
  css = stripMarkedBlocks(css)
  css += cssBlock

  fs.writeFileSync(filePath, css)
  console.log(`Updated ${path.relative(projectRoot, filePath)}`)
}

const layoutCss = `
/* =========================
   PMS10 MODERN DESKTOP TOPBAR RESET
   Desktop only. Mobile layout remains untouched.
========================= */

@media (min-width: 901px) {
  :root {
    --pms10-desktop-header-h: 76px;
    --pms10-page-x: 24px;
    --pms10-page-y: 18px;
    --pms10-bg: #f3f7fb;
    --pms10-card: #ffffff;
    --pms10-border: rgba(148, 163, 184, 0.22);
    --pms10-text: #0f172a;
    --pms10-muted: #64748b;
    --pms10-blue: #0f4c81;
    --pms10-blue-2: #145da0;
  }

  html,
  body,
  #root {
    background: var(--pms10-bg) !important;
  }

  body {
    overflow-x: hidden !important;
    background:
      radial-gradient(circle at top left, rgba(20, 93, 160, 0.08), transparent 30%),
      linear-gradient(180deg, #f8fbff 0%, #f3f7fb 46%, #eef4fb 100%) !important;
  }

  .app-shell,
  .app-shell.app-scrolled,
  .app-shell.app-sidebar-collapsed {
    width: 100% !important;
    min-height: 100vh !important;
    padding-top: var(--pms10-desktop-header-h) !important;
    padding-left: 0 !important;
    padding-bottom: 0 !important;
    background: transparent !important;
    --current-header-h: var(--pms10-desktop-header-h) !important;
    --app-header-live-h: var(--pms10-desktop-header-h) !important;
  }

  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header,
  .app-shell .app-header,
  body > .app-header {
    position: fixed !important;
    z-index: 1000 !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: auto !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    min-height: var(--pms10-desktop-header-h) !important;
    height: var(--pms10-desktop-header-h) !important;
    max-height: var(--pms10-desktop-header-h) !important;
    margin: 0 !important;
    padding: 10px var(--pms10-page-x) !important;
    border-radius: 0 !important;
    border: 0 !important;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22) !important;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96)) !important;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08) !important;
    color: var(--pms10-text) !important;
    overflow: visible !important;
    transform: none !important;
  }

  .app-header-inner {
    width: min(1540px, 100%) !important;
    height: 100% !important;
    max-width: min(1540px, 100%) !important;
    margin: 0 auto !important;
    padding: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(250px, 340px) minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 18px !important;
    overflow: visible !important;
  }

  .app-brand {
    width: auto !important;
    min-height: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    color: var(--pms10-text) !important;
  }

  .app-brand-logo-wrap,
  .app-brand-logo,
  .app-scrolled .app-brand-logo-wrap,
  .app-scrolled .app-brand-logo {
    width: 46px !important;
    height: 46px !important;
    flex: 0 0 auto !important;
    border-radius: 999px !important;
  }

  .app-brand-text {
    min-width: 0 !important;
    display: block !important;
  }

  .app-brand-title {
    color: var(--pms10-text) !important;
    font-size: 1rem !important;
    font-weight: 950 !important;
    letter-spacing: 0.055em !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  .app-brand-subtitle {
    margin-top: 3px !important;
    color: #1e3a5f !important;
    font-size: 0.62rem !important;
    font-weight: 900 !important;
    letter-spacing: 0.055em !important;
    white-space: nowrap !important;
    line-height: 1 !important;
  }

  .app-brand-unit,
  .app-scrolled .app-brand-unit {
    display: block !important;
    max-height: none !important;
    margin-top: 4px !important;
    color: var(--pms10-muted) !important;
    font-size: 0.64rem !important;
    font-weight: 700 !important;
    opacity: 1 !important;
    white-space: nowrap !important;
    line-height: 1 !important;
  }

  .app-sidebar-toggle,
  .app-sidebar-trademark {
    display: none !important;
  }

  .app-desktop-nav {
    width: auto !important;
    max-width: 100% !important;
    min-height: 0 !important;
    flex: unset !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    overflow: visible !important;
    padding: 0 !important;
  }

  .app-nav-link {
    width: auto !important;
    min-height: 42px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    border-radius: 999px !important;
    padding: 0 13px !important;
    color: #334155 !important;
    background: transparent !important;
    font-size: 0.84rem !important;
    font-weight: 900 !important;
    letter-spacing: 0 !important;
    white-space: nowrap !important;
    box-shadow: none !important;
    transform: none !important;
  }

  .app-nav-link:hover {
    background: #eff6ff !important;
    color: var(--pms10-blue) !important;
    transform: none !important;
  }

  .app-nav-link.active {
    background: linear-gradient(135deg, #0f4c81, #145da0) !important;
    color: #ffffff !important;
    box-shadow: 0 10px 22px rgba(20, 93, 160, 0.22) !important;
  }

  .app-nav-icon,
  .app-nav-icon svg {
    width: 18px !important;
    height: 18px !important;
    flex: 0 0 auto !important;
  }

  .app-nav-label {
    display: inline !important;
    min-width: 0 !important;
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: nowrap !important;
  }

  .app-user-area {
    width: auto !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    display: grid !important;
    grid-template-columns: 42px minmax(120px, auto) auto !important;
    align-items: center !important;
    gap: 10px !important;
  }

  .app-user-avatar {
    width: 42px !important;
    height: 42px !important;
    background: #e0f2fe !important;
    color: var(--pms10-blue) !important;
    border: 1px solid rgba(20, 93, 160, 0.18) !important;
  }

  .app-user-name {
    max-width: 190px !important;
    color: var(--pms10-text) !important;
    font-size: 0.82rem !important;
    line-height: 1.1 !important;
  }

  .app-user-role {
    margin-top: 2px !important;
    color: var(--pms10-muted) !important;
    font-size: 0.62rem !important;
  }

  .app-logout-button {
    width: auto !important;
    min-width: 84px !important;
    min-height: 38px !important;
    margin: 0 !important;
    border-radius: 999px !important;
    background: #ef4444 !important;
    color: #ffffff !important;
    font-size: 0.74rem !important;
    box-shadow: 0 10px 22px rgba(239, 68, 68, 0.16) !important;
  }

  .app-user-logout-inline {
    display: none !important;
  }

  .app-main {
    width: min(1540px, 100%) !important;
    margin: 0 auto !important;
    padding: var(--pms10-page-y) var(--pms10-page-x) 34px !important;
  }

  .dashboard-page,
  .projects-page,
  .pm-map-page,
  .reports-page,
  .offline-sync-page,
  .user-management-page,
  .create-project-page,
  .edit-project-page,
  .project-details-page,
  .pu-page {
    margin-top: 0 !important;
  }

  .app-mobile-nav {
    display: none !important;
  }
}

@media (min-width: 901px) and (max-width: 1180px) {
  :root {
    --pms10-desktop-header-h: 74px;
    --pms10-page-x: 16px;
  }

  .app-header-inner {
    grid-template-columns: minmax(210px, 290px) minmax(0, 1fr) auto !important;
    gap: 10px !important;
  }

  .app-brand-title {
    font-size: 0.82rem !important;
  }

  .app-brand-subtitle,
  .app-brand-unit {
    font-size: 0.5rem !important;
  }

  .app-nav-link {
    padding: 0 9px !important;
    font-size: 0.74rem !important;
  }

  .app-user-text {
    display: none !important;
  }

  .app-user-area {
    grid-template-columns: 40px auto !important;
  }
}

/* Phone layout remains untouched. */
@media (max-width: 900px) {
  .app-sidebar-toggle,
  .app-sidebar-trademark {
    display: none !important;
  }
}
`

const dashboardCss = `
/* =========================
   PMS10 MODERN DESKTOP TOPBAR RESET
   Desktop dashboard refinements.
========================= */

@media (min-width: 901px) {
  .dashboard-page {
    width: 100% !important;
    max-width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 18px !important;
    padding: 0 !important;
    overflow: visible !important;
  }

  .dashboard-hero,
  .dashboard-page.is-dashboard-scrolled .dashboard-hero {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    z-index: 1 !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 118px !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 24px 28px !important;
    border-radius: 24px !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: space-between !important;
    box-shadow: 0 18px 44px rgba(15, 48, 87, 0.16) !important;
  }

  .dashboard-page.is-dashboard-scrolled {
    padding-top: 0 !important;
  }

  .dashboard-page.is-dashboard-scrolled .dashboard-hero::after {
    display: block !important;
  }

  .dashboard-page.is-dashboard-scrolled .dashboard-eyebrow,
  .dashboard-page.is-dashboard-scrolled .dashboard-hero p:not(.dashboard-eyebrow) {
    display: inline-flex !important;
  }

  .dashboard-page.is-dashboard-scrolled .dashboard-hero h1,
  .dashboard-hero h1 {
    max-width: 980px !important;
    margin: 0 !important;
    color: #ffffff !important;
    font-size: clamp(2.05rem, 4.8vw, 4rem) !important;
    line-height: 0.97 !important;
    letter-spacing: -0.045em !important;
  }

  .dashboard-hero p:not(.dashboard-eyebrow) {
    max-width: 900px !important;
    margin-top: 12px !important;
    font-size: 0.96rem !important;
  }

  .dashboard-stat-grid {
    display: grid !important;
    grid-template-columns: repeat(20, minmax(0, 1fr)) !important;
    gap: 14px !important;
    align-items: stretch !important;
  }

  .dashboard-stat-grid .dashboard-stat-card:nth-child(-n + 5) {
    grid-column: span 4 !important;
  }

  .dashboard-stat-grid .dashboard-stat-card:nth-child(n + 6) {
    grid-column: span 5 !important;
  }

  .dashboard-stat-card {
    min-height: 110px !important;
    border-radius: 22px !important;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.07) !important;
    border: 1px solid rgba(148, 163, 184, 0.18) !important;
  }

  .dashboard-charts-grid,
  .dashboard-priority-grid,
  .dashboard-section-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 18px !important;
    align-items: stretch !important;
  }

  .dashboard-chart-card,
  .dashboard-panel,
  .dashboard-card,
  .dashboard-priority-card {
    border-radius: 24px !important;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.07) !important;
    border: 1px solid rgba(148, 163, 184, 0.18) !important;
  }
}

@media (min-width: 901px) and (max-width: 1240px) {
  .dashboard-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .dashboard-stat-grid .dashboard-stat-card {
    grid-column: auto !important;
  }

  .dashboard-charts-grid,
  .dashboard-priority-grid,
  .dashboard-section-grid {
    grid-template-columns: 1fr !important;
  }
}
`

const projectsCss = `
/* =========================
   PMS10 MODERN DESKTOP TOPBAR RESET
   Project Registry desktop refinements.
========================= */

@media (min-width: 901px) {
  .projects-page {
    width: 100% !important;
    max-width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 18px !important;
    padding: 0 0 18px !important;
    overflow: visible !important;
  }

  .projects-hero,
  .projects-registry-hero,
  .projects-page.is-registry-scrolled .projects-hero,
  .projects-page.is-registry-scrolled .projects-registry-hero {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    z-index: 1 !important;
    width: 100% !important;
    min-height: 112px !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 24px 28px !important;
    border-radius: 24px !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: space-between !important;
    box-shadow: 0 18px 44px rgba(15, 48, 87, 0.14) !important;
  }

  .projects-page.is-registry-scrolled .projects-hero-spacer {
    display: none !important;
  }

  .projects-page.is-registry-scrolled .projects-hero::after,
  .projects-page.is-registry-scrolled .projects-registry-hero::after {
    display: block !important;
  }

  .projects-page.is-registry-scrolled .projects-eyebrow,
  .projects-page.is-registry-scrolled .projects-hero p {
    display: inline-flex !important;
  }

  .projects-hero h1,
  .projects-page.is-registry-scrolled .projects-hero h1 {
    max-width: 980px !important;
    margin: 0 !important;
    color: #ffffff !important;
    font-size: clamp(2rem, 4.4vw, 3.8rem) !important;
    line-height: 0.97 !important;
    letter-spacing: -0.045em !important;
  }

  .projects-hero p {
    max-width: 900px !important;
    margin-top: 12px !important;
    font-size: 0.95rem !important;
  }

  .projects-summary-grid {
    display: grid !important;
    grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
    gap: 14px !important;
  }

  .projects-summary-card {
    min-height: 104px !important;
    border-radius: 20px !important;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.07) !important;
    border: 1px solid rgba(148, 163, 184, 0.18) !important;
  }

  .projects-search-panel,
  .project-list-panel,
  .projects-filter-panel,
  .projects-list-card,
  .projects-table-card {
    border-radius: 24px !important;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.07) !important;
    border: 1px solid rgba(148, 163, 184, 0.18) !important;
  }

  .project-list-row,
  .project-card-row,
  .project-row {
    border-radius: 20px !important;
  }
}

@media (min-width: 901px) and (max-width: 1240px) {
  .projects-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}
`

appendReset(files.layoutCss, layoutCss)
appendReset(files.dashboardCss, dashboardCss)
appendReset(files.projectsCss, projectsCss)

console.log('PMS10 modern desktop topbar reset applied.')
