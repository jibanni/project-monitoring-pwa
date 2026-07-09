const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/Projects.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

// Fix malformed concatenated imports such as:
// } from '../utils/projectVariance'import { ... } from '../utils/aorAccess'
const before = code

code = code
  .replace(/(['"]\.\.\/utils\/projectVariance['"])\s*import\s+/g, "$1\nimport ")
  .replace(/(['"]\.\.\/utils\/projectStatus['"])\s*import\s+/g, "$1\nimport ")
  .replace(/(['"]\.\.\/utils\/aorAccess['"])\s*import\s+/g, "$1\nimport ")
  .replace(/(['"]\.\.\/utils\/[^'"]+['"])\s*import\s+/g, "$1\nimport ")

if (code !== before) {
  changed = true
  console.log('Fixed concatenated import line(s) in Projects.tsx.')
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

  if (names.length === originalNames.length) {
    return source
  }

  changed = true
  console.log(`Removed ${nameToRemove} from ${modulePath} import.`)

  if (names.length === 0) {
    return source.replace(pattern, '')
  }

  const replacement =
    names.length === 1
      ? `import { ${names[0]} } from '${modulePath}'`
      : `import {\n  ${names.join(',\n  ')},\n} from '${modulePath}'`

  return source.replace(pattern, replacement)
}

// These are now replaced by projectStatus helpers. Remove old imports if left unused.
code = removeNamedImport(code, '../utils/projectVariance', 'getComputedRiskLevel')
code = removeNamedImport(code, '../utils/projectVariance', 'getProjectDisplayStatus')

// Ensure projectStatus import is present once.
const projectStatusImport = "import { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'"
const hasProjectStatusImport =
  code.includes("from '../utils/projectStatus'") ||
  code.includes('from "../utils/projectStatus"')

if (!hasProjectStatusImport) {
  const lines = code.split('\n')
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
    lines.splice(insertAt + 1, 0, projectStatusImport)
    code = lines.join('\n')
  } else {
    code = `${projectStatusImport}\n${code}`
  }

  changed = true
  console.log('Added projectStatus import.')
}

// Remove duplicate projectStatus imports if the previous patch duplicated them.
const lines = code.split('\n')
const output = []
let seenProjectStatusImport = false

for (const line of lines) {
  if (line.includes("from '../utils/projectStatus'") || line.includes('from "../utils/projectStatus"')) {
    if (seenProjectStatusImport) {
      changed = true
      console.log('Removed duplicate projectStatus import.')
      continue
    }

    seenProjectStatusImport = true
  }

  output.push(line)
}

code = output.join('\n')

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Projects.tsx import-line hotfix applied.')
} else {
  console.log('No import-line changes were needed.')
}
