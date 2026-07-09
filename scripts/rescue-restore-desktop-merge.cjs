const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()

const cssFiles = [
  'src/styles/layout.css',
  'src/styles/dashboard.css',
  'src/styles/projects.css',
]

const tsxFiles = [
  'src/components/Layout.tsx',
]

const knownMarkers = [
  'PMS10 DESKTOP SIDEBAR NAVIGATION',
  'PMS10 COLLAPSIBLE DESKTOP SIDEBAR',
  'PMS10 POLISHED DESKTOP SIDEBAR',
  'PMS10 SIDEBAR FINAL WIDTH OVERRIDE',
  'PMS10 SIDEBAR POLISH FIX',
  'PMS10 MODERN DESKTOP DESIGN RESET',
  'PMS10 MODERN DESKTOP TOPBAR RESET',
  'PMS10 FORCE DESKTOP TOPBAR HOTFIX',
  'PMS10 DESKTOP BANNER RESTORE FIX',
  'PMS10 DESKTOP BANNER RESTORE FIX - LAYOUT',
  'PMS10 RESCUE RESTORE MERGE',
]

function fileExists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath))
}

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return false
  fs.copyFileSync(source, destination)
  return true
}

function createCurrentBackup(relativePath) {
  const filePath = path.join(projectRoot, relativePath)
  if (!fs.existsSync(filePath)) return

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')

  const backupPath = `${filePath}.rescue-current-${stamp}.bak`
  fs.copyFileSync(filePath, backupPath)
  console.log(`Current backup: ${path.relative(projectRoot, backupPath)}`)
}

function stripMarkedBlocks(css) {
  let output = css

  for (const marker of knownMarkers) {
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

function restoreCss(relativePath) {
  const filePath = path.join(projectRoot, relativePath)

  if (!fs.existsSync(filePath)) {
    console.warn(`Skipped missing ${relativePath}`)
    return
  }

  createCurrentBackup(relativePath)

  const candidates = [
    `${filePath}.modern-topbar.bak`,
    `${filePath}.desktop-reset.bak`,
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      fs.copyFileSync(candidate, filePath)
      console.log(`Restored ${relativePath} from ${path.relative(projectRoot, candidate)}`)
      return
    }
  }

  const stripped = stripMarkedBlocks(fs.readFileSync(filePath, 'utf8'))
  fs.writeFileSync(filePath, stripped)
  console.log(`Removed custom desktop override blocks from ${relativePath}`)
}

function restoreLayoutComponent() {
  const relativePath = 'src/components/Layout.tsx'
  const filePath = path.join(projectRoot, relativePath)

  if (!fs.existsSync(filePath)) {
    console.warn(`Skipped missing ${relativePath}`)
    return
  }

  createCurrentBackup(relativePath)

  const candidates = [
    `${filePath}.desktop-reset.bak`,
    `${filePath}.modern-topbar.bak`,
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      fs.copyFileSync(candidate, filePath)
      console.log(`Restored ${relativePath} from ${path.relative(projectRoot, candidate)}`)
      return
    }
  }

  console.log(`No Layout.tsx backup found. Leaving ${relativePath} as-is.`)
}

function appendSafePolish() {
  const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')
  const dashboardCssPath = path.join(projectRoot, 'src/styles/dashboard.css')
  const projectsCssPath = path.join(projectRoot, 'src/styles/projects.css')

  if (fs.existsSync(layoutCssPath)) {
    let css = fs.readFileSync(layoutCssPath, 'utf8')
    css = stripMarkedBlocks(css)

    css += `
/* =========================
   PMS10 RESCUE RESTORE MERGE
   Safe desktop polish only. Does not override hero merge/sticky positioning.
========================= */

@media (min-width: 901px) {
  :root {
    --pms10-desktop-bg: #f3f7fb;
    --pms10-card-shadow: 0 12px 32px rgba(15, 23, 42, 0.07);
    --pms10-card-border: rgba(148, 163, 184, 0.18);
  }

  body,
  #root {
    background: var(--pms10-desktop-bg) !important;
  }

  .app-header {
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.10);
  }

  .app-main {
    background: transparent;
  }
}
`
    fs.writeFileSync(layoutCssPath, css)
    console.log('Added safe layout polish.')
  }

  if (fs.existsSync(dashboardCssPath)) {
    let css = fs.readFileSync(dashboardCssPath, 'utf8')
    css = stripMarkedBlocks(css)

    css += `
/* =========================
   PMS10 RESCUE RESTORE MERGE
   Safe dashboard polish only. Original hero merge behavior is preserved.
========================= */

@media (min-width: 901px) {
  .dashboard-stat-card,
  .dashboard-chart-card,
  .dashboard-panel,
  .dashboard-card,
  .dashboard-priority-card {
    border-radius: 22px;
    box-shadow: var(--pms10-card-shadow, 0 12px 32px rgba(15, 23, 42, 0.07));
    border-color: var(--pms10-card-border, rgba(148, 163, 184, 0.18));
  }

  .dashboard-stat-grid {
    gap: 14px;
  }
}
`
    fs.writeFileSync(dashboardCssPath, css)
    console.log('Added safe dashboard polish.')
  }

  if (fs.existsSync(projectsCssPath)) {
    let css = fs.readFileSync(projectsCssPath, 'utf8')
    css = stripMarkedBlocks(css)

    css += `
/* =========================
   PMS10 RESCUE RESTORE MERGE
   Safe project registry polish only. Original hero merge behavior is preserved.
========================= */

@media (min-width: 901px) {
  .projects-summary-card,
  .projects-search-panel,
  .project-list-panel,
  .projects-filter-panel,
  .projects-list-card,
  .projects-table-card {
    border-radius: 22px;
    box-shadow: var(--pms10-card-shadow, 0 12px 32px rgba(15, 23, 42, 0.07));
    border-color: var(--pms10-card-border, rgba(148, 163, 184, 0.18));
  }

  .project-list-row,
  .project-card-row,
  .project-row {
    border-radius: 18px;
  }
}
`
    fs.writeFileSync(projectsCssPath, css)
    console.log('Added safe project registry polish.')
  }
}

for (const relativePath of cssFiles) {
  restoreCss(relativePath)
}

restoreLayoutComponent()
appendSafePolish()

console.log('')
console.log('Rescue complete.')
console.log('Next: npm run build && npm run dev -- --host 0.0.0.0')
console.log('Then hard refresh Chrome: Command + Shift + R')
