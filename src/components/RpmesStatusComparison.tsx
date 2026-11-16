import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { canViewProject } from '../utils/aorAccess'
import { normalizeProgramName } from '../utils/program'
import {
  compareRpmesStatus, parseRpmesValues, physicalLabels, pilotProvince, rpmesCsvUrl,
  RPMES_PILOT_PROVINCES, RPMES_PILOT_SOURCES, statusLabels, text, toPhysical,
  type PilotProvince, type StatusEntry,
} from '../utils/rpmesStatusComparison'
import '../styles/rpmesStatusComparison.css'

type Project = {
  province: unknown; municipality: unknown; funding_source: unknown; funding_year?: unknown
  subaybayan_project_code?: unknown; project_name: unknown; status: unknown; physical_accomplishment: unknown
}
type SheetData = { rows: StatusEntry[]; checkedAt: Date }
type Props = { projects: Project[]; projectSource: 'memory' | 'device' | 'network' | 'empty'; refreshProjects: () => Promise<void> }

const dateLabel = (date: Date) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
}).format(date)

async function loadRpmes(province: PilotProvince): Promise<SheetData> {
  const response = await fetch(rpmesCsvUrl(province), {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) throw new Error('CSV unavailable')
  const csv = await response.text()
  if (csv.length > 1_000_000) throw new Error('Unexpected response size')
  const { read, utils } = await import('xlsx')
  const workbook = read(csv, { type: 'string', raw: true })
  const values = utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: '' })
  return { rows: parseRpmesValues(values, province), checkedAt: new Date() }
}

export default function RpmesStatusComparison({ projects, projectSource, refreshProjects }: Props) {
  const auth = useAuth()
  const [selected, setSelected] = useState<PilotProvince | ''>('')
  const [sheets, setSheets] = useState<Partial<Record<PilotProvince, SheetData>>>({})
  const [errors, setErrors] = useState<PilotProvince[]>([])
  const [loading, setLoading] = useState(false)
  const [exceptionsOnly, setExceptionsOnly] = useState(false)
  const [exportError, setExportError] = useState(false)
  const usingCachedProjects = projectSource !== 'network'

  const official = useMemo(() => projects.flatMap((project): StatusEntry[] => {
    const province = pilotProvince(project.province)
    if (!province || text(project.funding_year) !== '2025' || normalizeProgramName(project.funding_source) !== 'SBDP') return []
    return [{ code: text(project.subaybayan_project_code), province, municipality: text(project.municipality),
      title: text(project.project_name), status: text(project.status), physical: toPhysical(project.physical_accomplishment) }]
  }), [projects])
  const provinces = RPMES_PILOT_PROVINCES.filter((province) => auth.isAdmin || official.some((entry) => entry.province === province))
  const requested = selected ? provinces.filter((province) => province === selected) : provinces
  const ready = projectSource === 'empty' ? [] : requested.filter((province) => sheets[province] && !errors.includes(province))
  const rpmes = ready.flatMap((province) => sheets[province]!.rows.filter((entry) => canViewProject(entry, auth)))
  const compared = compareRpmesStatus(rpmes, official.filter((entry) => ready.includes(entry.province)))
  const visible = exceptionsOnly ? compared.filter((row) => row.result !== 'Match') : compared
  const matching = compared.filter((row) => row.result === 'Match').length

  async function runComparison() {
    setLoading(true)
    setExportError(false)
    try {
      const [results] = await Promise.all([
        Promise.allSettled(requested.map(loadRpmes)),
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
      setLoading(false)
    }
  }

  async function exportComparison() {
    setExportError(false)
    try {
      const xlsx = await import('xlsx')
      const workbook = xlsx.utils.book_new()
      const detail = xlsx.utils.aoa_to_sheet([
        ['Province', 'LGU', 'Project Code', 'Project Title', 'RPMES Form 2 Status (AB)', 'SubayBAYAN Status in PMS10', 'SubayBAYAN Physical %', 'Comparison', 'Review Notes'],
        ...visible.map((row) => [row.province, row.municipality, row.code, row.title, statusLabels(row.rpmes),
          statusLabels(row.subay), physicalLabels(row.subay), row.result, row.note]),
      ])
      detail['!cols'] = [24, 23, 33, 60, 31, 27, 24, 26, 74].map((wch) => ({ wch }))
      if (detail['!ref']) detail['!autofilter'] = { ref: detail['!ref'] }
      const sources = xlsx.utils.aoa_to_sheet([
        ['FY 2025 SBDP — RPMES vs SubayBAYAN'],
        ['Exported (PHT)', dateLabel(new Date())],
        ['Rows exported', exceptionsOnly ? 'Exceptions only' : 'All results in your scope'],
        ['SubayBAYAN source', usingCachedProjects ? 'Cached PMS10 official records' : 'PMS10 official records from the imported SubayBAYAN extract'],
        ['Note', 'Source reporting periods can differ. A discrepancy is for verification and does not change either source.'],
        [],
        ['Province', 'RPMES sheet read (PHT)', 'Google workbook'],
        ...ready.map((province) => [province, dateLabel(sheets[province]!.checkedAt),
          `https://docs.google.com/spreadsheets/d/${RPMES_PILOT_SOURCES[province]}/edit`]),
        ...requested.filter((province) => !ready.includes(province)).map((province) => [province, 'Not loaded; not included in comparison']),
      ])
      sources['!cols'] = [29, 100, 95].map((wch) => ({ wch }))
      xlsx.utils.book_append_sheet(workbook, detail, 'Comparison')
      xlsx.utils.book_append_sheet(workbook, sources, 'Sources')
      xlsx.writeFile(workbook, 'PMS10_FY2025_SBDP_RPMES_vs_SubayBAYAN.xlsx')
    } catch {
      setExportError(true)
    }
  }

  return <section className="rpmes-comparison" aria-labelledby="pms10-rpmes-title">
    <h2 id="pms10-rpmes-title">RPMES vs SubayBAYAN Project Status</h2>
    <p>FY 2025 SBDP · RPMES Form 2, column AB, compared with the SubayBAYAN records imported into PMS10.</p>
    <div className="rpmes-comparison-controls">
      <label>Province <select value={selected} disabled={loading || !provinces.length}
        onChange={(event) => setSelected(event.target.value as PilotProvince | '')}>
        <option value="">All available pilot provinces</option>
        {provinces.map((province) => <option key={province}>{province}</option>)}
      </select></label>
      <button type="button" onClick={() => void runComparison()} disabled={loading || !requested.length}>
        {loading ? 'Comparing…' : ready.length ? 'Refresh comparison' : 'Compare statuses'}
      </button>
      {compared.length > 0 && <>
        <label><input type="checkbox" checked={exceptionsOnly} onChange={(event) => setExceptionsOnly(event.target.checked)} /> Exceptions only</label>
        <button type="button" disabled={loading || !visible.length} onClick={() => void exportComparison()}>Export Excel</button>
      </>}
    </div>
    {loading && <p role="status">Reading the selected RPMES sheets and refreshing PMS10 records…</p>}
    {requested.some((province) => errors.includes(province)) && <p role="alert">
      Unable to read RPMES for {requested.filter((province) => errors.includes(province)).join(', ')}. No missing project flags were generated for those provinces. Retry to include them.
    </p>}
    {exportError && <p role="alert">Could not export the comparison. Please try again.</p>}
    {projectSource === 'empty' && <p role="status">Waiting for official PMS10 records before classifying comparisons.</p>}
    {!requested.length && <p role="status">No FY 2025 SBDP pilot projects are available in your current PMS10 scope.</p>}
    {ready.length > 0 && <>
      <p role="status"><strong>{matching} matches · {compared.length - matching} for review</strong> · Showing {visible.length} of {compared.length} comparison rows.</p>
      <p className="rpmes-comparison-meta">{ready.map((province) => `${province}: ${dateLabel(sheets[province]!.checkedAt)}`).join(' · ')} (RPMES read, PHT).
        {usingCachedProjects ? ' SubayBAYAN uses cached PMS10 records.' : ''} Source reporting dates may differ.</p>
      {visible.length > 0 && <div className="rpmes-comparison-table" tabIndex={0} role="region" aria-label="Project status comparison results">
        <table>
          <thead><tr>{['Project / LGU', 'RPMES Form 2 · AB', 'SubayBAYAN in PMS10', 'SubayBAYAN physical', 'Comparison'].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
          <tbody>{visible.map((row) => <tr key={row.key}>
            <td><strong>{row.title || 'Untitled project'}</strong><small>{row.code || 'No SubayBAYAN code'} · {row.municipality} · {row.province}</small></td>
            <td>{statusLabels(row.rpmes)}</td><td>{statusLabels(row.subay)}</td><td>{physicalLabels(row.subay)}</td>
            <td><span className="rpmes-result" data-match={row.result === 'Match'}>{row.result}</span><small>{row.note}</small></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>
}
