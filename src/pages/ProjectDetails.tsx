import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { offlineDb } from '../lib/offlineDb'
import { getTargetPhysicalInfo } from '../utils/projectVariance'
import { cleanupProjectPhotos, deleteProjectPhotos } from '../services/photoService'
import '../styles/projectDetails.css'
import '../styles/pageHero.css'

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0

  const numericValue =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())

  return Number.isFinite(numericValue) ? numericValue : 0
}

function formatCurrency(value: unknown) {
  return (
    'Php ' +
    toNumber(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function formatPercent(value: unknown) {
  return (
    toNumber(value).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }) + '%'
  )
}

function clampPercent(value: unknown) {
  const numberValue = toNumber(value)

  if (numberValue < 0) return 0
  if (numberValue > 100) return 100

  return numberValue
}

function formatDate(value: unknown) {
  const rawValue = String(value ?? '').trim()

  if (!rawValue) return '-'

  const date = new Date(rawValue)

  if (Number.isNaN(date.getTime())) return rawValue

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function getDisplayValue(value: unknown, fallback = '-') {
  const displayValue = String(value ?? '').trim()
  return displayValue || fallback
}

function formatFundingYear(value: unknown) {
  const rawValue = getDisplayValue(value, '')

  if (!rawValue) return '-'

  const cleaned = rawValue.replace(/^FY\s*/i, '').trim()

  return cleaned ? `FY ${cleaned}` : '-'
}

function formatFundingDisplay(project: any) {
  const year = getDisplayValue(project?.funding_year, '')
  const source = getDisplayValue(project?.funding_source, '')

  if (year && source) return `${formatFundingYear(year)} · ${source}`
  if (year) return formatFundingYear(year)
  return source || '-'
}

function normalizeClassName(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return normalized || 'unknown'
}

function getRiskLevelFromVariance(variance: number) {
  if (!Number.isFinite(variance) || variance >= 0) return 'None'
  if (variance >= -5) return 'Low'
  if (variance > -10) return 'Moderate'
  return 'High'
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
      <path d="M9 12h10" />
    </svg>
  )
}

function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2.75h8.1L19 7.65V21.25H6V2.75Z" />
      <path d="M14 2.75V8h5" />
      <path d="M8.8 15.8h6.4" />
      <path d="M8.8 18.15h4.6" />
      <path d="M8.8 11.4h6.4" />
    </svg>
  )
}

function IconUpdate() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function IconMap() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18.5 4.75 20V6L9 4.5l6 2 4.25-1.5v14L15 20.5l-6-2Z" />
      <path d="M9 4.5v14" />
      <path d="M15 6.5v14" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 19.25 6 14.5 16.7 3.8a2.12 2.12 0 0 1 3 3L9 17.5l-4.25 1.75Z" />
      <path d="m14.9 5.6 3.5 3.5" />
    </svg>
  )
}

function IconDelete() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 7.25h13" />
      <path d="M9.5 7.25V5.1h5v2.15" />
      <path d="M7.25 7.25 8 20h8l.75-12.75" />
      <path d="M10.25 10.75v5.75" />
      <path d="M13.75 10.75v5.75" />
    </svg>
  )
}

export default function ProjectDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, isEngineer } = useAuth()

  const [project, setProject] = useState<any>(null)
  const [updates, setUpdates] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState('online')
  const [photosExpanded, setPhotosExpanded] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [isHeroCompact, setIsHeroCompact] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      window.requestAnimationFrame(() => {
        setIsHeroCompact(window.scrollY > 28)
        ticking = false
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    setPhotosExpanded(false)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadOfflineData() {
    if (!id) return

    const cachedProject = await offlineDb.projects.get(id)
    const pendingUpdates = await offlineDb.project_updates
      .where('project_id')
      .equals(id)
      .toArray()

    setProject(cachedProject || null)
    setUpdates(
      pendingUpdates.sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || '')),
      ),
    )
    setPhotos([])
    setDataSource('offline')
  }

  async function loadData() {
    setLoading(true)

    if (!id) {
      setLoading(false)
      return
    }

    if (!navigator.onLine) {
      await loadOfflineData()
      setLoading(false)
      return
    }

    try {
      const projectResult = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()

      const updatesResult = await supabase
        .from('project_updates')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false })

      if (projectResult.error) {
        throw projectResult.error
      }

      if (updatesResult.error) {
        throw updatesResult.error
      }

      await cleanupProjectPhotos(id, 5)

      const photosResult = await supabase
        .from('project_photos')
        .select('*')
        .eq('project_id', id)
        .order('uploaded_at', { ascending: false })
        .limit(5)

      if (photosResult.error) {
        throw photosResult.error
      }

      const onlineProject = projectResult.data
      const latestPhotos = photosResult.data || []

      setProject(onlineProject)
      setUpdates(updatesResult.data || [])
      setPhotos(latestPhotos)
      setDataSource('online')

      await offlineDb.projects.put({
        id: onlineProject.id,
        project_name: onlineProject.project_name || '',
        description: onlineProject.description || '',
        status: onlineProject.status || '',
        municipality: onlineProject.municipality || '',
        province: onlineProject.province || '',
        barangay: onlineProject.barangay || '',
        physical_accomplishment: onlineProject.physical_accomplishment || 0,
        target_physical_accomplishment:
          onlineProject.target_physical_accomplishment ?? null,
        target_physical_as_of: onlineProject.target_physical_as_of || '',
        target_physical_source: onlineProject.target_physical_source || 'auto',
        financial_accomplishment: onlineProject.financial_accomplishment || 0,
        risk_level: onlineProject.risk_level || '',
        project_type: onlineProject.project_type || '',
        funding_source: onlineProject.funding_source || '',
        funding_year: onlineProject.funding_year || '',
        implementing_office: onlineProject.implementing_office || '',
        contractor: onlineProject.contractor || '',
        budget: onlineProject.budget || 0,
        start_date: onlineProject.start_date || '',
        target_completion_date: onlineProject.target_completion_date || '',
        latitude: onlineProject.latitude || '',
        longitude: onlineProject.longitude || '',
        last_inspection_date: onlineProject.last_inspection_date || '',
        cached_at: new Date().toISOString(),
      } as any)
    } catch (error) {
      console.error(error)
      await loadOfflineData()
    } finally {
      setLoading(false)
    }
  }

  const latestUpdate = updates.length > 0 ? updates[0] : null
  const displayedPhotos = photos.slice(0, 5)
  const primaryPhoto = displayedPhotos.length > 0 ? displayedPhotos[0] : null
  const expandedPhotos = displayedPhotos.slice(1, 5)

  const physicalProgress = useMemo(
    () => clampPercent(project?.physical_accomplishment),
    [project],
  )

  const financialProgress = useMemo(
    () => clampPercent(project?.financial_accomplishment),
    [project],
  )

  const statusClass = normalizeClassName(project?.status)
  const varianceInfo = getTargetPhysicalInfo(project)
  const computedRiskLevel = getRiskLevelFromVariance(varianceInfo.variance)
  const riskClass = normalizeClassName(computedRiskLevel)

  function generatePdfReport() {
    if (!project) return

    const doc = new jsPDF('p', 'mm', 'a4')

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('PROJECT MONITORING REPORT', 105, 15, {
      align: 'center',
    })

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('DILG-PDMU Project Monitoring System', 105, 21, {
      align: 'center',
    })

    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30)

    autoTable(doc, {
      startY: 36,
      head: [['Project Information', 'Details']],
      body: [
        ['Project Name', project.project_name || '-'],
        ['Description', project.description || '-'],
        ['Project Type', project.project_type || '-'],
        ['Funding Year', formatFundingYear(project.funding_year)],
        ['Funding Source', project.funding_source || '-'],
        ['Implementing Office', project.implementing_office || '-'],
        ['Contractor', project.contractor || '-'],
        ['Total Project Cost', formatCurrency(project.budget)],
        ['Province', project.province || '-'],
        ['Municipality', project.municipality || '-'],
        ['Barangay', project.barangay || '-'],
        ['Latitude', project.latitude || '-'],
        ['Longitude', project.longitude || '-'],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [37, 99, 235],
      },
    })

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [['Implementation Status', 'Details']],
      body: [
        ['Status', project.status || '-'],
        ['Risk Level', computedRiskLevel],
        ['Physical Accomplishment', `${project.physical_accomplishment || 0}%`],
        [
          'Target Physical Accomplishment',
          `${getTargetPhysicalInfo(project).targetPhysical}%`,
        ],
        ['Variance', getTargetPhysicalInfo(project).label],
        ['Financial Accomplishment', `${project.financial_accomplishment || 0}%`],
        ['Last Inspection Date', project.last_inspection_date || '-'],
        ['Start Date', project.start_date || '-'],
        ['Target Completion Date', project.target_completion_date || '-'],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [22, 163, 74],
      },
    })

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [['Latest Inspection Update', 'Details']],
      body: latestUpdate
        ? [
            ['Inspection Date', latestUpdate.inspection_date || '-'],
            ['Physical Accomplishment', `${latestUpdate.physical_accomplishment || 0}%`],
            ['Financial Accomplishment', `${latestUpdate.financial_accomplishment || 0}%`],
            ['Risk Level', latestUpdate.risk_level || '-'],
            [
              'Inspection GPS',
              `${latestUpdate.inspection_latitude || '-'}, ${
                latestUpdate.inspection_longitude || '-'
              }`,
            ],
            ['Issues / Findings', latestUpdate.issues || '-'],
            ['Recommendations', latestUpdate.recommendations || '-'],
            ['Remarks', latestUpdate.remarks || '-'],
          ]
        : [['No update available', '-']],
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [245, 158, 11],
      },
    })

    if (updates.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [['Inspection Date', 'Physical', 'Financial', 'Risk', 'Remarks']],
        body: updates.map((update) => [
          update.inspection_date || '-',
          `${update.physical_accomplishment || 0}%`,
          `${update.financial_accomplishment || 0}%`,
          update.risk_level || '-',
          update.remarks || '-',
        ]),
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
        },
        headStyles: {
          fillColor: [55, 65, 81],
        },
      })
    }

    if (displayedPhotos.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [['Photo Caption', 'Photo URL']],
        body: displayedPhotos.map((photo) => [
          photo.caption || '-',
          photo.photo_url || '-',
        ]),
        styles: {
          fontSize: 7,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [124, 58, 237],
        },
      })
    }

    const pageCount = doc.getNumberOfPages()

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' })
    }

    const fileName = sanitizeFileName(
      `${project.project_name || 'project'}-monitoring-report.pdf`,
    )

    doc.save(fileName)
  }

  async function handleDelete() {
    if (!id) return

    if (!isAdmin) {
      alert('You are not allowed to delete projects.')
      return
    }

    if (!navigator.onLine) {
      alert('Deleting projects is not allowed while offline.')
      return
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this project? This will also delete its photos and update records.',
    )

    if (!confirmed) return

    try {
      await deleteProjectPhotos(id)

      const updatesDeleteResult = await supabase
        .from('project_updates')
        .delete()
        .eq('project_id', id)

      if (updatesDeleteResult.error) {
        throw updatesDeleteResult.error
      }

      const projectDeleteResult = await supabase
        .from('projects')
        .delete()
        .eq('id', id)

      if (projectDeleteResult.error) {
        throw projectDeleteResult.error
      }

      await offlineDb.projects.delete(id)

      alert('Project deleted successfully.')
      navigate('/projects')
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Unable to delete project. Please try again.')
    }
  }

  function goBackToProjects() {
    navigate('/projects')
  }

  function goToEditProject() {
    if (!id) return
    navigate(`/projects/${id}/edit`)
  }

  function goToAddUpdate() {
    if (!id) return
    navigate(`/projects/${id}/updates`)
  }

  function goToMap() {
    if (!id) return
    navigate(`/map?projectId=${encodeURIComponent(id)}&from=details`)
  }

  if (loading) {
    return (
      <div className="pd-page">
        <div className="pd-loading-state">
          <h2>Loading project details...</h2>
          <p>Please wait while the project record is being prepared.</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="pd-page">
        <div className="pd-empty-state">
          <h2>Project not found</h2>
          <p>
            This project is not available in the offline cache. Open it once while online
            before using it offline.
          </p>
          <button type="button" className="pd-secondary-btn" onClick={goBackToProjects}>
            Back to Projects
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`pd-page ${isHeroCompact ? 'is-pd-scrolled' : ''}`}>
      {dataSource === 'offline' && (
        <div className="pd-offline-banner">
          <strong>Offline Mode:</strong> You are viewing cached project details. Online
          photo gallery is unavailable while offline.
        </div>
      )}

      <header className="pd-hero">
        <div className="pd-hero-main">
          <div className="pd-title-block">
            <p className="pd-eyebrow">DETAILS</p>
            <h1>{getDisplayValue(project.project_name, 'Untitled Project')}</h1>

            <div className="pd-hero-meta">
              <span>{getDisplayValue(project.province)}</span>
              <span>{getDisplayValue(project.municipality)}</span>
              <span>{getDisplayValue(project.barangay)}</span>
            </div>
          </div>
        </div>

        <div className="pd-status-panel">
          <span className={`pd-status-badge pd-status-${statusClass}`}>
            {getDisplayValue(project.status, 'No Status')}
          </span>
          <span className={`pd-variance-badge ${varianceInfo.className}`}>
            {varianceInfo.compactLabel}
          </span>
          <span className={`pd-risk-badge pd-risk-${riskClass}`}>
            {computedRiskLevel}
          </span>
        </div>
      </header>

      <section className="pd-summary-grid">
        <article className="pd-summary-card">
          <span>Physical</span>
          <strong>{formatPercent(project.physical_accomplishment)}</strong>
          <div className="pd-progress-track">
            <div className="pd-progress-fill" style={{ width: `${physicalProgress}%` }} />
          </div>
        </article>

        <article className="pd-summary-card">
          <span>Financial</span>
          <strong>{formatPercent(project.financial_accomplishment)}</strong>
          <div className="pd-progress-track">
            <div
              className="pd-progress-fill pd-progress-fill-financial"
              style={{ width: `${financialProgress}%` }}
            />
          </div>
        </article>

        <article className="pd-summary-card">
          <span>Project Cost</span>
          <strong className="pd-cost-value">{formatCurrency(project.budget)}</strong>
        </article>

        <article className="pd-summary-card">
          <span>Last Inspection</span>
          <strong className="pd-date-value">{formatDate(project.last_inspection_date)}</strong>
        </article>
      </section>

      <main className="pd-content-grid">
        <div className="pd-main-column">
          <section className="pd-card">
            <div className="pd-section-header">
              <div>
                <p className="pd-section-eyebrow">Overview</p>
                <h2>Project Information</h2>
              </div>
            </div>

            <div className="pd-info-grid">
              <div className="pd-info-item">
                <span>Project Type</span>
                <strong>{getDisplayValue(project.project_type)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Funding Year</span>
                <strong>{formatFundingYear(project.funding_year)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Funding Source</span>
                <strong>{formatFundingDisplay(project)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Implementing Office</span>
                <strong>{getDisplayValue(project.implementing_office)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Contractor</span>
                <strong>{getDisplayValue(project.contractor)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Start Date</span>
                <strong>{formatDate(project.start_date)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Target Completion</span>
                <strong>{formatDate(project.target_completion_date)}</strong>
              </div>
            </div>

            <div className="pd-description-box">
              <span>Description</span>
              <p>{getDisplayValue(project.description, 'No project description encoded.')}</p>
            </div>
          </section>

          <section className="pd-card">
            <div className="pd-section-header">
              <div>
                <p className="pd-section-eyebrow">Latest Inspection</p>
                <h2>Latest Update</h2>
              </div>

              {latestUpdate && (
                <span className="pd-section-chip">
                  {formatDate(latestUpdate.inspection_date)}
                </span>
              )}
            </div>

            {latestUpdate ? (
              <div className="pd-latest-update">
                <div className="pd-info-grid">
                  <div className="pd-info-item">
                    <span>Inspection Date</span>
                    <strong>{formatDate(latestUpdate.inspection_date)}</strong>
                  </div>

                  <div className="pd-info-item">
                    <span>Physical</span>
                    <strong>{formatPercent(latestUpdate.physical_accomplishment)}</strong>
                  </div>

                  <div className="pd-info-item">
                    <span>Financial</span>
                    <strong>{formatPercent(latestUpdate.financial_accomplishment)}</strong>
                  </div>

                  <div className="pd-info-item">
                    <span>Risk Level</span>
                    <strong>{getDisplayValue(latestUpdate.risk_level)}</strong>
                  </div>

                  <div className="pd-info-item">
                    <span>Inspection GPS</span>
                    <strong>
                      {getDisplayValue(latestUpdate.inspection_latitude)},{' '}
                      {getDisplayValue(latestUpdate.inspection_longitude)}
                    </strong>
                  </div>

                  <div className="pd-info-item">
                    <span>Remarks</span>
                    <strong>{getDisplayValue(latestUpdate.remarks)}</strong>
                  </div>
                </div>

                <div className="pd-note-grid">
                  <div className="pd-note-box">
                    <span>Issues / Findings</span>
                    <p>{getDisplayValue(latestUpdate.issues, 'No issues encoded.')}</p>
                  </div>

                  <div className="pd-note-box">
                    <span>Recommendations</span>
                    <p>
                      {getDisplayValue(
                        latestUpdate.recommendations,
                        'No recommendations encoded.',
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pd-empty-inline">
                No inspection update has been encoded for this project yet.
              </div>
            )}
          </section>

          <section className="pd-card">
            <div className="pd-section-header">
              <div>
                <p className="pd-section-eyebrow">Location</p>
                <h2>Project Site</h2>
              </div>
            </div>

            <div className="pd-info-list">
              <div>
                <span>Province</span>
                <strong>{getDisplayValue(project.province)}</strong>
              </div>

              <div>
                <span>Municipality / City</span>
                <strong>{getDisplayValue(project.municipality)}</strong>
              </div>

              <div>
                <span>Barangay</span>
                <strong>{getDisplayValue(project.barangay)}</strong>
              </div>

              <div>
                <span>Coordinates</span>
                <strong>
                  {getDisplayValue(project.latitude)}, {getDisplayValue(project.longitude)}
                </strong>
              </div>
            </div>
          </section>

        </div>

        <aside className="pd-side-column">
          <section className="pd-card">
            <div className="pd-section-header">
              <div>
                <p className="pd-section-eyebrow">Photos</p>
                <h2>Photo Gallery</h2>
              </div>

              <span className="pd-section-chip">{displayedPhotos.length} photos</span>
            </div>

            {dataSource === 'offline' ? (
              <div className="pd-empty-inline">
                Online photo gallery is not available while offline. Newly captured offline
                photos can be viewed from the Offline Sync page before syncing.
              </div>
            ) : displayedPhotos.length === 0 || !primaryPhoto ? (
              <div className="pd-empty-inline">No photos uploaded yet.</div>
            ) : (
              <div className="pd-photo-holder">
                <button
                  type="button"
                  className="pd-feature-photo-card"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.9)), url("${primaryPhoto.photo_url}")`,
                  }}
                  onClick={() => setPhotosExpanded((current) => !current)}
                  aria-expanded={photosExpanded}
                >
                  <div className="pd-feature-photo-overlay">
                    <div>
                      <strong>
                        {getDisplayValue(primaryPhoto.caption, 'Latest project photo')}
                      </strong>
                      <span>{formatDate(primaryPhoto.uploaded_at)}</span>
                    </div>

                    <span className="pd-photo-expand-pill">
                      {photosExpanded
                        ? 'Hide Photos'
                        : expandedPhotos.length > 0
                          ? `View ${expandedPhotos.length} More`
                          : 'Latest Photo Only'}
                    </span>
                  </div>
                </button>

                {photosExpanded && (
                  <div className="pd-photo-expanded-panel">
                    <div className="pd-photo-expanded-header">
                      <div>
                        <h3>Latest Additional Photos</h3>
                        <p>Showing up to 4 photos, excluding the main photo above.</p>
                      </div>

                      <button
                        type="button"
                        className="pd-photo-collapse-btn"
                        onClick={() => setPhotosExpanded(false)}
                      >
                        Collapse
                      </button>
                    </div>

                    {expandedPhotos.length === 0 ? (
                      <div className="pd-empty-inline">
                        The latest photo is already displayed in the main photo holder.
                      </div>
                    ) : (
                      <div className="pd-photo-grid">
                        {expandedPhotos.map((photo) => (
                          <a
                            key={photo.id}
                            className="pd-photo-card"
                            href={photo.photo_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <div
                              className="pd-photo-card-image"
                              style={{
                                backgroundImage: `url("${photo.photo_url}")`,
                              }}
                            />

                            <div className="pd-photo-card-body">
                              <strong>{getDisplayValue(photo.caption, 'Project photo')}</strong>
                              <span>{formatDate(photo.uploaded_at)}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
          <section className="pd-card pd-history-section">
            <div className="pd-section-header">
              <div>
                <p className="pd-section-eyebrow">History</p>
                <h2>Update History</h2>
              </div>

              <span className="pd-section-chip">
                {updates.length} record{updates.length === 1 ? '' : 's'}
              </span>
            </div>

            {updates.length === 0 ? (
              <div className="pd-empty-inline">No update history available.</div>
            ) : (
              <div className="pd-history-list">
                {updates.map((update) => (
                  <article key={update.id} className="pd-history-card">
                    <div className="pd-history-top">
                      <div>
                        <span>Inspection Date</span>
                        <strong>{formatDate(update.inspection_date)}</strong>
                      </div>

                      <span
                        className={`pd-risk-badge pd-risk-${normalizeClassName(
                          update.risk_level,
                        )}`}
                      >
                        {getDisplayValue(update.risk_level, 'No Risk')}
                      </span>
                    </div>

                    <div className="pd-history-progress">
                      <div>
                        <span>Physical</span>
                        <strong>{formatPercent(update.physical_accomplishment)}</strong>
                      </div>

                      <div>
                        <span>Financial</span>
                        <strong>{formatPercent(update.financial_accomplishment)}</strong>
                      </div>
                    </div>

                    <div className="pd-note-grid pd-history-note-grid">
                      <div className="pd-note-box">
                        <span>Issues / Findings</span>
                        <p>{getDisplayValue(update.issues, 'No issues encoded.')}</p>
                      </div>

                      <div className="pd-note-box">
                        <span>Recommendations</span>
                        <p>
                          {getDisplayValue(
                            update.recommendations,
                            'No recommendations encoded.',
                          )}
                        </p>
                      </div>

                      <div className="pd-note-box">
                        <span>Remarks</span>
                        <p>{getDisplayValue(update.remarks, 'No remarks encoded.')}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

        </aside>
      </main>

      {portalReady && isHeroCompact
        ? createPortal(
            <div className="pd-viewport-titlebar" aria-hidden="true">
              <h1>{getDisplayValue(project.project_name, 'Untitled Project')}</h1>
            </div>,
            document.body,
          )
        : null}

      {portalReady
        ? createPortal(
            <div className="pd-fab-stack" aria-label="Project quick actions">
              <button
                type="button"
                className="pd-fab pd-fab-back"
                onClick={goBackToProjects}
                aria-label="Back to projects"
                title="Back to Projects"
              >
                <IconBack />
              </button>

              <button
                type="button"
                className="pd-fab pd-fab-pdf"
                onClick={generatePdfReport}
                aria-label="Generate PDF report"
                title="Generate PDF"
              >
                <IconPdf />
              </button>

              {(isAdmin || isEngineer) && (
                <button
                  type="button"
                  className="pd-fab pd-fab-update"
                  onClick={goToAddUpdate}
                  aria-label="Add project update"
                  title="Add Update"
                >
                  <IconUpdate />
                </button>
              )}

              <button
                type="button"
                className="pd-fab pd-fab-map"
                onClick={goToMap}
                aria-label="View GIS map"
                title="GIS Map"
              >
                <IconMap />
              </button>

              {isAdmin && dataSource === 'online' && (
                <button
                  type="button"
                  className="pd-fab pd-fab-edit"
                  onClick={goToEditProject}
                  aria-label="Edit project"
                  title="Edit Project"
                >
                  <IconEdit />
                </button>
              )}

              {isAdmin && dataSource === 'online' && (
                <button
                  type="button"
                  className="pd-fab pd-fab-delete"
                  onClick={handleDelete}
                  aria-label="Delete project"
                  title="Delete Project"
                >
                  <IconDelete />
                </button>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}