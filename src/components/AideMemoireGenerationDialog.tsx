import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createPortal } from 'react-dom'
import {
  aideMemoireDocumentToBlob,
  aideMemoirePhotoAssetToBlob,
  getAideMemoireDocument,
  getAideMemoirePhotoAssets,
  offlineDb,
  saveAideMemoireDocument,
  saveAideMemoireRecord,
  type AideMemoirePhoto,
  type OfflineAideMemoire,
} from '../lib/offlineDb'
import {
  generateAideMemoireFiles,
  type AideMemoireExportData,
  type AideMemoireExportFormat,
} from '../utils/aideMemoireExport'
import '../styles/aideMemoireGenerationDialog.css'

type Source = 'online' | 'offline'

type Props = {
  open: boolean
  projectId: string
  updateRef: string
  source: Source
  returnTo?: string
  onClose: () => void
  onGenerated?: () => void | Promise<void>
}

function buildRecordId(projectId: string, source: Source, updateRef: string) {
  return `aide-${projectId}-${source}-${updateRef}`
}

function mapExportData(
  record: OfflineAideMemoire,
  photos: Array<AideMemoirePhoto & { blob?: Blob }>,
  extractedBy: string,
  extractedAt: string,
): AideMemoireExportData {
  return {
    extractedBy,
    extractedAt,
    provinceHuc: record.province_huc,
    officeName: record.office_name,
    officeAddress: record.office_address,
    inspectionDate: record.inspection_date,
    projectTitle: record.project_title,
    program: record.program,
    projectCode: record.project_code,
    fundingYear: record.funding_year,
    nationalSubsidy: record.national_subsidy,
    lguEquity: record.lgu_equity,
    projectType: record.project_type,
    exactLocation: record.exact_location,
    implementingUnit: record.implementing_unit,
    modeOfImplementation: record.mode_of_implementation,
    contractorName: record.contractor_name,
    contractAmount: record.contract_amount,
    contractDuration: record.contract_duration,
    revisedContractDuration: record.revised_contract_duration,
    originalExpirationDate: record.original_expiration_date,
    revisedExpirationDate: record.revised_expiration_date,
    targetToDate: record.target_to_date,
    actualToDate: record.actual_to_date,
    physicalVariance: record.physical_variance,
    balance: record.balance,
    totalDisbursement: record.total_disbursement,
    financialAccomplishment: record.financial_accomplishment,
    generalObservations: record.general_observations,
    findings: (record.findings || []).map((item) => {
      const linkedPhotos = photos.filter((photo) => (item.photo_refs || []).includes(photo.photo_ref))
      const coordinateLines = linkedPhotos.map((photo) => {
        if (!Number.isFinite(Number(photo.latitude)) || !Number.isFinite(Number(photo.longitude))) {
          return `Photo ${photo.photo_number}: GPS not available`
        }
        return `Photo ${photo.photo_number} GPS: ${Number(photo.latitude).toFixed(7)}, ${Number(photo.longitude).toFixed(7)}`
      })
      return {
        finding: item.finding,
        recommendation: item.recommendation,
        timeline: item.timeline,
        remarks: [item.remarks, ...coordinateLines].filter(Boolean).join('\n'),
      }
    }),
    attendance: (record.attendance || []).map((item) => ({
      name: item.name,
      designationAgency: item.designation_agency,
    })),
    photos: photos
      .sort((first, second) => Number(first.photo_number || 0) - Number(second.photo_number || 0))
      .map((photo) => ({
        caption: photo.caption,
        fileName: photo.file_name,
        fileType: photo.file_type,
        blob: photo.blob,
        url: photo.photo_url,
        latitude: photo.latitude ?? null,
        longitude: photo.longitude ?? null,
        capturedAt: photo.captured_at,
        findingId: photo.finding_id,
        photoKind: photo.photo_kind,
      })),
  }
}

export default function AideMemoireGenerationDialog({
  open,
  projectId,
  updateRef,
  source,
  returnTo,
  onClose,
  onGenerated,
}: Props) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [record, setRecord] = useState<OfflineAideMemoire | null>(null)
  const [photos, setPhotos] = useState<Array<AideMemoirePhoto & { blob?: Blob }>>([])
  const [format, setFormat] = useState<AideMemoireExportFormat>('pdf')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [latestPdfBlob, setLatestPdfBlob] = useState<Blob | null>(null)
  const [latestPdfName, setLatestPdfName] = useState('Aide_Memoire.pdf')
  const [latestPdfDocumentId, setLatestPdfDocumentId] = useState('')

  const aideMemoireId = useMemo(
    () => buildRecordId(projectId, source, updateRef),
    [projectId, source, updateRef],
  )

  useEffect(() => {
    if (!open || !projectId || !updateRef) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setMessage('')
      setWarning('')
      setError('')

      try {
        let stored = await offlineDb.aide_memoires.get(aideMemoireId)
        if (!stored) {
          stored = await offlineDb.aide_memoires
            .where('[project_id+update_ref]')
            .equals([projectId, updateRef])
            .first()
        }

        if (!stored) {
          throw new Error('The submitted inspection snapshot is not available on this device.')
        }

        const legacyPhotos = (stored.photos || []).filter((photo) => Boolean(photo.file_blob))
        if (legacyPhotos.length > 0 || stored.latest_pdf_blob || stored.latest_docx_blob) {
          stored = await saveAideMemoireRecord(stored)
        }

        const assets = await getAideMemoirePhotoAssets(stored.id)
        const assetMap = new Map(assets.map((asset) => [asset.photo_ref, asset]))
        const loadedPhotos = (stored.photos || []).map((photo) => {
          const asset = assetMap.get(photo.photo_ref)
          return {
            ...photo,
            blob: asset ? aideMemoirePhotoAssetToBlob(asset) : photo.file_blob,
          }
        })

        const storedPdf = await getAideMemoireDocument(stored.id, 'pdf')

        if (cancelled) return
        setRecord(stored)
        setPhotos(loadedPhotos)
        if (storedPdf) {
          setLatestPdfBlob(aideMemoireDocumentToBlob(storedPdf))
          setLatestPdfName(storedPdf.file_name || 'Aide_Memoire.pdf')
          setLatestPdfDocumentId(storedPdf.id)
        } else {
          setLatestPdfBlob(null)
          setLatestPdfName('Aide_Memoire.pdf')
          setLatestPdfDocumentId('')
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Unable to prepare the Aide Memoire output.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, aideMemoireId, projectId, updateRef])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !generating) onClose()
    }
    document.body.classList.add('am-direct-dialog-open')
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('am-direct-dialog-open')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, generating, onClose])

  if (!open) return null

  function openLatestPdf() {
    if (!latestPdfBlob) return

    if (latestPdfDocumentId) {
      const fallbackReturnTo = returnTo || `/projects/${projectId}`
      const source = fallbackReturnTo.endsWith('/updates') ? 'update' : 'details'
      const params = new URLSearchParams({
        documentId: latestPdfDocumentId,
        from: source,
        returnTo: fallbackReturnTo,
      })

      onClose()
      navigate(`/projects/${projectId}/aide-memoire/pdf?${params.toString()}`)
      return
    }

    const url = URL.createObjectURL(latestPdfBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = latestPdfName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function generate() {
    if (!record) return
    setGenerating(true)
    setMessage('')
    setWarning('')
    setError('')

    try {
      const generatedAt = new Date().toISOString()
      const extractedBy =
        auth?.profile?.full_name ||
        auth?.profile?.email ||
        auth?.user?.email ||
        'PMS10 User'
      const result = await generateAideMemoireFiles(
        mapExportData(record, photos, extractedBy, generatedAt),
        format,
      )
      const cacheWarnings: string[] = []

      if (result.pdfBlob && result.pdfFileName) {
        setLatestPdfBlob(result.pdfBlob)
        setLatestPdfName(result.pdfFileName)
        try {
          const storedPdf = await saveAideMemoireDocument({
            aideMemoireId: record.id,
            projectId: record.project_id,
            updateRef: record.update_ref,
            format: 'pdf',
            fileName: result.pdfFileName,
            blob: result.pdfBlob,
            generatedAt,
          })
          setLatestPdfDocumentId(storedPdf.id)
        } catch (cacheError) {
          console.error('PDF generated but the local Latest PDF cache could not be saved.', cacheError)
          cacheWarnings.push('The PDF downloaded, but its local Latest PDF copy could not be retained on this device.')
        }
      }

      if (result.docxBlob && result.docxFileName) {
        try {
          await saveAideMemoireDocument({
            aideMemoireId: record.id,
            projectId: record.project_id,
            updateRef: record.update_ref,
            format: 'docx',
            fileName: result.docxFileName,
            blob: result.docxBlob,
            generatedAt,
          })
        } catch (cacheError) {
          console.error('DOCX generated but its local cache could not be saved.', cacheError)
          cacheWarnings.push('The DOCX downloaded, but its local copy could not be retained on this device.')
        }
      }

      setMessage(`${result.generated.join(' and ')} generated successfully.`)
      setWarning(cacheWarnings.join(' '))
      await onGenerated?.()
    } catch (generationError: any) {
      setError(generationError?.message || 'Unable to generate the Aide Memoire file.')
    } finally {
      setGenerating(false)
    }
  }

  return createPortal(
    <div className="am-direct-backdrop" role="presentation" onMouseDown={() => !generating && onClose()}>
      <section
        className="am-direct-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="am-direct-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="am-direct-header">
          <div>
            <p>Document Output</p>
            <h2 id="am-direct-title">Generate Aide Memoire</h2>
            <span>{record?.project_title || 'Submitted inspection'}</span>
          </div>
          <button type="button" onClick={onClose} disabled={generating} aria-label="Close">×</button>
        </header>

        {loading ? (
          <div className="am-direct-state"><span className="am-direct-spinner" /> Preparing inspection data…</div>
        ) : (
          <>
            {error && <div className="am-direct-error">{error}</div>}
            {message && <div className="am-direct-success">{message}</div>}
            {warning && <div className="am-direct-warning">{warning}</div>}

            {record && (
              <>
                <div className="am-direct-summary">
                  <span><small>Inspection</small><strong>{record.inspection_date || '—'}</strong></span>
                  <span><small>Findings</small><strong>{record.findings?.length || 0}</strong></span>
                  <span><small>Attendees</small><strong>{record.attendance?.length || 0}</strong></span>
                  <span><small>Photos</small><strong>{record.photos?.length || 0}</strong></span>
                </div>

                <div className="am-direct-options">
                  {([
                    ['docx', 'Editable DOCX', 'For review and final corrections'],
                    ['pdf', 'Final PDF', 'For printing and official submission'],
                    ['both', 'DOCX and PDF', 'Generate both files'],
                  ] as const).map(([value, title, subtitle]) => (
                    <label key={value} className={format === value ? 'is-selected' : ''}>
                      <input
                        type="radio"
                        name="aide-output-direct"
                        value={value}
                        checked={format === value}
                        onChange={() => setFormat(value)}
                      />
                      <span><strong>{title}</strong><small>{subtitle}</small></span>
                    </label>
                  ))}
                </div>

                <div className="am-direct-actions">
                  <button type="button" className="secondary" onClick={onClose} disabled={generating}>Cancel</button>
                  {latestPdfBlob && (
                    <button type="button" className="document" onClick={openLatestPdf} disabled={generating}>Latest PDF</button>
                  )}
                  <button type="button" className="primary" onClick={() => void generate()} disabled={generating}>
                    {generating ? 'Generating…' : 'Generate File'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}
