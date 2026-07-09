const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const dashboardPath = path.join(projectRoot, 'src/pages/Dashboard.tsx')
const cssPath = path.join(projectRoot, 'src/styles/dashboard.css')

if (!fs.existsSync(dashboardPath)) {
  console.error('Missing file: src/pages/Dashboard.tsx')
  process.exit(1)
}

if (!fs.existsSync(cssPath)) {
  console.error('Missing file: src/styles/dashboard.css')
  process.exit(1)
}

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

backup(dashboardPath, 'compact-filter-bar')
backup(cssPath, 'compact-filter-bar')

let code = fs.readFileSync(dashboardPath, 'utf8')
let changed = false

// Add toggle state.
if (!code.includes('showDashboardFilters')) {
  const marker = `  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>(
    DEFAULT_DASHBOARD_FILTERS,
  )
`

  const replacement = `${marker}  const [showDashboardFilters, setShowDashboardFilters] = useState(false)
`

  if (code.includes(marker)) {
    code = code.replace(marker, replacement)
    changed = true
    console.log('Added dashboard filter toggle state.')
  } else {
    console.warn('Could not find dashboardFilters state marker.')
  }
}

// Replace section class with compact/collapsible class.
if (code.includes('<section className="dashboard-filter-panel" aria-label="Dashboard filters">')) {
  code = code.replace(
    '<section className="dashboard-filter-panel" aria-label="Dashboard filters">',
    `<section
          className={[
            'dashboard-filter-panel',
            showDashboardFilters ? 'is-open' : '',
            hasActiveDashboardFilters ? 'has-active-filters' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Dashboard filters"
        >`,
  )
  changed = true
  console.log('Made dashboard filter panel collapsible.')
}

// Replace old bulky filter header.
const oldHeader = `          <div className="dashboard-filter-header">
            <div>
              <p className="dashboard-card-kicker">Filters</p>
              <h2>Dashboard Scope</h2>
            </div>

            <span>
              {formatCount(visibleProjects.length)} / {formatCount(aorProjects.length)} projects
            </span>
          </div>
`

const newHeader = `          <div className="dashboard-filter-bar">
            <div className="dashboard-filter-summary">
              <span className="dashboard-filter-summary-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 6.5h16v2H4v-2Zm3 4.75h10v2H7v-2Zm3 4.75h4v2h-4v-2Z" />
                </svg>
              </span>

              <div className="dashboard-filter-summary-text">
                <p>Dashboard filters</p>
                <strong>
                  {[
                    dashboardFilters.program !== ALL_FILTER_VALUE
                      ? dashboardFilters.program
                      : '',
                    dashboardFilters.year !== ALL_FILTER_VALUE
                      ? dashboardFilters.year
                      : '',
                    dashboardFilters.province !== ALL_FILTER_VALUE
                      ? dashboardFilters.province
                      : '',
                    dashboardFilters.lgu !== ALL_FILTER_VALUE
                      ? dashboardFilters.lgu
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'All projects'}
                </strong>
              </div>
            </div>

            <div className="dashboard-filter-bar-actions">
              <span>
                {formatCount(visibleProjects.length)} / {formatCount(aorProjects.length)}
              </span>

              <button
                type="button"
                className="dashboard-filter-toggle"
                onClick={() => setShowDashboardFilters((current) => !current)}
                aria-expanded={showDashboardFilters}
              >
                {showDashboardFilters ? 'Hide' : 'Filter'}
              </button>
            </div>
          </div>
`

if (code.includes(oldHeader)) {
  code = code.replace(oldHeader, newHeader)
  changed = true
  console.log('Replaced bulky dashboard filter header with compact bar.')
} else {
  console.warn('Old dashboard filter header marker not found. It may already be patched.')
}

fs.writeFileSync(dashboardPath, code)

// CSS patch
let css = fs.readFileSync(cssPath, 'utf8')
const marker = 'PMS10 DASHBOARD COMPACT FILTER BAR'

const oldIndex = css.indexOf(marker)
if (oldIndex >= 0) {
  const start = css.lastIndexOf('/*', oldIndex)
  const safeStart = start >= 0 ? start : oldIndex
  const next = css.indexOf('/* =========================', oldIndex + marker.length)
  css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
}

css += `
/* =========================
   PMS10 DASHBOARD COMPACT FILTER BAR
   Makes dashboard filters one-line with a Filter button.
========================= */

.dashboard-filter-panel {
  padding: 10px !important;
  border-radius: 22px !important;
}

.dashboard-filter-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 48px;
}

.dashboard-filter-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dashboard-filter-summary-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #eff6ff;
  color: #0f4c81;
}

.dashboard-filter-summary-icon svg {
  width: 19px;
  height: 19px;
  fill: currentColor;
}

.dashboard-filter-summary-text {
  min-width: 0;
}

.dashboard-filter-summary-text p {
  margin: 0 0 3px;
  color: #64748b;
  font-size: 0.62rem;
  font-weight: 950;
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
}

.dashboard-filter-summary-text strong {
  display: block;
  max-width: 100%;
  color: #0f172a;
  font-size: 0.88rem;
  font-weight: 950;
  line-height: 1.05;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-filter-bar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dashboard-filter-bar-actions > span {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0 10px;
  background: #eff6ff;
  color: #0f4c81;
  font-size: 0.72rem;
  font-weight: 950;
  white-space: nowrap;
}

.dashboard-filter-toggle {
  min-height: 38px;
  border: 0;
  border-radius: 14px;
  padding: 0 14px;
  background: #0f4c81;
  color: #ffffff;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 950;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(15, 76, 129, 0.16);
}

.dashboard-filter-panel.has-active-filters .dashboard-filter-toggle {
  background: #ff6b2c;
  box-shadow: 0 10px 20px rgba(255, 107, 44, 0.16);
}

.dashboard-filter-panel:not(.is-open) .dashboard-filter-grid {
  display: none !important;
}

.dashboard-filter-panel.is-open .dashboard-filter-grid {
  margin-top: 12px;
}

.dashboard-filter-panel:not(.is-open) .dashboard-filter-header {
  display: none !important;
}

@media (max-width: 640px) {
  .dashboard-filter-panel {
    padding: 9px !important;
    border-radius: 20px !important;
  }

  .dashboard-filter-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 44px;
  }

  .dashboard-filter-summary-icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
    border-radius: 12px;
  }

  .dashboard-filter-summary-icon svg {
    width: 17px;
    height: 17px;
  }

  .dashboard-filter-summary-text p {
    font-size: 0.54rem;
  }

  .dashboard-filter-summary-text strong {
    font-size: 0.78rem;
  }

  .dashboard-filter-bar-actions > span {
    display: none;
  }

  .dashboard-filter-toggle {
    min-height: 36px;
    border-radius: 13px;
    padding: 0 12px;
    font-size: 0.76rem;
  }

  .dashboard-filter-panel.is-open .dashboard-filter-grid {
    margin-top: 10px;
  }
}
`

fs.writeFileSync(cssPath, css)

if (changed) {
  console.log('Dashboard compact filter bar applied.')
} else {
  console.log('No TSX changes made. CSS compact filter bar was refreshed.')
}
