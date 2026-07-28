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

function findMapFile() {
  const candidates = walk(path.join(projectRoot, 'src'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => {
      const source = fs.readFileSync(file, 'utf8')
      let score = 0

      if (/MapContainer/.test(source)) score += 10
      if (/<Marker\b/.test(source)) score += 9
      if (/<Tooltip\b/.test(source)) score += 8
      if (/react-leaflet/.test(source)) score += 8
      if (/GIS|Map|leaflet|marker|tooltip/i.test(path.basename(file))) score += 5
      if (/Project/i.test(source)) score += 2

      return { file, score }
    })
    .filter((item) => item.score >= 20)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.file ?? null
}

function findTagEnd(source, tagStart) {
  let quote = null
  let braceDepth = 0

  for (let i = tagStart; i < source.length; i += 1) {
    const char = source[i]
    const prev = source[i - 1]

    if (quote) {
      if (char === quote && prev !== '\\') quote = null
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '{') {
      braceDepth += 1
      continue
    }

    if (char === '}') {
      braceDepth -= 1
      continue
    }

    if (char === '>' && braceDepth === 0) return i
  }

  return -1
}

function removeBraceProp(tag, propName) {
  const pattern = new RegExp(`\\s+${propName}\\s*=\\s*{`, 'm')
  const match = pattern.exec(tag)

  if (!match) return tag

  const start = match.index
  const braceStart = tag.indexOf('{', start)

  let depth = 0
  let quote = null

  for (let i = braceStart; i < tag.length; i += 1) {
    const char = tag[i]
    const prev = tag[i - 1]

    if (quote) {
      if (char === quote && prev !== '\\') quote = null
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '{') depth += 1
    if (char === '}') depth -= 1

    if (depth === 0) {
      return tag.slice(0, start) + tag.slice(i + 1)
    }
  }

  return tag
}

function removeProp(tag, propName) {
  let output = tag

  output = output.replace(new RegExp(`\\s+${propName}\\s*=\\s*"[^"]*"`, 'g'), '')
  output = output.replace(new RegExp(`\\s+${propName}\\s*=\\s*'[^']*'`, 'g'), '')
  output = removeBraceProp(output, propName)
  output = output.replace(new RegExp(`\\s+${propName}(?=\\s|>|/)`, 'g'), '')

  return output
}

function addClassName(tag, classToAdd) {
  if (tag.includes(classToAdd)) return tag

  if (/className\s*=\s*"[^"]*"/.test(tag)) {
    return tag.replace(/className\s*=\s*"([^"]*)"/, (full, names) => `className="${names} ${classToAdd}"`)
  }

  if (/className\s*=\s*'[^']*'/.test(tag)) {
    return tag.replace(/className\s*=\s*'([^']*)'/, (full, names) => `className='${names} ${classToAdd}'`)
  }

  if (/className\s*=\s*{\s*`[^`]*`\s*}/.test(tag)) {
    return tag.replace(/className\s*=\s*{\s*`([^`]*)`\s*}/, (full, names) => `className={\`${names} ${classToAdd}\`}`)
  }

  return tag.replace(/>$/, `\n                    className="${classToAdd}">`)
}

function patchTags(source, tagName, patcher) {
  let result = ''
  let lastIndex = 0
  let count = 0

  const pattern = new RegExp(`<${tagName}\\b`, 'g')
  let match

  while ((match = pattern.exec(source)) !== null) {
    const start = match.index
    const end = findTagEnd(source, start)

    if (end < 0) break

    const tag = source.slice(start, end + 1)
    const patched = patcher(tag)

    result += source.slice(lastIndex, start) + patched
    lastIndex = end + 1
    pattern.lastIndex = end + 1

    if (patched !== tag) count += 1
  }

  result += source.slice(lastIndex)

  return { source: result, count }
}

function removePreviousMapHelpers(source) {
  let output = source

  output = output.replace(
    /\nconst pms10OpenMapLabelPopup[\s\S]*?\nconst pms10MapStableLabelHandlers:\s*any\s*=\s*\{[\s\S]*?\n\}\n/g,
    '\n',
  )

  output = output.replace(
    /\nconst pms10OpenMapLabelPopup[\s\S]*?\nconst pms10MapStableLabelHandlers\s*=\s*\{[\s\S]*?\n\}\n/g,
    '\n',
  )

  return output
}

function patchTooltip(tag) {
  let output = tag

  // The previous label-click approach made the tooltip an active tap target.
  // On mobile this can race with the map click cycle and cause ghost markers / missed details.
  output = removeProp(output, 'eventHandlers')
  output = removeProp(output, 'interactive')
  output = removeProp(output, 'sticky')
  output = removeProp(output, 'opacity')

  output = addClassName(output, 'pms10-map-label-readonly')

  if (!/\binteractive\s*=\s*{\s*false\s*}/.test(output)) {
    output = output.replace(/>$/, `\n                    interactive={false}>`)
  }

  return output
}

function patchMarker(tag) {
  let output = tag

  if (!/\bbubblingMouseEvents\b/.test(output)) {
    output = output.replace(/>$/, `\n                    bubblingMouseEvents={false}>`)
  }

  return output
}

function patchMapContainer(tag) {
  let output = tag

  // Keep popup open on marker tap. This helps when mobile tap also triggers map background click.
  if (!/\bclosePopupOnClick\b/.test(output)) {
    output = output.replace(/>$/, `\n                  closePopupOnClick={false}>`)
  }

  // Do not inject animation props here; those can change map behavior in some builds.
  return output
}

function patchMapFile() {
  const mapFile = findMapFile()

  if (!mapFile) {
    fail('Could not find the React Leaflet map TSX file. Expected MapContainer, Marker, Tooltip.')
  }

  backup(mapFile, 'map-marker-ghost-tap-reset-fix')

  let source = fs.readFileSync(mapFile, 'utf8')

  source = removePreviousMapHelpers(source)

  let patched

  patched = patchTags(source, 'MapContainer', patchMapContainer)
  source = patched.source
  console.log(`Patched ${patched.count} MapContainer tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  patched = patchTags(source, 'Marker', patchMarker)
  source = patched.source
  console.log(`Patched ${patched.count} Marker tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  patched = patchTags(source, 'Tooltip', patchTooltip)
  source = patched.source
  console.log(`Reset ${patched.count} Tooltip label tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  fs.writeFileSync(mapFile, source)
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

  return walk(path.join(projectRoot, 'src')).find((file) => file.endsWith('.css')) ?? null
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

function patchCss() {
  const cssFile = findBestCssFile()

  if (!cssFile) {
    fail('Could not find a CSS file under src/.')
  }

  backup(cssFile, 'map-marker-ghost-tap-reset-fix')

  let css = fs.readFileSync(cssFile, 'utf8')

  const markersToRemove = [
    'PMS10 MAP LABEL CLICK AND FLICKER FIX',
    'PMS10 MAP POPUP STABLE LABEL FIX',
    'PMS10 MAP MARKER GHOST TAP RESET FIX',
  ]

  for (const marker of markersToRemove) {
    css = removeCssBlock(css, marker)
  }

  css += `
/* =========================
   PMS10 MAP MARKER GHOST TAP RESET FIX
   Labels are display-only; marker tap is the single reliable popup trigger.
========================= */

/*
  The earlier interactive Tooltip patch caused mobile tap races:
  - tap label/marker
  - tooltip fires
  - map also receives tap
  - popup closes or a temporary/ghost marker appears elsewhere

  This reset makes project labels read-only and lets taps reach the real marker.
*/

.leaflet-tooltip.pms10-map-label-readonly,
.pms10-map-label-readonly {
  pointer-events: none !important;
  cursor: default !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
  transition: none !important;
  animation: none !important;
}

/* Do not override Leaflet transform. Leaflet needs transform for correct marker/label positions. */
.leaflet-marker-icon,
.leaflet-marker-shadow,
.leaflet-tooltip,
.leaflet-popup,
.leaflet-pane,
.leaflet-map-pane,
.leaflet-tile-pane,
.leaflet-marker-pane,
.leaflet-tooltip-pane,
.leaflet-popup-pane {
  backface-visibility: hidden !important;
  -webkit-backface-visibility: hidden !important;
}

/* Improve mobile tap reliability without creating extra visual hit objects */
.leaflet-marker-icon {
  cursor: pointer !important;
  touch-action: manipulation !important;
  -webkit-tap-highlight-color: transparent !important;
}

.leaflet-container {
  -webkit-tap-highlight-color: transparent !important;
}

.leaflet-container * {
  -webkit-tap-highlight-color: transparent !important;
}

/* Reduce repaint/fade flicker only; keep positioning transforms untouched */
.leaflet-fade-anim .leaflet-tile,
.leaflet-fade-anim .leaflet-popup,
.leaflet-zoom-animated {
  transition-duration: 0ms !important;
  animation-duration: 0ms !important;
}
`

  fs.writeFileSync(cssFile, css)
  console.log(`Patched CSS in ${path.relative(projectRoot, cssFile)}.`)
}

patchMapFile()
patchCss()

console.log('Applied marker ghost/tap reset fix.')
console.log('Labels are now display-only to stop ghost markers; tap the actual marker to open details.')
