const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/Projects.tsx')
const cssPath = path.join(process.cwd(), 'src/styles/projects.css')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

function removeNamedImport(source, modulePath, nameToRemove) {
  const escapedModule = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*['"]${escapedModule}['"]\\s*;?`,
    'm',
  )

  const match = source.match(pattern)

  if (!match) return source

  const names = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== nameToRemove)

  if (names.length === match[1].split(',').map((item) => item.trim()).filter(Boolean).length) {
    return source
  }

  changed = true
  console.log(`Removed unused ${nameToRemove} import from ${modulePath}.`)

  if (names.length === 0) {
    return source.replace(pattern, '')
  }

  const replacement =
    names.length === 1
      ? `import { ${names[0]} } from '${modulePath}'`
      : `import {\n  ${names.join(',\n  ')},\n} from '${modulePath}'`

  return source.replace(pattern, replacement)
}

function insertImport(source, importLine) {
  if (source.includes("from '../utils/projectStatus'") || source.includes('from "../utils/projectStatus"')) {
    return source
  }

  const lines = source.split('\n')
  let insertAt = -1
  let insideImport = false

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()

    if (trimmed.startsWith('import ')) {
      insideImport = true
      insertAt = i
    }

    if (insideImport && /from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed)) {
      insideImport = false
      insertAt = i
    }
  }

  if (insertAt >= 0) {
    lines.splice(insertAt + 1, 0, importLine)
  } else {
    lines.unshift(importLine)
  }

  changed = true
  console.log('Added projectStatus import.')

  return lines.join('\n')
}

function addHelperAfter(functionName, helperCode) {
  if (code.includes('function getRegistryStatus(')) return

  const start = code.indexOf(`function ${functionName}(`)

  if (start === -1) {
    console.warn(`Could not find ${functionName}; helper was not inserted.`)
    return
  }

  const braceStart = code.indexOf('{', start)
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

  code = code.slice(0, end) + '\n\n' + helperCode + code.slice(end)
  changed = true
  console.log('Added registry status/risk helper functions.')
}

function replaceAll(search, replacement, label) {
  if (!code.includes(search)) {
    console.warn(`Marker not found, skipped: ${label}`)
    return
  }

  code = code.split(search).join(replacement)
  changed = true
  console.log(`Patched: ${label}`)
}

function replaceOnce(search, replacement, label) {
  if (!code.includes(search)) {
    console.warn(`Marker not found, skipped: ${label}`)
    return
  }

  code = code.replace(search, replacement)
  changed = true
  console.log(`Patched: ${label}`)
}

code = removeNamedImport(code, '../utils/projectVariance', 'getComputedRiskLevel')
code = removeNamedImport(code, '../utils/projectVariance', 'getProjectDisplayStatus')

code = insertImport(
  code,
  "import { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'",
)

addHelperAfter(
  'getRiskClass',
  `function getRegistryStatus(project: ProjectRow) {
  return getPmsProjectStatus(project)
}

function getRegistryRisk(project: ProjectRow) {
  return getPmsRiskLevel(project)
}`,
)

replaceAll('getProjectDisplayStatus(project)', 'getRegistryStatus(project)', 'display status helper usage')
replaceAll('getComputedRiskLevel(project)', 'getRegistryRisk(project)', 'risk helper usage')

// Keep cached offline projects aligned with dashboard logic.
replaceOnce(
  "    status: textValue(project.status) || 'Not Yet Started',",
  "    status: getRegistryStatus(project),",
  "offline cached status",
)

replaceOnce(
  "    risk_level: getRegistryRisk(project),",
  "    risk_level: getRegistryRisk(project),",
  "offline cached risk already aligned",
)

// Add Under Procurement count and make status counts exact, not string-contains.
if (!code.includes('const underProcurementCount = filteredProjects.filter')) {
  replaceOnce(
`  const notStartedCount = filteredProjects.filter((project) =>
    getRegistryStatus(project).toLowerCase().includes('not'),
  ).length

  const ongoingCount = filteredProjects.filter((project) =>
    getRegistryStatus(project).toLowerCase().includes('ongoing'),
  ).length

  const completedCount = filteredProjects.filter((project) =>
    getRegistryStatus(project).toLowerCase().includes('complete'),
  ).length`,
`  const underProcurementCount = filteredProjects.filter(
    (project) => getRegistryStatus(project) === 'Under Procurement',
  ).length

  const notStartedCount = filteredProjects.filter(
    (project) => getRegistryStatus(project) === 'Not Yet Started',
  ).length

  const ongoingCount = filteredProjects.filter(
    (project) => getRegistryStatus(project) === 'Ongoing',
  ).length

  const completedCount = filteredProjects.filter(
    (project) => getRegistryStatus(project) === 'Completed',
  ).length`,
    'summary status counts',
  )
}

// Add Under Procurement summary card.
if (!code.includes('<span>Under Procurement</span>')) {
  replaceOnce(
`        <div className="projects-summary-card gray">
          <span>Not Yet Started</span>
          <strong>{notStartedCount}</strong>
        </div>`,
`        <div className="projects-summary-card orange">
          <span>Under Procurement</span>
          <strong>{underProcurementCount}</strong>
        </div>

        <div className="projects-summary-card gray">
          <span>Not Yet Started</span>
          <strong>{notStartedCount}</strong>
        </div>`,
    'Under Procurement summary card',
  )
}

// Make registry card status/risk use simplified logic inside map block.
replaceOnce(
  '              const computedRisk = getRegistryRisk(project)\n              const displayStatus = getRegistryStatus(project)',
  '              const computedRisk = getRegistryRisk(project)\n              const displayStatus = getRegistryStatus(project)',
  'row status/risk already aligned',
)

fs.writeFileSync(filePath, code)

// CSS: add under procurement classes and better 7-card registry summary wrapping.
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf8')

  const cssPatch = `
/* =========================
   PMS10 PROJECT REGISTRY DASHBOARD SYNC
========================= */

.project-status.under-procurement {
  background: #fff7ed !important;
  color: #c2410c !important;
}

.project-list-row.high-risk .project-row-main,
.project-list-row.high-risk .project-row-status-stack {
  border-color: rgba(239, 68, 68, 0.12);
}

@media (min-width: 1180px) {
  .projects-summary-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
  }
}

@media (min-width: 760px) and (max-width: 1179px) {
  .projects-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 759px) {
  .projects-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 420px) {
  .projects-summary-grid {
    grid-template-columns: 1fr !important;
  }
}
`

  if (!css.includes('PMS10 PROJECT REGISTRY DASHBOARD SYNC')) {
    css += cssPatch
    fs.writeFileSync(cssPath, css)
    changed = true
    console.log('Added project registry sync CSS.')
  }
}

if (changed) {
  console.log('Project Registry is now synced to the same status/risk logic as Dashboard.')
} else {
  console.log('No changes made. It may already be synced.')
}
