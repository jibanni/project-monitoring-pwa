const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/ProjectUpdates.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')

if (!code.includes("import '../styles/projectUpdatesModalFix.css'")) {
  if (code.includes("import '../styles/projectUpdates.css'")) {
    code = code.replace(
      "import '../styles/projectUpdates.css'",
      "import '../styles/projectUpdates.css'\nimport '../styles/projectUpdatesModalFix.css'",
    )
  } else {
    const lastImportMatch = [...code.matchAll(/^import .*$/gm)].pop()
    if (!lastImportMatch) {
      console.error('Could not find imports in ProjectUpdates.tsx')
      process.exit(1)
    }

    const insertIndex = lastImportMatch.index + lastImportMatch[0].length
    code =
      code.slice(0, insertIndex) +
      "\nimport '../styles/projectUpdatesModalFix.css'" +
      code.slice(insertIndex)
  }

  console.log('Added projectUpdatesModalFix.css import.')
} else {
  console.log('projectUpdatesModalFix.css import already exists.')
}

fs.writeFileSync(filePath, code)
