const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const dashboardTsxPath = path.join(projectRoot, 'src/pages/Dashboard.tsx')
const dashboardCssPath = path.join(projectRoot, 'src/styles/dashboard.css')

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

function appendOrReplaceCss(filePath, marker, cssBlock) {
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
}

function findFunctionRange(source, functionName) {
  const marker = `function ${functionName}`
  const start = source.indexOf(marker)

  if (start < 0) {
    throw new Error(`Could not find ${marker}`)
  }

  const openBrace = source.indexOf('{', start)

  if (openBrace < 0) {
    throw new Error(`Could not find opening brace for ${functionName}`)
  }

  let depth = 0
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index]

    if (char === '{') depth += 1
    if (char === '}') depth -= 1

    if (depth === 0) {
      return { start, end: index + 1 }
    }
  }

  throw new Error(`Could not find closing brace for ${functionName}`)
}

requireFile(dashboardTsxPath)
requireFile(dashboardCssPath)

backup(dashboardTsxPath, 'drilldown-compact-safari')
backup(dashboardCssPath, 'drilldown-compact-safari')

let tsx = fs.readFileSync(dashboardTsxPath, 'utf8')

// 1) Add safe page size constant.
if (!tsx.includes('const DRILLDOWN_PAGE_SIZE = 80')) {
  tsx = tsx.replace(
    'const MODAL_CLOSE_DELAY = 190',
    'const MODAL_CLOSE_DELAY = 190\nconst DRILLDOWN_PAGE_SIZE = 80',
  )
}

// 2) Add visible-count state for safer rendering on iPhone Safari.
if (!tsx.includes('drilldownVisibleCount')) {
  tsx = tsx.replace(
    'const [isDrilldownClosing, setIsDrilldownClosing] = useState(false)',
    `const [isDrilldownClosing, setIsDrilldownClosing] = useState(false)
  const [drilldownVisibleCount, setDrilldownVisibleCount] = useState(DRILLDOWN_PAGE_SIZE)`,
  )
}

// 3) Reset visible count every time a card/chart category is opened.
if (!tsx.includes('setDrilldownVisibleCount(DRILLDOWN_PAGE_SIZE)')) {
  tsx = tsx.replace(
    'setIsDrilldownClosing(false)',
    `setIsDrilldownClosing(false)
    setDrilldownVisibleCount(DRILLDOWN_PAGE_SIZE)`,
  )
}

// 4) Replace heavy project cards with compact list rows.
const compactRenderProjectCard = `function renderProjectCard(project: ProjectRecord) {
    const projectId = getProjectId(project)
    const projectName = getProjectName(project)
    const riskLevel = getRiskLevel(project)
    const status = getStatus(project)
    const physicalProgress = formatPercent(getPhysicalProgress(project))

    return (
      <article
        className="dashboard-modal-project-card dashboard-modal-project-row"
        key={projectId || projectName}
      >
        <div className="dashboard-modal-project-main">
          <div className="dashboard-modal-project-info">
            <p className="dashboard-modal-project-kicker">
              {getFundingDisplay(project)}
            </p>

            <h3>{projectName}</h3>

            <p className="dashboard-modal-project-location">
              {getLocation(project)}
            </p>

            <p className="dashboard-modal-project-meta">
              <span>{status}</span>
              <span>Risk: {riskLevel}</span>
              <span>{physicalProgress}</span>
            </p>
          </div>

          <button
            type="button"
            className="dashboard-modal-view-btn"
            disabled={!projectId}
            onClick={() => {
              if (!projectId) return
              closeDrilldown()
              navigate(\`/projects/\${projectId}\`)
            }}
          >
            View
          </button>
        </div>
      </article>
    )
  }`

try {
  const range = findFunctionRange(tsx, 'renderProjectCard')
  tsx = `${tsx.slice(0, range.start)}${compactRenderProjectCard}${tsx.slice(range.end)}`
} catch (error) {
  console.error(error.message)
  console.error('Dashboard.tsx was not modified.')
  process.exit(1)
}

// 5) Render first 80 records only, with a Load More button.
// This prevents iPhone Safari from crashing when Total Projects / Completed Projects opens 191-269 records.
if (!tsx.includes('const visibleDrilldownProjects = drilldown.projects.slice(')) {
  tsx = tsx.replace(
    `function renderModal() {
    if (!drilldown) return null`,
    `function renderModal() {
    if (!drilldown) return null

    const visibleDrilldownProjects = drilldown.projects.slice(0, drilldownVisibleCount)
    const hiddenDrilldownCount = Math.max(
      drilldown.projects.length - visibleDrilldownProjects.length,
      0,
    )`,
  )
}

tsx = tsx.replace(
  /drilldown\.projects\.map\(renderProjectCard\)/g,
  'visibleDrilldownProjects.map(renderProjectCard)',
)

if (!tsx.includes('dashboard-modal-load-more')) {
  tsx = tsx.replace(
    `visibleDrilldownProjects.map(renderProjectCard)
            ) : (`,
    `(
                <>
                  {visibleDrilldownProjects.map(renderProjectCard)}

                  {hiddenDrilldownCount > 0 ? (
                    <button
                      type="button"
                      className="dashboard-modal-load-more"
                      onClick={() =>
                        setDrilldownVisibleCount((currentCount) =>
                          currentCount + DRILLDOWN_PAGE_SIZE,
                        )
                      }
                    >
                      Show {Math.min(hiddenDrilldownCount, DRILLDOWN_PAGE_SIZE)} more
                    </button>
                  ) : null}
                </>
              )
            ) : (`,
  )
}

fs.writeFileSync(dashboardTsxPath, tsx)

const cssBlock = `
/* =========================
   PMS10 DASHBOARD DRILLDOWN COMPACT SAFARI FIX
   Compact modal list + reduced rendering load for Total/Completed drilldown.
========================= */

.dashboard-modal-backdrop {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

.dashboard-drilldown-modal {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

.dashboard-modal-body {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
}

.dashboard-modal-project-card.dashboard-modal-project-row {
  padding: 12px 12px !important;
  border-radius: 18px !important;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08) !important;
}

.dashboard-modal-project-row + .dashboard-modal-project-row {
  margin-top: 0 !important;
}

.dashboard-modal-project-row .dashboard-modal-project-main {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 76px !important;
  align-items: center !important;
  gap: 10px !important;
}

.dashboard-modal-project-info {
  min-width: 0 !important;
}

.dashboard-modal-project-row .dashboard-modal-project-kicker {
  margin: 0 0 4px !important;
  font-size: 0.68rem !important;
  line-height: 1.05 !important;
  letter-spacing: 0.16em !important;
  color: #f97316 !important;
}

.dashboard-modal-project-row h3 {
  margin: 0 !important;
  font-size: 0.95rem !important;
  line-height: 1.18 !important;
  letter-spacing: -0.02em !important;
  color: #0f172a !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
}

.dashboard-modal-project-row .dashboard-modal-project-location {
  margin: 5px 0 0 !important;
  font-size: 0.76rem !important;
  line-height: 1.2 !important;
  color: #64748b !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.dashboard-modal-project-meta {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 5px !important;
  margin: 7px 0 0 !important;
}

.dashboard-modal-project-meta span {
  display: inline-flex !important;
  align-items: center !important;
  max-width: 100% !important;
  min-height: 20px !important;
  padding: 4px 7px !important;
  border-radius: 999px !important;
  background: #f1f5f9 !important;
  color: #475569 !important;
  font-size: 0.64rem !important;
  line-height: 1 !important;
  font-weight: 900 !important;
}

.dashboard-modal-project-row .dashboard-modal-view-btn {
  width: 72px !important;
  min-width: 72px !important;
  height: 40px !important;
  min-height: 40px !important;
  padding: 0 !important;
  border-radius: 14px !important;
  font-size: 0.78rem !important;
  font-weight: 950 !important;
  align-self: center !important;
}

.dashboard-modal-project-row .dashboard-modal-project-grid,
.dashboard-modal-project-row .dashboard-modal-progress-row {
  display: none !important;
}

.dashboard-modal-load-more {
  width: 100% !important;
  min-height: 46px !important;
  border: 0 !important;
  border-radius: 16px !important;
  background: linear-gradient(135deg, #0f4f8f, #1f73c9) !important;
  color: #ffffff !important;
  font-weight: 950 !important;
  letter-spacing: 0.02em !important;
  box-shadow: 0 10px 24px rgba(15, 79, 143, 0.2) !important;
}

@media (max-width: 700px) {
  .dashboard-modal-header {
    padding: 18px 18px 16px !important;
  }

  .dashboard-modal-header h2 {
    font-size: 1.28rem !important;
    line-height: 1.1 !important;
  }

  .dashboard-modal-header p:not(.dashboard-modal-eyebrow) {
    font-size: 0.82rem !important;
    line-height: 1.35 !important;
  }

  .dashboard-modal-body {
    padding: 12px 12px calc(18px + env(safe-area-inset-bottom)) !important;
    gap: 8px !important;
  }

  .dashboard-modal-project-card.dashboard-modal-project-row {
    padding: 11px 11px !important;
    border-radius: 17px !important;
  }

  .dashboard-modal-project-row .dashboard-modal-project-main {
    grid-template-columns: minmax(0, 1fr) 66px !important;
    gap: 8px !important;
  }

  .dashboard-modal-project-row .dashboard-modal-project-kicker {
    font-size: 0.62rem !important;
  }

  .dashboard-modal-project-row h3 {
    font-size: 0.86rem !important;
    line-height: 1.16 !important;
  }

  .dashboard-modal-project-row .dashboard-modal-project-location {
    font-size: 0.7rem !important;
  }

  .dashboard-modal-project-meta {
    gap: 4px !important;
    margin-top: 6px !important;
  }

  .dashboard-modal-project-meta span {
    min-height: 18px !important;
    padding: 3px 6px !important;
    font-size: 0.58rem !important;
  }

  .dashboard-modal-project-row .dashboard-modal-view-btn {
    width: 64px !important;
    min-width: 64px !important;
    height: 38px !important;
    min-height: 38px !important;
    border-radius: 13px !important;
    font-size: 0.72rem !important;
  }
}
`

appendOrReplaceCss(
  dashboardCssPath,
  'PMS10 DASHBOARD DRILLDOWN COMPACT SAFARI FIX',
  cssBlock,
)

console.log('Dashboard drilldown compact Safari fix applied.')
console.log('Total/Completed now render paginated compact rows instead of heavy cards.')
