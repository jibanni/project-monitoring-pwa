const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const dashboardCssPath = path.join(projectRoot, 'src/styles/dashboard.css')
const projectsCssPath = path.join(projectRoot, 'src/styles/projects.css')

function backup(filePath, suffix) {
  if (!fs.existsSync(filePath)) return

  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function appendOrReplace(filePath, marker, cssBlock) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${path.relative(projectRoot, filePath)}`)
    process.exit(1)
  }

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

backup(dashboardCssPath, 'mobile-card-compact')
backup(projectsCssPath, 'registry-summary-removed')

const dashboardCss = `
/* =========================
   PMS10 MOBILE COMPACT DASHBOARD CARDS
   Mobile only. Makes top dashboard cards shorter and cleaner.
========================= */

@media (max-width: 700px) {
  .dashboard-stat-grid {
    gap: 8px !important;
  }

  .dashboard-stat-grid .dashboard-stat-card,
  .dashboard-stat-card {
    min-height: 92px !important;
    max-height: 92px !important;
    padding: 11px 12px !important;
    border-radius: 18px !important;
    overflow: hidden !important;
  }

  .dashboard-stat-card span,
  .dashboard-stat-card .stat-label,
  .dashboard-stat-card .card-label {
    font-size: 0.58rem !important;
    letter-spacing: 0.13em !important;
    line-height: 1.05 !important;
  }

  .dashboard-stat-card strong,
  .dashboard-stat-card .stat-value {
    margin-top: 8px !important;
    font-size: 1.55rem !important;
    line-height: 1 !important;
  }

  .dashboard-stat-card p,
  .dashboard-stat-card .stat-helper,
  .dashboard-stat-card .card-helper {
    margin-top: 7px !important;
    font-size: 0.68rem !important;
    line-height: 1.05 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
  }

  .dashboard-stat-card::after {
    width: 72px !important;
    height: 72px !important;
    right: -22px !important;
    bottom: -26px !important;
    opacity: 0.55 !important;
  }

  .dashboard-stat-grid .dashboard-stat-card.high-risk {
    min-height: 92px !important;
    max-height: 92px !important;
  }

  .dashboard-stat-grid .dashboard-stat-card.high-risk strong,
  .dashboard-stat-grid .dashboard-stat-card.high-risk .stat-value {
    font-size: 1.55rem !important;
  }
}

@media (max-width: 420px) {
  .dashboard-stat-grid .dashboard-stat-card,
  .dashboard-stat-card {
    min-height: 88px !important;
    max-height: 88px !important;
    padding: 10px 11px !important;
  }

  .dashboard-stat-card strong,
  .dashboard-stat-card .stat-value {
    font-size: 1.46rem !important;
  }
}
`

const projectsCss = `
/* =========================
   PMS10 REMOVE PROJECT REGISTRY SUMMARY CARDS
   Removes the Project Registry top summary cards to keep the list simple.
========================= */

.projects-summary-grid,
.projects-summary-card,
.projects-page .projects-summary-grid,
.projects-page .projects-summary-card {
  display: none !important;
}

/* Tighten the space after removing Project Registry summary cards. */
.projects-page .projects-search-panel,
.projects-search-panel {
  margin-top: 0 !important;
}

@media (max-width: 700px) {
  .projects-page {
    gap: 12px !important;
  }

  .projects-compact-list-card,
  .project-list-panel,
  .projects-list-card {
    margin-top: 0 !important;
  }
}
`

appendOrReplace(
  dashboardCssPath,
  'PMS10 MOBILE COMPACT DASHBOARD CARDS',
  dashboardCss,
)

appendOrReplace(
  projectsCssPath,
  'PMS10 REMOVE PROJECT REGISTRY SUMMARY CARDS',
  projectsCss,
)

console.log('Mobile dashboard cards compacted and Project Registry summary cards removed.')
