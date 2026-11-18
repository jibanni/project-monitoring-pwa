import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProjectFundingProgram } from '../utils/program'
import { compareReportingProjects, type ReportingProject, type ReportingChange } from '../utils/reportingSnapshotVariance'
import '../styles/reportingSnapshots.css'

type ProjectScopeSource = {
  subaybayan_project_code?: string | null
  funding_source?: string | null
  project_type?: string | null
  funding_year?: number | string | null
  province?: string | null
}

type Snapshot = {
  id: string
  report_month: string
  program: string | null
  funding_year: number | null
  province: string | null
  captured_at: string
  project_count: number
}

type Comparison = { comparedAt: string; baseline: ReportingProject[]; current: ReportingProject[] }
type Result = ReturnType<typeof compareReportingProjects>
const snapshotColumns = 'id, report_month, program, funding_year, province, captured_at, project_count'
const reportDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const monthLabel = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', timeZone: 'Asia/Manila' })
const dateLabel = (value: string) => reportDate.format(new Date(value))
const formatMonth = (value: string) => monthLabel.format(new Date(value + 'T00:00:00Z'))
const scopeLabel = (row: Snapshot) => [row.program || 'All programs', row.funding_year ? `FY ${row.funding_year}` : 'All funding years', row.province || 'All provinces and cities'].join(' · ')
const signed = (value: number) => value > 0 ? `+${value}` : String(value)
const percent = (value?: number | null) => value == null ? '—' : `${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}%`
const message = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Try again in a moment.'

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Manila' }).formatToParts(new Date())
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`
}

async function listSnapshots(signal?: AbortSignal) {
  const request = supabase.from('pms10_reporting_snapshots').select(snapshotColumns)
    .order('report_month', { ascending: false }).order('captured_at', { ascending: false }).order('id')
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw error
  return (data ?? []) as Snapshot[]
}

async function exportVariance(snapshot: Snapshot, comparison: Comparison, result: Result) {
  const xlsx = await import('xlsx')
  const book = xlsx.utils.book_new()
  const summary = xlsx.utils.aoa_to_sheet([
    ['Reporting Snapshots and Variance Analysis'],
    ['Source', 'SubayBAYAN Official'],
    ['Reporting period', formatMonth(snapshot.report_month)],
    ['Scope', scopeLabel(snapshot)],
    ['Snapshot captured (PHT)', dateLabel(snapshot.captured_at)],
    ['Records compared (PHT)', dateLabel(comparison.comparedAt)],
    ['Note', 'Not found in latest data does not mean cancelled.'],
    [],
    ['Project status', 'Snapshot', 'Latest', 'Variance'],
    ...result.summary.map(({ label, before, after, delta }) => [label, before, after, delta]),
  ])
  summary['!cols'] = [{ wch: 34 }, { wch: 68 }, { wch: 15 }, { wch: 15 }]
  const projects = xlsx.utils.aoa_to_sheet([
    ['Variance', 'Project code', 'Project', 'Province', 'LGU', 'Program', 'Funding year', 'Snapshot status',
      'Latest status', 'Snapshot physical (%)', 'Latest physical (%)', 'Snapshot financial (%)', 'Latest financial (%)', 'Revised fields'],
    ...result.changes.map(({ kind, before, after, fields }) => {
      const project = (after ?? before)!
      return [kind, project.code, project.title, project.province, project.municipality, project.program,
        project.fundingYear, before?.status, after?.status, before?.physical, after?.physical, before?.financial, after?.financial, fields.join(', ')]
    }),
  ])
  projects['!cols'] = [27, 23, 54, 25, 25, 25, 14, 22, 22, 22, 22, 22, 22, 50].map((wch) => ({ wch }))
  if (projects['!ref']) projects['!autofilter'] = { ref: projects['!ref'] }
  xlsx.utils.book_append_sheet(book, summary, 'Summary')
  xlsx.utils.book_append_sheet(book, projects, 'Project Details')
  xlsx.writeFile(book, `PMS10_SubayBAYAN_Variance_${snapshot.report_month.slice(0, 7)}.xlsx`)
}

function ReportingSnapshotsPanel({ projects }: { projects: readonly ProjectScopeSource[] }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotId, setSnapshotId] = useState('')
  const [month, setMonth] = useState(currentMonth)
  const [program, setProgram] = useState('')
  const [fundingYear, setFundingYear] = useState('')
  const [province, setProvince] = useState('')
  const [busy, setBusy] = useState(true)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [page, setPage] = useState(0)
  const [category, setCategory] = useState<ReportingChange['kind'] | ''>('')
  const selected = snapshots.find(({ id }) => id === snapshotId)
  const result = useMemo(() => comparison ? compareReportingProjects(comparison.baseline, comparison.current) : null, [comparison])
  const options = useMemo(() => {
    const official = projects.filter((project) => project.subaybayan_project_code?.trim())
    const values = (list: string[]) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b))
    return {
      programs: values(official.map((project) => getProjectFundingProgram(project) || 'Unspecified')),
      years: [...new Set(official.map(({ funding_year }) => String(funding_year ?? '')).filter((value) => /^\d{4}$/.test(value)))].sort((a, b) => Number(b) - Number(a)),
      provinces: values(official.map(({ province }) => province?.trim() ?? '')),
    }
  }, [projects])

  useEffect(() => {
    const abort = new AbortController()
    listSnapshots(abort.signal)
      .then((rows) => { if (!abort.signal.aborted) { setSnapshots(rows); setSnapshotId(rows[0]?.id ?? '') } })
      .catch((error) => { if (!abort.signal.aborted) setError(`Could not load saved snapshots. ${message(error)}`) })
      .finally(() => { if (!abort.signal.aborted) setBusy(false) })
    return () => abort.abort()
  }, [])

  const pageSize = 12
  const changes = result?.changes.filter((row) => !category || row.kind === category) ?? []

  async function run(name: string, work: () => Promise<void>) {
    setBusy(true)
    setAction(name)
    setError('')
    setNotice('')
    try { await work() } catch (error) { setError(`${name} failed. ${message(error)}`) }
    finally { setBusy(false); setAction('') }
  }

  function save() {
    if (!/^\d{4}-\d{2}$/.test(month)) { setError('Select a reporting month.'); return }
    void run('Save snapshot', async () => {
      const { data, error } = await supabase.rpc('pms10_save_reporting_snapshot', {
        p_month: month + '-01', p_program: program || null, p_year: fundingYear ? Number(fundingYear) : null, p_province: province || null,
      })
      if (error) throw error
      setComparison(null)
      setNotice('Official records captured. The snapshot is saved.')
      try {
        setSnapshots(await listSnapshots())
        setSnapshotId(String(data))
      } catch (error) {
        setError(`The snapshot was saved, but the list could not reload. ${message(error)}`)
      }
    })
  }

  function compare() {
    if (!selected) return
    setComparison(null)
    void run('Compare', async () => {
      const { data, error } = await supabase.rpc('pms10_compare_reporting_snapshot', { p_snapshot_id: selected.id })
      if (error) throw error
      if (!data || !Array.isArray(data.baseline) || !Array.isArray(data.current)) throw new Error('The selected snapshot is unavailable.')
      setComparison(data as Comparison)
      setPage(0)
      setCategory('')
    })
  }

  return <div className="snapshot-panel" aria-busy={busy}>
    <p>Save a baseline from SubayBAYAN Official and compare it with the latest official records. Actual On-Site updates are excluded.</p>
    <form className="snapshot-controls" onSubmit={(event) => { event.preventDefault(); save() }}>
      <label>Reporting month <input type="month" required value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      <label>Program <select aria-label="Program" value={program} onChange={(event) => setProgram(event.target.value)}>
        <option value="">All programs</option>{options.programs.map((value) => <option key={value} value={value} data-preserve-case>{value}</option>)}
      </select></label>
      <label>Funding year <select aria-label="Funding year" value={fundingYear} onChange={(event) => setFundingYear(event.target.value)}>
        <option value="">All funding years</option>{options.years.map((value) => <option key={value} value={value}>FY {value}</option>)}
      </select></label>
      <label>Province or city <select aria-label="Province or city" value={province} onChange={(event) => setProvince(event.target.value)}>
        <option value="">All provinces and cities</option>{options.provinces.map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <button className="snapshot-primary" type="submit" disabled={busy}>Save reporting snapshot</button>
    </form>
    <div className="snapshot-controls snapshot-compare-controls">
      <label>Saved snapshot <select aria-label="Saved snapshot" value={snapshotId} onChange={(event) => {
        setSnapshotId(event.target.value); setComparison(null); setError(''); setNotice('')
      }} disabled={busy || !snapshots.length}>
        <option value="">{snapshots.length ? 'Select a snapshot' : 'No saved snapshots'}</option>
        {snapshots.map((item) => <option key={item.id} value={item.id} data-preserve-case>
          {formatMonth(item.report_month)} · {scopeLabel(item)} · {item.project_count} projects · {dateLabel(item.captured_at)}
        </option>)}
      </select></label>
      <button type="button" className="snapshot-primary" disabled={busy || !selected} onClick={compare}>Compare with latest</button>
      <button type="button" disabled={busy || !selected || !comparison || !result} onClick={() => {
        if (selected && comparison && result) void run('Export', () => exportVariance(selected, comparison, result))
      }}>Export variance to Excel</button>
      <button type="button" disabled={busy} onClick={() => void run('Reload snapshots', async () => {
        const next = await listSnapshots()
        setSnapshots(next)
        if (!next.some(({ id }) => id === snapshotId)) { setSnapshotId(next[0]?.id ?? ''); setComparison(null) }
      })}>Reload snapshots</button>
    </div>
    {busy && <p role="status">{action ? `${action} in progress…` : 'Loading saved snapshots…'}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="snapshot-error" role="alert">{error}</p>}
    {selected && comparison && result && <>
      <p><strong>{formatMonth(selected.report_month)}</strong> · {scopeLabel(selected)}<br />
        Snapshot captured {dateLabel(selected.captured_at)} PHT · Latest data read {dateLabel(comparison.comparedAt)} PHT</p>
      <div className="snapshot-table-wrap">
        <table aria-label="Snapshot status summary">
          <thead><tr><th scope="col">Project status</th><th scope="col">Snapshot</th><th scope="col">Latest</th><th scope="col">Variance</th></tr></thead>
          <tbody>{result.summary.map((row) => <tr key={row.label}>
            <th scope="row">{row.label}</th><td>{row.before}</td><td>{row.after}</td><td>{signed(row.delta)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="snapshot-detail-heading"><h3>Project-level variances</h3>
        <label>Variance type <select aria-label="Variance type" value={category} onChange={(event) => { setCategory(event.target.value as typeof category); setPage(0) }}>
          <option value="">All variances</option><option>Added</option><option>Revised</option><option>Not found in latest data</option>
        </select></label>
      </div>
      <p>Not found in latest data means the project does not appear in the latest records for this scope. It is not a cancellation status.</p>
      {changes.length === 0 ? <p>No project-level variances in this selection.</p> : <>
        <div className="snapshot-table-wrap">
          <table aria-label="Project-level variances">
            <thead><tr>{['Project', 'Location', 'Variance', 'Snapshot status', 'Latest status', 'Physical', 'Financial'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{changes.slice(page * pageSize, (page + 1) * pageSize).map(({ kind, before, after, fields }) => {
              const project = (after ?? before)!
              return <tr key={`${kind}-${project.id}`}>
                <th scope="row">{project.title || project.code}<small>{project.code}</small></th>
                <td>{[project.province, project.municipality].filter(Boolean).join(' · ') || '—'}</td>
                <td>{kind}{fields.length > 0 && <small>{fields.join(', ')}</small>}</td>
                <td>{before?.status ?? '—'}</td><td>{after?.status ?? '—'}</td>
                <td>{percent(before?.physical)} → {percent(after?.physical)}</td>
                <td>{percent(before?.financial)} → {percent(after?.financial)}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        {changes.length > pageSize && <div className="snapshot-pagination">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, changes.length)} of {changes.length}</span>
          <button type="button" disabled={(page + 1) * pageSize >= changes.length} onClick={() => setPage(page + 1)}>Next</button>
        </div>}
      </>}
    </>}
  </div>
}

export default function ReportingSnapshots({ projects }: { projects: readonly ProjectScopeSource[] }) {
  const [opened, setOpened] = useState(false)
  return <details className="reporting-snapshots" onToggle={(event) => { if (event.currentTarget.open) setOpened(true) }}>
    <summary>Reporting Snapshots and Variance Analysis <span>SubayBAYAN Official</span></summary>
    {opened && <ReportingSnapshotsPanel projects={projects} />}
  </details>
}
