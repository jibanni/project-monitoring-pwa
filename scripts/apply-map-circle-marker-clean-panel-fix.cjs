const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const packageRoot = __dirname ? path.resolve(__dirname, '..') : projectRoot

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath) && fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function removeCssBlock(css, marker) {
  let output = css
  let index = output.indexOf(marker)

  while (index >= 0) {
    const start = output.lastIndexOf('/*', index)
    const safeStart = start >= 0 ? start : index
    const next = output.indexOf('/* =========================', index + marker.length)
    output = next >= 0 ? output.slice(0, safeStart) + output.slice(next) : output.slice(0, safeStart)
    index = output.indexOf(marker)
  }

  return output
}

const replacements = [
  ['src/pages/ProjectMap.tsx', 'ProjectMap.tsx.map-circle-marker-clean-panel.bak'],
  ['src/styles/projectMap.css', 'projectMap.css.map-circle-marker-clean-panel.bak'],
]

for (const [relativePath, suffix] of replacements) {
  const sourcePath = path.join(packageRoot, relativePath)
  const targetPath = path.join(projectRoot, relativePath)

  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing patch file: ${relativePath}`)
    process.exit(1)
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`Missing project file: ${relativePath}`)
    process.exit(1)
  }

  backup(targetPath, suffix)
  fs.copyFileSync(sourcePath, targetPath)
  console.log(`Replaced ${relativePath}`)
}

// Clean map-related CSS blocks that earlier patches may have appended to layout.css.
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')
if (fs.existsSync(layoutCssPath)) {
  backup(layoutCssPath, 'layout.css.map-circle-marker-clean-panel.bak')

  const markers = [
    'PMS10 MAP LABEL CLICK AND FLICKER FIX',
    'PMS10 MAP POPUP STABLE LABEL FIX',
    'PMS10 MAP MARKER GHOST TAP RESET FIX',
    'PMS10 MAP FINAL MARKER PANEL FIX',
  ]

  let layoutCss = fs.readFileSync(layoutCssPath, 'utf8')
  for (const marker of markers) {
    layoutCss = removeCssBlock(layoutCss, marker)
  }

  fs.writeFileSync(layoutCssPath, layoutCss)
  console.log('Cleaned old map patch blocks from src/styles/layout.css')
}

console.log('Applied PMS10 circle-marker clean map panel fix.')
