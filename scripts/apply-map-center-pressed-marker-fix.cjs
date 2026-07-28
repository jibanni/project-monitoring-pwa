const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const mapPath = path.join(projectRoot, 'src/pages/ProjectMap.tsx')
const cssPath = path.join(projectRoot, 'src/styles/projectMap.css')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(mapPath)) fail('Missing file: src/pages/ProjectMap.tsx')

function backup(filePath, suffix) {
  if (!fs.existsSync(filePath)) return

  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
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

backup(mapPath, 'center-pressed-marker-fix')

let source = fs.readFileSync(mapPath, 'utf8')

const helper = `function pms10CenterPressedMapMarker(event: any) {
  const layer = event?.target
  const map = layer?._map as L.Map | undefined
  const latLng = layer?.getLatLng?.() ?? event?.latlng

  if (!map || !latLng) return

  const centerMarkerWithPopup = () => {
    try {
      map.invalidateSize({ pan: false })

      const zoom = map.getZoom()
      const mapSize = map.getSize()
      const markerPoint = map.project(latLng, zoom)

      /*
        Put the selected marker slightly below the map center.
        This centers the marker + popup together so the popup is not cut off.
      */
      const verticalOffset = Math.min(Math.max(mapSize.y * 0.12, 46), 88)
      const targetPoint = markerPoint.subtract([0, verticalOffset])
      const targetLatLng = map.unproject(targetPoint, zoom)

      map.panTo(targetLatLng, {
        animate: true,
        duration: 0.25,
        easeLinearity: 0.25,
      })
    } catch {
      // Keep marker click working even if the map is not ready.
    }
  }

  centerMarkerWithPopup()
  window.setTimeout(centerMarkerWithPopup, 80)
}
`

if (!source.includes('function pms10CenterPressedMapMarker')) {
  const marker = 'function getProjectMarkerColor'
  const index = source.indexOf(marker)

  if (index >= 0) {
    source = `${source.slice(0, index)}${helper}\n${source.slice(index)}`
  } else {
    const typeIndex = source.indexOf('type ProjectRecord')
    if (typeIndex >= 0) {
      source = `${source.slice(0, typeIndex)}${helper}\n${source.slice(typeIndex)}`
    } else {
      source = `${helper}\n${source}`
    }
  }
}

// Patch every CircleMarker used for project markers.
const patchedCircleMarkers = patchTags(source, 'CircleMarker', (tag) => {
  if (!/center=\{\s*\[/.test(tag)) return tag

  let output = tag

  output = removeProp(output, 'eventHandlers')
  output = removeProp(output, 'bubblingMouseEvents')

  output = output.replace(/>$/, `
                        bubblingMouseEvents={false}
                        eventHandlers={{
                          click: pms10CenterPressedMapMarker,
                          popupopen: pms10CenterPressedMapMarker,
                        }}>`)

  return output
})

source = patchedCircleMarkers.source

// Keep the popup close to marker, but let our custom pan handle visibility.
const patchedPopups = patchTags(source, 'Popup', (tag) => {
  if (!tag.includes('pm-map-project-popup')) return tag

  let output = tag

  output = output.replace(/autoPan=\{true\}/g, 'autoPan={false}')
  output = output.replace(/keepInView=\{true\}/g, 'keepInView={false}')
  output = output.replace(/autoClose=\{false\}/g, 'autoClose={true}')

  if (!/\bautoClose=/.test(output)) {
    output = output.replace(/>$/, `\n                          autoClose={true}>`)
  }

  if (!/\bautoPan=/.test(output)) {
    output = output.replace(/>$/, `\n                          autoPan={false}>`)
  }

  if (!/\bkeepInView=/.test(output)) {
    output = output.replace(/>$/, `\n                          keepInView={false}>`)
  }

  // Keep pointer close to marker.
  if (/offset=\{/.test(output)) {
    output = output.replace(/offset=\{\[\s*0\s*,\s*-?\d+\s*\]\}/g, 'offset={[0, -1]}')
  } else {
    output = output.replace(/>$/, `\n                          offset={[0, -1]}>`)
  }

  return output
})

source = patchedPopups.source

fs.writeFileSync(mapPath, source)

console.log(`Patched ${patchedCircleMarkers.count} CircleMarker tag(s).`)
console.log(`Patched ${patchedPopups.count} Popup tag(s).`)

if (fs.existsSync(cssPath)) {
  backup(cssPath, 'center-pressed-marker-fix')

  let css = fs.readFileSync(cssPath, 'utf8')
  const marker = 'PMS10 MAP CENTER PRESSED MARKER FIX'
  css = removeCssBlock(css, marker)

  css += `
/* =========================
   PMS10 MAP CENTER PRESSED MARKER FIX
   Marker tap recenters map so the anchored popup is not truncated.
========================= */

/* Keep popup compact and close to marker after the map recenters. */
.pm-map-shell .leaflet-popup.pm-map-project-popup {
  margin-bottom: 1px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-tip-container {
  margin-top: -1px !important;
}

.pm-map-shell .leaflet-popup.pm-map-project-popup .leaflet-popup-tip {
  width: 12px !important;
  height: 12px !important;
  margin-top: -6px !important;
}

/* Keep the marker/popup interaction responsive after auto-pan. */
.pm-map-shell .leaflet-interactive {
  cursor: pointer !important;
  touch-action: manipulation !important;
}

.pm-map-shell .leaflet-popup,
.pm-map-shell .leaflet-popup-content-wrapper,
.pm-map-shell .leaflet-popup-tip {
  transition: none !important;
  animation: none !important;
}
`

  fs.writeFileSync(cssPath, css)
  console.log('Updated src/styles/projectMap.css.')
}

console.log('')
console.log('Applied map center pressed marker fix.')
console.log('When a marker opens a popup, the map pans so the marker and popup are centered together.')
