const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const dashboardPath = path.join(projectRoot, 'src/pages/Dashboard.tsx')
const projectsPath = path.join(projectRoot, 'src/pages/Projects.tsx')

let changed = false

function removeFunctionByName(source, functionName) {
  let start = source.indexOf(`function ${functionName}<`)

  if (start === -1) {
    start = source.indexOf(`function ${functionName}(`)
  }

  if (start === -1) return source

  const braceStart = source.indexOf('{', start)

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
  console.log(`Removed unused function: ${functionName}`)

  return source.slice(0, start) + source.slice(end)
}

function removeNamedImport(source, modulePath, nameToRemove) {
  const escapedModule = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*['"]${escapedModule}['"]\\s*;?`,
    'm',
  )

  const match = source.match(pattern)

  if (!match) return source

  const originalNames = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const names = originalNames.filter((item) => item !== nameToRemove)

  if (names.length === originalNames.length) return source

  changed = true
  console.log(`Removed unused import: ${nameToRemove} from ${modulePath}`)

  if (names.length === 0) {
    return source.replace(pattern, '')
  }

  const replacement =
    names.length === 1
      ? `import { ${names[0]} } from '${modulePath}'`
      : `import {\n  ${names.join(',\n  ')},\n} from '${modulePath}'`

  return source.replace(pattern, replacement)
}

function fixConcatenatedImports(source) {
  return source
    .replace(/(['"]\.\.\/utils\/projectVariance['"])\s*import\s+/g, "$1\nimport ")
    .replace(/(['"]\.\.\/utils\/projectStatus['"])\s*import\s+/g, "$1\nimport ")
    .replace(/(['"]\.\.\/utils\/aorAccess['"])\s*import\s+/g, "$1\nimport ")
    .replace(/(['"]\.\.\/utils\/[^'"]+['"])\s*import\s+/g, "$1\nimport ")
}

if (fs.existsSync(dashboardPath)) {
  let dashboard = fs.readFileSync(dashboardPath, 'utf8')
  const before = dashboard

  dashboard = fixConcatenatedImports(dashboard)
  dashboard = removeFunctionByName(dashboard, 'countBy')
  dashboard = removeNamedImport(dashboard, '../utils/projectVariance', 'getComputedRiskLevel')

  fs.writeFileSync(dashboardPath, dashboard)

  if (dashboard !== before) {
    changed = true
    console.log('Cleaned Dashboard.tsx.')
  }
} else {
  console.warn('Skipped missing src/pages/Dashboard.tsx')
}

if (fs.existsSync(projectsPath)) {
  let projects = fs.readFileSync(projectsPath, 'utf8')
  const before = projects

  projects = fixConcatenatedImports(projects)
  projects = removeNamedImport(projects, '../utils/projectVariance', 'getComputedRiskLevel')
  projects = removeNamedImport(projects, '../utils/projectVariance', 'getProjectDisplayStatus')

  fs.writeFileSync(projectsPath, projects)

  if (projects !== before) {
    changed = true
    console.log('Cleaned Projects.tsx.')
  }
} else {
  console.warn('Skipped missing src/pages/Projects.tsx')
}

if (changed) {
  console.log('Unused import/function cleanup complete.')
} else {
  console.log('No cleanup changes were needed.')
}
