const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const projectsPath = path.join(projectRoot, 'src/pages/Projects.tsx')
const cssPath = path.join(projectRoot, 'src/styles/projects.css')

if (!fs.existsSync(projectsPath)) {
  console.error('Missing file: src/pages/Projects.tsx')
  process.exit(1)
}

function backup(filePath, suffix) {
  if (!fs.existsSync(filePath)) return

  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function removeFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`)
  if (start < 0) return source

  const braceStart = source.indexOf('{', start)
  if (braceStart < 0) return source

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

  if (end < 0) return source

  while (source[end] === '\n' || source[end] === '\r') {
    end += 1
  }

  console.log(`Removed function: ${functionName}`)
  return source.slice(0, start) + source.slice(end)
}

function removeCodeButtonBlock(source) {
  const marker = '{textValue(project.subaybayan_project_code) && ('
  let index = source.indexOf(marker)

  while (index >= 0) {
    const blockStart = source.lastIndexOf('\n', index)
    let parenDepth = 0
    let braceDepth = 0
    let end = -1

    for (let i = index; i < source.length; i += 1) {
      const char = source[i]

      if (char === '{') braceDepth += 1
      if (char === '}') braceDepth -= 1
      if (char === '(') parenDepth += 1
      if (char === ')') parenDepth -= 1

      if (i > index && braceDepth === 0 && parenDepth === 0) {
        end = i + 1
        break
      }
    }

    if (end < 0) {
      console.warn('Could not remove SubayBAYAN code chip block automatically.')
      break
    }

    while (source[end] === '\n' || source[end] === '\r') {
      end += 1
    }

    source = source.slice(0, blockStart) + source.slice(end)
    console.log('Removed SubayBAYAN code chip block from project row.')

    index = source.indexOf(marker)
  }

  return source
}

backup(projectsPath, 'remove-subay-code-list')

let code = fs.readFileSync(projectsPath, 'utf8')
const before = code

// Remove the project list SubayBAYAN code chip block.
code = removeCodeButtonBlock(code)

// Remove helpers added only for the project list chip.
code = removeFunction(code, 'copySubayProjectCode')
code = removeFunction(code, 'CopyIcon')

// If an empty meta-line is left, keep the program name visible and full width.
// This keeps the FY/program line without the SubayBAYAN code chip.
code = code.replace(
  /<div className="project-row-meta-line">\s*<p className="project-row-program">\{formatFundingDisplay\(project\)\}<\/p>\s*<\/div>/g,
  '<p className="project-row-program">{formatFundingDisplay(project)}</p>',
)

fs.writeFileSync(projectsPath, code)

if (code !== before) {
  console.log('Updated src/pages/Projects.tsx')
} else {
  console.log('No SubayBAYAN project list chip was found. Projects.tsx may already be clean.')
}

// CSS cleanup: hide leftover code chip class if the markup appears from cache/older code.
if (fs.existsSync(cssPath)) {
  backup(cssPath, 'remove-subay-code-list')

  let css = fs.readFileSync(cssPath, 'utf8')
  const marker = 'PMS10 REMOVE SUBAY CODE FROM PROJECT LIST'

  const oldIndex = css.indexOf(marker)
  if (oldIndex >= 0) {
    const start = css.lastIndexOf('/*', oldIndex)
    const safeStart = start >= 0 ? start : oldIndex
    const next = css.indexOf('/* =========================', oldIndex + marker.length)
    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
  }

  css += `
/* =========================
   PMS10 REMOVE SUBAY CODE FROM PROJECT LIST
   Project code is kept in Project Details, not in the registry row.
========================= */

.project-list-row .project-row-code,
.project-card-row .project-row-code,
.project-row .project-row-code {
  display: none !important;
}

.project-row-meta-line {
  gap: 0 !important;
}

.project-row-meta-line .project-row-program {
  max-width: 100% !important;
  flex: 1 1 auto !important;
}
`

  fs.writeFileSync(cssPath, css)
  console.log('Updated src/styles/projects.css')
}

console.log('SubayBAYAN code removed from Project Registry list rows.')
