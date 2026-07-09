const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/Dashboard.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

function addImport() {
  if (code.includes("from '../utils/projectStatus'")) return

  const lastImportMatch = [...code.matchAll(/^import .*$/gm)].pop()

  if (!lastImportMatch) {
    throw new Error('Could not find import section in Dashboard.tsx')
  }

  const insertIndex = lastImportMatch.index + lastImportMatch[0].length
  code =
    code.slice(0, insertIndex) +
    "\nimport { getPmsProjectStatus, getPmsRiskLevel, isPmsHighRisk } from '../utils/projectStatus'" +
    code.slice(insertIndex)

  changed = true
  console.log('Added projectStatus import.')
}

function replaceFunction(functionName, replacement) {
  const pattern = new RegExp(`function ${functionName}\\(project: ProjectRecord\\) \\{[\\s\\S]*?\\n\\}`, 'm')

  if (!pattern.test(code)) {
    console.warn(`Could not find ${functionName} function.`)
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
    console.warn('Could not find dashboardData useMemo block.')
    return
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

    const highRiskProjects = visibleProjects.filter(isPmsHighRisk)

    const statusData = [
      { name: 'Under Procurement', count: underProcurementProjects.length },
      { name: 'Not Yet Started', count: notStartedProjects.length },
      { name: 'Ongoing', count: ongoingProjects.length },
      { name: 'Completed', count: completedProjects.length },
      { name: 'Suspended', count: suspendedProjects.length },
      { name: 'Terminated', count: terminatedProjects.length },
      { name: 'Cancelled', count: cancelledProjects.length },
    ].filter((item) => item.count > 0)

    const riskData = countBy(visibleProjects, getRiskLevel)

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
      highRiskProjects,
      statusData,
      riskData,
      latestProjects,
    }
`

  code = code.slice(0, start) + replacement + code.slice(end)
  changed = true
  console.log('Replaced dashboardData with mutually exclusive simplified status categories.')
}

function replaceStatCards() {
  const start = code.indexOf('  const statCards = [')
  const endMarker = '\n\n  function renderProjectCard'
  const end = code.indexOf(endMarker, start)

  if (start === -1 || end === -1) {
    console.warn('Could not find statCards block.')
    return
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
      className: 'for-review',
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
      subtitle: 'Projects with physical accomplishment above 0% and below 100%.',
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
      helper: 'Suspended/terminated/cancelled',
      className: 'high-risk',
      title: 'Critical Status Projects',
      subtitle: 'Projects tagged as suspended, terminated, or cancelled.',
      records: dashboardData.criticalStatusProjects,
    },
    {
      key: 'high-risk',
      label: 'High Risk',
      value: dashboardData.highRiskProjects.length,
      helper: 'Risk subset, not status',
      className: 'high-risk',
      title: 'High Risk Projects',
      subtitle: 'Projects requiring close monitoring and follow-through. This is a risk subset, not an implementation status category.',
      records: dashboardData.highRiskProjects,
    },
  ]`

  code = code.slice(0, start) + replacement + code.slice(end)
  changed = true
  console.log('Replaced statCards with simplified status cards plus separate High Risk card.')
}

function patchStatusChartClicks() {
  code = code.replace(
    /visibleProjects\.filter\(\s*\(project\) => getStatus\(project\) === name,\s*\)/g,
    "visibleProjects.filter((project) => getStatus(project) === name)",
  )

  code = code.replace(
    "Projects currently categorized as ${name}.",
    "Projects currently categorized as ${name} using the simplified PMS10 status rule.",
  )
}

addImport()

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
patchStatusChartClicks()

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched src/pages/Dashboard.tsx for consistent simplified status counts.')
} else {
  console.log('No Dashboard.tsx changes made. It may already be patched or the file structure differs.')
}
