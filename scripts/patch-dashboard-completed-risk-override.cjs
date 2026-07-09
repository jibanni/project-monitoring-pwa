const fs = require('fs')
const path = require('path')

const dashboardPath = path.join(process.cwd(), 'src/pages/Dashboard.tsx')

if (!fs.existsSync(dashboardPath)) {
  console.error('Missing file:', dashboardPath)
  process.exit(1)
}

let code = fs.readFileSync(dashboardPath, 'utf8')
let changed = false

function replaceOnce(search, replacement, label) {
  if (!code.includes(search)) {
    console.warn(`Marker not found, skipped: ${label}`)
    return
  }

  code = code.replace(search, replacement)
  changed = true
  console.log(`Patched: ${label}`)
}

if (!code.includes('function isCompletedForRisk(project: ProjectRecord)')) {
  replaceOnce(
`function getRiskLevel(project: ProjectRecord) {
  return getComputedRiskLevel(project)
}`,
`function isCompletedForRisk(project: ProjectRecord) {
  const status = normalizeForCompare(getStatus(project))

  const physical = asNumber(
    project.physical_accomplishment ??
      project.physical_progress ??
      project.actual_physical ??
      project.total_accomplishment ??
      project.total_accomplishment_percentage ??
      project.accomplishment ??
      project.physical ??
      0,
  )

  return (
    physical >= 100 ||
    status.includes('completed') ||
    status === 'complete'
  )
}

function getRiskLevel(project: ProjectRecord) {
  if (isCompletedForRisk(project)) {
    return 'None'
  }

  return getComputedRiskLevel(project)
}`,
    'Dashboard completed/100% risk override',
  )
} else {
  console.log('Dashboard completed/100% risk override already exists.')
}

fs.writeFileSync(dashboardPath, code)

if (changed) {
  console.log('Patched src/pages/Dashboard.tsx.')
} else {
  console.log('No Dashboard.tsx changes made. It may already be patched or markers differ.')
}
