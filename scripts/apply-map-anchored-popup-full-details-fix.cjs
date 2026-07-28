const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const patchRoot = __dirname ? path.resolve(__dirname, '..') : process.cwd()

const replacements = [
  {
    source: path.join(patchRoot, 'files/src/pages/ProjectMap.tsx'),
    target: path.join(projectRoot, 'src/pages/ProjectMap.tsx'),
  },
  {
    source: path.join(patchRoot, 'files/src/styles/projectMap.css'),
    target: path.join(projectRoot, 'src/styles/projectMap.css'),
  },
]

function fail(message) {
  console.error(message)
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

function removeCssBlock(css, marker) {
  let output = css
  let index = output.indexOf(marker)

  while (index >= 0) {
    const start = output.lastIndexOf('/*', index)
    const safeStart = start >= 0 ? start : index
    const next = output.indexOf('/* =========================', index + marker.length)

    output = next >= 0
      ? output.slice(0, safeStart) + output.slice(next)
      : output.slice(0, safeStart)

    index = output.indexOf(marker)
  }

  return output
}

for (const item of replacements) {
  if (!fs.existsSync(item.source)) {
    fail(`Missing patch file: ${path.relative(patchRoot, item.source)}`)
  }

  if (!fs.existsSync(item.target)) {
    fail(`Missing target file: ${path.relative(projectRoot, item.target)}`)
  }

  backup(item.target, 'anchored-popup-full-details-fix')
  fs.copyFileSync(item.source, item.target)

  console.log(`Updated ${path.relative(projectRoot, item.target)}`)
}

// Remove old experimental map CSS blocks that may still be in layout.css.
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (fs.existsSync(layoutCssPath)) {
  backup(layoutCssPath, 'anchored-popup-full-details-fix')

  let layoutCss = fs.readFileSync(layoutCssPath, 'utf8')

  const oldMarkers = [
    'PMS10 MAP LABEL CLICK AND FLICKER FIX',
    'PMS10 MAP POPUP STABLE LABEL FIX',
    'PMS10 MAP MARKER GHOST TAP RESET FIX',
    'PMS10 MAP FINAL MARKER PANEL FIX',
    'PMS10 MAP ANCHORED POPUP FINAL FIX',
  ]

  for (const marker of oldMarkers) {
    layoutCss = removeCssBlock(layoutCss, marker)
  }

  fs.writeFileSync(layoutCssPath, layoutCss)
  console.log('Cleaned old map experiment blocks from src/styles/layout.css')
}

console.log('')
console.log('PMS10 map anchored popup full details fix applied.')
console.log('The map now uses CircleMarker + anchored Leaflet Popup, with no Tooltip labels and no fixed bottom/top panel.')
