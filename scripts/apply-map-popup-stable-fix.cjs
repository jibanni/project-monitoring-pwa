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

      if (/MapContainer/.test(source)) score += 10
      if (/<Marker\b/.test(source)) score += 9
      if (/<Tooltip\b/.test(source)) score += 9
      if (/react-leaflet/.test(source)) score += 8
      if (/GIS|Map|leaflet|marker|tooltip/i.test(path.basename(file))) score += 5
      if (/Project/i.test(source)) score += 2

      return { file, score }
    })
    .filter((item) => item.score >= 22)
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
  let braceStart = tag.indexOf('{', start)
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

function removeSimpleProp(tag, propName) {
  let output = tag
  output = output.replace(new RegExp(`\\s+${propName}\\s*=\\s*"[^"]*"`, 'g'), '')
  output = output.replace(new RegExp(`\\s+${propName}\\s*=\\s*'[^']*'`, 'g'), '')
  output = removeBraceProp(output, propName)
  output = output.replace(new RegExp(`\\s+${propName}(?=\\s|>|/)`, 'g'), '')
  return output
}

function addOrMergeClassName(tag, classToAdd) {
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

function patchTagProps(source, tagName, patcher) {
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

function addMapContainerProps(tag) {
  let output = tag
  const props = [
    'closePopupOnClick={false}',
    'zoomAnimation={false}',
    'fadeAnimation={false}',
    'markerZoomAnimation={false}',
  ]

  for (const prop of props) {
    const name = prop.split('=')[0]
    if (!new RegExp(`\\b${name}\\b`).test(output)) {
      output = output.replace(/>$/, `\n                  ${prop}>`)
    }
  }

  return output
}

function addMarkerProps(tag) {
  let output = tag

  if (!/\bbubblingMouseEvents\b/.test(output)) {
    output = output.replace(/>$/, `\n                    bubblingMouseEvents={false}>`)
  }

  return output
}

function patchTooltipTag(tag) {
  let output = tag

  // Remove prior partial handlers and unstable duplicates.
  output = removeSimpleProp(output, 'eventHandlers')
  output = removeSimpleProp(output, 'interactive')
  output = removeSimpleProp(output, 'sticky')
  output = removeSimpleProp(output, 'opacity')

  // Keep permanent if already present. Otherwise make labels stable and always tappable.
  if (!/\bpermanent\b/.test(output)) {
    output = output.replace(/>$/, `\n                    permanent>`)
  }

  output = addOrMergeClassName(output, 'pms10-map-project-label-fixed')

  output = output.replace(/>$/, `
                    interactive
                    sticky={false}
                    opacity={1}
                    eventHandlers={pms10MapStableLabelHandlers}>`)

  return output
}

function insertStableHandlers(source) {
  if (source.includes('pms10OpenMapLabelPopup')) return source

  const helper = `
const pms10OpenMapLabelPopup = (event: any) => {
  const originalEvent = event?.originalEvent

  originalEvent?.preventDefault?.()
  originalEvent?.stopPropagation?.()

  const tooltip = event?.target
  const sourceLayer =
    tooltip?._source ??
    event?.sourceTarget?._source ??
    event?.propagatedFrom?._source ??
    event?.sourceTarget

  const openSource = () => {
    try {
      sourceLayer?.fire?.('click', {
        originalEvent,
        latlng: sourceLayer?.getLatLng?.(),
      })
    } catch {
      // ignored
    }

    try {
      sourceLayer?.openPopup?.()
    } catch {
      // ignored
    }
  }

  openSource()

  // On mobile, the map click/touch handler can close the popup immediately.
  // Reopen shortly after the native tap cycle finishes.
  window.setTimeout(openSource, 50)
  window.setTimeout(openSource, 140)
}

const pms10MapStableLabelHandlers: any = {
  click: pms10OpenMapLabelPopup,
  mousedown: pms10OpenMapLabelPopup,
  touchstart: pms10OpenMapLabelPopup,
  pointerdown: pms10OpenMapLabelPopup,
}

`

  const importMatches = [...source.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm)]
  if (importMatches.length > 0) {
    const last = importMatches[importMatches.length - 1]
    const insertAt = last.index + last[0].length
    return source.slice(0, insertAt) + '\n' + helper + source.slice(insertAt)
  }

  return helper + source
}

function patchMapFile() {
  const mapFile = findMapFile()

  if (!mapFile) {
    fail('Could not find the React Leaflet GIS map file. Expected TSX file with MapContainer, Marker, Tooltip.')
  }

  backup(mapFile, 'map-popup-stable-fix')

  let source = fs.readFileSync(mapFile, 'utf8')
  source = insertStableHandlers(source)

  let patched

  patched = patchTagProps(source, 'MapContainer', addMapContainerProps)
  source = patched.source
  console.log(`Patched ${patched.count} MapContainer tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  patched = patchTagProps(source, 'Marker', addMarkerProps)
  source = patched.source
  console.log(`Patched ${patched.count} Marker tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  patched = patchTagProps(source, 'Tooltip', patchTooltipTag)
  source = patched.source
  console.log(`Patched ${patched.count} Tooltip tag(s) in ${path.relative(projectRoot, mapFile)}.`)

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

function patchCss() {
  const cssFile = findBestCssFile()

  if (!cssFile) {
    fail('Could not find a CSS file under src/.')
  }

  backup(cssFile, 'map-popup-stable-fix')

  let css = fs.readFileSync(cssFile, 'utf8')

  // Remove previous patch because it overwrote Leaflet transform positioning with translateZ(0).
  css = removeCssBlock(css, 'PMS10 MAP LABEL CLICK AND FLICKER FIX')
  css = removeCssBlock(css, 'PMS10 MAP POPUP STABLE LABEL FIX')

  css += `
/* =========================
   PMS10 MAP POPUP STABLE LABEL FIX
   Stable label taps and reduced Leaflet flicker.
========================= */

/*
  Do NOT override transform on Leaflet tooltips/markers.
  Leaflet uses transform for positioning; overriding it causes flicker/jumps.
*/

.leaflet-tooltip.pms10-map-project-label-fixed,
.pms10-map-project-label-fixed {
  pointer-events: auto !important;
  cursor: pointer !important;
  touch-action: manipulation !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
  transition: none !important;
  animation: none !important;
}

.leaflet-tooltip.pms10-map-project-label-fixed:hover,
.leaflet-tooltip.pms10-map-project-label-fixed:active,
.leaflet-tooltip.pms10-map-project-label-fixed:focus {
  filter: none !important;
  transition: none !important;
  animation: none !important;
}

/* Reduce animation-triggered flicker on mobile without breaking positioning */
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

.leaflet-zoom-animated,
.leaflet-fade-anim .leaflet-tile,
.leaflet-fade-anim .leaflet-popup,
.leaflet-fade-anim .leaflet-map-pane,
.leaflet-marker-icon,
.leaflet-tooltip,
.leaflet-popup {
  transition-duration: 0ms !important;
  animation-duration: 0ms !important;
}

.leaflet-container * {
  -webkit-tap-highlight-color: transparent !important;
}
`

  fs.writeFileSync(cssFile, css)
  console.log(`Patched CSS in ${path.relative(projectRoot, cssFile)}.`)
}

patchMapFile()
patchCss()

console.log('Stable GIS map label popup fix applied.')
console.log('This replaces the previous flicker CSS and uses multi-event tooltip handlers.')
