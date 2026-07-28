const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()

function fail(message) {
  console.error(message)
  process.exit(1)
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue
      walk(fullPath, files)
      continue
    }

    if (entry.isFile() && /\.(tsx|ts|css)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

function backup(filePath, suffix) {
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
    output = next >= 0 ? output.slice(0, safeStart) + output.slice(next) : output.slice(0, safeStart)
    index = output.indexOf(marker)
  }

  return output
}

function findMapFile() {
  const srcDir = path.join(projectRoot, 'src')
  const candidates = walk(srcDir)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => {
      const source = fs.readFileSync(file, 'utf8')
      let score = 0

      if (/MapContainer/.test(source)) score += 8
      if (/<Marker\b/.test(source)) score += 8
      if (/<Tooltip\b/.test(source)) score += 8
      if (/react-leaflet/.test(source)) score += 6
      if (/GIS|Map|leaflet|marker|tooltip/i.test(path.basename(file))) score += 4
      if (/Project/i.test(source)) score += 2

      return { file, score }
    })
    .filter((item) => item.score >= 16)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.file ?? null
}

function patchTooltipTags(source) {
  let count = 0

  const patched = source.replace(/<Tooltip\b([^>]*)>/g, (match, props) => {
    if (match.includes('pms10-label-click-fix')) return match

    let nextProps = props

    if (!/\binteractive\b/.test(nextProps)) {
      nextProps += '\n                    interactive'
    }

    if (!/\beventHandlers\s*=/.test(nextProps)) {
      nextProps += `\n                    eventHandlers={{\n                      click: (event: any) => {\n                        event?.originalEvent?.preventDefault?.()\n                        event?.originalEvent?.stopPropagation?.()\n                        event?.target?._source?.openPopup?.()\n                      },\n                    }}`
    }

    if (/\bclassName\s*=/.test(nextProps)) {
      nextProps = nextProps.replace(
        /className\s*=\s*"([^"]*)"/,
        (classMatch, classNames) => `className="${classNames} pms10-map-project-label pms10-label-click-fix"`,
      )

      nextProps = nextProps.replace(
        /className\s*=\s*'([^']*)'/,
        (classMatch, classNames) => `className='${classNames} pms10-map-project-label pms10-label-click-fix'`,
      )

      nextProps = nextProps.replace(
        /className\s*=\s*{\s*`([^`]*)`\s*}/,
        (classMatch, classNames) => `className={\`${classNames} pms10-map-project-label pms10-label-click-fix\`}`,
      )
    } else {
      nextProps += '\n                    className="pms10-map-project-label pms10-label-click-fix"'
    }

    count += 1
    return `<Tooltip${nextProps}>`
  })

  return { source: patched, count }
}

function patchMapFile() {
  const mapFile = findMapFile()

  if (!mapFile) {
    fail('Could not find the React Leaflet map file. Expected a TSX file with MapContainer, Marker, and Tooltip.')
  }

  backup(mapFile, 'map-label-click-flicker-fix')

  const before = fs.readFileSync(mapFile, 'utf8')
  const { source: after, count } = patchTooltipTags(before)

  if (count <= 0) {
    console.log(`No Tooltip tags patched in ${path.relative(projectRoot, mapFile)}. They may already be patched.`)
  } else {
    fs.writeFileSync(mapFile, after)
    console.log(`Patched ${count} Tooltip tag(s) in ${path.relative(projectRoot, mapFile)}.`)
  }
}

function findBestCssFile() {
  const preferred = [
    path.join(projectRoot, 'src/styles/gis.css'),
    path.join(projectRoot, 'src/styles/map.css'),
    path.join(projectRoot, 'src/styles/layout.css'),
    path.join(projectRoot, 'src/index.css'),
    path.join(projectRoot, 'src/App.css'),
  ]

  for (const file of preferred) {
    if (fs.existsSync(file)) return file
  }

  const cssFiles = walk(path.join(projectRoot, 'src')).filter((file) => file.endsWith('.css'))

  return cssFiles[0] ?? null
}

function patchCss() {
  const cssFile = findBestCssFile()

  if (!cssFile) {
    fail('Could not find a CSS file under src/.')
  }

  backup(cssFile, 'map-label-click-flicker-fix')

  const marker = 'PMS10 MAP LABEL CLICK AND FLICKER FIX'
  let css = fs.readFileSync(cssFile, 'utf8')
  css = removeCssBlock(css, marker)

  css += `
/* =========================
   PMS10 MAP LABEL CLICK AND FLICKER FIX
   Makes project labels clickable and reduces iOS/Safari Leaflet flicker.
========================= */

/* Project name labels on the GIS map */
.leaflet-tooltip.pms10-map-project-label,
.pms10-map-project-label {
  pointer-events: auto !important;
  cursor: pointer !important;
  touch-action: manipulation !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
  transition: none !important;
  animation: none !important;
  will-change: transform !important;
  backface-visibility: hidden !important;
  -webkit-backface-visibility: hidden !important;
  transform: translateZ(0) !important;
}

/* Prevent label hover/tap from creating visual jump/flicker */
.leaflet-tooltip.pms10-map-project-label:hover,
.leaflet-tooltip.pms10-map-project-label:active,
.leaflet-tooltip.pms10-map-project-label:focus {
  transform: translateZ(0) !important;
  filter: none !important;
}

/* Stabilize Leaflet layers on mobile Safari/Chrome */
.leaflet-container,
.leaflet-pane,
.leaflet-map-pane,
.leaflet-tile-pane,
.leaflet-overlay-pane,
.leaflet-marker-pane,
.leaflet-tooltip-pane,
.leaflet-popup-pane,
.leaflet-marker-icon,
.leaflet-tooltip,
.leaflet-popup {
  backface-visibility: hidden !important;
  -webkit-backface-visibility: hidden !important;
}

.leaflet-marker-icon,
.leaflet-tooltip,
.leaflet-popup {
  will-change: transform !important;
}

/* Keep tile transitions from flickering during taps and label clicks */
.leaflet-tile {
  transition: none !important;
  animation: none !important;
  backface-visibility: hidden !important;
  -webkit-backface-visibility: hidden !important;
}

/* Prevent accidental text selection or blue tap overlays on the map */
.leaflet-container * {
  -webkit-tap-highlight-color: transparent !important;
}
`

  fs.writeFileSync(cssFile, css)
  console.log(`Patched map label/flicker CSS in ${path.relative(projectRoot, cssFile)}.`)
}

patchMapFile()
patchCss()

console.log('Map label click + flicker fix applied.')
console.log('Clicking a project label should now open the same popup/details as clicking the marker.')
