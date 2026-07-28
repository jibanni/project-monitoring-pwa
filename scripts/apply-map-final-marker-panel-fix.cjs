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

    if (entry.isFile() && /\.(tsx|ts|css)$/.test(entry.name)) files.push(fullPath)
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

function findFunctionRange(text, functionName) {
  const start = text.indexOf(`function ${functionName}`)
  if (start < 0) return null

  const openBrace = text.indexOf('{', start)
  if (openBrace < 0) return null

  let depth = 0
  let quote = null

  for (let i = openBrace; i < text.length; i += 1) {
    const char = text[i]
    const prev = text[i - 1]

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
      let end = i + 1
      while (end < text.length && /\s/.test(text[end])) end += 1
      return { start, end }
    }
  }

  return null
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

    if (depth === 0) return tag.slice(0, start) + tag.slice(i + 1)
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

function findMapFile() {
  const direct = path.join(projectRoot, 'src/pages/ProjectMap.tsx')
  if (fs.existsSync(direct)) return direct

  const candidates = walk(path.join(projectRoot, 'src'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => {
      const source = fs.readFileSync(file, 'utf8')
      let score = 0

      if (/MapContainer/.test(source)) score += 10
      if (/<Marker\b/.test(source)) score += 9
      if (/react-leaflet/.test(source)) score += 8
      if (/ProjectMap|GIS|Map|leaflet|marker/i.test(path.basename(file))) score += 5

      return { file, score }
    })
    .filter((item) => item.score >= 20)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.file ?? null
}

function patchMapFile() {
  const mapFile = findMapFile()
  if (!mapFile) fail('Could not find ProjectMap.tsx / React Leaflet map file.')

  backup(mapFile, 'final-marker-panel-fix')

  let source = fs.readFileSync(mapFile, 'utf8')

  // Remove Tooltip/Popup imports; this patch uses a stable React details panel instead.
  source = source
    .replace(/,\s*Tooltip/g, '')
    .replace(/Tooltip,\s*/g, '')
    .replace(/,\s*Popup/g, '')
    .replace(/Popup,\s*/g, '')

  // Remove previous map helper blocks from earlier patches.
  source = source.replace(/\nconst pms10OpenMapLabelPopup[\s\S]*?const pms10MapStableLabelHandlers(?:\s*:\s*any)?\s*=\s*\{[\s\S]*?\n\}\n/g, '\n')

  // Remove all Leaflet tooltips and popups from markers to stop ghost labels/markers.
  source = source.replace(/\s*<Tooltip\b[\s\S]*?<\/Tooltip>\n?/g, '')
  source = source.replace(/\s*<Popup\b[\s\S]*?<\/Popup>\n?/g, '')

  const markerFunction = `const projectMarkerIconCache = new Map<string, L.DivIcon>()

function createProjectMarker(project: MapProject) {
  const risk = getComputedRiskLevel(project).toLowerCase()

  let markerClass = 'pm-marker-neutral'

  if (risk.includes('low')) markerClass = 'pm-marker-low'
  if (risk.includes('moderate') || risk.includes('medium')) markerClass = 'pm-marker-moderate'
  if (risk.includes('high') || risk.includes('critical')) markerClass = 'pm-marker-high'

  const cachedIcon = projectMarkerIconCache.get(markerClass)
  if (cachedIcon) return cachedIcon

  const icon = L.divIcon({
    className: 'pm-marker-wrapper',
    html:
      '<div class="pm-marker-touch-target">' +
      '<div class="pm-marker ' + markerClass + '"><span></span></div>' +
      '</div>',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })

  projectMarkerIconCache.set(markerClass, icon)
  return icon
}
`

  const range = findFunctionRange(source, 'createProjectMarker')
  if (!range) fail('Could not find createProjectMarker function in map file.')

  source = source.slice(0, range.start) + markerFunction + source.slice(range.end)

  if (!source.includes("const [activeMapProjectId, setActiveMapProjectId] = useState('')")) {
    source = source.replace(
      "  const [mapLayer, setMapLayer] = useState<MapLayer>('street')",
      "  const [mapLayer, setMapLayer] = useState<MapLayer>('street')\n  const [activeMapProjectId, setActiveMapProjectId] = useState('')",
    )
  }

  if (!source.includes('const activeMapProject = useMemo(() => {')) {
    const insertAfter = `  const coordinateIssueProjects = useMemo(() => {
    return filteredProjects.filter(
      (project) => project.displayLatitude === null || project.displayLongitude === null,
    )
  }, [filteredProjects])
`

    const addition = `
  const activeMapProject = useMemo(() => {
    if (!activeMapProjectId) return null
    return displayedProjects.find((project) => project.id === activeMapProjectId) || null
  }, [activeMapProjectId, displayedProjects])

  const activeMapVarianceInfo = useMemo(() => {
    return activeMapProject ? getTargetPhysicalInfo(activeMapProject) : null
  }, [activeMapProject])

  useEffect(() => {
    if (!activeMapProjectId) return

    const stillDisplayed = displayedProjects.some((project) => project.id === activeMapProjectId)
    if (!stillDisplayed) setActiveMapProjectId('')
  }, [activeMapProjectId, displayedProjects])
`

    if (!source.includes(insertAfter)) {
      fail('Could not find coordinateIssueProjects block for active map project insertion.')
    }

    source = source.replace(insertAfter, insertAfter + addition)
  }

  if (!source.includes("setActiveMapProjectId('')\n    setSearchTerm('')")) {
    source = source.replace(
      "  function clearFilters() {\n    setSearchTerm('')",
      "  function clearFilters() {\n    setActiveMapProjectId('')\n    setSearchTerm('')",
    )
  }

  source = patchTags(source, 'MapContainer', (tag) => {
    let output = tag

    if (!/\bclosePopupOnClick\b/.test(output)) {
      output = output.replace(/>$/, `\n                  closePopupOnClick={false}>`)
    }

    return output
  }).source

  source = patchTags(source, 'Marker', (tag) => {
    if (!tag.includes('createProjectMarker(project)')) return tag

    let output = tag

    output = removeProp(output, 'key')
    output = removeProp(output, 'eventHandlers')
    output = removeProp(output, 'bubblingMouseEvents')
    output = removeProp(output, 'riseOnHover')
    output = removeProp(output, 'zIndexOffset')

    output = output.replace(/<Marker\b/, '<Marker\n                        key={project.id}')

    output = output.replace(/>$/, `
                        bubblingMouseEvents={false}
                        riseOnHover
                        zIndexOffset={activeMapProjectId === project.id ? 1000 : 0}
                        eventHandlers={{
                          click: (event) => {
                            event?.originalEvent?.preventDefault?.()
                            event?.originalEvent?.stopPropagation?.()
                            setActiveMapProjectId(project.id)
                          },
                          touchend: (event) => {
                            event?.originalEvent?.preventDefault?.()
                            event?.originalEvent?.stopPropagation?.()
                            setActiveMapProjectId(project.id)
                          },
                        }}>`)

    return output
  }).source

  // Remove the now-unused variance variable from the marker render loop only.
  source = source.replace(
    /\n\s*const varianceInfo = getTargetPhysicalInfo\(project\)\n\n\s*return \(\n\s*<Marker/,
    '\n\n                    return (\n                      <Marker',
  )

  const panel = `

                  {activeMapProject && activeMapVarianceInfo ? (
                    <div className="pm-map-active-project-panel" role="dialog" aria-label="Selected project details">
                      <button
                        type="button"
                        className="pm-map-active-project-close"
                        onClick={() => setActiveMapProjectId('')}
                        aria-label="Close selected project details"
                      >
                        ×
                      </button>

                      <h3>{activeMapProject.project_name || 'Untitled Project'}</h3>
                      <p>{getProjectLocation(activeMapProject)}</p>

                      <div className="pm-map-popup-badges">
                        <span className={getStatusClass(activeMapProject.status)}>
                          {activeMapProject.status || 'No Status'}
                        </span>

                        <span className={getRiskClass(getComputedRiskLevel(activeMapProject))}>
                          {getComputedRiskLevel(activeMapProject)}
                        </span>
                      </div>

                      <dl>
                        <div>
                          <dt>Program</dt>
                          <dd>{getFundingLabel(activeMapProject)}</dd>
                        </div>

                        <div>
                          <dt>Project Cost</dt>
                          <dd>{formatPhpFull(activeMapProject.budget)}</dd>
                        </div>

                        <div>
                          <dt>Physical</dt>
                          <dd>{formatPercent(activeMapProject.physical_accomplishment)}</dd>
                        </div>

                        <div>
                          <dt>Financial</dt>
                          <dd>{formatPercent(activeMapProject.financial_accomplishment)}</dd>
                        </div>

                        <div>
                          <dt>Variance</dt>
                          <dd className={\`pm-map-variance \${activeMapVarianceInfo.className}\`}>
                            {activeMapVarianceInfo.compactLabel}
                          </dd>
                        </div>
                      </dl>

                      <Link to={\`/projects/\${activeMapProject.id}\`}>View Details</Link>
                    </div>
                  ) : null}`

  if (!source.includes('pm-map-active-project-panel')) {
    source = source.replace(/\n\s*<\/MapContainer>\n\s*\)}/, (match) => {
      return match.replace(/\n\s*\)}/, `${panel}\n              )}`)
    })
  }

  fs.writeFileSync(mapFile, source)
  console.log(`Patched ${path.relative(projectRoot, mapFile)}.`)
}

function patchCssFile(cssFile) {
  if (!fs.existsSync(cssFile)) return false

  backup(cssFile, 'final-marker-panel-fix')

  const markersToRemove = [
    'PMS10 MAP LABEL CLICK AND FLICKER FIX',
    'PMS10 MAP POPUP STABLE LABEL FIX',
    'PMS10 MAP MARKER GHOST TAP RESET FIX',
    'PMS10 MAP FINAL MARKER PANEL FIX',
  ]

  let css = fs.readFileSync(cssFile, 'utf8')

  for (const marker of markersToRemove) {
    css = removeCssBlock(css, marker)
  }

  css += `
/* =========================
   PMS10 MAP FINAL MARKER PANEL FIX
   Removes ghost labels/popups and uses a stable React details panel.
========================= */

/* Labels/tooltips are disabled by JSX; this is a safety net. */
.pm-map-shell .leaflet-tooltip,
.pm-map-shell .pms10-map-label-readonly,
.pm-map-shell .pms10-map-project-label,
.pm-map-shell .pms10-map-project-label-fixed {
  display: none !important;
  pointer-events: none !important;
}

/* Hide Leaflet popup shell because the map now uses the stable details panel. */
.pm-map-shell .leaflet-popup {
  display: none !important;
  pointer-events: none !important;
}

.pm-marker-wrapper,
.pm-cluster-wrapper {
  background: transparent !important;
  border: 0 !important;
}

.pm-marker-wrapper {
  display: grid !important;
  place-items: center !important;
  width: 38px !important;
  height: 38px !important;
  cursor: pointer !important;
  touch-action: manipulation !important;
  -webkit-tap-highlight-color: transparent !important;
}

.pm-marker-touch-target {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  cursor: pointer;
  touch-action: manipulation;
}

.pm-marker {
  position: relative !important;
  width: 24px !important;
  height: 24px !important;
  pointer-events: none !important;
}

.pm-marker span {
  position: absolute !important;
  inset: 2px !important;
  display: block !important;
  border: 3px solid #ffffff !important;
  border-radius: 999px !important;
  background: #16a34a;
  box-shadow: 0 8px 14px rgba(15, 23, 42, 0.24) !important;
}

.pm-marker span::after {
  content: '' !important;
  position: absolute !important;
  inset: 5px !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.95) !important;
}

.pm-marker-neutral span,
.pm-marker-none span,
.pm-marker-no-risk span {
  background: #16a34a !important;
}

.pm-marker-low span {
  background: #facc15 !important;
}

.pm-marker-moderate span,
.pm-marker-medium span {
  background: #f97316 !important;
}

.pm-marker-high span,
.pm-marker-critical span {
  background: #dc2626 !important;
}

.pm-map-active-project-panel {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 720;
  max-height: min(52%, 360px);
  overflow: auto;
  padding: 14px 14px 16px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.22);
  -webkit-overflow-scrolling: touch;
}

.pm-map-active-project-close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  color: #334155;
  background: #e2e8f0;
  font-size: 1.25rem;
  font-weight: 900;
  line-height: 1;
}

.pm-map-active-project-panel h3 {
  margin: 0 38px 6px 0;
  color: #0f172a;
  font-size: 0.98rem;
  font-weight: 950;
  line-height: 1.15;
}

.pm-map-active-project-panel p {
  margin: 0 38px 10px 0;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 760;
  line-height: 1.35;
}

.pm-map-active-project-panel dl {
  display: grid;
  gap: 7px;
  margin: 0;
}

.pm-map-active-project-panel dl div {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 8px;
}

.pm-map-active-project-panel dt {
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 900;
  text-transform: uppercase;
}

.pm-map-active-project-panel dd {
  min-width: 0;
  margin: 0;
  color: #0f172a;
  font-size: 0.78rem;
  font-weight: 820;
  overflow-wrap: anywhere;
}

.pm-map-active-project-panel a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 38px;
  margin-top: 12px;
  border-radius: 12px;
  color: #ffffff;
  background: #16467a;
  font-size: 0.82rem;
  font-weight: 900;
  text-decoration: none;
}

/* Keep Leaflet positioning intact. Never override transform on markers/panes. */
.pm-map-shell .leaflet-container,
.pm-map-shell .leaflet-pane,
.pm-map-shell .leaflet-marker-icon,
.pm-map-shell .leaflet-tile,
.pm-map-shell .leaflet-tile-container img {
  -webkit-tap-highlight-color: transparent !important;
  backface-visibility: hidden !important;
  -webkit-backface-visibility: hidden !important;
}

@media (max-width: 430px) {
  .pm-marker-wrapper,
  .pm-marker-touch-target {
    width: 36px !important;
    height: 36px !important;
  }

  .pm-marker {
    width: 22px !important;
    height: 22px !important;
  }

  .pm-marker span {
    inset: 2px !important;
    border-width: 3px !important;
  }

  .pm-marker span::after {
    inset: 4px !important;
  }

  .pm-map-active-project-panel {
    left: 10px;
    right: 10px;
    bottom: 10px;
    max-height: 58%;
    padding: 13px 13px 15px;
    border-radius: 18px;
  }
}
`

  fs.writeFileSync(cssFile, css)
  console.log(`Patched ${path.relative(projectRoot, cssFile)}.`)
  return true
}

function patchCss() {
  const projectMapCss = path.join(projectRoot, 'src/styles/projectMap.css')
  const layoutCss = path.join(projectRoot, 'src/styles/layout.css')

  const patchedProjectMap = patchCssFile(projectMapCss)

  if (fs.existsSync(layoutCss)) {
    backup(layoutCss, 'final-marker-panel-fix')

    let layoutCssContent = fs.readFileSync(layoutCss, 'utf8')

    for (const marker of [
      'PMS10 MAP LABEL CLICK AND FLICKER FIX',
      'PMS10 MAP POPUP STABLE LABEL FIX',
      'PMS10 MAP MARKER GHOST TAP RESET FIX',
      'PMS10 MAP FINAL MARKER PANEL FIX',
    ]) {
      layoutCssContent = removeCssBlock(layoutCssContent, marker)
    }

    fs.writeFileSync(layoutCss, layoutCssContent)
    console.log(`Cleaned prior map patches from ${path.relative(projectRoot, layoutCss)}.`)
  }

  if (!patchedProjectMap) fail('Could not patch src/styles/projectMap.css')
}

patchMapFile()
patchCss()

console.log('PMS10 final map marker/details panel fix applied.')
