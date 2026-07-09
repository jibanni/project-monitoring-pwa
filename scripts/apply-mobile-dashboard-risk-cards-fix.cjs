const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const cssPath = path.join(projectRoot, 'src/styles/dashboard.css')

if (!fs.existsSync(cssPath)) {
  console.error('Missing file: src/styles/dashboard.css')
  process.exit(1)
}

const backupPath = `${cssPath}.mobile-risk-cards.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(cssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(cssPath, 'utf8')

const marker = 'PMS10 MOBILE DASHBOARD RISK CARDS FIX'

// Remove old copy if rerun.
const oldIndex = css.indexOf(marker)
if (oldIndex >= 0) {
  const start = css.lastIndexOf('/*', oldIndex)
  const safeStart = start >= 0 ? start : oldIndex
  const next = css.indexOf('/* =========================', oldIndex + marker.length)
  css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
}

css += `
/* =========================
   PMS10 MOBILE DASHBOARD RISK CARDS FIX
   Mobile only. Desktop/tablet view is untouched.
========================= */

@media (max-width: 700px) {
  /*
    Mobile dashboard should show only actionable risk summary.
    Low Risk and Medium Risk remain available in the Risk chart,
    but are hidden from the top card grid to reduce scrolling.
  */
  .dashboard-stat-grid .dashboard-stat-card.low-risk,
  .dashboard-stat-grid .dashboard-stat-card.medium-risk {
    display: none !important;
  }

  .dashboard-stat-grid .dashboard-stat-card.high-risk {
    grid-column: 1 / -1 !important;
    min-height: 96px !important;
  }

  .dashboard-stat-grid .dashboard-stat-card.high-risk strong,
  .dashboard-stat-grid .dashboard-stat-card.high-risk .stat-value {
    font-size: 2.05rem !important;
  }

  .dashboard-stat-grid .dashboard-stat-card {
    min-height: 116px !important;
  }
}

@media (max-width: 420px) {
  .dashboard-stat-grid .dashboard-stat-card.high-risk {
    grid-column: auto !important;
  }
}
`

fs.writeFileSync(cssPath, css)

console.log('Mobile dashboard risk cards fix applied.')
console.log('Low Risk and Medium Risk cards are hidden on mobile only.')
