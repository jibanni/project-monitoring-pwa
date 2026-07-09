const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/Projects.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

// Fix any concatenated import first.
code = code
  .replace(/(['"]\.\.\/utils\/projectVariance['"])\s*import\s+/g, "$1\nimport ")
  .replace(/(['"]\.\.\/utils\/projectStatus['"])\s*import\s+/g, "$1\nimport ")
  .replace(/(['"]\.\.\/utils\/aorAccess['"])\s*import\s+/g, "$1\nimport ")
  .replace(/(['"]\.\.\/utils\/[^'"]+['"])\s*import\s+/g, "$1\nimport ")

const lines = code.split('\n')
const output = []

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i]

  if (!line.trim().startsWith('import ')) {
    output.push(line)
    continue
  }

  const block = [line]
  let j = i

  while (
    j + 1 < lines.length &&
    !block.join('\n').match(/from\s+['"][^'"]+['"]\s*;?\s*$/)
  ) {
    j += 1
    block.push(lines[j])
  }

  const blockText = block.join('\n')

  if (
    blockText.includes("from '../utils/projectVariance'") ||
    blockText.includes('from "../utils/projectVariance"')
  ) {
    const moduleQuote = blockText.includes("from '../utils/projectVariance'")
      ? "'../utils/projectVariance'"
      : '"../utils/projectVariance"'

    const namesTextMatch = blockText.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\.\/utils\/projectVariance['"]/)

    if (namesTextMatch) {
      const names = namesTextMatch[1]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((name) => name !== 'getComputedRiskLevel')
        .filter((name) => name !== 'getProjectDisplayStatus')

      if (names.length === 0) {
        changed = true
        i = j
        console.log('Removed whole projectVariance import.')
        continue
      }

      const replacement =
        names.length === 1
          ? `import { ${names[0]} } from ${moduleQuote}`
          : `import {\n  ${names.join(',\n  ')},\n} from ${moduleQuote}`

      output.push(replacement)
      changed = true
      i = j
      console.log('Removed getComputedRiskLevel/getProjectDisplayStatus from projectVariance import.')
      continue
    }
  }

  output.push(...block)
  i = j
}

code = output.join('\n')

// Extra safety: remove standalone lines if a malformed import remains.
code = code
  .replace(/^\s*getComputedRiskLevel,\s*\n/gm, '')
  .replace(/^\s*getProjectDisplayStatus,\s*\n/gm, '')

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Projects.tsx projectVariance import cleanup applied.')
} else {
  console.log('No projectVariance import cleanup was needed.')
}
