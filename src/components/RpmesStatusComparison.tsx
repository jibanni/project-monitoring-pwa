import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import RpmesLinkManager from './RpmesLinkManager'
import { useAuth } from '../context/AuthContext'
import { getCanonicalProjectLgu } from '../data/region10Directory'
import { canViewProject } from '../utils/aorAccess'
import { getPmsProjectStatus } from '../utils/projectStatus'
import {
  DEFAULT_RPMES_COHORT, DEFAULT_RPMES_PROGRAM, parseRpmesValues, readRpmesSourceLinks, resolveRpmesSheet, rpmesCsvUrl,
  rpmesProvince, rpmesSourceKey, rpmesSpreadsheetId, RPMES_PROVINCES,
  rpmesOfficialCohort, rpmesYearOptions, SUMMARY_COLUMNS, summarizeByLgu, text,
  type RpmesCohort, type RpmesProvince, type RpmesSourceKey, type RpmesSourceLinks, type StatusEntry,
} from '../utils/rpmesStatusComparison'
import '../styles/rpmesStatusComparison.css'

type Project = Record<string, unknown>
type SheetData = { rows: StatusEntry[]; checkedAt: Date; spreadsheetId: string }
type Props = { officialProjects: Project[]; projectSource: 'memory' | 'device' | 'network' | 'empty'; refreshProjects: () => Promise<void> }

const fundingOptions = ['SBDP', 'SBDP-UA'] as const

const toolbarIconPaths = {
  compare: 'M4 19h16M7 15v-4m5 4V5m5 10V8',
  refresh: 'M20 11a8 8 0 0 0-14-5L3 9m0 0V4m0 5h5m-4 4a8 8 0 0 0 14 5l3-3m0 0v5m0-5h-5',
  import: 'M12 16V4m-4 4 4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4',
  links: 'M10 13a4 4 0 0 0 6 0l3-3a4 4 0 1 0-6-6l-2 2m3 5a4 4 0 0 0-6 0l-3 3a4 4 0 1 0 6 6l2-2',
  export: 'M12 4v12m-4-4 4 4 4-4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3',
} as const

function RpmesToolbarIcon({ name }: { name: keyof typeof toolbarIconPaths }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={toolbarIconPaths[name]} /></svg>
}

const dateLabel = (date: Date) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
}).format(date)
const percent = new Intl.NumberFormat('en-PH', { style: 'percent', maximumFractionDigits: 2 })
const sourceNames = { subay: 'PMS SubayBAYAN', rpmes: 'RPMES' } as const
const sources = ['subay', 'rpmes'] as const
const statusSummaryRows = [
  { key: 'notStarted', label: 'Not yet started' },
  { key: 'ongoing', label: 'Ongoing implementation' },
  { key: 'completed', label: 'Completed' },
] as const
const metricLabels = {
  projects: 'Projects', barangays: 'Barangays', notStarted: 'Not yet started',
  ongoing: 'Ongoing', completed: 'Completed', completion: 'Completion rate',
} as const

function displayMetric(key: keyof typeof metricLabels, value: number | null) {
  if (value === null) return '—'
  return key === 'completion' ? percent.format(value) : String(value)
}

function readLinks(storageKey: string, legacyKey: string) {
  const saved = (key: string) => {
    try { return JSON.parse(localStorage.getItem(key) || '{}') as unknown } catch { return {} }
  }
  return readRpmesSourceLinks(saved(storageKey), saved(legacyKey))
}

async function loadRpmes(province: RpmesProvince, cohort: RpmesCohort, program: string, spreadsheetId: string): Promise<SheetData> {
  const response = await fetch(rpmesCsvUrl(spreadsheetId), {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) {
    throw new Error('The spreadsheet could not be read. Check that you entered a viewable Google Sheets link.')
  }
  const csv = await response.text()
  if (csv.length > 1_000_000) throw new Error('Unexpected sheet size.')
  const { read, utils } = await import('xlsx')
  const workbook = read(csv, { type: 'string', raw: true })
  const values = utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: '' })
  return { rows: parseRpmesValues(values, province, cohort, program), checkedAt: new Date(), spreadsheetId }
}

export default function RpmesStatusComparison({ officialProjects, projectSource, refreshProjects }: Props) {
  const auth = useAuth()
  const storageKey = `pms10:rpmes-links:v2:${auth.user?.id}`
  const legacyKey = `pms10:rpmes-links:v1:${auth.user?.id}`
  const [links, setLinks] = useState(() => readLinks(storageKey, legacyKey))
  const [cohort, setCohort] = useState<RpmesCohort>(DEFAULT_RPMES_COHORT)
  const [selected, setSelected] = useState<RpmesProvince | ''>('')
  const [sheets, setSheets] = useState<Partial<Record<RpmesSourceKey, SheetData>>>({})
  const [errors, setErrors] = useState<RpmesSourceKey[]>([])
  const [loading, setLoading] = useState(false)
  const [differencesOnly, setDifferencesOnly] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [importProvince, setImportProvince] = useState<RpmesProvince | ''>('')
  const [importUrl, setImportUrl] = useState('')
  const [importError, setImportError] = useState('')
  const [notice, setNotice] = useState('')
  const [exportError, setExportError] = useState(false)
  const busy = useRef(false)
  const usingCachedProjects = projectSource !== 'network'

  const program = DEFAULT_RPMES_PROGRAM
  const reportingYear = cohort.slice(0, 4)
  const isUa = cohort.endsWith('-UA')
  const yearOptions = useMemo(() => rpmesYearOptions(officialProjects, DEFAULT_RPMES_PROGRAM)
    .filter((value) => !value.endsWith('-UA')), [officialProjects])
  const comparisonLabel = `${isUa ? 'SBDP-UA' : 'SBDP'} ${reportingYear}`

  const official = useMemo(() => officialProjects.flatMap((project): StatusEntry[] => {
    const province = rpmesProvince(project.province)
    if (!province || rpmesOfficialCohort(project, program) !== cohort) return []
    return [{ province, municipality: text(project.municipality), barangay: text(project.barangay), status: getPmsProjectStatus(project) }]
  }), [officialProjects, cohort, program])
  // Province labels are public metadata. Row-level AOR filtering still applies to both sources.
  const requested = selected ? [selected] : RPMES_PROVINCES
  const sourceFor = (province: RpmesProvince) => resolveRpmesSheet(links, cohort, province, program)
  const configured = requested.flatMap((province) => {
    const id = sourceFor(province)
    return id ? [{ province, id, key: rpmesSourceKey(cohort, province, program) }] : []
  })
  const missing = requested.filter((province) => !sourceFor(province))
  const failed = configured.filter(({ key }) => errors.includes(key))
  const ready = projectSource === 'empty' ? [] : configured.filter(({ key, id }) => sheets[key]?.spreadsheetId === id && !errors.includes(key))
  const readyProvinces = new Set(ready.map(({ province }) => province))
  const rpmes = ready.flatMap(({ key }) => sheets[key]!.rows.filter((entry) => canViewProject(entry, auth)))
  const compared = summarizeByLgu(official.filter((entry) => readyProvinces.has(entry.province)), rpmes, getCanonicalProjectLgu)
  const differing = compared.filter((row) => SUMMARY_COLUMNS.some(({ key }) =>
    displayMetric(key, row.subay[key]) !== displayMetric(key, row.rpmes[key])))
  const visible = differencesOnly ? differing : compared
  const subayProjectCount = compared.reduce((total, row) => total + row.subay.projects, 0)
  const rpmesProjectCount = compared.reduce((total, row) => total + row.rpmes.projects, 0)
  const byProvince = new Map<RpmesProvince, typeof compared>()
  for (const row of visible) {
    const group = byProvince.get(row.province)
    if (group) group.push(row)
    else byProvince.set(row.province, [row])
  }
  const provinceCount = new Set(compared.map((row) => row.province)).size

  function resetComparisonSelection() {
    setNotice('')
    setImportError('')
    setImportUrl('')
    setDifferencesOnly(false)
    setExportError(false)
  }

  function saveManagedLinks(next: RpmesSourceLinks, changed: RpmesSourceKey[]) {
    if (!auth.isAdmin || busy.current) return false
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      return false
    }
    setLinks(next)
    setSheets((previous) => {
      const retained = { ...previous }
      changed.forEach((key) => delete retained[key])
      return retained
    })
    setErrors((previous) => previous.filter((key) => !changed.includes(key)))
    setNotice('')
    setExportError(false)
    return true
  }

  async function runComparison() {
    if (busy.current || !configured.length) return
    busy.current = true
    setLoading(true)
    setNotice('')
    setExportError(false)
    try {
      const [results] = await Promise.all([
        Promise.allSettled(configured.map(({ province, id }) => loadRpmes(province, cohort, program, id))),
        refreshProjects().catch(() => undefined),
      ])
      const failedKeys: RpmesSourceKey[] = []
      const next: Partial<Record<RpmesSourceKey, SheetData>> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[configured[index].key] = result.value
        else failedKeys.push(configured[index].key)
      })
      setSheets((previous) => ({ ...previous, ...next }))
      setErrors((previous) => [...previous.filter((key) => !configured.some((source) => source.key === key)), ...failedKeys])
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  async function importLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !importProvince) return
    const province = importProvince
    const spreadsheetId = rpmesSpreadsheetId(importUrl)
    setImportError('')
    setNotice('')
    if (!spreadsheetId) {
      setImportError('Paste a valid Google Sheets spreadsheet link.')
      return
    }
    busy.current = true
    setLoading(true)
    try {
      const data = await loadRpmes(province, cohort, program, spreadsheetId)
      const key = rpmesSourceKey(cohort, province, program)
      const next = { ...links, [key]: spreadsheetId }
      setLinks(next)
      setSheets((previous) => ({ ...previous, [key]: data }))
      setErrors((previous) => previous.filter((item) => item !== key))
      setSelected(province)
      setImportOpen(false)
      setImportUrl('')
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
        setNotice(`RPMES link imported for ${province} · ${comparisonLabel} and saved in this browser.`)
      } catch {
        setNotice(`RPMES link imported for ${province} · ${comparisonLabel} for this visit. Browser storage was unavailable.`)
      }
    } catch (error) {
      setImportError(error instanceof Error && error.name === 'Error' ? error.message : 'Unable to read RPMES Form 2. Check the link and try again.')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  async function exportComparison() {
    setExportError(false)
    try {
      const xlsx = await import('xlsx')
      const workbook = xlsx.utils.book_new()
      const summary = xlsx.utils.aoa_to_sheet([
        ['Province', 'LGU', ...SUMMARY_COLUMNS.flatMap(({ label }) => sources.map((source) => `${label} — ${sourceNames[source]}`))],
        ...compared.map((row) => [row.province, row.lgu, ...SUMMARY_COLUMNS.flatMap(({ key }) => sources.map((source) => row[source][key]))]),
      ])
      summary['!cols'] = [24, 23, ...SUMMARY_COLUMNS.flatMap(() => [26, 24])].map((wch) => ({ wch }))
      if (summary['!ref']) summary['!autofilter'] = { ref: summary['!ref'] }
      for (let i = 1; i <= compared.length; i += 1) {
        for (const c of [12, 13]) {
          const cell = summary[xlsx.utils.encode_cell({ r: i, c })]
          if (cell) cell.z = '0.00%'
        }
      }
      const notes = xlsx.utils.aoa_to_sheet([
        [`${comparisonLabel} — PMS SubayBAYAN vs RPMES`],
        ['Exported (PHT)', dateLabel(new Date())],
        ['PMS SubayBAYAN', usingCachedProjects ? 'Cached official PMS10 records' : 'Official records from imported SubayBAYAN data'],
        ['Completion', 'Completed / total projects per LGU and source. Blank if a source has no projects.'],
        ['Status grouping', 'Preparation and procurement count as Not Yet Started. Other or blank statuses stay in total projects.'],
        ['Barangays', 'Distinct nonblank barangays per LGU and source.'],
        [],
        ['Province', 'RPMES sheet read (PHT)', 'Google Sheets source'],
        ...ready.map(({ province, key }) => [province, dateLabel(sheets[key]!.checkedAt),
          `https://docs.google.com/spreadsheets/d/${sheets[key]!.spreadsheetId}/edit`]),
        ...requested.filter((province) => !readyProvinces.has(province)).map((province) => [province, sourceFor(province) ? 'Not loaded; not included' : 'No RPMES link; not included']),
      ])
      notes['!cols'] = [25, 100, 95].map((wch) => ({ wch }))
      xlsx.utils.book_append_sheet(workbook, summary, 'LGU Summary')
      xlsx.utils.book_append_sheet(workbook, notes, 'Sources')
      xlsx.writeFile(workbook, `PMS10_${program.replace(/[^a-z0-9-]+/gi, '_')}_${cohort}_RPMES_vs_SubayBAYAN.xlsx`)
    } catch {
      setExportError(true)
    }
  }

  return <section className="rpmes-comparison" aria-labelledby="pms10-rpmes-title">
    <header className="rpmes-page-heading">
      <div>
        <p className="rpmes-eyebrow">Region X · Project monitoring</p>
        <h1 id="pms10-rpmes-title">RPMES Comparison</h1>
        <p>Compare SubayBAYAN Official with RPMES Form 2. Actual on-site updates are excluded.</p>
      </div>
      <span className="rpmes-cohort-badge">{comparisonLabel}</span>
    </header>
    <div className="rpmes-workspace">
      <div className="rpmes-comparison-controls rpmes-toolbar">
        <div className="rpmes-toolbar-filters" role="group" aria-label="Comparison filters">
          <label>Program <select className="rpmes-program-select" data-preserve-case aria-label="Program" value={isUa ? 'SBDP-UA' : 'SBDP'} disabled={loading}
            onChange={(event) => {
              setCohort((reportingYear + (event.target.value === 'SBDP-UA' ? '-UA' : '')) as RpmesCohort)
              resetComparisonSelection()
            }}>
            {fundingOptions.map((value) => <option value={value} key={value}>{value}</option>)}
          </select></label>
          <label>Reporting year <select aria-label="Reporting year" value={reportingYear} disabled={loading}
            onChange={(event) => {
              setCohort((event.target.value + (isUa ? '-UA' : '')) as RpmesCohort)
              resetComparisonSelection()
            }}>
            {yearOptions.map((value) => <option value={value} key={value}>FY {value}</option>)}
          </select></label>
          <label>Province <select aria-label="Province" value={selected} disabled={loading}
            onChange={(event) => {
              const province = event.target.value as RpmesProvince | ''
              setSelected(province)
              setImportProvince(province)
              setImportUrl('')
              setImportError('')
              setNotice('')
            }}>
            <option value="">All five provinces</option>
            {RPMES_PROVINCES.map((province) => <option key={province}>{province}</option>)}
          </select></label>
        </div>
        <button type="button" className="rpmes-primary rpmes-toolbar-button rpmes-compare-button"
          onClick={() => void runComparison()} disabled={loading || !configured.length}>
          <RpmesToolbarIcon name={ready.length ? 'refresh' : 'compare'} />
          {ready.length ? 'Refresh comparison' : 'Compare statuses'}
        </button>
      </div>
      <div className="rpmes-comparison-controls rpmes-workbook-bar">
        <div className="rpmes-link-status">
          <strong>{configured.length} of {requested.length} {requested.length === 1 ? 'province' : 'provinces'} linked</strong>
          {missing.length > 0 && <span>No link yet for {missing.join(', ')}. Unlinked provinces are excluded from totals.</span>}
        </div>
        <div className="rpmes-actions rpmes-workbook-actions" role="group" aria-label="Workbook tools">
          <button className="rpmes-secondary rpmes-toolbar-button" type="button" aria-controls="rpmes-import-link" aria-expanded={importOpen} disabled={loading}
            onClick={() => {
              if (!importOpen) {
                setManagerOpen(false)
                setImportProvince(selected)
                setImportUrl('')
                setImportError('')
              }
              setImportOpen(!importOpen)
            }}><RpmesToolbarIcon name="import" />Import RPMES Link</button>
          {auth.isAdmin && <button className="rpmes-secondary rpmes-toolbar-button" type="button" aria-controls="rpmes-link-manager" aria-expanded={managerOpen} disabled={loading}
            onClick={() => {
              if (!managerOpen) setImportOpen(false)
              setManagerOpen(!managerOpen)
            }}><RpmesToolbarIcon name="links" />Manage RPMES Links</button>}
          <button className="rpmes-toolbar-button rpmes-excel-button" type="button" disabled={loading || !compared.length}
            onClick={() => void exportComparison()}><RpmesToolbarIcon name="export" />Export Excel</button>
        </div>
      </div>
      {auth.isAdmin && <RpmesLinkManager open={managerOpen} disabled={loading} yearOptions={yearOptions}
        initialYear={reportingYear} links={links} onSave={saveManagedLinks} />}
      {importOpen && <form id="rpmes-import-link" className="rpmes-import" onSubmit={importLink}>
        <p><strong>Link a province workbook for {comparisonLabel}</strong></p>
        <p>Use the standard RPMES Form 2 tab for this program and year. The sheet may contain both regular and UA projects. Only the selected funding type is compared. Links are saved in this browser.</p>
        <div className="rpmes-comparison-controls rpmes-import-fields">
          <label>RPMES province <select aria-label="RPMES province" value={importProvince} disabled={loading} required
            onChange={(event) => setImportProvince(event.target.value as RpmesProvince | '')}>
            <option value="">Select a province</option>
            {RPMES_PROVINCES.map((province) => <option key={province}>{province}</option>)}
          </select></label>
          <label className="rpmes-link-field">Google Sheets link <input aria-label="Google Sheets link" type="url" required maxLength={2048} value={importUrl}
            disabled={loading} placeholder="https://docs.google.com/spreadsheets/d/…"
            onChange={(event) => setImportUrl(event.target.value)} /></label>
          <button type="submit" className="rpmes-primary" disabled={loading || !importProvince}>Import link</button>
        </div>
        {importError && <p role="alert">{importError}</p>}
      </form>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Reading RPMES Form 2…</p>}
    {failed.length > 0 && <p role="alert">
      Could not read RPMES for {failed.map(({ province }) => province).join(', ')}. Those provinces are not included in the table.
    </p>}
    {exportError && <p role="alert">Could not export the comparison. Please try again.</p>}
    {projectSource === 'empty' && <p role="status">Waiting for official PMS10 project records.</p>}
    {!configured.length && <div className="rpmes-empty">
      <strong>No RPMES workbook linked for this selection</strong>
      <p>Use {auth.isAdmin && 'Manage RPMES Links or '}Import RPMES Link to add a workbook for {comparisonLabel}. A missing link does not mean there are zero projects.</p>
    </div>}
    {ready.length > 0 && <>
      {usingCachedProjects && <p role="status">PMS SubayBAYAN is showing cached records.</p>}
      <div className="rpmes-summary" aria-label="Comparison totals">
        <div><strong>{compared.length}</strong> LGUs covered <span>across {provinceCount} {provinceCount === 1 ? 'province' : 'provinces'}</span></div>
        <div><strong>{subayProjectCount}</strong> PMS SubayBAYAN projects</div>
        <div><strong>{rpmesProjectCount}</strong> RPMES projects</div>
        <div><strong>{differing.length}</strong> {differing.length === 1 ? 'LGU' : 'LGUs'} with differences</div>
      </div>
      {compared.length > 0 && <div className="rpmes-table-options">
        <p>One number means both sources agree. Highlighted cells show each source’s figure.</p>
        <label><input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)} /> Show differences only</label>
      </div>}
      {visible.length > 0 && <div className="rpmes-comparison-table" tabIndex={0} role="region" aria-label="LGU status summary">
        <table>
          <caption>Showing {visible.length} of {compared.length} LGUs</caption>
          <thead>
            <tr>
              <th scope="col">Province</th><th scope="col">LGU</th>
              {SUMMARY_COLUMNS.map(({ key }) => <th scope="col" key={key}>{metricLabels[key]}</th>)}
            </tr>
          </thead>
          {[...byProvince].map(([province, rows]) => <tbody key={province}>
            {rows.map((row, index) => <tr key={row.key}>
              {index === 0 && <th className="rpmes-province-cell" scope="rowgroup" rowSpan={rows.length}>{province}</th>}
              <th scope="row">{row.lgu}</th>
              {SUMMARY_COLUMNS.map(({ key }) => {
                const subay = displayMetric(key, row.subay[key])
                const rpmes = displayMetric(key, row.rpmes[key])
                const differs = subay !== rpmes
                return <td key={key} data-diff={differs}>
                  {differs ? <div className="rpmes-metric-difference">
                    <span><span>SubayBAYAN</span> <strong>{subay}</strong></span>
                    <span><span>RPMES</span> <strong>{rpmes}</strong></span>
                  </div> : subay}
                </td>
              })}
            </tr>)}
          </tbody>)}
        </table>
      </div>}
      {!compared.length && <p>No projects were found in the selected scope.</p>}
      {differencesOnly && compared.length > 0 && !visible.length && <p role="status">No differences in the displayed metrics for the selected LGUs.</p>}
      {compared.length > 0 && <section className="rpmes-status-summary" aria-labelledby="rpmes-status-summary-title">
        <h2 id="rpmes-status-summary-title">Summary{differencesOnly && <span>All {compared.length} LGUs in scope</span>}</h2>
        <table aria-labelledby="rpmes-status-summary-title">
          <thead><tr>
            <th scope="col">Project status</th>
            {sources.map((source) => <th key={source} scope="col">{sourceNames[source]}</th>)}
          </tr></thead>
          <tbody>{statusSummaryRows.map(({ key, label }) => {
            const subay = compared.reduce((total, row) => total + row.subay[key], 0)
            const rpmes = compared.reduce((total, row) => total + row.rpmes[key], 0)
            return <tr key={key}>
              <th scope="row">{label}</th>
              <td data-diff={subay !== rpmes}>{subay}</td>
              <td data-diff={subay !== rpmes}>{rpmes}</td>
            </tr>
          })}</tbody>
        </table>
      </section>}
    </>}
  </section>
}
