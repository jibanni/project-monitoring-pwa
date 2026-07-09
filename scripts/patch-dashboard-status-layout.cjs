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

function removeHighRiskCardObject(source) {
  const keyIndex = source.indexOf("key: 'high-risk'")

  if (keyIndex === -1) {
    return { source, removed: false }
  }

  let objectStart = source.lastIndexOf('    {', keyIndex)

  if (objectStart === -1) {
    objectStart = source.lastIndexOf('{', keyIndex)
  }

  if (objectStart === -1) {
    return { source, removed: false }
  }

  let depth = 0
  let objectEnd = -1

  for (let i = objectStart; i < source.length; i += 1) {
    const char = source[i]

    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        objectEnd = i + 1

        while (source[objectEnd] === ',' || source[objectEnd] === '\n' || source[objectEnd] === ' ' || source[objectEnd] === '\r') {
          if (source[objectEnd] === ',' && source[objectEnd + 1] === '\n') {
            objectEnd += 2
            break
          }

          objectEnd += 1
        }

        break
      }
    }
  }

  if (objectEnd === -1) {
    return { source, removed: false }
  }

  return {
    source: source.slice(0, objectStart) + source.slice(objectEnd),
    removed: true,
  }
}

const result = removeHighRiskCardObject(code)

if (result.removed) {
  code = result.source
  changed = true
  console.log('Removed High Risk from the status summary card grid.')
} else {
  console.log('High Risk card was not found in the status summary card grid, or already removed.')
}

// Add a clear comment in the dashboard data block so future edits do not re-add High Risk
// to status totals.
if (!code.includes('High Risk is intentionally not part of the status card grid.')) {
  const marker = '    const highRiskProjects = visibleProjects.filter(isPmsHighRisk)\n'
  if (code.includes(marker)) {
    code = code.replace(
      marker,
      marker +
        '\n    // High Risk is intentionally not part of the status card grid.\n' +
        '    // It is a risk subset and must not be added to implementation status totals.\n',
    )
    changed = true
    console.log('Added High Risk clarification comment.')
  }
}

fs.writeFileSync(dashboardPath, code)

if (!fs.existsSync(cssPath)) {
  console.error('Missing file:', cssPath)
  process.exit(1)
}

let css = fs.readFileSync(cssPath, 'utf8')

const override = `
/* =========================
   PMS10 STATUS SUMMARY LAYOUT FIX
   4 cards on the first row, 2 wider cards on the second row.
   High Risk is not included here because it is a risk subset, not a status.
========================= */

@media (min-width: 1024px) {
  .dashboard-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    align-items: stretch !important;
  }

  .dashboard-stat-grid .dashboard-stat-card:nth-child(5),
  .dashboard-stat-grid .dashboard-stat-card:nth-child(6) {
    grid-column: span 2 !important;
  }
}

@media (min-width: 681px) and (max-width: 1023px) {
  .dashboard-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .dashboard-stat-grid .dashboard-stat-card {
    grid-column: auto !important;
  }
}

@media (max-width: 680px) {
  .dashboard-stat-grid {
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
`

if (!css.includes('PMS10 STATUS SUMMARY LAYOUT FIX')) {
  css += override
  fs.writeFileSync(cssPath, css)
  changed = true
  console.log('Added dashboard status card layout override.')
} else {
  console.log('Dashboard status card layout override already exists.')
}

if (changed) {
  console.log('Dashboard status layout patch completed.')
} else {
  console.log('No changes were needed.')
}
