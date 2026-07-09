const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()

const dashboardPath = path.join(projectRoot, 'src/pages/Dashboard.tsx')
const projectsPath = path.join(projectRoot, 'src/pages/Projects.tsx')
const subayServicePath = path.join(projectRoot, 'src/services/subayImportService.ts')
const dashboardCssPath = path.join(projectRoot, 'src/styles/dashboard.css')

function backup(filePath, suffix) {
  if (!fs.existsSync(filePath)) return

  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function ensureImport(code, importLine, modulePath) {
  if (code.includes(`from '${modulePath}'`) || code.includes(`from "${modulePath}"`)) {
    return code
  }

  const lines = code.split('\n')
  let insertAt = -1
  let insideImport = false

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()

    if (trimmed.startsWith('import ')) {
      insideImport = true
      insertAt = i
    }

    if (insideImport && /from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed)) {
      insideImport = false
      insertAt = i
    }
  }

  if (insertAt >= 0) {
    lines.splice(insertAt + 1, 0, importLine)
  } else {
    lines.unshift(importLine)
  }

  return lines.join('\n')
}

function replaceFunctionByName(code, functionName, replacement) {
  const start = code.indexOf(`function ${functionName}(`)
  if (start < 0) return { code, changed: false }

  const braceStart = code.indexOf('{', start)
  if (braceStart < 0) return { code, changed: false }

  let depth = 0
  let end = -1

  for (let i = braceStart; i < code.length; i += 1) {
    const char = code[i]

    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }

  if (end < 0) return { code, changed: false }

  return {
    code: code.slice(0, start) + replacement + code.slice(end),
    changed: true,
  }
}

function insertAfter(code, search, insertText, label) {
  if (code.includes(insertText.trim().slice(0, 80))) {
    return { code, changed: false }
  }

  const index = code.indexOf(search)
  if (index < 0) {
    console.warn(`Marker not found, skipped: ${label}`)
    return { code, changed: false }
  }

  return {
    code: code.slice(0, index + search.length) + insertText + code.slice(index + search.length),
    changed: true,
  }
}

function patchDashboard() {
  if (!fs.existsSync(dashboardPath)) {
    console.warn('Skipped missing src/pages/Dashboard.tsx')
    return
  }

  backup(dashboardPath, 'dashboard-filters')
  backup(dashboardCssPath, 'dashboard-filters')

  let code = fs.readFileSync(dashboardPath, 'utf8')
  let changed = false

  code = ensureImport(
    code,
    "import { normalizeProgramName } from '../utils/program'",
    '../utils/program',
  )

  // Add filter type/constants after DrilldownState.
  if (!code.includes('type DashboardFilters =')) {
    const marker = `type DrilldownState = {
  title: string
  subtitle: string
  projects: ProjectRecord[]
}
`
    const add = `

type DashboardFilters = {
  program: string
  year: string
  province: string
  lgu: string
}

const ALL_FILTER_VALUE = '__ALL__'

const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  program: ALL_FILTER_VALUE,
  year: ALL_FILTER_VALUE,
  province: ALL_FILTER_VALUE,
  lgu: ALL_FILTER_VALUE,
}
`
    if (code.includes(marker)) {
      code = code.replace(marker, marker + add)
      changed = true
      console.log('Added dashboard filter types/constants.')
    }
  }

  // Normalize funding source in Dashboard.
  const fundingReplacement = `function getFundingSource(project: ProjectRecord) {
  const source = safeText(
    project.funding_source ??
      project.source_of_fund ??
      project.fund_source ??
      project.program ??
      project.program_name,
    'N/A',
  )

  const normalizedSource = normalizeProgramName(source)

  return normalizedSource || 'N/A'
}`
  let result = replaceFunctionByName(code, 'getFundingSource', fundingReplacement)
  if (result.changed) {
    code = result.code
    changed = true
    console.log('Normalized Dashboard funding source.')
  }

  // Add filter helper functions after getFundingDisplay.
  if (!code.includes('function uniqueSortedTextValues')) {
    const marker = `function getFundingDisplay(project: ProjectRecord) {
  const year = getFundingYear(project)
  const source = getFundingSource(project)

  if (year && source !== 'N/A') return \`\${year} · \${source}\`
  return year || source
}
`
    const helpers = `

function getProgramFilterValue(project: ProjectRecord) {
  const source = getFundingSource(project)
  return source === 'N/A' ? '' : source
}

function getYearFilterValue(project: ProjectRecord) {
  return getFundingYear(project)
}

function getProvinceFilterValue(project: ProjectRecord) {
  return safeText(project.province ?? project.province_name, '')
}

function getLguFilterValue(project: ProjectRecord) {
  return safeText(
    project.city_municipality ??
      project.municipality ??
      project.city ??
      project.lgu ??
      project.lgu_name,
    '',
  )
}

function uniqueSortedTextValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => safeText(value, '')).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
}

function matchesDashboardFilter(value: string, filterValue: string) {
  if (filterValue === ALL_FILTER_VALUE) return true
  return value === filterValue
}
`
    result = insertAfter(code, marker, helpers, 'dashboard filter helper functions')
    if (result.changed) {
      code = result.code
      changed = true
      console.log('Added dashboard filter helper functions.')
    }
  }

  // Add filter state after isDashboardScrolled state.
  if (!code.includes('const [dashboardFilters, setDashboardFilters]')) {
    const marker = `  const [isDashboardScrolled, setIsDashboardScrolled] = useState(false)
`
    const add = `  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>(
    DEFAULT_DASHBOARD_FILTERS,
  )
`
    if (code.includes(marker)) {
      code = code.replace(marker, marker + add)
      changed = true
      console.log('Added dashboard filter state.')
    }
  }

  // Replace visibleProjects memo block.
  if (!code.includes('const aorProjects = useMemo(() => {')) {
    const oldBlock = `  const visibleProjects = useMemo(() => {
    return filterProjectsByAor(projects, auth)
  }, [projects, auth])
`
    const newBlock = `  const aorProjects = useMemo(() => {
    return filterProjectsByAor(projects, auth)
  }, [projects, auth])

  const filterOptions = useMemo(() => {
    const years = uniqueSortedTextValues(aorProjects.map(getYearFilterValue)).sort(
      (a, b) => asNumber(b) - asNumber(a),
    )

    return {
      programs: uniqueSortedTextValues(aorProjects.map(getProgramFilterValue)),
      years,
      provinces: uniqueSortedTextValues(aorProjects.map(getProvinceFilterValue)),
      lgus: uniqueSortedTextValues(aorProjects.map(getLguFilterValue)),
    }
  }, [aorProjects])

  const hasActiveDashboardFilters = useMemo(() => {
    return Object.values(dashboardFilters).some(
      (value) => value !== ALL_FILTER_VALUE,
    )
  }, [dashboardFilters])

  const visibleProjects = useMemo(() => {
    return aorProjects.filter((project) => {
      return (
        matchesDashboardFilter(
          getProgramFilterValue(project),
          dashboardFilters.program,
        ) &&
        matchesDashboardFilter(getYearFilterValue(project), dashboardFilters.year) &&
        matchesDashboardFilter(
          getProvinceFilterValue(project),
          dashboardFilters.province,
        ) &&
        matchesDashboardFilter(getLguFilterValue(project), dashboardFilters.lgu)
      )
    })
  }, [aorProjects, dashboardFilters])
`
    if (code.includes(oldBlock)) {
      code = code.replace(oldBlock, newBlock)
      changed = true
      console.log('Added filtered visibleProjects logic.')
    } else {
      console.warn('Dashboard visibleProjects marker not found. Filter logic was not inserted.')
    }
  }

  // Add filter panel after hero.
  if (!code.includes('dashboard-filter-panel')) {
    const marker = `        <section className="dashboard-stat-grid" aria-label="Dashboard summary cards">`
    const panel = `        <section className="dashboard-filter-panel" aria-label="Dashboard filters">
          <div className="dashboard-filter-header">
            <div>
              <p className="dashboard-card-kicker">Filters</p>
              <h2>Dashboard Scope</h2>
            </div>

            <span>
              {formatCount(visibleProjects.length)} / {formatCount(aorProjects.length)} projects
            </span>
          </div>

          <div className="dashboard-filter-grid">
            <label>
              <span>Program</span>
              <select
                value={dashboardFilters.program}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    program: event.target.value,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All programs</option>
                {filterOptions.programs.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Funding Year</span>
              <select
                value={dashboardFilters.year}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    year: event.target.value,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All years</option>
                {filterOptions.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Province</span>
              <select
                value={dashboardFilters.province}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    province: event.target.value,
                    lgu: ALL_FILTER_VALUE,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All provinces</option>
                {filterOptions.provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>LGU</span>
              <select
                value={dashboardFilters.lgu}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    lgu: event.target.value,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All LGUs</option>
                {filterOptions.lgus.map((lgu) => (
                  <option key={lgu} value={lgu}>
                    {lgu}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="dashboard-filter-reset"
              disabled={!hasActiveDashboardFilters}
              onClick={() => setDashboardFilters(DEFAULT_DASHBOARD_FILTERS)}
            >
              Reset
            </button>
          </div>
        </section>

`
    if (code.includes(marker)) {
      code = code.replace(marker, panel + marker)
      changed = true
      console.log('Added dashboard filter panel.')
    } else {
      console.warn('Dashboard stat grid marker not found. Filter panel was not inserted.')
    }
  }

  if (changed) {
    fs.writeFileSync(dashboardPath, code)
    console.log('Updated src/pages/Dashboard.tsx')
  } else {
    console.log('Dashboard already patched or markers not found.')
  }

  if (fs.existsSync(dashboardCssPath)) {
    let css = fs.readFileSync(dashboardCssPath, 'utf8')
    const marker = 'PMS10 DASHBOARD FILTER PANEL'

    const oldIndex = css.indexOf(marker)
    if (oldIndex >= 0) {
      const start = css.lastIndexOf('/*', oldIndex)
      const safeStart = start >= 0 ? start : oldIndex
      const next = css.indexOf('/* =========================', oldIndex + marker.length)
      css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
    }

    css += `
/* =========================
   PMS10 DASHBOARD FILTER PANEL
   Filter dashboard by program, year, province, and LGU.
========================= */

.dashboard-filter-panel {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.07);
}

.dashboard-filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.dashboard-filter-header h2 {
  margin: 2px 0 0;
  color: #0f172a;
  font-size: 1rem;
  line-height: 1.1;
}

.dashboard-filter-header > span {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 8px 11px;
  background: #eff6ff;
  color: #0f4c81;
  font-size: 0.72rem;
  font-weight: 950;
}

.dashboard-filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 10px;
  align-items: end;
}

.dashboard-filter-grid label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.dashboard-filter-grid label span {
  color: #64748b;
  font-size: 0.66rem;
  font-weight: 950;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dashboard-filter-grid select {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 14px;
  padding: 0 12px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 850;
  outline: none;
}

.dashboard-filter-grid select:focus {
  border-color: rgba(15, 76, 129, 0.48);
  box-shadow: 0 0 0 4px rgba(15, 76, 129, 0.1);
}

.dashboard-filter-reset {
  min-height: 42px;
  border: 0;
  border-radius: 14px;
  padding: 0 16px;
  background: #0f4c81;
  color: #ffffff;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 950;
  cursor: pointer;
}

.dashboard-filter-reset:disabled {
  cursor: not-allowed;
  background: #e2e8f0;
  color: #94a3b8;
}

@media (max-width: 980px) {
  .dashboard-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-filter-reset {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .dashboard-filter-panel {
    border-radius: 20px;
    padding: 13px;
  }

  .dashboard-filter-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-filter-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .dashboard-filter-grid select,
  .dashboard-filter-reset {
    min-height: 40px;
    border-radius: 13px;
  }
}
`
    fs.writeFileSync(dashboardCssPath, css)
    console.log('Updated dashboard filter CSS.')
  }
}

function patchProjects() {
  if (!fs.existsSync(projectsPath)) {
    console.warn('Skipped missing src/pages/Projects.tsx')
    return
  }

  backup(projectsPath, 'program-normalization')

  let code = fs.readFileSync(projectsPath, 'utf8')
  const before = code

  code = ensureImport(
    code,
    "import { normalizeProgramName } from '../utils/program'",
    '../utils/program',
  )

  code = code.replace(
    `  const source = textValue(project.funding_source || project.project_type)`,
    `  const source = normalizeProgramName(
    textValue(project.funding_source || project.project_type),
  )`,
  )

  if (code !== before) {
    fs.writeFileSync(projectsPath, code)
    console.log('Updated src/pages/Projects.tsx program display.')
  } else {
    console.log('Projects.tsx already normalized or marker not found.')
  }
}

function patchSubayImportService() {
  if (!fs.existsSync(subayServicePath)) {
    console.warn('Skipped missing src/services/subayImportService.ts')
    return
  }

  backup(subayServicePath, 'program-normalization')

  let code = fs.readFileSync(subayServicePath, 'utf8')
  const before = code

  code = ensureImport(
    code,
    "import { normalizeProgramName } from '../utils/program'",
    '../utils/program',
  )

  code = code.replace(
    `    funding_source: record.fundingSource || null,`,
    `    funding_source: normalizeProgramName(record.fundingSource) || null,`,
  )

  code = code.replace(
    `      const fundingSource = firstNonEmpty(
        getCell(row, headerMap, 'fundingSource'),
        getCell(row, headerMap, 'projectType'),
        'SubayBAYAN',
      )`,
    `      const fundingSource = normalizeProgramName(
        firstNonEmpty(
          getCell(row, headerMap, 'fundingSource'),
          getCell(row, headerMap, 'projectType'),
          'SubayBAYAN',
        ),
      )`,
  )

  if (code !== before) {
    fs.writeFileSync(subayServicePath, code)
    console.log('Updated src/services/subayImportService.ts program normalization.')
  } else {
    console.log('subayImportService.ts already normalized or markers not found.')
  }
}

patchDashboard()
patchProjects()
patchSubayImportService()

console.log('Dashboard filters and program normalization patch completed.')
