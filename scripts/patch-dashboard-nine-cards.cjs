const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/Dashboard.tsx')
const cssPath = path.join(process.cwd(), 'src/styles/dashboard.css')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

function addProjectStatusImport() {
  code = code.replace(
    /^import\s+\{[\s\S]*?\}\s+from\s+'..\/utils\/projectStatus'\n/m,
    '',
  )

  const lastImportMatch = [...code.matchAll(/^import .*$/gm)].pop()

  if (!lastImportMatch) {
    throw new Error('Could not find import section in Dashboard.tsx')
  }

  const insertIndex = lastImportMatch.index + lastImportMatch[0].length

  code =
    code.slice(0, insertIndex) +
    "\nimport { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'" +
    code.slice(insertIndex)

  changed = true
  console.log('Updated projectStatus import.')
}

function replaceFunction(functionName, replacement) {
  const pattern = new RegExp(
    `function ${functionName}\\(project: ProjectRecord\\) \\{[\\s\\S]*?\\n\\}`,
    'm',
  )

  if (!pattern.test(code)) {
    console.warn(`Could not find ${functionName}.`)
    return
  }

  code = code.replace(pattern, replacement)
  changed = true
  console.log(`Replaced ${functionName}.`)
}

function replaceDashboardData() {
  const start = code.indexOf('  const dashboardData = useMemo(() => {')
  const endMarker = '  }, [visibleProjects])'
  const end = code.indexOf(endMarker, start)

  if (start === -1 || end === -1) {
    console.error('Could not find dashboardData useMemo block.')
    console.error('Send grep output: grep -n "dashboardData\\|statCards\\|visibleProjects" src/pages/Dashboard.tsx')
    process.exit(1)
  }

  const replacement = `  const dashboardData = useMemo(() => {
    const underProcurementProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Under Procurement',
    )

    const notStartedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Not Yet Started',
    )

    const ongoingProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Ongoing',
    )

    const completedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Completed',
    )

    const suspendedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Suspended',
    )

    const terminatedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Terminated',
    )

    const cancelledProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Cancelled',
    )

    const criticalStatusProjects = [
      ...suspendedProjects,
      ...terminatedProjects,
      ...cancelledProjects,
    ]

    const lowRiskProjects = visibleProjects.filter(
      (project) => getRiskLevel(project) === 'Low',
    )

    const mediumRiskProjects = visibleProjects.filter(
      (project) => getRiskLevel(project) === 'Moderate',
    )

    const highRiskProjects = visibleProjects.filter(
      (project) => getRiskLevel(project) === 'High',
    )

    const statusData = [
      { name: 'Under Procurement', count: underProcurementProjects.length },
      { name: 'Not Yet Started', count: notStartedProjects.length },
      { name: 'Ongoing', count: ongoingProjects.length },
      { name: 'Completed', count: completedProjects.length },
      { name: 'Suspended', count: suspendedProjects.length },
      { name: 'Terminated', count: terminatedProjects.length },
      { name: 'Cancelled', count: cancelledProjects.length },
    ].filter((item) => item.count > 0)

    const riskData = [
      { name: 'Low', count: lowRiskProjects.length },
      { name: 'Medium', count: mediumRiskProjects.length },
      { name: 'High', count: highRiskProjects.length },
    ].filter((item) => item.count > 0)

    const latestProjects = [...visibleProjects]
      .sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a))
      .slice(0, 5)

    return {
      totalProjects: visibleProjects.length,
      underProcurementProjects,
      notStartedProjects,
      ongoingProjects,
      completedProjects,
      suspendedProjects,
      terminatedProjects,
      cancelledProjects,
      criticalStatusProjects,
      lowRiskProjects,
      mediumRiskProjects,
      highRiskProjects,
      statusData,
      riskData,
      latestProjects,
    }
`

  code = code.slice(0, start) + replacement + code.slice(end)
  changed = true
  console.log('Replaced dashboardData.')
}

function replaceStatCards() {
  const start = code.indexOf('  const statCards = [')
  const endMarker = '\n\n  function renderProjectCard'
  const end = code.indexOf(endMarker, start)

  if (start === -1 || end === -1) {
    console.error('Could not find statCards block.')
    console.error('Send grep output: grep -n "statCards\\|renderProjectCard" src/pages/Dashboard.tsx')
    process.exit(1)
  }

  const replacement = `  const statCards = [
    {
      key: 'total',
      label: 'Total Projects',
      value: dashboardData.totalProjects,
      helper: 'All records',
      className: 'total',
      title: 'All Projects',
      subtitle: 'Complete list of enrolled projects.',
      records: visibleProjects,
    },
    {
      key: 'under-procurement',
      label: 'Under Procurement',
      value: dashboardData.underProcurementProjects.length,
      helper: 'No contract evidence',
      className: 'under-procurement',
      title: 'Under Procurement Projects',
      subtitle: 'Projects with 0% physical accomplishment and no contract evidence yet.',
      records: dashboardData.underProcurementProjects,
    },
    {
      key: 'not-started',
      label: 'Not Yet Started',
      value: dashboardData.notStartedProjects.length,
      helper: 'Contracted, 0% physical',
      className: 'not-started',
      title: 'Not Yet Started Projects',
      subtitle: 'Projects with contract evidence but no physical accomplishment yet.',
      records: dashboardData.notStartedProjects,
    },
    {
      key: 'ongoing',
      label: 'Ongoing',
      value: dashboardData.ongoingProjects.length,
      helper: '1% to 99% physical',
      className: 'ongoing',
      title: 'Ongoing Projects',
      subtitle: 'Projects with physical accomplishment above 0% and below 100%, or tagged ongoing.',
      records: dashboardData.ongoingProjects,
    },
    {
      key: 'completed',
      label: 'Completed',
      value: dashboardData.completedProjects.length,
      helper: '100% physical or completed',
      className: 'completed',
      title: 'Completed Projects',
      subtitle: 'Projects with completed status or 100% physical accomplishment.',
      records: dashboardData.completedProjects,
    },
    {
      key: 'critical-status',
      label: 'Critical Status',
      value: dashboardData.criticalStatusProjects.length,
      helper: 'Suspended / terminated / cancelled',
      className: 'critical-status',
      title: 'Critical Status Projects',
      subtitle: 'Projects tagged as suspended, terminated, or cancelled.',
      records: dashboardData.criticalStatusProjects,
    },
    {
      key: 'low-risk',
      label: 'Low Risk',
      value: dashboardData.lowRiskProjects.length,
      helper: 'Risk subset',
      className: 'low-risk',
      title: 'Low Risk Projects',
      subtitle: 'Projects with low risk level.',
      records: dashboardData.lowRiskProjects,
    },
    {
      key: 'medium-risk',
      label: 'Medium Risk',
      value: dashboardData.mediumRiskProjects.length,
      helper: 'Risk subset',
      className: 'medium-risk',
      title: 'Medium Risk Projects',
      subtitle: 'Projects with medium or moderate risk level.',
      records: dashboardData.mediumRiskProjects,
    },
    {
      key: 'high-risk',
      label: 'High Risk',
      value: dashboardData.highRiskProjects.length,
      helper: 'Risk subset',
      className: 'high-risk',
      title: 'High Risk Projects',
      subtitle: 'Projects requiring close monitoring and follow-through.',
      records: dashboardData.highRiskProjects,
    },
  ]`

  code = code.slice(0, start) + replacement + code.slice(end)
  changed = true
  console.log('Replaced statCards with 9 cards.')
}

addProjectStatusImport()

replaceFunction(
  'getStatus',
  `function getStatus(project: ProjectRecord) {
  return getPmsProjectStatus(project)
}`,
)

replaceFunction(
  'getRiskLevel',
  `function getRiskLevel(project: ProjectRecord) {
  return getPmsRiskLevel(project)
}`,
)

replaceDashboardData()
replaceStatCards()

fs.writeFileSync(filePath, code)

let css = ''

if (fs.existsSync(cssPath)) {
  css = fs.readFileSync(cssPath, 'utf8')
}

const oldLayoutBlocks = [
  'PMS10 STATUS SUMMARY LAYOUT FIX',
  'PMS10 DASHBOARD 9-CARD LAYOUT',
]

oldLayoutBlocks.forEach((marker) => {
  const index = css.indexOf(`/* =========================\n   ${marker}`)
  if (index >= 0) {
    const nextIndex = css.indexOf('/* =========================', index + 20)
    css = css.slice(0, index) + (nextIndex >= 0 ? css.slice(nextIndex) : '')
  }
})

const cssPatch = `
/* =========================
   PMS10 DASHBOARD 9-CARD LAYOUT
   5 cards top row, 4 wider cards bottom row
========================= */

@media (min-width: 1180px) {
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
}

@media (min-width: 760px) and (max-width: 1179px) {
  .dashboard-stat-grid {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 12px !important;
  }

  .dashboard-stat-grid .dashboard-stat-card {
    grid-column: auto !important;
  }
}

@media (max-width: 759px) {
  .dashboard-stat-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  .dashboard-stat-grid .dashboard-stat-card {
    grid-column: auto !important;
  }
}

@media (max-width: 420px) {
  .dashboard-stat-grid {
    grid-template-columns: 1fr !important;
  }
}

.dashboard-stat-card.under-procurement {
  border-top-color: #f97316 !important;
}

.dashboard-stat-card.not-started {
  border-top-color: #64748b !important;
}

.dashboard-stat-card.ongoing {
  border-top-color: #16a34a !important;
}

.dashboard-stat-card.completed {
  border-top-color: #2563eb !important;
}

.dashboard-stat-card.critical-status {
  border-top-color: #ef4444 !important;
}

.dashboard-stat-card.low-risk {
  border-top-color: #eab308 !important;
}

.dashboard-stat-card.medium-risk {
  border-top-color: #f97316 !important;
}

.dashboard-stat-card.high-risk {
  border-top-color: #ef4444 !important;
}
`

if (!css.includes('PMS10 DASHBOARD 9-CARD LAYOUT')) {
  css += cssPatch
  fs.writeFileSync(cssPath, css)
  changed = true
  console.log('Added dashboard 9-card layout CSS.')
} else {
  fs.writeFileSync(cssPath, css)
}

if (changed) {
  console.log('Dashboard 9-card patch completed.')
} else {
  console.log('No changes made.')
}
