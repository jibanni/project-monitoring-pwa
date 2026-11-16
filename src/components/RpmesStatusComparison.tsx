import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { getCanonicalProjectLgu } from '../data/region10Directory'
import { canViewProject } from '../utils/aorAccess'
import { normalizeProgramName } from '../utils/program'
import { getPmsProjectStatus } from '../utils/projectStatus'
import {
  parseRpmesValues, pilotProvince, rpmesCsvUrl, rpmesSpreadsheetId, RPMES_PILOT_PROVINCES,
  RPMES_PILOT_SOURCES, SUMMARY_COLUMNS, summarizeByLgu, text,
  type PilotProvince, type StatusEntry,
} from '../utils/rpmesStatusComparison'
import '../styles/rpmesStatusComparison.css'

type Project = Record<string, unknown>
type SheetData = { rows: StatusEntry[]; checkedAt: Date; spreadsheetId: string }
type SourceLinks = Partial<Record<PilotProvince, string>>
type Props = { officialProjects: Project[]; projectSource: 'memory' | 'device' | 'network' | 'empty'; refreshProjects: () => Promise<void> }

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

function readLinks(storageKey: string): SourceLinks {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
    return Object.fromEntries(RPMES_PILOT_PROVINCES.flatMap((province) => {
      const id = saved?.[province]
      return typeof id === 'string' && /^[\w-]{20,128}$/.test(id) ? [[province, id]] : []
    }))
  } catch {
    return {}
  }
}

async function loadRpmes(province: PilotProvince, spreadsheetId: string): Promise<SheetData> {
  const response = await fetch(rpmesCsvUrl(province, spreadsheetId), {
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
  return { rows: parseRpmesValues(values, province), checkedAt: new Date(), spreadsheetId }
}

export default function RpmesStatusComparison({ officialProjects, projectSource, refreshProjects }: Props) {
  const auth = useAuth()
  const storageKey = `pms10:rpmes-links:v1:${auth.user?.id}`
  const [links, setLinks] = useState(() => readLinks(storageKey))
  const [selected, setSelected] = useState<PilotProvince | ''>('')
  const [sheets, setSheets] = useState<Partial<Record<PilotProvince, SheetData>>>({})
  const [errors, setErrors] = useState<PilotProvince[]>([])
  const [loading, setLoading] = useState(false)
  const [differencesOnly, setDifferencesOnly] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importProvince, setImportProvince] = useState<PilotProvince | ''>('')
  const [importUrl, setImportUrl] = useState('')
  const [importError, setImportError] = useState('')
  const [notice, setNotice] = useState('')
  const [exportError, setExportError] = useState(false)
  const busy = useRef(false)
  const usingCachedProjects = projectSource !== 'network'

  const official = useMemo(() => officialProjects.flatMap((project): StatusEntry[] => {
    const province = pilotProvince(project.province)
    if (!province || text(project.funding_year) !== '2025' || normalizeProgramName(project.funding_source) !== 'SBDP') return []
    return [{ province, municipality: text(project.municipality), barangay: text(project.barangay), status: getPmsProjectStatus(project) }]
  }), [officialProjects])
  const provinces = RPMES_PILOT_PROVINCES.filter((province) => auth.isAdmin || official.some((entry) => entry.province === province))
  const requested = selected ? provinces.filter((province) => province === selected) : provinces
  const ready = projectSource === 'empty' ? [] : requested.filter((province) => sheets[province] && !errors.includes(province))
  const rpmes = ready.flatMap((province) => sheets[province]!.rows.filter((entry) => canViewProject(entry, auth)))
  const compared = summarizeByLgu(official.filter((entry) => ready.includes(entry.province)), rpmes, getCanonicalProjectLgu)
  const differing = compared.filter((row) => SUMMARY_COLUMNS.some(({ key }) =>
    displayMetric(key, row.subay[key]) !== displayMetric(key, row.rpmes[key])))
  const visible = differencesOnly ? differing : compared
  const subayProjectCount = compared.reduce((total, row) => total + row.subay.projects, 0)
  const rpmesProjectCount = compared.reduce((total, row) => total + row.rpmes.projects, 0)
  const byProvince = new Map<PilotProvince, typeof compared>()
  for (const row of visible) {
    const group = byProvince.get(row.province)
    if (group) group.push(row)
    else byProvince.set(row.province, [row])
  }
  const provinceCount = new Set(compared.map((row) => row.province)).size

  async function runComparison() {
    if (busy.current || !requested.length) return
    busy.current = true
    setLoading(true)
    setNotice('')
    setExportError(false)
    try {
      const [results] = await Promise.all([
        Promise.allSettled(requested.map((province) => loadRpmes(province, links[province] ?? RPMES_PILOT_SOURCES[province]))),
        refreshProjects().catch(() => undefined),
      ])
      const failed: PilotProvince[] = []
      const next: Partial<Record<PilotProvince, SheetData>> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[requested[index]] = result.value
        else failed.push(requested[index])
      })
      setSheets((previous) => ({ ...previous, ...next }))
      setErrors((previous) => [...previous.filter((province) => !requested.includes(province)), ...failed])
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  async function importLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !importProvince || !provinces.includes(importProvince)) return
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
      const data = await loadRpmes(province, spreadsheetId)
      const next = { ...links, [province]: spreadsheetId }
      setLinks(next)
      setSheets((previous) => ({ ...previous, [province]: data }))
      setErrors((previous) => previous.filter((item) => item !== province))
      setSelected(province)
      setImportOpen(false)
      setImportUrl('')
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
        setNotice(`RPMES link imported for ${province} and saved in this browser.`)
      } catch {
        setNotice(`RPMES link imported for ${province} for this visit. Browser storage was unavailable.`)
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
        ['FY 2025 SBDP — PMS SubayBAYAN vs RPMES'],
        ['Exported (PHT)', dateLabel(new Date())],
        ['PMS SubayBAYAN', usingCachedProjects ? 'Cached official PMS10 records' : 'Official records from imported SubayBAYAN data'],
        ['Completion', 'Completed / total projects per LGU and source. Blank if a source has no projects.'],
        ['Status grouping', 'Preparation and procurement count as Not Yet Started. Other or blank statuses stay in total projects.'],
        ['Barangays', 'Distinct nonblank barangays per LGU and source.'],
        [],
        ['Province', 'RPMES sheet read (PHT)', 'Google Sheets source'],
        ...ready.map((province) => [province, dateLabel(sheets[province]!.checkedAt),
          `https://docs.google.com/spreadsheets/d/${sheets[province]!.spreadsheetId}/edit`]),
        ...requested.filter((province) => !ready.includes(province)).map((province) => [province, 'Not loaded; not included']),
      ])
      notes['!cols'] = [25, 100, 95].map((wch) => ({ wch }))
      xlsx.utils.book_append_sheet(workbook, summary, 'LGU Summary')
      xlsx.utils.book_append_sheet(workbook, notes, 'Sources')
      xlsx.writeFile(workbook, 'PMS10_FY2025_SBDP_RPMES_vs_SubayBAYAN.xlsx')
    } catch {
      setExportError(true)
    }
  }

  return <section className="rpmes-comparison" aria-labelledby="pms10-rpmes-title">
    <h1 id="pms10-rpmes-title">RPMES Comparison</h1>
    <p>FY 2025 SBDP · PMS SubayBAYAN Official vs RPMES Form 2. Actual on-site updates are excluded.</p>
    <div className="rpmes-comparison-controls">
      <label>Province <select aria-label="Province" value={selected} disabled={loading || !provinces.length}
        onChange={(event) => setSelected(event.target.value as PilotProvince | '')}>
        <option value="">All available pilot provinces</option>
        {provinces.map((province) => <option key={province}>{province}</option>)}
      </select></label>
      <button type="button" className="rpmes-primary" onClick={() => void runComparison()} disabled={loading || !requested.length}>
        {ready.length ? 'Refresh comparison' : 'Compare statuses'}
      </button>
      <button type="button" aria-controls="rpmes-import-link" aria-expanded={importOpen} disabled={loading || !provinces.length}
        onClick={() => {
          if (!importOpen) {
            setImportProvince(selected || provinces[0] || '')
            setImportUrl('')
            setImportError('')
          }
          setImportOpen(!importOpen)
        }}>Import RPMES Link</button>
      {compared.length > 0 && <button type="button" disabled={loading} onClick={() => void exportComparison()}>Export Excel</button>}
    </div>
    {importOpen && <form id="rpmes-import-link" className="rpmes-import" onSubmit={importLink}>
      <p>Select the province and paste its FY 2025 SBDP RPMES workbook link. Saved links apply only in this browser.</p>
      <div className="rpmes-comparison-controls">
        <label>RPMES province <select aria-label="RPMES province" value={importProvince} disabled={loading}
          onChange={(event) => setImportProvince(event.target.value as PilotProvince)}>
          {provinces.map((province) => <option key={province}>{province}</option>)}
        </select></label>
        <label className="rpmes-link-field">Google Sheets link <input aria-label="Google Sheets link" type="url" required maxLength={2048} value={importUrl}
          disabled={loading} placeholder="https://docs.google.com/spreadsheets/d/…"
          onChange={(event) => setImportUrl(event.target.value)} /></label>
        <button type="submit" className="rpmes-primary" disabled={loading || !importProvince}>Import link</button>
      </div>
      {importError && <p role="alert">{importError}</p>}
    </form>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Reading RPMES Form 2…</p>}
    {requested.some((province) => errors.includes(province)) && <p role="alert">
      Could not read RPMES for {requested.filter((province) => errors.includes(province)).join(', ')}. Those provinces are not included in the table.
    </p>}
    {exportError && <p role="alert">Could not export the comparison. Please try again.</p>}
    {projectSource === 'empty' && <p role="status">Waiting for official PMS10 project records.</p>}
    {!requested.length && <p role="status">No FY 2025 SBDP pilot projects are available in your current PMS10 scope.</p>}
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
