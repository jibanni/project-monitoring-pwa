const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const mapPath = path.join(projectRoot, 'src/pages/ProjectMap.tsx')
const cssPath = path.join(projectRoot, 'src/styles/projectMap.css')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(mapPath)) fail('Missing file: src/pages/ProjectMap.tsx')
if (!fs.existsSync(cssPath)) fail('Missing file: src/styles/projectMap.css')

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function readBestProjectMapBase() {
  const backups = [
    `${mapPath}.final-marker-panel-fix.bak`,
    `${mapPath}.map-marker-ghost-tap-reset-fix.bak`,
    `${mapPath}.map-popup-stable-fix.bak`,
    `${mapPath}.map-label-click-flicker-fix.bak`,
    `${mapPath}.update-hero-details-bubbles.bak`,
  ]

  for (const candidate of backups) {
    if (!fs.existsSync(candidate)) continue

    const source = fs.readFileSync(candidate, 'utf8')

    if (source.includes('MapContainer') && source.includes('<Marker') && source.includes('function createProjectMarker')) {
      console.log(`Using backup as clean base: ${path.relative(projectRoot, candidate)}`)
      return source
    }
  }

  console.log('No usable ProjectMap backup found. Repairing current ProjectMap.tsx directly.')
  return fs.readFileSync(mapPath, 'utf8')
}

function findFunctionRange(text, functionName) {
  const start = text.indexOf(`function ${functionName}`)
  if (start < 0) return null

  const openBrace = text.indexOf('{', start)
  if (openBrace < 0) return null

  let depth = 0
  let quote = null

  for (let index = openBrace; index < text.length; index += 1) {
    const char = text[index]
    const prev = text[index - 1]

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
      let end = index + 1
      while (end < text.length && /\s/.test(text[end])) end += 1
      return { start, end }
    }
  }

  return null
}

function removeLeafletChildBlock(source, tagName) {
  const pattern = new RegExp(`\\s*<${tagName}\\b[\\s\\S]*?<\\/${tagName}>\\n?`, 'g')
  return source.replace(pattern, '')
}

function removePreviousHelpers(source) {
  let output = source

  output = output.replace(/\nconst pms10OpenMapLabelPopup[\s\S]*?const pms10MapStableLabelHandlers(?:\s*:\s*any)?\s*=\s*\{[\s\S]*?\n\}\n/g, '\n')

  return output
}

function removeReactLeafletImports(source) {
  return source
    .replace(/,\s*Popup/g, '')
    .replace(/Popup,\s*/g, '')
    .replace(/,\s*Tooltip/g, '')
    .replace(/Tooltip,\s*/g, '')
}

function replaceCreateMarker(source) {
  const range = findFunctionRange(source, 'createProjectMarker')
  if (!range) fail('Could not find createProjectMarker() in ProjectMap.tsx')

  const replacement = `const projectMarkerIconCache = new Map<string, L.DivIcon>()

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
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })

  projectMarkerIconCache.set(markerClass, icon)
  return icon
}

`

  return source.slice(0, range.start) + replacement + source.slice(range.end)
}

function addStateAndMemos(source) {
  let output = source

  if (!output.includes("const [activeMapProjectId, setActiveMapProjectId] = useState('')")) {
    output = output.replace(
      "  const [mapLayer, setMapLayer] = useState<MapLayer>('street')\n",
      "  const [mapLayer, setMapLayer] = useState<MapLayer>('street')\n  const [activeMapProjectId, setActiveMapProjectId] = useState('')\n",
    )
  }

  if (!output.includes("setActiveMapProjectId('')\n    setSearchTerm('')")) {
    output = output.replace(
      "  function clearFilters() {\n    setSearchTerm('')",
      "  function clearFilters() {\n    setActiveMapProjectId('')\n    setSearchTerm('')",
    )
  }

  if (!output.includes('const activeMapProject = useMemo(() => {')) {
    const anchor = `  const coordinateIssueProjects = useMemo(() => {
    return filteredProjects.filter(
      (project) => project.displayLatitude === null || project.displayLongitude === null,
    )
  }, [filteredProjects])
`

    const insertion = `
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

    if (!output.includes(anchor)) fail('Could not find coordinateIssueProjects block for insertion.')
    output = output.replace(anchor, anchor + insertion)
  }

  return output
}

function addMapContainerProp(source) {
  if (source.includes('closePopupOnClick={false}')) return source

  return source.replace(
    '                  zoomControl\n                >',
    '                  zoomControl\n                  closePopupOnClick={false}\n                >',
  )
}

function replaceMarkerRenderBlock(source) {
  const markerMapStart = source.indexOf('                  {displayedProjects.map((project) => {')

  if (markerMapStart < 0) {
    // Already in final parenthesized map form; leave it.
    if (source.includes('{displayedProjects.map((project) => (')) return source
    fail('Could not find displayedProjects marker render block.')
  }

  const markerMapEnd = source.indexOf('                  })}', markerMapStart)
  if (markerMapEnd < 0) fail('Could not find end of displayedProjects marker render block.')

  const end = markerMapEnd + '                  })}\n'.length

  const replacement = `                  {displayedProjects.map((project) => (
                    <Marker
                      key={project.id}
                      position={[
                        project.displayLatitude as number,
                        project.displayLongitude as number,
                      ]}
                      icon={createProjectMarker(project)}
                      bubblingMouseEvents={false}
                      riseOnHover
                      zIndexOffset={activeMapProjectId === project.id ? 1000 : 0}
                      eventHandlers={{
                        click: (event) => {
                          event?.originalEvent?.preventDefault?.()
                          event?.originalEvent?.stopPropagation?.()
                          setActiveMapProjectId(project.id)
                        },
                      }}
                    />
                  ))}
`

  return source.slice(0, markerMapStart) + replacement + source.slice(end)
}

function addFragmentAndPanel(source) {
  let output = source

  if (!output.includes('pm-map-active-project-panel')) {
    output = output.replace('              ) : (\n                <MapContainer', '              ) : (\n                <>\n                <MapContainer')

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
                        <dd className={'pm-map-variance ' + activeMapVarianceInfo.className}>
                          {activeMapVarianceInfo.compactLabel}
                        </dd>
                      </div>

                      <div>
                        <dt>As of</dt>
                        <dd>{activeMapVarianceInfo.asOfLabel.replace('As of ', '')}</dd>
                      </div>
                    </dl>

                    <Link to={'/projects/' + activeMapProject.id}>View Details</Link>
                  </div>
                ) : null}
                </>
`

    if (!output.includes('                </MapContainer>')) fail('Could not find closing MapContainer for panel insertion.')
    output = output.replace('                </MapContainer>\n              )}', `                </MapContainer>${panel}              )}`)
  }

  return output
}

function repairProjectMap() {
  backup(mapPath, 'syntax-repair-before-final-map-fix')

  let source = readBestProjectMapBase()

  source = removePreviousHelpers(source)
  source = removeReactLeafletImports(source)
  source = removeLeafletChildBlock(source, 'Tooltip')
  source = removeLeafletChildBlock(source, 'Popup')
  source = replaceCreateMarker(source)
  source = addStateAndMemos(source)
  source = addMapContainerProp(source)
  source = replaceMarkerRenderBlock(source)
  source = addFragmentAndPanel(source)

  fs.writeFileSync(mapPath, source)
  console.log('Repaired and replaced src/pages/ProjectMap.tsx')
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
  backup(cssPath, 'syntax-repair-final-map-fix')

  let css = fs.readFileSync(cssPath, 'utf8')

  for (const marker of [
    'PMS10 MAP LABEL CLICK AND FLICKER FIX',
    'PMS10 MAP POPUP STABLE LABEL FIX',
    'PMS10 MAP MARKER GHOST TAP RESET FIX',
    'PMS10 MAP FINAL MARKER PANEL FIX',
    'PMS10 MAP SYNTAX REPAIR FINAL FIX',
  ]) {
    css = removeCssBlock(css, marker)
  }

  css += `
/* =========================
   PMS10 MAP SYNTAX REPAIR FINAL FIX
   Stable marker details panel; no Leaflet tooltip/popup ghost markers.
========================= */

.pm-map-shell {
  position: relative;
}

/* Safety net: ProjectMap no longer renders Tooltip/Popup, but hide old remnants. */
.pm-map-shell .leaflet-tooltip,
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
  width: 34px !important;
  height: 34px !important;
  cursor: pointer !important;
  touch-action: manipulation !important;
  -webkit-tap-highlight-color: transparent !important;
}

.pm-marker-touch-target {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  cursor: pointer;
  touch-action: manipulation;
}

.pm-marker {
  position: relative !important;
  width: 21px !important;
  height: 21px !important;
  pointer-events: none !important;
}

.pm-marker span {
  position: absolute !important;
  inset: 2px !important;
  display: block !important;
  border: 3px solid #ffffff !important;
  border-radius: 999px !important;
  background: #16a34a;
  box-shadow: 0 7px 12px rgba(15, 23, 42, 0.24) !important;
}

.pm-marker span::after {
  content: '' !important;
  position: absolute !important;
  inset: 4px !important;
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

/* Keep Leaflet transform positioning intact. Never override transform. */
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
    width: 32px !important;
    height: 32px !important;
  }

  .pm-marker {
    width: 20px !important;
    height: 20px !important;
  }

  .pm-marker span {
    inset: 2px !important;
    border-width: 3px !important;
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

  fs.writeFileSync(cssPath, css)
  console.log('Patched src/styles/projectMap.css')

  if (fs.existsSync(layoutCssPath)) {
    backup(layoutCssPath, 'syntax-repair-final-map-fix')
    let layoutCss = fs.readFileSync(layoutCssPath, 'utf8')

    for (const marker of [
      'PMS10 MAP LABEL CLICK AND FLICKER FIX',
      'PMS10 MAP POPUP STABLE LABEL FIX',
      'PMS10 MAP MARKER GHOST TAP RESET FIX',
      'PMS10 MAP FINAL MARKER PANEL FIX',
      'PMS10 MAP SYNTAX REPAIR FINAL FIX',
    ]) {
      layoutCss = removeCssBlock(layoutCss, marker)
    }

    fs.writeFileSync(layoutCssPath, layoutCss)
    console.log('Cleaned old map CSS patch blocks from src/styles/layout.css')
  }
}

repairProjectMap()
patchCss()

console.log('Fixed ProjectMap syntax and applied final stable marker panel behavior.')
