const fs = require('fs')
const path = require('path')

const dashboardPath = path.join(process.cwd(), 'src/pages/Dashboard.tsx')
const cssPath = path.join(process.cwd(), 'src/styles/dashboard.css')

if (!fs.existsSync(dashboardPath)) {
  console.error('Missing file:', dashboardPath)
  process.exit(1)
}

let code = fs.readFileSync(dashboardPath, 'utf8')
let changed = false

function removeImportFromModule(source, modulePath) {
  const lines = source.split('\n')
  const kept = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    if (!line.trim().startsWith('import ')) {
      kept.push(line)
      continue
    }

    const block = [line]
    let j = i

    while (!block.join('\n').includes(' from ') && j + 1 < lines.length) {
      j += 1
      block.push(lines[j])
    }

    while (
      !block.join('\n').match(/from\s+['"][^'"]+['"]\s*;?\s*$/) &&
      j + 1 < lines.length
    ) {
      j += 1
      block.push(lines[j])
    }

    const blockText = block.join('\n')

    if (blockText.includes(`from '${modulePath}'`) || blockText.includes(`from "${modulePath}"`)) {
      i = j
      changed = true
      continue
    }

    kept.push(...block)
    i = j
  }

  return kept.join('\n')
}

function insertImport(source, importLine) {
  const lines = source.split('\n')
  let insertAt = -1
  let inImport = false

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()

    if (trimmed.startsWith('import ')) {
      inImport = true
      insertAt = i
    }

    if (inImport && /from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed)) {
      inImport = false
      insertAt = i
    }
  }

  if (insertAt === -1) {
    return importLine + '\n' + source
  }

  lines.splice(insertAt + 1, 0, importLine)
  return lines.join('\n')
}

function removeNamedImport(source, modulePath, namesToRemove) {
  const lines = source.split('\n')
  const output = []
  let changedLocal = False

  return source
}

function removeNamedImportSimple(source, modulePath, name) {
  const importRegex = new RegExp(
    `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*;?`,
    'm',
  )

  const match = source.match(importRegex)

  if (!match) return source

  const names = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== name)

  changed = true

  if (names.length === 0) {
    return source.replace(importRegex, '')
  }

  const replacement =
    names.length === 1
      ? `import { ${names[0]} } from '${modulePath}'`
      : `import {\n  ${names.join(',\n  ')},\n} from '${modulePath}'`

  return source.replace(importRegex, replacement)
}

function removeConstByName(source, constName) {
  const pattern = new RegExp(`\\n?const\\s+${constName}\\s*=.*\\n`, 'm')
  if (pattern.test(source)) {
    changed = true
    return source.replace(pattern, '\n')
  }

  return source
}

function removeFunctionByName(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`)

  if (start === -1) return source

  let braceStart = source.indexOf('{', start)

  if (braceStart === -1) return source

  let depth = 0
  let end = -1

  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i]

    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }

  if (end === -1) return source

  while (source[end] === '\n' || source[end] === '\r') {
    end += 1
  }

  changed = true
  return source.slice(0, start) + source.slice(end)
}

function replaceFunction(functionName, replacement) {
  const start = code.indexOf(`function ${functionName}(`)

  if (start === -1) {
    console.warn(`Could not find ${functionName}; adding replacement before dashboardData.`)
    const marker = '  const dashboardData = useMemo(() => {'
    const markerIndex = code.indexOf(marker)

    if (markerIndex >= 0) {
      code = code.slice(0, markerIndex) + `${replacement}\n\n` + code.slice(markerIndex)
      changed = true
    }

    return
  }

  let braceStart = code.indexOf('{', start)

  if (braceStart === -1) return

  let depth = 0
  let end = -1

  for (let i = braceStart; i < code.length; i += 1) {
    const char = code[i]

    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }

  if (end === -1) return

  code = code.slice(0, start) + replacement + code.slice(end)
  changed = true
  console.log(`Replaced ${functionName}.`)
}

function replaceUseMemoBlock(blockName, dependencyText, replacement) {
  const start = code.indexOf(`  const ${blockName} = useMemo(() => {`)
  const endMarker = `  }, ${dependencyText})`
  const end = code.indexOf(endMarker, start)

  if (start === -1 || end === -1) {
    console.error(`Could not find ${blockName} useMemo block.`)
    process.exit(1)
  }

  code = code.slice(0, start) + replacement + code.slice(end)
  changed = true
  console.log(`Replaced ${blockName}.`)
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

// Clean bad/old imports and unused old helpers.
code = removeImportFromModule(code, '../utils/projectStatus')
code = insertImport(
  code,
  "import { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'",
)

code = removeNamedImportSimple(code, '../utils/projectVariance', 'getComputedRiskLevel')
code = removeConstByName(code, 'STATUS_FALLBACK')
code = removeFunctionByName(code, 'isCompletedForRisk')
code = removeFunctionByName(code, 'isStatus')
code = removeFunctionByName(code, 'isRisk')

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

replaceUseMemoBlock(
  'dashboardData',
  '[visibleProjects]',
  `  const dashboardData = useMemo(() => {
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
`,
)

replaceStatCards()

fs.writeFileSync(dashboardPath, code)

// CSS patch
let css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : ''

function stripOldLayout(marker) {
  const index = css.indexOf(`/* =========================\n   ${marker}`)

  if (index < 0) return

  const nextIndex = css.indexOf('/* =========================', index + 20)
  css = css.slice(0, index) + (nextIndex >= 0 ? css.slice(nextIndex) : '')
}

stripOldLayout('PMS10 STATUS SUMMARY LAYOUT FIX')
stripOldLayout('PMS10 DASHBOARD 9-CARD LAYOUT')

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

css += cssPatch
fs.writeFileSync(cssPath, css)

console.log('Dashboard hotfix complete. Now run npm run build.')
