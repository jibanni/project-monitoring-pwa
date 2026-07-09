import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  createProjectFingerprint,
  getSubayProjectFingerprint,
  parseSubayMasterlistFile,
  projectPayloadFromSubayRecord,
  SUBAY_MIN_FUNDING_YEAR,
} from '../services/subayImportService'
import type { SubayImportIssue, SubayImportRecord } from '../services/subayImportService'
import '../styles/subayImport.css'
import '../styles/pageHero.css'

type ExistingProject = {
  id: string
  project_name?: string | null
  funding_year?: number | string | null
  funding_source?: string | null
  province?: string | null
  municipality?: string | null
  subaybayan_project_code?: string | null
}

type PreviewAction = 'create' | 'update_by_code' | 'link_manual' | 'invalid'

type PreviewRow = {
  record: SubayImportRecord
  action: PreviewAction
  actionLabel: string
  projectId?: string
  issue?: string
}

type ImportResult = {
  created: number
  updated: number
  linked: number
  skipped: number
  errors: string[]
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getProjectCode(project: ExistingProject) {
  return textValue(project.subaybayan_project_code).toUpperCase()
}

function getStatusClass(action: PreviewAction) {
  if (action === 'create') return 'create'
  if (action === 'update_by_code') return 'update'
  if (action === 'link_manual') return 'link'
  return 'invalid'
}

function formatCurrency(value: number) {
  return `Php ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: string | null) {
  if (!value) return '-'

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.25 17.25 8.5h-3.1v6h-4.3v-6h-3.1L12 3.25Z" />
      <path d="M5 16.75h14v3H5v-3Z" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 18.5 9 12l6.5-6.5" />
      <path d="M9 12h11" />
    </svg>
  )
}

function buildPreviewRows(records: SubayImportRecord[], existingProjects: ExistingProject[]) {
  const byCode = new Map<string, ExistingProject>()
  const byFingerprint = new Map<string, ExistingProject>()

  existingProjects.forEach((project) => {
    const code = getProjectCode(project)

    if (code) byCode.set(code, project)

    const fingerprint = createProjectFingerprint({
      funding_year: project.funding_year,
      funding_source: project.funding_source,
      province: project.province,
      municipality: project.municipality,
      project_name: project.project_name,
    })

    if (fingerprint && !byFingerprint.has(fingerprint)) {
      byFingerprint.set(fingerprint, project)
    }
  })

  return records.map((record): PreviewRow => {
    if (!record.projectCode || !record.projectTitle) {
      return {
        record,
        action: 'invalid',
        actionLabel: 'Invalid Row',
        issue: 'Missing PROJECT CODE or PROJECT TITLE.',
      }
    }

    const existingByCode = byCode.get(record.projectCode)

    if (existingByCode) {
      return {
        record,
        action: 'update_by_code',
        actionLabel: 'Update Existing',
        projectId: existingByCode.id,
      }
    }

    const fingerprint = getSubayProjectFingerprint(record)
    const manualMatch = byFingerprint.get(fingerprint)

    if (manualMatch) {
      return {
        record,
        action: 'link_manual',
        actionLabel: 'Link Manual Record',
        projectId: manualMatch.id,
      }
    }

    return {
      record,
      action: 'create',
      actionLabel: 'Create New',
    }
  })
}

export default function SubayImport() {
  const navigate = useNavigate()
  const auth = useAuth() as any
  const isAdmin = Boolean(auth?.isAdmin) || textValue(auth?.profile?.role).toLowerCase() === 'admin'
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [fileName, setFileName] = useState('')
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [issues, setIssues] = useState<SubayImportIssue[]>([])
  const [detectedSheets, setDetectedSheets] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const stats = useMemo(() => {
    return {
      total: previewRows.length,
      create: previewRows.filter((row) => row.action === 'create').length,
      update: previewRows.filter((row) => row.action === 'update_by_code').length,
      link: previewRows.filter((row) => row.action === 'link_manual').length,
      invalid: previewRows.filter((row) => row.action === 'invalid').length,
      importable: previewRows.filter((row) => row.action !== 'invalid').length,
    }
  }, [previewRows])

  async function fetchExistingProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, project_name, funding_year, funding_source, province, municipality, subaybayan_project_code')

    if (error) throw error

    return (data || []) as ExistingProject[]
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    setErrorMessage('')
    setSuccessMessage('')
    setImportResult(null)
    setPreviewRows([])
    setIssues([])
    setDetectedSheets([])

    if (!file) {
      setFileName('')
      return
    }

    setFileName(file.name)

    try {
      setLoading(true)

      const [parseResult, existingProjects] = await Promise.all([
        parseSubayMasterlistFile(file),
        fetchExistingProjects(),
      ])

      setIssues(parseResult.issues)
      setDetectedSheets(parseResult.detectedSheets)
      setPreviewRows(buildPreviewRows(parseResult.records, existingProjects))

      if (parseResult.records.length === 0) {
        setErrorMessage(`No FY ${SUBAY_MIN_FUNDING_YEAR} onwards project rows were found in the uploaded file.`)
      }
    } catch (error: any) {
      console.error(error)
      setErrorMessage(
        error?.message ||
          'Unable to read the SubayBAYAN masterlist. Please check the XLS/XLSX file.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmImport() {
    if (stats.importable === 0) {
      setErrorMessage('There are no valid rows to import.')
      return
    }

    const confirmed = window.confirm(
      'Proceed with SubayBAYAN Priority Import? Existing project master data with the same PROJECT CODE will be overwritten, but inspection updates and photos will be preserved.',
    )

    if (!confirmed) return

    setImporting(true)
    setErrorMessage('')
    setSuccessMessage('')

    const result: ImportResult = {
      created: 0,
      updated: 0,
      linked: 0,
      skipped: 0,
      errors: [],
    }

    for (const row of previewRows) {
      if (row.action === 'invalid') {
        result.skipped += 1
        continue
      }

      const payload = projectPayloadFromSubayRecord(row.record)

      try {
        if (row.action === 'create') {
          const { error } = await supabase.from('projects').insert(payload)
          if (error) throw error
          result.created += 1
        } else if (row.projectId) {
          const { error } = await supabase
            .from('projects')
            .update(payload)
            .eq('id', row.projectId)

          if (error) throw error

          if (row.action === 'link_manual') {
            result.linked += 1
          } else {
            result.updated += 1
          }
        } else {
          result.skipped += 1
          result.errors.push(`${row.record.projectCode}: Missing PMS10 project ID for update.`)
        }
      } catch (error: any) {
        console.error(error)
        result.skipped += 1
        result.errors.push(
          `${row.record.projectCode}: ${error?.message || 'Import failed for this row.'}`,
        )
      }
    }

    setImporting(false)
    setImportResult(result)

    if (result.errors.length > 0) {
      setErrorMessage(
        `Import completed with ${result.errors.length} row error(s). Review the result summary below.`,
      )
    } else {
      setSuccessMessage('SubayBAYAN import completed successfully.')
    }
  }

  function resetImport() {
    setFileName('')
    setPreviewRows([])
    setIssues([])
    setDetectedSheets([])
    setErrorMessage('')
    setSuccessMessage('')
    setImportResult(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (!isAdmin) {
    return (
      <main className="subay-import-page">
        <section className="subay-import-access-card">
          <h1>Admin Access Required</h1>
          <p>Only Admin accounts can import SubayBAYAN masterlists.</p>
          <button type="button" onClick={() => navigate('/projects')}>
            Back to Projects
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="subay-import-page">
      <section className="subay-import-hero">
        <div>
          <p className="subay-import-eyebrow">Admin Tool</p>
          <h1>SubayBAYAN Import</h1>
          <p>
            Upload a SubayBAYAN XLS/XLSX masterlist. PMS10 will include only FY{' '}
            {SUBAY_MIN_FUNDING_YEAR} onwards and use PROJECT CODE to update existing
            projects, link matching manual records, and add new projects without
            duplicating inspection history.
          </p>
        </div>

        <button type="button" className="subay-import-back-btn" onClick={() => navigate('/projects')}>
          <BackIcon />
          Back
        </button>
      </section>

      {(errorMessage || successMessage) && (
        <section className={`subay-import-alert ${errorMessage ? 'error' : 'success'}`}>
          {errorMessage || successMessage}
        </section>
      )}

      <section className="subay-import-card subay-import-upload-card">
        <div className="subay-import-upload-copy">
          <span className="subay-import-upload-icon">
            <UploadIcon />
          </span>
          <div>
            <h2>Upload SubayBAYAN Masterlist</h2>
            <p>
              Accepted formats: .xls and .xlsx. The importer adapts to different
              SubayBAYAN masterlist formats and captures intended completion and
              contract expiration dates when available.
            </p>
          </div>
        </div>

        <div className="subay-import-upload-actions">
          <input
            id="subay-masterlist-file"
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleFileChange}
            disabled={loading || importing}
          />
          <label className="subay-import-file-trigger" htmlFor="subay-masterlist-file">
            {loading ? 'Reading file...' : 'Choose XLS/XLSX File'}
          </label>
          <span className={`subay-import-file-name ${fileName ? 'has-file' : ''}`}>
            {fileName || 'No file selected'}
          </span>
        </div>
      </section>

      <section className="subay-import-summary-grid" aria-label="Import preview summary">
        <article className="subay-import-summary-card">
          <span>Total Rows</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="subay-import-summary-card green">
          <span>New</span>
          <strong>{stats.create}</strong>
        </article>
        <article className="subay-import-summary-card blue">
          <span>Update</span>
          <strong>{stats.update}</strong>
        </article>
        <article className="subay-import-summary-card orange">
          <span>Link Manual</span>
          <strong>{stats.link}</strong>
        </article>
        <article className="subay-import-summary-card red">
          <span>Invalid</span>
          <strong>{stats.invalid}</strong>
        </article>
      </section>

      {detectedSheets.length > 0 && (
        <section className="subay-import-sheet-note">
          Detected SubayBAYAN sheet(s): <strong>{detectedSheets.join(', ')}</strong>
        </section>
      )}

      {issues.length > 0 && (
        <section className="subay-import-card subay-import-issues-card">
          <h2>Warnings / Skipped Rows</h2>
          <div className="subay-import-issues-list">
            {issues.slice(0, 12).map((issue, index) => (
              <div key={`${issue.sheetName}-${issue.rowNumber}-${index}`}>
                <strong>{issue.sheetName}</strong>
                <span>Row {issue.rowNumber || '-'}</span>
                <p>{issue.message}</p>
              </div>
            ))}
          </div>
          {issues.length > 12 && (
            <p className="subay-import-muted">Showing first 12 of {issues.length} warnings.</p>
          )}
        </section>
      )}

      <section className="subay-import-card">
        <div className="subay-import-table-header">
          <div>
            <h2>Preview Before Import</h2>
            <p>
              PROJECT CODE is the main matching key. Only FY {SUBAY_MIN_FUNDING_YEAR}
              onwards will be included. Existing PMS10 inspection updates, photos,
              and Google Drive records are preserved.
            </p>
          </div>

          <div className="subay-import-table-actions">
            <button type="button" className="subay-import-secondary-btn" onClick={resetImport}>
              Reset
            </button>
            <button
              type="button"
              className="subay-import-primary-btn"
              onClick={handleConfirmImport}
              disabled={loading || importing || stats.importable === 0}
            >
              {importing ? 'Importing...' : `Confirm Import (${stats.importable})`}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="subay-import-loading">
            <div className="subay-import-loader" />
            <p>Reading SubayBAYAN masterlist...</p>
          </div>
        ) : previewRows.length === 0 ? (
          <div className="subay-import-empty">
            Upload a SubayBAYAN masterlist to preview projects before import.
          </div>
        ) : (
          <div className="subay-import-table-wrap">
            <table className="subay-import-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Project Code</th>
                  <th>Project Title</th>
                  <th>LGU</th>
                  <th>Program / FY</th>
                  <th>Cost</th>
                  <th>Status</th>
                  <th>Intended Completion</th>
                  <th>Contract Expiration</th>
                  <th>Revised Expiry</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={`${row.record.projectCode}-${row.record.sheetName}-${row.record.rowNumber}`}>
                    <td>
                      <span className={`subay-import-action-pill ${getStatusClass(row.action)}`}>
                        {row.actionLabel}
                      </span>
                      {row.issue && <small>{row.issue}</small>}
                    </td>
                    <td>
                      <strong>{row.record.projectCode}</strong>
                      <small>{row.record.sourceSummary}</small>
                    </td>
                    <td>{row.record.projectTitle}</td>
                    <td>
                      <strong>{row.record.municipality || '-'}</strong>
                      <small>{row.record.province || '-'}</small>
                    </td>
                    <td>
                      <strong>{row.record.fundingSource || '-'}</strong>
                      <small>{row.record.fundingYear ? `FY ${row.record.fundingYear}` : 'No FY'}</small>
                    </td>
                    <td>{formatCurrency(row.record.budget || row.record.contractAmount)}</td>
                    <td>{row.record.status}</td>
                    <td>{formatDate(row.record.targetCompletionDate)}</td>
                    <td>{formatDate(row.record.contractExpirationDate)}</td>
                    <td>{formatDate(row.record.revisedContractExpirationDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {importResult && (
        <section className="subay-import-card subay-import-result-card">
          <h2>Import Result</h2>
          <div className="subay-import-result-grid">
            <div>
              <span>Created</span>
              <strong>{importResult.created}</strong>
            </div>
            <div>
              <span>Updated</span>
              <strong>{importResult.updated}</strong>
            </div>
            <div>
              <span>Linked</span>
              <strong>{importResult.linked}</strong>
            </div>
            <div>
              <span>Skipped</span>
              <strong>{importResult.skipped}</strong>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="subay-import-error-list">
              {importResult.errors.slice(0, 10).map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
