import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { refreshSharedProjects } from '../lib/projectDataCache'
import { useAuth } from '../context/AuthContext'
import {
  createProjectFingerprint,
  getSubayProjectFingerprint,
  parseSubayMasterlistFile,
  projectPayloadFromSubayRecord,
  SUBAY_MIN_FUNDING_YEAR,
} from '../services/subayImportService'
import type { SubayImportIssue, SubayImportRecord, SubaySourceRow } from '../services/subayImportService'
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
  status?: string | null
  physical_accomplishment?: number | string | null
  budget?: number | string | null
  disbursement_amount?: number | string | null
  financial_accomplishment?: number | string | null
  revised_project_cost?: number | string | null
  has_contract_modification?: boolean | string | null
}

type PreviewAction = 'create' | 'update_by_code' | 'link_manual' | 'reconcile_code' | 'invalid'

type PreviewRow = {
  record: SubayImportRecord
  action: PreviewAction
  actionLabel: string
  projectId?: string
  existingBudget?: number | string | null
  existingDisbursementAmount?: number | string | null
  existingFinancialAccomplishment?: number | string | null
  existingRevisedProjectCost?: number | string | null
  existingHasContractModification?: boolean | string | null
  previousOfficialCode?: string | null
  existingProjectName?: string | null
  existingProjectStatus?: string | null
  existingProjectPhysical?: number | string | null
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

function getCanonicalSglgifCode(value: unknown) {
  const code = textValue(value).toUpperCase()
  const match = code.match(/^SGLGIF-(\d{4})-(\d{10})(?:-|$)/)

  return match ? `SGLGIF-${match[1]}-${match[2]}` : ''
}

function getStatusClass(action: PreviewAction) {
  if (action === 'create') return 'create'
  if (action === 'update_by_code') return 'update'
  if (action === 'link_manual' || action === 'reconcile_code') return 'link'
  return 'invalid'
}

function formatCurrency(value: number | null | undefined) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) return ''

  return `Php ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getImportCost(record: SubayImportRecord) {
  return record.budget || record.contractAmount || 0
}

function formatFinancialPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-'
  return `${Number(value).toFixed(2)}%`
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
  const uncodedByFingerprint = new Map<string, ExistingProject[]>()
  const codedByFingerprint = new Map<string, ExistingProject[]>()
  const linkedProjectIds = new Set<string>()
  const incomingOfficialCodes = new Set(records.map((record) => record.projectCode.trim().toUpperCase()))

  existingProjects.forEach((project) => {
    const code = getProjectCode(project)

    if (code) byCode.set(code, project)

    // Match and migrate SGLGIF codes created by the earlier importer, which
    // appended the project title after the 10-digit LGU reference code.
    const canonicalSglgifCode = getCanonicalSglgifCode(code)
    if (canonicalSglgifCode && !byCode.has(canonicalSglgifCode)) {
      byCode.set(canonicalSglgifCode, project)
    }

    const fingerprint = createProjectFingerprint({
      funding_year: project.funding_year,
      funding_source: project.funding_source,
      province: project.province,
      municipality: project.municipality,
      project_name: project.project_name,
    })

    if (fingerprint) {
      const matches = code ? codedByFingerprint : uncodedByFingerprint
      matches.set(fingerprint, [...(matches.get(fingerprint) || []), project])
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
        existingBudget: existingByCode.budget,
        existingDisbursementAmount: existingByCode.disbursement_amount,
        existingFinancialAccomplishment: existingByCode.financial_accomplishment,
        existingRevisedProjectCost: existingByCode.revised_project_cost,
        existingHasContractModification: existingByCode.has_contract_modification,
      }
    }

    const fingerprint = getSubayProjectFingerprint(record)
    const uncodedMatches = uncodedByFingerprint.get(fingerprint) || []
    const codedMatches = codedByFingerprint.get(fingerprint) || []

    // A descriptive match is ONLY allowed to attach an official code to a
    // formerly manually enrolled record that has no SubayBAYAN project code.
    // Do not silently overwrite a different official project code.
    if (uncodedMatches.length > 1) {
      return {
        record,
        action: 'invalid',
        actionLabel: 'Review Match',
        issue: `Multiple uncoded PMS10 projects match ${record.projectCode}. Review duplicates manually before importing.`,
      }
    }

    if (uncodedMatches.length === 1) {
      const manualMatch = uncodedMatches[0]
      if (linkedProjectIds.has(manualMatch.id)) {
        return {
          record,
          action: 'invalid',
          actionLabel: 'Review Match',
          issue: 'This PMS10 manual project was already matched to a different imported row. No changes will be applied.',
        }
      }
      linkedProjectIds.add(manualMatch.id)
      return {
        record,
        action: 'link_manual',
        actionLabel: 'Link Existing (No Code)',
        projectId: manualMatch.id,
        existingBudget: manualMatch.budget,
        existingDisbursementAmount: manualMatch.disbursement_amount,
        existingFinancialAccomplishment: manualMatch.financial_accomplishment,
        existingRevisedProjectCost: manualMatch.revised_project_cost,
        existingHasContractModification: manualMatch.has_contract_modification,
        existingProjectName: manualMatch.project_name,
        existingProjectStatus: manualMatch.status,
        existingProjectPhysical: manualMatch.physical_accomplishment,
        issue: 'This existing PMS10 project has no SubayBAYAN code. Its official details will be linked and updated; this is not a new project.',
      }
    }

    // SubayBAYAN is the authority for official project codes and status.
    // A previously stored code may be obsolete. We may safely repair that
    // existing row (and retain its inspection/photo project_id) ONLY if:
    // - the full year/program/province/LGU/title fingerprint is unique,
    // - the old code is NOT present anywhere in the current official extract,
    // - and no other incoming row has already claimed the same PMS10 row.
    // Otherwise preserve both official identities; never overwrite a code
    // belonging to a different entry in the SAME official masterlist.
    const staleCodeCandidates = codedMatches.filter((project) =>
      !incomingOfficialCodes.has(getProjectCode(project)),
    )
    if (codedMatches.length === 1 && staleCodeCandidates.length === 1) {
      const stale = staleCodeCandidates[0]
      if (linkedProjectIds.has(stale.id)) {
        return {
          record,
          action: 'invalid',
          actionLabel: 'Review Duplicates',
          issue: 'The same PMS10 project was already matched to another source row. No code will be replaced.',
        }
      }
      linkedProjectIds.add(stale.id)
      return {
        record,
        action: 'reconcile_code',
        actionLabel: 'Update Official Code',
        projectId: stale.id,
        previousOfficialCode: getProjectCode(stale),
        existingBudget: stale.budget,
        existingDisbursementAmount: stale.disbursement_amount,
        existingFinancialAccomplishment: stale.financial_accomplishment,
        existingRevisedProjectCost: stale.revised_project_cost,
        existingHasContractModification: stale.has_contract_modification,
        existingProjectName: stale.project_name,
        existingProjectStatus: stale.status,
        existingProjectPhysical: stale.physical_accomplishment,
        issue: `SubayBAYAN is authoritative: replace obsolete stored code ${getProjectCode(stale)} with ${record.projectCode} on this existing project. Inspection history and project ID remain unchanged.`,
      }
    }

    if (codedMatches.length > 1 && staleCodeCandidates.length > 0) {
      return {
        record,
        action: 'invalid',
        actionLabel: 'Review Ambiguous Match',
        issue: 'Multiple existing coded projects share the source title, year, program and location. No automatic overwrite is safe. Review their project codes.',
      }
    }

    if (codedMatches.length > 0) {
      // This is a DISTINCT source project because the other matching title
      // is associated with an official code ALSO present in this extract.
      return {
        record,
        action: 'create',
        actionLabel: 'Create Official Project',
        issue: 'Another official project shares this title and location, but its distinct code is also in this masterlist. Create this separate source project; do not merge them by title.',
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
  const [sourceRows, setSourceRows] = useState<SubaySourceRow[]>([])
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
      link: previewRows.filter((row) => row.action === 'link_manual' || row.action === 'reconcile_code').length,
      invalid: previewRows.filter((row) => row.action === 'invalid').length,
      importable: previewRows.filter((row) => row.action !== 'invalid').length,
    }
  }, [previewRows])

  async function fetchExistingProjects() {
    const projects: ExistingProject[] = []
    const pageSize = 500
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_name, funding_year, funding_source, province, municipality, subaybayan_project_code, status, physical_accomplishment, budget, disbursement_amount, financial_accomplishment, revised_project_cost, has_contract_modification')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      const page = (data || []) as ExistingProject[]
      projects.push(...page)
      if (page.length < pageSize) break
    }
    return projects
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    setErrorMessage('')
    setSuccessMessage('')
    setImportResult(null)
    setPreviewRows([])
    setSourceRows([])
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
      setSourceRows(parseResult.sourceRows)
      setPreviewRows(buildPreviewRows(parseResult.records, existingProjects))

      if (parseResult.records.length === 0) {
        if (parseResult.sourceRows.length > 0) {
          setSuccessMessage(
            `No FY ${SUBAY_MIN_FUNDING_YEAR} onwards projects were found for the active list. ${parseResult.sourceRows.length.toLocaleString()} genuine project source rows can still be archived for future use.`,
          )
        } else {
          setErrorMessage('No nonblank rows were found in a supported sheet.')
        }
      }
    } catch (error: any) {
      console.error(error)
      setErrorMessage(
        error?.message ||
          'Unable to read the project masterlist. Please check the XLS/XLSX file.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmImport() {
    if (stats.importable === 0 && sourceRows.length === 0) {
      setErrorMessage('There are no valid project rows or source rows to keep.')
      return
    }

    const confirmed = window.confirm(
      'Proceed with the project masterlist import? PMS10 will first keep a read-only copy of every genuine project row, including columns it does not currently use. Spreadsheet headers, logo/caption rows, and decorative rows are ignored. Existing project master data with the same import code will be updated. SubayBAYAN values supersede the official project master data. Engineer/field observations remain preserved in the inspection history.',
    )

    if (!confirmed) return

    setImporting(true)
    setErrorMessage('')
    setSuccessMessage('')

    // Stop before archiving or updating records if the database migration
    // is missing. Otherwise each project update would fail on reverted_funds.
    const hasSubayRecords = previewRows.some(
      (row) => row.action !== 'invalid' && row.record.subayFormat !== 'sglgif_portal',
    )
    if (hasSubayRecords) {
      const { error: schemaError } = await supabase
        .from('projects')
        .select('reverted_funds')
        .limit(1)
      if (schemaError) {
        setImporting(false)
        setErrorMessage(
          'SubayBAYAN import stopped: the reverted_funds database column is not available. ' +
            'Apply migration 20261112083000_add_subay_reverted_funds.sql in Supabase ' +
            'before importing. No project records were changed.',
        )
        return
      }
    }

    const sourceRowsToKeep = sourceRows
    let sourceBatchId = ''

    try {
      const { data: batch, error: batchError } = await supabase
        .from('subay_import_batches')
        .insert({
          source_file_name: fileName || 'SubayBAYAN extract',
          imported_by: auth?.user?.id || null,
          expected_row_count: sourceRowsToKeep.length,
        })
        .select('id')
        .single()

      if (batchError || !batch?.id) {
        throw batchError || new Error('Unable to create the source archive batch.')
      }

      sourceBatchId = batch.id

      for (let offset = 0; offset < sourceRowsToKeep.length; offset += 100) {
        const chunk = sourceRowsToKeep.slice(offset, offset + 100).map((row) => ({
          batch_id: sourceBatchId,
          project_code: row.projectCode,
          source_format: row.sourceFormat,
          source_format_label: row.sourceFormatLabel,
          source_sheet_name: row.sheetName,
          source_row_number: row.rowNumber,
          source_data: row.sourceData,
        }))
        const { error: archiveError } = await supabase
          .from('subay_import_source_rows')
          .insert(chunk)

        if (archiveError) throw archiveError
      }
    } catch (error: any) {
      setImporting(false)
      setErrorMessage(
        `PMS10 could not preserve the uploaded source rows, so project import was stopped before changing project records. ${error?.message || ''}`.trim(),
      )
      return
    }

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

      const payload = projectPayloadFromSubayRecord(row.record, {
        isCreate: row.action === 'create',
        existingBudget: row.existingBudget,
        existingDisbursementAmount: row.existingDisbursementAmount,
        existingFinancialAccomplishment: row.existingFinancialAccomplishment,
        existingRevisedProjectCost: row.existingRevisedProjectCost,
        existingHasContractModification: row.existingHasContractModification,
      })

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

          if (row.action === 'link_manual' || row.action === 'reconcile_code') {
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

    try {
      await refreshSharedProjects({ force: true })
    } catch (refreshError) {
      console.warn('Imported project data saved; dashboard cache refresh failed.', refreshError)
    }

    setImporting(false)
    setImportResult(result)

    if (result.errors.length > 0) {
      setErrorMessage(
        `Source rows are safely archived. Project import completed with ${result.errors.length} row error(s). Review the result summary below.`,
      )
    } else if (stats.importable === 0) {
      setSuccessMessage(
        `${sourceRowsToKeep.length.toLocaleString()} genuine project source rows were archived. No project rows were eligible for the active PMS10 list.`,
      )
    } else {
      setSuccessMessage(
        `Project masterlist import completed. ${sourceRowsToKeep.length.toLocaleString()} genuine project source rows were kept for future PMS10 fields.`,
      )
    }
  }

  function resetImport() {
    setFileName('')
    setPreviewRows([])
    setSourceRows([])
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
          <p>Only Admin accounts can import SubayBAYAN and SGLGIF masterlists.</p>
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
          <h1>Project Masterlist Import</h1>
          <p>
            Upload a supported SubayBAYAN or SGLGIF XLS/XLSX masterlist. PMS10
            keeps the two SubayBAYAN formats and also detects the SGLGIF Portal
            projects extraction. SGLGIF import codes use the format
            SGLGIF-FY-########## and do not include the project title. Existing
            records are matched without duplicating inspection history. The
            original values from every nonblank row are also kept for future
            PMS10 improvements, including fields that are not currently used.
            The archive is append-only and available to approved Admins.
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
            <h2>Upload SubayBAYAN or SGLGIF Masterlist</h2>
            <p>
              Accepted formats: .xls and .xlsx. Supported layouts are
              SubayBAYAN FY 2024-below, SubayBAYAN FY 2025-above, and the SGLGIF
              Portal projects extraction.
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
          <span>Total Projects</span>
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
          <span>Link / Reconcile</span>
          <strong>{stats.link}</strong>
        </article>
        <article className="subay-import-summary-card red">
          <span>Invalid</span>
          <strong>{stats.invalid}</strong>
        </article>
      </section>

      {stats.link > 0 && (
        <section className="subay-import-sheet-note" aria-label="Previously manual projects matched to source records">
          <strong>Existing PMS10 project identities requiring official matching ({stats.link})</strong>
          <p>SubayBAYAN codes are authoritative. PMS10 will retain the existing project ID and engineering history while linking an uncoded project or reconciling a unique obsolete code.</p>
          {previewRows.filter((row) => row.action === 'link_manual' || row.action === 'reconcile_code').map((row) => (
            <p key={row.record.projectCode}>
              <strong>{row.action === 'reconcile_code' ? 'Official code correction' : 'Link uncoded record'}:</strong>
              {' '}{row.previousOfficialCode || 'No existing code'} → {row.record.projectCode}
              {' '}— {row.record.projectTitle} ({row.record.municipality}, {row.record.province}).
              {' '}Before: {row.existingProjectStatus || 'Not specified'} ({row.existingProjectPhysical ?? 'Not recorded'}% physical).
              {' '}Official: {row.record.status || 'Not specified'} ({row.record.physicalAccomplishment ?? 'Not recorded'}% physical).
            </p>
          ))}
        </section>
      )}

      {detectedSheets.length > 0 && (
        <section className="subay-import-sheet-note">
          Detected supported sheet(s): <strong>{detectedSheets.join(', ')}</strong>
        </section>
      )}

      {issues.length > 0 && (
        <section className="subay-import-card subay-import-issues-card">
          <h2>Warnings / Incomplete / Skipped Rows</h2>
          <div className="subay-import-issues-list">
            {issues.slice(0, 12).map((issue, index) => (
              <div key={`${issue.sheetName}-${issue.rowNumber}-${index}`}>
                <strong>{issue.sheetName}</strong>
                <span>Row {issue.rowNumber || '-'}</span>
                <p>{issue.message}</p>
              </div>
            ))}
          </div>
          <p className="subay-import-muted">
            Warning/incomplete rows are still importable unless the message explicitly says
            “Skipped row”. Admin can complete missing master data after enrollment.
          </p>
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
              SubayBAYAN uses PROJECT CODE. SGLGIF uses a stable import code
              generated from its LGU reference code, year, LGU, and title. Only FY{' '}
              {SUBAY_MIN_FUNDING_YEAR} onwards will be included. Existing PMS10
              inspection updates, photos, and Google Drive records are preserved;
              official project values are replaced by the imported SubayBAYAN data. Only
              genuine project rows are counted and archived with their original
              columns; spreadsheet headers, logo/caption rows, and decorative
              rows are ignored. A dedicated “Date of NADAI” is used as the
              download date; other NADAI indicators stay in the source archive
              until their meaning is confirmed.
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
              disabled={loading || importing || sourceRows.length === 0}
            >
              {importing
                ? 'Importing...'
                : stats.importable === 0
                  ? `Keep Source Rows (${sourceRows.length})`
                  : `Confirm Import (${stats.importable})`}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="subay-import-loading">
            <div className="subay-import-loader" />
            <p>Reading project masterlist...</p>
          </div>
        ) : previewRows.length === 0 ? (
          <div className="subay-import-empty">
            {sourceRows.length > 0
              ? `No project rows qualify for the active FY ${SUBAY_MIN_FUNDING_YEAR}+ list. The ${sourceRows.length.toLocaleString()} source rows can still be archived above.`
              : 'Upload a supported SubayBAYAN or SGLGIF masterlist to preview projects before import.'}
          </div>
        ) : (
          <div className="subay-import-table-wrap">
            <table className="subay-import-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Project / Import Code</th>
                  <th>Project Title</th>
                  <th>LGU</th>
                  <th>Program / FY</th>
                  <th>Cost</th>
                  <th>Financial Source</th>
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
                    <td>
                      {formatCurrency(getImportCost(row.record)) || (
                        <>
                          <span>Blank</span>
                          {row.record.subayFormat === 'sglgif_portal' && (
                            <small>Enter manually after import</small>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {row.record.disbursementAmount !== null || row.record.revertedFunds !== null ? (
                        <>
                          <strong>Official SubayBAYAN</strong>
                          <small>
                            Disbursed: {formatCurrency(row.record.disbursementAmount) || 'Php 0.00'}
                          </small>
                          <small>
                            Reverted: {formatCurrency(row.record.revertedFunds) || 'Php 0.00'}
                          </small>
                          <small>
                            Financial: {formatFinancialPercent(row.record.financialAccomplishment)}
                          </small>
                        </>
                      ) : (
                        <>
                          <strong>No source financial figures</strong>
                          <small>Disbursement and reversion were not reported</small>
                        </>
                      )}
                    </td>
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
