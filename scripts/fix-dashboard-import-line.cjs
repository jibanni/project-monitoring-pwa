const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/Dashboard.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

// Fix the specific broken line:
// } from '../utils/projectVariance'import { getPmsProjectStatus...
const beforeBroken = code
code = code
  .replace(/(['"]\.\.\/utils\/projectVariance['"])\s*import\s+\{/g, "$1\nimport {")
  .replace(/(['"]\.\.\/utils\/projectStatus['"])\s*import\s+\{/g, "$1\nimport {")
  .replace(/(['"]\.\.\/utils\/[^'"]+['"])\s*import\s+/g, "$1\nimport ")

if (code !== beforeBroken) {
  changed = true
  console.log('Fixed concatenated import line.')
}

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

// The dashboard now uses getPmsRiskLevel, so getComputedRiskLevel is no longer needed.
code = removeNamedImport(code, '../utils/projectVariance', 'getComputedRiskLevel')

// Ensure projectStatus import exists and appears on its own line.
if (!code.includes("from '../utils/projectStatus'") && !code.includes('from "../utils/projectStatus"')) {
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

  const importLine = "import { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'"

  if (insertAt >= 0) {
    lines.splice(insertAt + 1, 0, importLine)
    code = lines.join('\n')
  } else {
    code = importLine + '\n' + code
  }

  changed = true
  console.log('Added projectStatus import.')
}

// Remove duplicate projectStatus import lines if any.
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
  console.log('Dashboard import-line hotfix applied.')
} else {
  console.log('No import-line changes were needed.')
}
