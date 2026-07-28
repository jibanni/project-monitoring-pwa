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
  const exactProjectMap = path.join(projectRoot, 'src/pages/ProjectMap.tsx')

  if (fs.existsSync(exactProjectMap)) {
    return exactProjectMap
  }

  const candidates = walk(path.join(projectRoot, 'src'))
    .filter((file) => {
      if (!file.endsWith('.tsx')) return false

      const base = path.basename(file).toLowerCase()
      const full = file.toLowerCase()

      if (base.includes('backup')) return false
      if (base.includes('.bak')) return false
      if (full.includes('.backup.')) return false
      if (full.includes('.bak')) return false

      return true
    })
    .map((file) => {
      const source = fs.readFileSync(file, 'utf8')
      let score = 0

      if (/MapContainer/.test(source)) score += 10
      if (/<Marker\b/.test(source)) score += 10
      if (/react-leaflet/.test(source)) score += 8
      if (/Popup/.test(source)) score += 6
      if (/ProjectMap|GIS|Map|leaflet|marker/i.test(path.basename(file))) score += 6
      if (/displayedProjects\.map|project\.displayLatitude|project\.displayLongitude/.test(source)) score += 8

      return { file, score }
    })
    .filter((item) => item.score >= 28)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.file ?? null
}

function findTagEnd(source, tagStart) {
  let quote = null
  let braceDepth = 0

  for (let i = tagStart; i < source.length; i += 1) {
    const char = source[i]
    const previous = source[i - 1]

    if (quote) {
      if (char === quote && previous !== '\\') quote = null
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
    const previous = tag[i - 1]

    if (quote) {
      if (char === quote && previous !== '\\') quote = null
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

function addProp(tag, prop) {
  const name = prop.split('=')[0].trim()

  if (new RegExp(`\\b${name}\\b`).test(tag)) return tag

  return tag.replace(/>$/, `\n                  ${prop}>`)
}

function addMarkerProp(tag, prop) {
  const name = prop.split('=')[0].trim()

  if (new RegExp(`\\b${name}\\b`).test(tag)) return tag

  return tag.replace(/>$/, `\n                        ${prop}>`)
}

function addPopupProp(tag, prop) {
  const name = prop.split('=')[0].trim()

  if (new RegExp(`\\b${name}\\b`).test(tag)) return tag

  return tag.replace(/>$/, `\n                          ${prop}>`)
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

function insertReliableMarkerHelper(source) {
  if (source.includes('pms10ReliableMarkerHandlers')) return source

  const helper = `
const pms10ReliableMarkerHandlers: any = {
  click: (event: any) => {
    const originalEvent = event?.originalEvent

    originalEvent?.preventDefault?.()
    originalEvent?.stopPropagation?.()

    const marker = event?.target

    window.requestAnimationFrame(() => {
      marker?.openPopup?.()
    })
  },
}

const pms10MarkerIconCache = new Map<string, L.DivIcon>()

`

  const importBlockMatch = source.match(/^import[\s\S]*?(?=\n(?:const|type|function|export|interface)\b)/)

  if (importBlockMatch?.index === 0) {
    const insertAt = importBlockMatch[0].length
    return source.slice(0, insertAt) + '\n' + helper + source.slice(insertAt)
  }

  return helper + source
}

function removeTooltipImport(source) {
  return source.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]react-leaflet['"]/m,
    (full, imports) => {
      const names = imports
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => item !== 'Tooltip')

      return `import {\n  ${names.join(',\n  ')},\n} from 'react-leaflet'`
    },
  )
}

function removeTooltipBlocks(source) {
  return source.replace(/\n\s*<Tooltip\b[\s\S]*?<\/Tooltip>\s*/g, '\n')
}

function patchMapContainer(tag) {
  let output = tag

  output = addProp(output, 'closePopupOnClick={false}')
  output = addProp(output, 'zoomAnimation={false}')
  output = addProp(output, 'fadeAnimation={false}')
  output = addProp(output, 'markerZoomAnimation={false}')

  return output
}

function patchMarker(tag) {
  let output = tag

  output = removeProp(output, 'eventHandlers')
  output = removeProp(output, 'bubblingMouseEvents')
  output = removeProp(output, 'riseOnHover')

  // Keep marker instance stable and make real marker tap the only detail trigger.
  output = addMarkerProp(output, 'eventHandlers={pms10ReliableMarkerHandlers}')
  output = addMarkerProp(output, 'bubblingMouseEvents={false}')
  output = addMarkerProp(output, 'riseOnHover')

  return output
}

function patchPopup(tag) {
  let output = tag

  output = removeProp(output, 'autoPan')
  output = removeProp(output, 'closeOnClick')
  output = removeProp(output, 'keepInView')
  output = removeProp(output, 'autoClose')

  // Prevent the map from jumping/panning on tap. The popup is compact, so clipping is unlikely.
  output = addPopupProp(output, 'autoPan={false}')
  output = addPopupProp(output, 'closeOnClick={false}')
  output = addPopupProp(output, 'autoClose={false}')
  output = addPopupProp(output, 'keepInView={false}')

  return output
}

function patchMarkerIconCache(source) {
  let output = source

  // Replace the divIcon creation block inside createProjectMarker with a cached version.
  const pattern = /function createProjectMarker\(project: MapProject\) \{[\s\S]*?\n\}/
  const replacement = `function createProjectMarker(project: MapProject) {
  const risk = getComputedRiskLevel(project).toLowerCase()

  let markerClass = 'pm-marker-neutral'

  if (risk.includes('low')) markerClass = 'pm-marker-low'
  if (risk.includes('moderate')) markerClass = 'pm-marker-moderate'
  if (risk.includes('high')) markerClass = 'pm-marker-high'

  const cachedIcon = pms10MarkerIconCache.get(markerClass)

  if (cachedIcon) return cachedIcon

  const icon = L.divIcon({
    className: 'pm-marker-wrapper pm-marker-hitbox',
    html: \`
      <div class="pm-marker \${markerClass}">
        <span></span>
      </div>
    \`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
  })

  pms10MarkerIconCache.set(markerClass, icon)

  return icon
}`

  if (!pattern.test(output)) {
    console.warn('Could not replace createProjectMarker(). Leaving existing marker icon function unchanged.')
    return output
  }

  return output.replace(pattern, replacement)
}

function patchMarkerKey(source) {
  return source.replace(
    /key=\{`\$\{project\.id\}-\$\{project\.displayLatitude\}-\$\{project\.displayLongitude\}-\$\{project\.coordinateSource\}-\$\{project\.coordinateDate \|\| ''\}`\}/g,
    'key={project.id}',
  )
}

function patchMapFile() {
  const mapFile = findMapFile()

  if (!mapFile) {
    fail('Could not find ProjectMap/GIS React Leaflet file.')
  }

  backup(mapFile, 'marker-popup-reliable-fix')

  let source = fs.readFileSync(mapFile, 'utf8')

  source = removePreviousMapHelpers(source)
  source = removeTooltipBlocks(source)
  source = removeTooltipImport(source)
  source = insertReliableMarkerHelper(source)
  source = patchMarkerIconCache(source)
  source = patchMarkerKey(source)

  let patched = patchTags(source, 'MapContainer', patchMapContainer)
  source = patched.source
  console.log(`Patched ${patched.count} MapContainer tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  patched = patchTags(source, 'Marker', patchMarker)
  source = patched.source
  console.log(`Patched ${patched.count} Marker tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  patched = patchTags(source, 'Popup', patchPopup)
  source = patched.source
  console.log(`Patched ${patched.count} Popup tag(s) in ${path.relative(projectRoot, mapFile)}.`)

  fs.writeFileSync(mapFile, source)
  console.log(`Updated ${path.relative(projectRoot, mapFile)}.`)
}

function findCssFile() {
  const preferred = [
    path.join(projectRoot, 'src/styles/projectMap.css'),
    path.join(projectRoot, 'src/styles/gis.css'),
    path.join(projectRoot, 'src/styles/map.css'),
    path.join(projectRoot, 'src/styles/layout.css'),
  ]

  for (const file of preferred) {
    if (fs.existsSync(file)) return file
  }

  return walk(path.join(projectRoot, 'src')).find((file) => file.endsWith('.css')) ?? null
}

function patchCss() {
  const cssFile = findCssFile()

  if (!cssFile) {
    fail('Could not find a map CSS file.')
  }

  backup(cssFile, 'marker-popup-reliable-fix')

  let css = fs.readFileSync(cssFile, 'utf8')

  const oldMarkers = [
    'PMS10 MAP LABEL CLICK AND FLICKER FIX',
    'PMS10 MAP POPUP STABLE LABEL FIX',
    'PMS10 MAP MARKER GHOST TAP RESET FIX',
    'PMS10 MAP MARKER POPUP RELIABLE FIX',
  ]

  for (const marker of oldMarkers) {
    css = removeCssBlock(css, marker)
  }

  css += `
/* =========================
   PMS10 MAP MARKER POPUP RELIABLE FIX
   Real marker tap opens popup; tooltips are removed to avoid ghost labels.
========================= */

/* Larger reliable tap target, same clean visual marker */
.pm-marker-wrapper.pm-marker-hitbox {
  background: transparent !important;
  border: 0 !important;
}

.pm-marker-wrapper.pm-marker-hitbox,
.pm-marker-hitbox .pm-marker {
  width: 44px !important;
  height: 44px !important;
}

.pm-marker-hitbox .pm-marker span {
  inset: 6px !important;
}

.pm-marker-hitbox .pm-marker span::after {
  inset: 8px !important;
}

/* No interactive project-name tooltip. Tooltip labels were causing the "other mark/label" behavior. */
.leaflet-tooltip.pms10-map-label-readonly,
.pms10-map-label-readonly,
.leaflet-tooltip.pms10-map-project-label,
.pms10-map-project-label,
.leaflet-tooltip.pms10-map-project-label-fixed,
.pms10-map-project-label-fixed {
  pointer-events: none !important;
  display: none !important;
}

/* Keep Leaflet transform positioning intact. Never override transform on markers/tooltips. */
.leaflet-marker-icon,
.leaflet-marker-shadow,
.leaflet-popup,
.leaflet-pane,
.leaflet-map-pane,
.leaflet-tile-pane,
.leaflet-marker-pane,
.leaflet-popup-pane {
  backface-visibility: hidden !important;
  -webkit-backface-visibility: hidden !important;
}

.leaflet-marker-icon {
  cursor: pointer !important;
  touch-action: manipulation !important;
  -webkit-tap-highlight-color: transparent !important;
}

.leaflet-container,
.leaflet-container * {
  -webkit-tap-highlight-color: transparent !important;
}

/* Reduce animation flicker without changing map/marker position transforms */
.leaflet-fade-anim .leaflet-tile,
.leaflet-fade-anim .leaflet-popup,
.leaflet-zoom-animated {
  transition-duration: 0ms !important;
  animation-duration: 0ms !important;
}

/* On phone, reduce the floating controls so they block fewer markers. */
@media (max-width: 760px) {
  .pm-map-floating-actions {
    right: max(6px, env(safe-area-inset-right, 0px)) !important;
    gap: 8px !important;
    pointer-events: none !important;
  }

  .pm-map-floating-actions .pm-map-fab,
  .pm-map-fab {
    width: 46px !important;
    height: 46px !important;
    min-width: 46px !important;
    min-height: 46px !important;
    pointer-events: auto !important;
  }

  .pm-map-fab svg {
    width: 20px !important;
    height: 20px !important;
  }
}

@media (max-width: 430px) {
  .pm-map-floating-actions {
    right: max(4px, env(safe-area-inset-right, 0px)) !important;
    bottom: calc(142px + env(safe-area-inset-bottom, 0px)) !important;
  }

  .pm-map-floating-actions .pm-map-fab,
  .pm-map-fab {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
  }
}
`

  fs.writeFileSync(cssFile, css)
  console.log(`Updated ${path.relative(projectRoot, cssFile)}.`)
}

patchMapFile()
patchCss()

console.log('PMS10 map marker popup reliable fix applied.')
console.log('Tooltips are removed; tapping the real marker now opens the project details popup.')
