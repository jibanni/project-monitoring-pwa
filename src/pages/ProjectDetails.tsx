import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getLatestAideMemoireDocument, offlineDb, saveAideMemoireDocument, type OfflineAideMemoire, type OfflineAideMemoireDocument } from '../lib/offlineDb'
import { getOfficialProjectCost, getProjectDisplayStatus, getTargetPhysicalInfo } from '../utils/projectVariance'
import { getPmsRiskLevel } from '../utils/projectStatus'
import { canEditProjectRecord, canUpdateProject, canViewProject } from '../utils/aorAccess'
import { cleanupProjectPhotos, deleteProjectPhotos } from '../services/photoService'
import { normalizeProgramName } from '../utils/program'
import '../styles/projectDetails.css'
import '../styles/projectDetailsUnifiedHero.css'
import '../styles/pageHero.css'
import { getDriveImageOpenUrl, getDriveImagePreviewUrl } from '../utils/driveImageUrl'
import ActionMenu from '../components/ActionMenu'
import AideMemoireGenerationDialog from '../components/AideMemoireGenerationDialog'

const PROJECT_UPDATE_HISTORY_LIMIT = 5

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

function formatDateTime(value: unknown) {
  const rawValue = String(value ?? '').trim()

  if (!rawValue) return '-'

  const date = new Date(rawValue)

  if (Number.isNaN(date.getTime())) return rawValue

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
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
  const source = normalizeProgramName(project?.funding_source)

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


function toLocationTitleCase(value?: string | null) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ')

  if (!normalized) return ''

  return normalized
    .toLocaleLowerCase('en-PH')
    .replace(/(^|[\s,./()\-–—])([a-z])/g, (_match, separator: string, letter: string) => {
      return `${separator}${letter.toLocaleUpperCase('en-PH')}`
    })
    .replace(/\bLgu\b/g, 'LGU')
    .replace(/\bHuc\b/g, 'HUC')
    .replace(/\bCdo\b/g, 'CDO')
}

function getDetailsHeroTitleSizeClass(value?: string | null) {
  const length = String(value ?? '').trim().length

  if (length <= 24) return 'pd-unified-title-short'
  if (length <= 42) return 'pd-unified-title-medium'
  if (length <= 68) return 'pd-unified-title-long'
  return 'pd-unified-title-extra-long'
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

function IconContinue() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 8.25V4.5h3.75" />
      <path d="M5.1 6.15A8.25 8.25 0 1 1 4 13" />
      <path d="M12 8v4.5l3 1.75" />
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

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 8.25A2.25 2.25 0 0 1 10.25 6h6.5A2.25 2.25 0 0 1 19 8.25v8.5A2.25 2.25 0 0 1 16.75 19h-6.5A2.25 2.25 0 0 1 8 16.75v-8.5Z" />
      <path d="M5 13.75V5.25A2.25 2.25 0 0 1 7.25 3h6.5" />
    </svg>
  )
}

export default function ProjectDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const auth = useAuth() as any
  const { isAdmin } = auth

  const [project, setProject] = useState<any>(null)
  const [updates, setUpdates] = useState<any[]>([])
  const [aideMemoireDrafts, setAideMemoireDrafts] = useState<OfflineAideMemoire[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState('online')
  const [photosExpanded, setPhotosExpanded] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [isHeroCompact, setIsHeroCompact] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [copiedSubayCode, setCopiedSubayCode] = useState(false)
  const [latestGeneratedAidePdf, setLatestGeneratedAidePdf] = useState<OfflineAideMemoireDocument | null>(null)
  const [aideGenerationRequest, setAideGenerationRequest] = useState<{ updateRef: string; source: 'online' | 'offline' } | null>(null)

  useEffect(() => {
    setPortalReady(true)
  }, [])


  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      window.requestAnimationFrame(() => {
        const nextCompact = window.scrollY > 48

        setIsHeroCompact((current) =>
          current === nextCompact ? current : nextCompact,
        )

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
  }, [
    id,
    auth?.profile?.id,
    auth?.profile?.role,
    auth?.profile?.province,
    auth?.profile?.municipality,
    auth?.poEngineerLguAssignments?.length,
    auth?.roEngineerProvinceAssignments?.length,
  ])

  useEffect(() => {
    void loadAideMemoireDrafts()

    function refreshDrafts() {
      void loadAideMemoireDrafts()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshDrafts()
    }

    window.addEventListener('focus', refreshDrafts)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', refreshDrafts)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, auth?.user?.id, auth?.profile?.id])

  async function loadAideMemoireDrafts() {
    if (!id) {
      setAideMemoireDrafts([])
      setLatestGeneratedAidePdf(null)
      return
    }

    try {
      const currentUserId = String(auth?.user?.id || auth?.profile?.id || '').trim()
      const drafts = await offlineDb.aide_memoires.where('project_id').equals(id).toArray()

      setAideMemoireDrafts(
        drafts
          .filter((draft) =>
            !draft.created_by || !currentUserId || draft.created_by === currentUserId,
          )
          .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
      )

      let latestPdf = await getLatestAideMemoireDocument(id, 'pdf')
      if (!latestPdf) {
        const legacyRecord = drafts
          .filter((draft) => Boolean(draft.latest_pdf_blob))
          .sort((first, second) =>
            String(second.latest_pdf_generated_at || second.updated_at || '').localeCompare(
              String(first.latest_pdf_generated_at || first.updated_at || ''),
            ),
          )[0]

        if (legacyRecord?.latest_pdf_blob) {
          try {
            latestPdf = await saveAideMemoireDocument({
              aideMemoireId: legacyRecord.id,
              projectId: id,
              updateRef: legacyRecord.update_ref,
              format: 'pdf',
              fileName: legacyRecord.latest_pdf_file_name || 'Aide_Memoire.pdf',
              blob: legacyRecord.latest_pdf_blob,
              generatedAt: legacyRecord.latest_pdf_generated_at || legacyRecord.updated_at,
            })
          } catch (migrationError) {
            console.warn('Unable to migrate the legacy Aide Memoire PDF.', migrationError)
          }
        }
      }
      setLatestGeneratedAidePdf(latestPdf)
    } catch (error) {
      console.error('Unable to load Aide Memoire drafts for this project.', error)
      setAideMemoireDrafts([])
      setLatestGeneratedAidePdf(null)
    }
  }

  async function loadOfflineData() {
    if (!id) return

    const cachedProject = await offlineDb.projects.get(id)
    const pendingUpdates = await offlineDb.project_updates
      .where('project_id')
      .equals(id)
      .toArray()

    if (cachedProject && !canViewProject(cachedProject, auth)) {
      setAccessDenied(true)
      setProject(null)
      setUpdates([])
      setPhotos([])
      setDataSource('offline')
      return
    }

    setAccessDenied(false)
    setProject(cachedProject || null)
    setUpdates(
      pendingUpdates
        .sort((a, b) =>
          String(b.inspection_date || b.created_at || '').localeCompare(
            String(a.inspection_date || a.created_at || ''),
          ),
        )
        .slice(0, PROJECT_UPDATE_HISTORY_LIMIT),
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
        .order('inspection_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(PROJECT_UPDATE_HISTORY_LIMIT)

      if (projectResult.error) {
        throw projectResult.error
      }

      if (updatesResult.error) {
        throw updatesResult.error
      }

      const onlineProject = projectResult.data

      if (!canViewProject(onlineProject, auth)) {
        setAccessDenied(true)
        setProject(null)
        setUpdates([])
        setPhotos([])
        setDataSource('online')
        return
      }

      setAccessDenied(false)

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

  const aideDraftByUpdate = useMemo(() => {
    const draftMap = new Map<string, OfflineAideMemoire>()

    aideMemoireDrafts.forEach((draft) => {
      draftMap.set(`${draft.update_source}:${draft.update_ref}`, draft)
    })

    return draftMap
  }, [aideMemoireDrafts])

  const latestWorkingUpdateDraft = useMemo(
    () =>
      aideMemoireDrafts.find(
        (draft) =>
          draft.status === 'draft' &&
          draft.update_source === 'offline' &&
          String(draft.update_ref || '').startsWith('working-'),
      ) || null,
    [aideMemoireDrafts],
  )


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

  const displayStatus = getProjectDisplayStatus(project)
  const varianceInfo = getTargetPhysicalInfo(project)
  const computedRiskLevel = getPmsRiskLevel((project || {}) as Record<string, any>)
  const normalizedHeroRisk = String(computedRiskLevel ?? '').trim().toLowerCase()
  const heroRiskLabel =
    !normalizedHeroRisk || normalizedHeroRisk === 'none' || normalizedHeroRisk === 'no risk'
      ? 'No Risk'
      : computedRiskLevel
  const heroRiskTone = normalizedHeroRisk.includes('high')
    ? 'high'
    : normalizedHeroRisk.includes('moderate') || normalizedHeroRisk.includes('medium')
      ? 'moderate'
      : normalizedHeroRisk.includes('low')
        ? 'low'
        : 'none'
  const heroVarianceTone = varianceInfo.className === 'behind'
    ? 'negative'
    : varianceInfo.className === 'ahead'
      ? 'positive'
      : 'neutral'
  const heroLocation = [
    toLocationTitleCase(project?.barangay),
    toLocationTitleCase(project?.municipality),
    toLocationTitleCase(project?.province),
  ]
    .filter(Boolean)
    .join(', ') || 'Location Not Available'
  const canUpdateCurrentProject = project ? canUpdateProject(project, auth) : false
  const canEditCurrentProject = project ? canEditProjectRecord(project, auth) : false

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
        ['Funding Source', normalizeProgramName(project.funding_source) || '-'],
        ['Implementing Office', project.implementing_office || '-'],
        ['Contractor', project.contractor || '-'],
        ['Total Project Cost', formatCurrency(getOfficialProjectCost(project))],
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
        ['Status', displayStatus || '-'],
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
            ['Risk Level', computedRiskLevel === 'None' ? 'None' : latestUpdate.risk_level || '-'],
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
          computedRiskLevel === 'None' ? 'None' : update.risk_level || '-',
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

  function openLatestGeneratedAidePdf() {
    if (!id || !latestGeneratedAidePdf) return

    const params = new URLSearchParams({
      documentId: latestGeneratedAidePdf.id,
      from: 'details',
      returnTo: `/projects/${id}`,
    })

    navigate(`/projects/${id}/aide-memoire/pdf?${params.toString()}`)
  }

  function goToMap() {
    if (!id) return
    navigate(`/map?projectId=${encodeURIComponent(id)}&from=details`)
  }

  const subayCode = project ? getDisplayValue(project.subaybayan_project_code, '') : ''

  async function handleCopySubayCode() {
    if (!subayCode) return

    try {
      await navigator.clipboard.writeText(subayCode)
      setCopiedSubayCode(true)
      window.setTimeout(() => setCopiedSubayCode(false), 1400)
    } catch {
      window.prompt('Copy SubayBAYAN Project Code:', subayCode)
    }
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

  if (accessDenied) {
    return (
      <div className="pd-page">
        <div className="pd-empty-state">
          <h2>Project access restricted</h2>
          <p>
            This project is outside your assigned Area of Responsibility. Please
            contact the system administrator if access is needed.
          </p>
          <button type="button" className="pd-secondary-btn" onClick={goBackToProjects}>
            Back to Projects
          </button>
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
      <header className="pd-hero pd-unified-hero">
        <div className="pd-unified-hero-content">
          <p className="pd-unified-hero-eyebrow">Project Details</p>
          <h1
            className={`pd-unified-hero-title ${getDetailsHeroTitleSizeClass(project?.project_name)}`}
            title={getDisplayValue(project.project_name, 'Untitled Project')}
          >
            {getDisplayValue(project.project_name, 'Untitled Project')}
          </h1>

          <p className="pd-unified-hero-location" aria-label="Project location">
            {heroLocation}
          </p>

          <p className="pd-unified-hero-monitoring" aria-label="Project status, variance, and risk">
            <span className="pd-unified-hero-monitoring__value pd-unified-hero-monitoring__status">
              {displayStatus}
            </span>
            <span className="pd-unified-hero-monitoring__separator" aria-hidden="true">•</span>
            <span
              className="pd-unified-hero-monitoring__value pd-unified-hero-monitoring__variance"
              data-tone={heroVarianceTone}
            >
              {varianceInfo.compactLabel}
            </span>
            <span className="pd-unified-hero-monitoring__separator" aria-hidden="true">•</span>
            <span
              className="pd-unified-hero-monitoring__value pd-unified-hero-monitoring__risk"
              data-tone={heroRiskTone}
            >
              {heroRiskLabel}
            </span>
          </p>
        </div>
      </header>

      {dataSource === 'offline' && (
        <div className="pd-offline-banner">
          <strong>Offline Mode:</strong> You are viewing cached project details. Online
          photo gallery is unavailable while offline.
        </div>
      )}

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
          <strong className="pd-cost-value">{formatCurrency(getOfficialProjectCost(project))}</strong>
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
              {subayCode && (
                <div className="pd-info-item pd-subay-info-item">
                  <span>SubayBAYAN Project Code</span>
                  <div className="pd-subay-info-value">
                    <strong>{subayCode}</strong>
                    <button
                      type="button"
                      className="pd-subay-info-copy"
                      onClick={handleCopySubayCode}
                      aria-label="Copy SubayBAYAN project code"
                      title="Copy SubayBAYAN project code"
                    >
                      <IconCopy />
                    </button>
                    {copiedSubayCode && <small>Copied</small>}
                  </div>
                </div>
              )}

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

              <div className="pd-info-item">
                <span>Contract Expiry</span>
                <strong>{formatDate(project.contract_expiration_date)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Revised Expiry</span>
                <strong>{formatDate(project.revised_contract_expiration_date)}</strong>
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
                    <strong>{computedRiskLevel === 'None' ? 'None' : getDisplayValue(latestUpdate.risk_level)}</strong>
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
                    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.9)), url("${getDriveImagePreviewUrl(primaryPhoto.photo_url)}")`,
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
                            href={getDriveImageOpenUrl(photo.photo_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <div
                              className="pd-photo-card-image"
                              style={{
                                backgroundImage: `url("${getDriveImagePreviewUrl(photo.photo_url)}")`,
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

              <span
                className="pd-section-chip"
                title={`Showing only the ${PROJECT_UPDATE_HISTORY_LIMIT} most recent updates`}
              >
                {updates.length === 1 ? 'Latest record' : `Latest ${updates.length}`}
              </span>
            </div>

            {updates.length === 0 ? (
              <div className="pd-empty-inline">No update history available.</div>
            ) : (
              <div className="pd-history-list">
                {updates.map((update) => {
                  const updateReference = String(
                    update.local_id || update.online_update_id || update.id || '',
                  )
                  const updateSource =
                    update.is_offline || update.local_id ? 'offline' : 'online'
                  const aideDraft = aideDraftByUpdate.get(
                    `${updateSource}:${updateReference}`,
                  )

                  return (
                  <article key={update.id} className="pd-history-card">
                    <div className="pd-history-top">
                      <div>
                        <span>Inspection Date</span>
                        <strong>{formatDate(update.inspection_date)}</strong>
                      </div>

                      <span
                        className={`pd-risk-badge pd-risk-${normalizeClassName(
                          computedRiskLevel === 'None' ? 'None' : update.risk_level,
                        )}`}
                      >
                        {computedRiskLevel === 'None' ? 'None' : getDisplayValue(update.risk_level, 'No Risk')}
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

                    <details className="pd-history-details">
                      <summary>View details</summary>

                      <div className="pd-history-details-body">
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

                        {canUpdateCurrentProject && updateReference && (
                          <div className={`pd-history-actions ${aideDraft ? 'has-aide-draft' : ''}`}>
                            {aideDraft && (
                              <div className="pd-aide-draft-status">
                                <span>Aide Memoire</span>
                                <strong>{aideDraft.status === 'final' ? 'Ready' : 'Draft Saved'}</strong>
                                <small>{aideDraft.status === 'final' ? 'Generated from submitted update' : `Last saved ${formatDateTime(aideDraft.updated_at)}`}</small>
                              </div>
                            )}

                            <button
                              type="button"
                              className="pd-aide-btn"
                              onClick={() => {
                                setAideGenerationRequest({
                                  updateRef: updateReference,
                                  source: updateSource === 'offline' ? 'offline' : 'online',
                                })
                              }}
                            >
                              {aideDraft ? 'Generate / Open Aide Memoire' : 'Generate Aide Memoire'}
                            </button>
                          </div>
                        )}
                      </div>
                    </details>
                  </article>
                  )
                })}
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

      {id && aideGenerationRequest && (
        <AideMemoireGenerationDialog
          open
          projectId={id}
          updateRef={aideGenerationRequest.updateRef}
          source={aideGenerationRequest.source}
          returnTo={`/projects/${id}`}
          onClose={() => setAideGenerationRequest(null)}
          onGenerated={loadAideMemoireDrafts}
        />
      )}

      <ActionMenu
        ariaLabel="Project actions"
        launcherLabel="Project actions"
        items={[
          {
            id: 'new-update',
            label: 'New Update',
            icon: <IconUpdate />,
            tone: 'accent',
            hidden: !canUpdateCurrentProject,
            onSelect: goToAddUpdate,
          },
          {
            id: 'continue-update',
            label: 'Continue Update',
            icon: <IconContinue />,
            tone: 'primary',
            hidden: !canUpdateCurrentProject || !latestWorkingUpdateDraft,
            onSelect: goToAddUpdate,
          },
          {
            id: 'latest-aide',
            label: 'Latest Aide Memoire',
            icon: <IconPdf />,
            tone: 'document',
            hidden: !latestGeneratedAidePdf,
            onSelect: openLatestGeneratedAidePdf,
          },
          {
            id: 'map',
            label: 'GIS Map',
            icon: <IconMap />,
            tone: 'primary',
            onSelect: goToMap,
          },
          {
            id: 'edit',
            label: 'Edit Project',
            icon: <IconEdit />,
            tone: 'primary',
            hidden: !canEditCurrentProject || dataSource !== 'online',
            onSelect: goToEditProject,
          },
          {
            id: 'project-report',
            label: 'Project Report PDF',
            icon: <IconPdf />,
            tone: 'document',
            onSelect: generatePdfReport,
          },
          {
            id: 'delete',
            label: 'Delete Project',
            icon: <IconDelete />,
            tone: 'danger',
            hidden: !isAdmin || dataSource !== 'online',
            onSelect: () => void handleDelete(),
          },
          {
            id: 'back',
            label: 'Back to Projects',
            icon: <IconBack />,
            tone: 'neutral',
            onSelect: goBackToProjects,
          },
        ]}
      />
    </div>
  )
}