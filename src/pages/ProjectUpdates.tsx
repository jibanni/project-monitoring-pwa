import { useEffect, useMemo, useRef, useState } from'react'
import { createPortal } from'react-dom'
import type { ChangeEvent, FormEvent, KeyboardEvent } from'react'
import { Link, useLocation, useNavigate, useParams } from'react-router-dom'
import { supabase } from'../lib/supabase'
import { offlineDb } from'../lib/offlineDb'
import { useAuth } from'../context/AuthContext'
import {
  formatProgressInput,
  getComputedRiskLevel,
  getContractExpirationInfo,
  getProjectReasonLabel,
  getStatusFromContractModification,
  getTargetPhysicalInfo,
  requiresProjectReason,
} from'../utils/projectVariance'
import { canUpdateProject } from'../utils/aorAccess'
import { formatFileSize } from'../utils/imageCompression'
import { getDrivePhotoUrl, uploadProjectPhotoToDrive } from'../services/googleDrivePhotoUploadService'
import'../styles/projectUpdates.css'
import'../styles/projectUpdatesModalFix.css'

type ProjectRecord = {
  id: string
  project_name?: string | null
  description?: string | null
  status?: string | null
  project_type?: string | null
  funding_source?: string | null
  funding_year?: number | string | null
  fiscal_year?: number | string | null
  year?: number | string | null
  funding_program?: string | null
  program?: string | null
  program_name?: string | null
  implementing_office?: string | null
  contractor?: string | null
  budget?: number | string | null
  start_date?: string | null
  target_completion_date?: string | null
  contract_expiration_date?: string | null
  has_contract_modification?: boolean | string | null
  contract_modification_type?: string | null
  revised_project_cost?: number | string | null
  revised_contract_expiration_date?: string | null
  not_yet_started_reason?: string | null
  barangay?: string | null
  municipality?: string | null
  province?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  physical_accomplishment?: number | string | null
  financial_accomplishment?: number | string | null
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  risk_level?: string | null
  last_inspection_date?: string | null
  updated_at?: string | null
}

type ProjectUpdateRouteState = {
  project?: ProjectRecord | null
}

type ProjectUpdateRecord = {
  id?: string
  project_id?: string
  engineer_id?: string | null
  inspection_date?: string | null
  physical_accomplishment?: number | string | null
  financial_accomplishment?: number | string | null
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  risk_level?: string | null
  issues?: string | null
  recommendations?: string | null
  remarks?: string | null
  inspection_latitude?: number | string | null
  inspection_longitude?: number | string | null
  created_at?: string | null
  sync_status?: string | null
  is_offline?: boolean
}

type ProjectUpdateInsert = {
  project_id: string
  engineer_id: string | null
  inspection_date: string
  physical_accomplishment: number
  financial_accomplishment: number
  target_physical_accomplishment: number
  target_physical_source: string
  risk_level: string
  issues: string | null
  recommendations: string | null
  remarks: string | null
  inspection_latitude: number | null
  inspection_longitude: number | null
  created_at: string
}

type PhotoInput = {
  id: string
  file: File
  previewUrl: string
  caption: string
  originalSize?: number
  compressedSize?: number
  compressed?: boolean
}

type SaveMode ='online' |'offline'

type SaveSuccessDialog = {
  title: string
  message: string
  mode: SaveMode
} | null

type NoticeDialog = {
  title: string
  message: string
  tone:'warning' |'danger' |'info'
} | null

type CoordinateResult = {
  isValid: boolean
  latitude: number | null
  longitude: number | null
  wasSwapped: boolean
  reason: string
}

const MAX_PHOTOS_PER_UPDATE = 3
const RECENT_UPDATE_LIMIT = 4

const statusOptions = ['Ongoing','Completed','Suspended','Terminated','Under Review','Under Procurement','Not Yet Started',
]

const NOT_YET_STARTED_REASONS = ['No TDRs Submitted','Lacking TDRs Submitted','TDRs under PO Engineers Review','TDRs under Review (PO)','TDRs under Review (RO)',
]

const SUSPENSION_ORDER_TYPE ='Suspension Order (SO)'

const CONTRACT_MODIFICATION_TYPE_OPTIONS = ['Variation Order (VO)',
  SUSPENSION_ORDER_TYPE,'Time Extension (EOT)','Combination',
]

const offlineUpdateTables = ['offlineUpdates','offline_updates','pendingUpdates','projectUpdates','project_updates','updates',
]

const offlinePhotoTables = ['offlinePhotos','offline_photos','pendingPhotos','projectPhotos','project_photos','photos',
]

function makeLocalId() {
  if (typeof crypto !=='undefined' &&'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function todayInputValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2,'0')
  const day = String(today.getDate()).padStart(2,'0')

  return `${year}-${month}-${day}`
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampProgress(value: unknown) {
  const parsed = toNumber(value)

  if (parsed < 0) return 0
  if (parsed > 100) return 100

  return parsed
}

function formatPercent(value: unknown) {
  return `${clampProgress(value).toFixed(2)}%`
}

function formatLongDate(value?: string | null) {
  if (!value) return'No record'

  const normalizedValue = value.length <= 10 ? `${value}T00:00:00` : value
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString('en-US', {
    year:'numeric',
    month:'long',
    day:'numeric',
  })
}

function normalizeText(value: unknown) {
  return String(value ??'').trim().toLowerCase().replace(/\s+/g,'')
}


function getDriveFundingYear(
  projectRecord?: ProjectRecord | null,
  fallbackInspectionDate?: string,
) {
  const rawValue =
    projectRecord?.funding_year ||
    projectRecord?.fiscal_year ||
    projectRecord?.year ||''

  const rawYearMatch = String(rawValue).match(/\b(20\d{2}|19\d{2})\b/)

  if (rawYearMatch?.[1]) {
    return rawYearMatch[1]
  }

  const dateYearMatch = String(fallbackInspectionDate ||'').match(/^(\d{4})-/)

  return dateYearMatch?.[1] ||''
}

function getDriveFundingSource(projectRecord?: ProjectRecord | null) {
  return String(
    projectRecord?.funding_source ||
      projectRecord?.funding_program ||
      projectRecord?.program ||
      projectRecord?.program_name ||
      projectRecord?.project_type ||'',
  ).trim()
}

function parseDateTime(value?: string | null) {
  if (!value) return null

  const normalizedValue = value.length <= 10 ? `${value}T00:00:00` : value
  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function getDaysSinceDate(value?: string | null) {
  const date = parseDateTime(value)

  if (!date) {
    return { days: null as number | null, label:'No update yet' }
  }

  const today = new Date()
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000))

  if (days === 0) return { days, label:'Updated today' }
  if (days === 1) return { days, label:'Updated 1 day ago' }

  return { days, label: `Updated ${days} days ago` }
}

function getUpdateDateValue(update?: ProjectUpdateRecord | null) {
  return update?.inspection_date || update?.created_at || null
}

function evaluateAmountExpression(value: string) {
  const cleaned = value.replace(/,/g,'').trim()

  if (!cleaned) return 0

  if (!/^[0-9+\-*/().\s]+$/.test(cleaned)) {
    throw new Error('Disbursement only accepts numbers and calculator operators.')
  }

  const result = Function(`"use strict"; return (${cleaned})`)()
  const amount = Number(result)

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Disbursement must be a valid non-negative amount.')
  }

  return amount
}

function cleanText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isUnsupportedPreview(fileOrUrl: string) {
  const lower = fileOrUrl.toLowerCase()
  return lower.endsWith('.heic') || lower.endsWith('.heif')
}

function isLikelyImage(file: File) {
  const lowerName = file.name.toLowerCase()

  return (
    file.type.startsWith('image/') ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp')
  )
}

function hasCoordinateValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !==''
}

function formatCoordinate(value: unknown) {
  const parsed = Number(value)

  if (Number.isFinite(parsed)) {
    return parsed.toFixed(7)
  }

  return String(value ||'')
}

function canBeLatitude(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= -90 && parsed <= 90
}

function canBeLongitude(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180
}

function isZeroCoordinate(latitude: number, longitude: number) {
  return latitude === 0 && longitude === 0
}

function isMindanaoCoordinate(latitude: number, longitude: number) {
  return latitude >= 4 && latitude <= 10.8 && longitude >= 119 && longitude <= 127.8
}

function normalizeCoordinatePair(
  latitude: unknown,
  longitude: unknown
): CoordinateResult {
  const hasLatitude = hasCoordinateValue(latitude)
  const hasLongitude = hasCoordinateValue(longitude)

  if (!hasLatitude && !hasLongitude) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason:'No GPS coordinates recorded.',
    }
  }

  if (!hasLatitude || !hasLongitude) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason:'Latitude or longitude is incomplete.',
    }
  }

  const lat = Number(latitude)
  const lng = Number(longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason:'Latitude or longitude is not a valid number.',
    }
  }

  if (canBeLatitude(lat) && canBeLongitude(lng) && !isZeroCoordinate(lat, lng)) {
    if (isMindanaoCoordinate(lat, lng)) {
      return {
        isValid: true,
        latitude: lat,
        longitude: lng,
        wasSwapped: false,
        reason:'Coordinates are valid.',
      }
    }

    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason:'Coordinates are valid globally but outside the Mindanao range. Please verify the encoded site location.',
    }
  }

  if (canBeLatitude(lng) && canBeLongitude(lat) && !isZeroCoordinate(lng, lat)) {
    if (isMindanaoCoordinate(lng, lat)) {
      return {
        isValid: true,
        latitude: lng,
        longitude: lat,
        wasSwapped: true,
        reason:'Latitude and longitude appeared reversed and were corrected.',
      }
    }

    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason:'Coordinates appear reversed, but the corrected location is still outside Mindanao. Please verify the encoded values.',
    }
  }

  return {
    isValid: false,
    latitude: null,
    longitude: null,
    wasSwapped: false,
    reason:'Coordinates are outside the valid latitude/longitude range.',
  }
}

function getRiskClass(risk?: string | null) {
  const normalized = String(risk ||'').toLowerCase()

  if (normalized.includes('high')) return'pu-risk-high'
  if (normalized.includes('moderate') || normalized.includes('medium')) return'pu-risk-moderate'
  if (normalized.includes('low')) return'pu-risk-low'

  return'pu-risk-none'
}

function getStatusClass(status?: string | null) {
  const normalized = String(status ||'').toLowerCase()

  if (normalized.includes('completed')) return'pu-badge-success'
  if (normalized.includes('ongoing')) return'pu-badge-primary'
  if (normalized.includes('under review')) return'pu-badge-warning'
  if (normalized.includes('under procurement')) return'pu-badge-warning'
  if (normalized.includes('suspended') || normalized.includes('terminated')) {
    return'pu-badge-danger'
  }
  if (normalized.includes('not yet')) return'pu-badge-neutral'

  return'pu-badge-neutral'
}


function getStatusHelperText(status: string) {
  const normalized = normalizeText(status)

  if (normalized ==='completed') return'100% done / ready for completion record'
  if (normalized ==='ongoing') return'Regular progress update'
  if (normalized ==='suspended') return'Critical: requires Suspension Order reason'
  if (normalized ==='terminated') return'Critical: requires termination reason'
  if (normalized ==='under review') return'For document / RO review tracking'
  if (normalized ==='not yet started') return'Non-start status update'
  if (normalized ==='under procurement') return'Procurement status update'

  return'Project status update'
}

function getModificationHelperText(modificationType: string) {
  const normalized = normalizeText(modificationType)

  if (normalized.includes('variation')) return'Change in quantity, scope, or cost'
  if (normalized.includes('suspension')) return'Suspension Order; project becomes Suspended'
  if (normalized.includes('extension')) return'Time extension / revised expiration'
  if (normalized.includes('combination')) return'Multiple contract changes'

  return'Contract modification'
}

function getGpsErrorMessage(error: GeolocationPositionError) {
  if (!window.isSecureContext) {
    return'GPS requires HTTPS or localhost. Please open the app using localhost, HTTPS deployment, or manually encode the coordinates.'
  }

  if (error.code === error.PERMISSION_DENIED) {
    return'Location permission was denied. Please allow location access in your browser settings, then try Update GPS again.'
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return'GPS position is unavailable. Please turn on device location services, move to an open area, or manually encode the coordinates.'
  }

  if (error.code === error.TIMEOUT) {
    return'GPS capture timed out. Please move to an open area with better signal and try again.'
  }

  return'Unable to capture GPS. Please allow location permission and try again.'
}

async function getOfflineTable(tableNames: string[]) {
  const db = offlineDb as any

  for (const tableName of tableNames) {
    if (db?.[tableName]) {
      return db[tableName]
    }
  }

  return null
}


async function readOfflineTable(tableNames: string[]) {
  const table = await getOfflineTable(tableNames)

  if (!table?.toArray) {
    return []
  }

  return table.toArray()
}

async function getCachedProject(projectId: string) {
  const db = offlineDb as any
  const projectsTable = db?.projects

  if (!projectsTable?.get) {
    return null
  }

  return projectsTable.get(projectId)
}

async function updateCachedProject(projectId: string, patch: Partial<ProjectRecord>) {
  const db = offlineDb as any
  const projectsTable = db?.projects

  if (!projectsTable?.update) {
    return
  }

  await projectsTable.update(projectId, patch)
}

async function putCachedProject(projectRecord: ProjectRecord) {
  const db = offlineDb as any
  const projectsTable = db?.projects

  if (!projectRecord?.id || !projectsTable?.put) {
    return
  }

  await projectsTable.put({
    ...projectRecord,
    project_name: projectRecord.project_name ||'Untitled Project',
    status: projectRecord.status ||'Not Yet Started',
    municipality: projectRecord.municipality ||'',
    province: projectRecord.province ||'',
    barangay: projectRecord.barangay ||'',
    physical_accomplishment: toNumber(projectRecord.physical_accomplishment),
    financial_accomplishment: toNumber(projectRecord.financial_accomplishment),
    risk_level: projectRecord.risk_level ||'None',
    cached_at: new Date().toISOString(),
  })
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
}

export default function ProjectUpdates() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth() as any
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const revisedContractExpirationDateInputRef = useRef<HTMLInputElement | null>(null)
  const photoInputsRef = useRef<PhotoInput[]>([])

  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [recentUpdates, setRecentUpdates] = useState<ProjectUpdateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [projectMissingOffline, setProjectMissingOffline] = useState(false)
  const [saving, setSaving] = useState(false)
  const [online, setOnline] = useState(
    typeof navigator !=='undefined' ? navigator.onLine : true
  )
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [inspectionDate, setInspectionDate] = useState(todayInputValue())
  const [projectStatus, setProjectStatus] = useState('Ongoing')
  const [physicalAccomplishment, setPhysicalAccomplishment] = useState('')
  const [targetPhysicalAccomplishment, setTargetPhysicalAccomplishment] = useState('')
  const targetPhysicalSource ='manual' as const
  const [financialAccomplishment, setFinancialAccomplishment] = useState('')
  const [disbursementAmount, setDisbursementAmount] = useState('')
  const [notYetStartedReason, setNotYetStartedReason] = useState('')
  const [hasContractModification, setHasContractModification] = useState(false)
  const [contractModificationType, setContractModificationType] = useState('')
  const [revisedProjectCost, setRevisedProjectCost] = useState('')
  const [revisedContractExpirationDate, setRevisedContractExpirationDate] = useState('')
  const [issues, setIssues] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [remarks, setRemarks] = useState('')
  const [inspectionLatitude, setInspectionLatitude] = useState('')
  const [inspectionLongitude, setInspectionLongitude] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsMessage, setGpsMessage] = useState('')
  const [photoInputs, setPhotoInputs] = useState<PhotoInput[]>([])
  const [isUpdateScrolled, setIsUpdateScrolled] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [saveSuccessDialog, setSaveSuccessDialog] = useState<SaveSuccessDialog>(null)
  const [noticeDialog, setNoticeDialog] = useState<NoticeDialog>(null)

  const routeProject = useMemo(() => {
    const state = location.state as ProjectUpdateRouteState | null
    const candidate = state?.project

    if (!candidate?.id || !id) return null

    return String(candidate.id) === String(id) ? candidate : null
  }, [location.state, id])

  const currentPhysical = useMemo(
    () => clampProgress(project?.physical_accomplishment),
    [project?.physical_accomplishment]
  )

  const currentFinancial = useMemo(
    () => clampProgress(project?.financial_accomplishment),
    [project?.financial_accomplishment]
  )

  const projectCost = useMemo(() => toNumber(project?.budget), [project?.budget])

  const activeModificationType = hasContractModification ? contractModificationType :''
  const isSuspendedSelected = useMemo(() => {
    return normalizeText(projectStatus).includes('suspend')
  }, [projectStatus])
  const contractModificationTypeOptions = useMemo(() => {
    return isSuspendedSelected ? [SUSPENSION_ORDER_TYPE] : CONTRACT_MODIFICATION_TYPE_OPTIONS
  }, [isSuspendedSelected])
  const isNotYetStartedSelected = useMemo(() => {
    return normalizeText(projectStatus) ==='not yet started'
  }, [projectStatus])
  const requiresUpdateReason = requiresProjectReason(projectStatus, activeModificationType)
  const projectReasonLabel = getProjectReasonLabel(projectStatus, activeModificationType)
  const heroDisplayStatus = getStatusFromContractModification(activeModificationType) || projectStatus || project?.status ||'No Status'

  const latestUpdateDate = useMemo(() => {
    const latestUpdate = recentUpdates[0]
    return (
      getUpdateDateValue(latestUpdate) ||
      project?.last_inspection_date ||
      project?.updated_at ||
      null
    )
  }, [project?.last_inspection_date, project?.updated_at, recentUpdates])

  const latestUpdateAge = useMemo(() => {
    return getDaysSinceDate(latestUpdateDate)
  }, [latestUpdateDate])


  useEffect(() => {
    if (!requiresUpdateReason && notYetStartedReason) {
      setNotYetStartedReason('')
    }
  }, [requiresUpdateReason, notYetStartedReason])

  useEffect(() => {
    if (!hasContractModification) {
      setContractModificationType('')
      setRevisedProjectCost('')
      setRevisedContractExpirationDate('')
      return
    }

    const statusFromModification = getStatusFromContractModification(contractModificationType)

    if (statusFromModification && projectStatus !== statusFromModification) {
      setProjectStatus(statusFromModification)
    }
  }, [contractModificationType, hasContractModification, projectStatus])

  useEffect(() => {
    if (!isSuspendedSelected) return

    if (!hasContractModification) {
      setHasContractModification(true)
    }

    if (contractModificationType !== SUSPENSION_ORDER_TYPE) {
      setContractModificationType(SUSPENSION_ORDER_TYPE)
    }
  }, [contractModificationType, hasContractModification, isSuspendedSelected])

  const targetVarianceInfo = useMemo(() => {
    return getTargetPhysicalInfo(
      {
        ...(project || {}),
        physical_accomplishment:
          physicalAccomplishment ===''
            ? project?.physical_accomplishment
            : physicalAccomplishment,
        target_physical_accomplishment: targetPhysicalAccomplishment,
        target_physical_as_of: inspectionDate,
        target_physical_source:'manual',
        contract_expiration_date: project?.contract_expiration_date,
        has_contract_modification: hasContractModification,
        contract_modification_type: activeModificationType,
        revised_project_cost: revisedProjectCost,
        revised_contract_expiration_date: revisedContractExpirationDate,
      },
      inspectionDate,
    )
  }, [
    project,
    physicalAccomplishment,
    targetPhysicalAccomplishment,
    targetPhysicalSource,
    inspectionDate,
    hasContractModification,
    activeModificationType,
    revisedProjectCost,
    revisedContractExpirationDate,
  ])

  const contractInfo = useMemo(() => {
    return getContractExpirationInfo({
      contract_expiration_date: project?.contract_expiration_date,
      has_contract_modification: hasContractModification,
      contract_modification_type: activeModificationType,
      revised_project_cost: revisedProjectCost,
      revised_contract_expiration_date: revisedContractExpirationDate,
    })
  }, [
    project?.contract_expiration_date,
    hasContractModification,
    activeModificationType,
    revisedProjectCost,
    revisedContractExpirationDate,
  ])

  const autoRiskLevel = useMemo(
    () => getComputedRiskLevel({
      ...(project || {}),
      physical_accomplishment:
        physicalAccomplishment ===''
          ? project?.physical_accomplishment
          : physicalAccomplishment,
      target_physical_accomplishment: targetPhysicalAccomplishment,
      target_physical_as_of: inspectionDate,
      target_physical_source:'manual',
      last_inspection_date: inspectionDate,
      contract_expiration_date: project?.contract_expiration_date,
      has_contract_modification: hasContractModification,
      contract_modification_type: activeModificationType,
      revised_project_cost: revisedProjectCost,
      revised_contract_expiration_date: revisedContractExpirationDate,
    }),
    [
      project,
      physicalAccomplishment,
      targetPhysicalAccomplishment,
      inspectionDate,
      hasContractModification,
      activeModificationType,
      revisedProjectCost,
      revisedContractExpirationDate,
    ],
  )

  const inspectionCoordinateStatus = useMemo(() => {
    return normalizeCoordinatePair(inspectionLatitude, inspectionLongitude)
  }, [inspectionLatitude, inspectionLongitude])

  const hasInspectionCoordinates =
    inspectionLatitude.trim() !=='' || inspectionLongitude.trim() !==''

  const canSubmit = useMemo(() => {
    if (!project) {
      return false
    }

    return canUpdateProject(project, auth)
  }, [
    project,
    auth?.profile?.id,
    auth?.profile?.role,
    auth?.profile?.province,
    auth?.profile?.municipality,
    auth?.isAdmin,
    auth?.isROEngineer,
    auth?.isPOEngineer,
    auth?.isEngineer,
    auth?.poEngineerLguAssignments?.length,
    auth?.roEngineerProvinceAssignments?.length,
    routeProject?.id,
  ])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
    }

    function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!online) {
    }
  }, [online])

  useEffect(() => {
    loadData()
  }, [
    id,
    online,
    auth?.profile?.id,
    auth?.profile?.role,
    auth?.profile?.province,
    auth?.profile?.municipality,
    auth?.poEngineerLguAssignments?.length,
    auth?.roEngineerProvinceAssignments?.length,
  ])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      requestAnimationFrame(() => {
        setIsUpdateScrolled(window.scrollY > 28)
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
    photoInputsRef.current = photoInputs
  }, [photoInputs])

  useEffect(() => {
    return () => {
      photoInputsRef.current.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl)
      })
    }
  }, [])


  function applyContractFieldsFromProject(projectRecord: ProjectRecord | null) {
    if (!projectRecord) {
      setHasContractModification(false)
      setContractModificationType('')
      setRevisedProjectCost('')
      setRevisedContractExpirationDate('')
      setNotYetStartedReason('')
      return
    }

    const hasModification =
      projectRecord.has_contract_modification === true ||
      String(projectRecord.has_contract_modification ||'').toLowerCase() ==='yes' ||
      String(projectRecord.has_contract_modification ||'').toLowerCase() ==='true'

    setHasContractModification(hasModification)
    setContractModificationType(projectRecord.contract_modification_type ||'')
    setRevisedProjectCost(
      projectRecord.revised_project_cost !== null &&
        projectRecord.revised_project_cost !== undefined
        ? String(projectRecord.revised_project_cost)
        :'',
    )
    setRevisedContractExpirationDate(
      projectRecord.revised_contract_expiration_date
        ? String(projectRecord.revised_contract_expiration_date).slice(0, 10)
        :'',
    )
    setNotYetStartedReason(projectRecord.not_yet_started_reason ||'')
  }


  function applyTargetPhysicalFromProject(projectRecord: ProjectRecord | null) {
    if (!projectRecord) {
      setTargetPhysicalAccomplishment('0')
      return
    }

    const storedTarget = String(projectRecord.target_physical_accomplishment ??'').trim()

    if (storedTarget) {
      setTargetPhysicalAccomplishment(formatProgressInput(storedTarget))
      return
    }

    setTargetPhysicalAccomplishment(
      formatProgressInput(projectRecord.physical_accomplishment ?? 0),
    )
  }

  function handleTargetPhysicalChange(value: string) {
    setTargetPhysicalAccomplishment(value)
  }


  function applyDisbursementComputation(rawValue = disbursementAmount) {
    try {
      if (projectCost <= 0) {
        setErrorMessage('Project Cost is required before computing financial accomplishment from disbursement.')
        return
      }

      const amount = evaluateAmountExpression(rawValue)
      const percentage = Math.min(100, Math.max(0, (amount / projectCost) * 100))

      setDisbursementAmount(String(amount))
      setFinancialAccomplishment(formatProgressInput(percentage))
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message :'Invalid disbursement input.')
    }
  }

  function handleDisbursementKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !=='Enter') return

    event.preventDefault()
    applyDisbursementComputation()
  }

  function getUpdateRemarksWithReason() {
    const remarksValue = cleanText(remarks)

    if (!requiresUpdateReason || !notYetStartedReason) return remarksValue

    const reasonLine = `${projectReasonLabel}: ${notYetStartedReason}`

    if (!remarksValue) return reasonLine
    if (remarksValue.includes(reasonLine)) return remarksValue

    return `${reasonLine}\n\n${remarksValue}`
  }


  async function loadData() {
    if (!id) return

    setLoading(true)
    setErrorMessage('')
    setProjectMissingOffline(false)

    try {
      if (online) {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .single()

        if (projectError) {
          throw projectError
        }

        const onlineProject = projectData as ProjectRecord

        if (!canUpdateProject(onlineProject, auth)) {
          setAccessDenied(true)
          setProject(null)
          setRecentUpdates([])
          return
        }

        setAccessDenied(false)
        setProjectMissingOffline(false)
        setProject(onlineProject)
        await putCachedProject(onlineProject)
        applyTargetPhysicalFromProject(onlineProject)
        applyContractFieldsFromProject(onlineProject)
        setProjectStatus(onlineProject?.status ||'Ongoing')
        setPhysicalAccomplishment(
          onlineProject?.physical_accomplishment !== null &&
            onlineProject?.physical_accomplishment !== undefined
            ? String(onlineProject.physical_accomplishment)
            :''
        )
        setFinancialAccomplishment(
          onlineProject?.financial_accomplishment !== null &&
            onlineProject?.financial_accomplishment !== undefined
            ? String(onlineProject.financial_accomplishment)
            :''
        )

        const { data: updatesData, error: updatesError } = await supabase
          .from('project_updates')
          .select('*')
          .eq('project_id', id)
          .order('inspection_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(RECENT_UPDATE_LIMIT)

        if (updatesError) {
          throw updatesError
        }

        setRecentUpdates((updatesData || []) as ProjectUpdateRecord[])
      } else {
        await loadOfflineData()
      }
    } catch (error) {
      console.error(error)

      try {
        await loadOfflineData()
        setMessage('Loaded cached project data because online loading failed.')
      } catch (offlineError) {
        console.error(offlineError)
        setErrorMessage('Unable to load project data. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadOfflineData() {
    if (!id) return

    let cachedProject = (await getCachedProject(id)) as ProjectRecord | null

    if (!cachedProject && routeProject) {
      cachedProject = routeProject
      await putCachedProject(routeProject)
    }

    if (!cachedProject) {
      setAccessDenied(false)
      setProjectMissingOffline(true)
      setProject(null)
      setRecentUpdates([])
      return
    }

    if (!canUpdateProject(cachedProject, auth)) {
      setAccessDenied(true)
      setProjectMissingOffline(false)
      setProject(null)
      setRecentUpdates([])
      return
    }

    setAccessDenied(false)
    setProjectMissingOffline(false)
    setProject(cachedProject)
    applyTargetPhysicalFromProject(cachedProject as ProjectRecord)
    applyContractFieldsFromProject(cachedProject as ProjectRecord)
    setProjectStatus(cachedProject?.status ||'Ongoing')
    setPhysicalAccomplishment(
      cachedProject?.physical_accomplishment !== null &&
        cachedProject?.physical_accomplishment !== undefined
        ? String(cachedProject.physical_accomplishment)
        :''
    )
    setFinancialAccomplishment(
      cachedProject?.financial_accomplishment !== null &&
        cachedProject?.financial_accomplishment !== undefined
        ? String(cachedProject.financial_accomplishment)
        :''
    )

    const offlineUpdates = await readOfflineTable(offlineUpdateTables)
    const filteredUpdates = offlineUpdates
      .filter((update: ProjectUpdateRecord) => update?.project_id === id)
      .sort((a: ProjectUpdateRecord, b: ProjectUpdateRecord) => {
        const dateA = new Date(
          a.inspection_date || a.created_at ||'1970-01-01'
        ).getTime()
        const dateB = new Date(
          b.inspection_date || b.created_at ||'1970-01-01'
        ).getTime()

        return dateB - dateA
      })
      .slice(0, RECENT_UPDATE_LIMIT)

    setRecentUpdates(filteredUpdates)
  }


  function handleProjectStatusChange(nextStatus: string) {
    setProjectStatus(nextStatus)

    if (normalizeText(nextStatus).includes('suspend')) {
      setHasContractModification(true)
      setContractModificationType(SUSPENSION_ORDER_TYPE)
      return
    }

    if (contractModificationType === SUSPENSION_ORDER_TYPE) {
      setContractModificationType('')
      setHasContractModification(false)
    }
  }

  function handleContractModificationTypeChange(nextType: string) {
    setContractModificationType(nextType)

    const statusFromModification = getStatusFromContractModification(nextType)

    if (statusFromModification) {
      setProjectStatus(statusFromModification)
    }
  }

  async function handlePhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value =''

    if (files.length === 0) return

    const imageFiles = files.filter(isLikelyImage)
    const rejectedCount = files.length - imageFiles.length

    const availableSlots = MAX_PHOTOS_PER_UPDATE - photoInputs.length
    const acceptedFiles = imageFiles.slice(0, Math.max(availableSlots, 0))

    if (acceptedFiles.length === 0) {
      if (rejectedCount > 0) {
        setErrorMessage(`${rejectedCount} file(s) were skipped because they are not images.`)
      } else if (imageFiles.length > 0) {
        setErrorMessage(`Only ${MAX_PHOTOS_PER_UPDATE} photos are allowed per update.`)
      }

      return
    }

    try {
      const mappedPhotos = acceptedFiles.map((file) => ({
        id: makeLocalId(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption:'',
        originalSize: file.size,
        compressedSize: file.size,
        compressed: false,
      }))

      setPhotoInputs((previous) => [...previous, ...mappedPhotos])

      if (rejectedCount > 0) {
        setErrorMessage(`${rejectedCount} file(s) were skipped because they are not images.`)
      } else if (imageFiles.length > acceptedFiles.length) {
        setErrorMessage(
          `Only ${MAX_PHOTOS_PER_UPDATE} photos are allowed per update. Extra photos were not added.`
        )
      } else {
        setErrorMessage('')
      }

      setMessage(
        `${acceptedFiles.length} photo(s) added. Original image files will be uploaded to Google Drive when this update is saved.`
      )
    } catch (photoError) {
      console.error(photoError)
      setErrorMessage('Unable to process the selected photo(s). Please try again.')
      setMessage('')
    }
  }

  function removePhoto(photoId: string) {
    setPhotoInputs((previous) => {
      const photoToRemove = previous.find((photo) => photo.id === photoId)

      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.previewUrl)
      }

      return previous.filter((photo) => photo.id !== photoId)
    })
  }

  function updatePhotoCaption(photoId: string, caption: string) {
    setPhotoInputs((previous) =>
      previous.map((photo) =>
        photo.id === photoId ? { ...photo, caption } : photo
      )
    )
  }

  function captureGps() {
    setGpsMessage('')
    setErrorMessage('')

    if (!navigator.geolocation) {
      const gpsError ='GPS is not supported by this browser or device.'
      setErrorMessage(gpsError)
      setNoticeDialog({ title:'GPS Unavailable', message: gpsError, tone:'warning' })
      return
    }

    if (!window.isSecureContext) {
      const gpsError ='GPS requires HTTPS or localhost. Please open the app using localhost, HTTPS deployment, or manually encode the coordinates.'
      setErrorMessage(gpsError)
      setNoticeDialog({ title:'GPS Permission Needed', message: gpsError, tone:'warning' })
      return
    }

    setGpsLoading(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude

        if (!isMindanaoCoordinate(latitude, longitude)) {
          const gpsError ='Captured GPS is outside the Mindanao range. Please verify your device location or manually encode the correct project coordinates.'
          setErrorMessage(gpsError)
          setNoticeDialog({ title:'Check GPS Location', message: gpsError, tone:'warning' })
          setGpsLoading(false)
          return
        }

        setInspectionLatitude(latitude.toFixed(7))
        setInspectionLongitude(longitude.toFixed(7))
        setGpsMessage(
          `GPS updated successfully with approximately ${Math.round(
            position.coords.accuracy
          )}m accuracy.`
        )
        setErrorMessage('')
        setGpsLoading(false)
      },
      (error) => {
        console.error(error)
        const gpsError = getGpsErrorMessage(error)
        setErrorMessage(gpsError)
        setNoticeDialog({ title:'GPS Capture Failed', message: gpsError, tone:'warning' })
        setGpsLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    )
  }


  function validateForm() {
    if (!id) {
      return'Project ID is missing.'
    }

    if (!canSubmit) {
      return'You are not allowed to submit project updates.'
    }

    if (!inspectionDate) {
      return'Please select the inspection date.'
    }

    if (physicalAccomplishment ==='') {
      return'Please enter the physical accomplishment.'
    }

    if (targetPhysicalAccomplishment ==='') {
      return'Please enter the target physical accomplishment.'
    }

    if (financialAccomplishment ==='') {
      return'Please enter the financial accomplishment.'
    }

    if (requiresUpdateReason && !notYetStartedReason.trim()) {
      return `Please provide the ${projectReasonLabel.toLowerCase()}.`
    }

    if (hasContractModification && !contractModificationType.trim()) {
      return'Please select the type of contract modification.'
    }

    if (hasContractModification && !revisedProjectCost.trim()) {
      return'Please enter the revised project cost.'
    }

    if (hasContractModification && !revisedContractExpirationDate.trim()) {
      return'Please enter the revised contract expiration date.'
    }

    const physical = toNumber(physicalAccomplishment)
    const targetPhysical = toNumber(targetPhysicalAccomplishment)
    const financial = toNumber(financialAccomplishment)

    if (physical < 0 || physical > 100) {
      return'Physical accomplishment must be between 0 and 100.'
    }

    if (targetPhysical < 0 || targetPhysical > 100) {
      return'Target physical accomplishment must be between 0 and 100.'
    }

    if (financial < 0 || financial > 100) {
      return'Financial accomplishment must be between 0 and 100.'
    }

    const hasLatitude = inspectionLatitude.trim() !==''
    const hasLongitude = inspectionLongitude.trim() !==''

    if (hasLatitude !== hasLongitude) {
      return'Please provide both latitude and longitude, or leave both blank.'
    }

    if (hasLatitude && hasLongitude && !inspectionCoordinateStatus.isValid) {
      return inspectionCoordinateStatus.reason
    }

    return''
  }

  function buildUpdatePayload(projectId: string): ProjectUpdateInsert {
    return {
      project_id: projectId,
      engineer_id: auth?.user?.id || auth?.profile?.id || null,
      inspection_date: inspectionDate,
      physical_accomplishment: clampProgress(physicalAccomplishment),
      target_physical_accomplishment: clampProgress(targetPhysicalAccomplishment),
      target_physical_source:'manual',
      financial_accomplishment: clampProgress(financialAccomplishment),
      risk_level: autoRiskLevel,
      issues: cleanText(issues),
      recommendations: cleanText(recommendations),
      remarks: getUpdateRemarksWithReason(),
      inspection_latitude:
        inspectionCoordinateStatus.isValid &&
        inspectionCoordinateStatus.latitude !== null
          ? inspectionCoordinateStatus.latitude
          : null,
      inspection_longitude:
        inspectionCoordinateStatus.isValid &&
        inspectionCoordinateStatus.longitude !== null
          ? inspectionCoordinateStatus.longitude
          : null,
      created_at: new Date().toISOString(),
    }
  }

  function buildLatestCoordinatePatch() {
    if (
      inspectionCoordinateStatus.isValid &&
      inspectionCoordinateStatus.latitude !== null &&
      inspectionCoordinateStatus.longitude !== null
    ) {
      return {
        latitude: inspectionCoordinateStatus.latitude,
        longitude: inspectionCoordinateStatus.longitude,
      }
    }

    return {}
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      const deniedMessage ='You are not allowed to update this project based on your assigned AOR.'
      setErrorMessage(deniedMessage)
      setNoticeDialog({ title:'Update Not Allowed', message: deniedMessage, tone:'danger' })
      setMessage('')
      return
    }

    const validationError = validateForm()

    if (validationError) {
      setErrorMessage(validationError)
      setNoticeDialog({ title:'Please Review the Update', message: validationError, tone:'warning' })
      setMessage('')
      return
    }

    setErrorMessage('')
    setMessage('')
    setConfirmSaveOpen(true)
  }

  async function confirmSaveUpdate() {
    if (saving) return

    const validationError = validateForm()

    if (validationError) {
      setConfirmSaveOpen(false)
      setErrorMessage(validationError)
      setNoticeDialog({ title:'Please Review the Update', message: validationError, tone:'warning' })
      setMessage('')
      return
    }

    setConfirmSaveOpen(false)
    setSaving(true)
    setErrorMessage('')
    setMessage('')

    try {
      const modeToUse: SaveMode = online ?'online' :'offline'
      if (modeToUse ==='online') {
        await saveOnline()
      } else {
        await saveOffline()
      }
    } catch (error: any) {
      console.error(error)
      const saveError = error?.message ||'Unable to save project update. Please check the form and try again.'
      setErrorMessage(saveError)
      setNoticeDialog({ title:'Update Not Saved', message: saveError, tone:'danger' })
    } finally {
      setSaving(false)
    }
  }

  async function saveOnline() {
    if (!id) return

    const projectId = id
    const updatePayload = buildUpdatePayload(projectId)
    const currentTimestamp = new Date().toISOString()
    const latestCoordinatePatch = buildLatestCoordinatePatch()

    const { data: insertedUpdate, error: insertError } = await supabase
      .from('project_updates')
      .insert(updatePayload)
      .select('*')
      .single()

    if (insertError) {
      throw insertError
    }

    const updateId = insertedUpdate?.id

    const projectPatch = {
      status: projectStatus,
      physical_accomplishment: clampProgress(physicalAccomplishment),
      target_physical_accomplishment: clampProgress(targetPhysicalAccomplishment),
      target_physical_as_of: inspectionDate,
      target_physical_source:'manual',
      financial_accomplishment: clampProgress(financialAccomplishment),
      risk_level: autoRiskLevel,
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification ? contractModificationType : null,
      revised_project_cost: hasContractModification ? toNumber(revisedProjectCost) : null,
      revised_contract_expiration_date: hasContractModification ? revisedContractExpirationDate : null,
      not_yet_started_reason: requiresUpdateReason ? cleanText(notYetStartedReason) : null,
      last_inspection_date: inspectionDate,
      ...latestCoordinatePatch,
      updated_at: currentTimestamp,
    }

    const { error: projectUpdateError } = await supabase
      .from('projects')
      .update(projectPatch)
      .eq('id', projectId)

    if (projectUpdateError) {
      throw projectUpdateError
    }

    if (photoInputs.length > 0 && updateId) {
      await uploadPhotosOnline(projectId, updateId)
    }

    clearFormAfterSave()
    setMessage('Project update saved online successfully.')
    setSaveSuccessDialog({
      title:'Update Saved',
      message:'Project update saved successfully. The project record has been updated.',
      mode:'online',
    })

  }

  async function uploadPhotosOnline(projectId: string, updateId: string) {
    const photoRows = []
    const projectTitle = project?.project_name ||'Untitled Project'
    const driveFundingYear = getDriveFundingYear(project, inspectionDate)
    const driveFundingSource = getDriveFundingSource(project)
    const uploadedBy =
      auth?.profile?.full_name ||
      auth?.profile?.email ||
      auth?.user?.email ||
      auth?.user?.id ||
      auth?.profile?.id ||'PMS10 User'

    for (let index = 0; index < photoInputs.length; index += 1) {
      const photo = photoInputs[index]
      const uploadedFile = await uploadProjectPhotoToDrive({
        file: photo.file,
        projectId,
        updateId,
        projectTitle,
        inspectionDate,
        fundingYear: driveFundingYear,
        fundingSource: driveFundingSource,
        fundingProgram: driveFundingSource,
        uploadedBy,
      })

      photoRows.push({
        project_id: projectId,
        project_update_id: updateId,
        photo_url: getDrivePhotoUrl(uploadedFile),
        caption:
          cleanText(photo.caption) ||
          `Project update photo ${index + 1}`,
        uploaded_at: new Date().toISOString(),
      })
    }

    if (photoRows.length > 0) {
      const { error: photoInsertError } = await supabase
        .from('project_photos')
        .insert(photoRows)

      if (photoInsertError) {
        throw photoInsertError
      }
    }
  }

  async function saveOffline() {
    if (!id) return

    const projectId = id
    const updatePayload = buildUpdatePayload(projectId)
    const localUpdateId = makeLocalId()
    const currentTimestamp = new Date().toISOString()
    const latestCoordinatePatch = buildLatestCoordinatePatch()
    const projectName = project?.project_name ||'Untitled Project'
    const driveFundingYear = getDriveFundingYear(project, inspectionDate)
    const driveFundingSource = getDriveFundingSource(project)

    const updateTable = await getOfflineTable(offlineUpdateTables)

    if (!updateTable?.add) {
      throw new Error('No compatible offline update table was found. Please check offlineDb.ts table names.'
      )
    }

    const offlineUpdateRecord = {
      ...updatePayload,
      local_id: localUpdateId,
      project_name: projectName,
      funding_year: driveFundingYear || null,
      funding_source: driveFundingSource || project?.funding_source || null,
      funding_program: driveFundingSource || null,
      status: projectStatus,
      contract_expiration_date: project?.contract_expiration_date || null,
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification ? contractModificationType : null,
      revised_project_cost: hasContractModification ? toNumber(revisedProjectCost) : null,
      revised_contract_expiration_date: hasContractModification ? revisedContractExpirationDate : null,
      not_yet_started_reason: requiresUpdateReason ? cleanText(notYetStartedReason) : null,
      synced: false,
      sync_status:'pending',
      is_offline: true,
      error:'',
    }

    const offlineUpdateId = await updateTable.add(offlineUpdateRecord)

    const offlinePhotoRecords = photoInputs.map((photo, index) => ({
      offline_update_id: offlineUpdateId,
      local_update_id: localUpdateId,
      project_update_id: localUpdateId,
      project_id: projectId,
      project_name: projectName,
      funding_year: driveFundingYear || null,
      funding_source: driveFundingSource || project?.funding_source || null,
      funding_program: driveFundingSource || null,
      file_blob: photo.file,
      file: photo.file,
      file_name: photo.file.name,
      file_type: photo.file.type,
      file_size: photo.file.size,
      caption:
        cleanText(photo.caption) ||
        `Project update photo ${index + 1}`,
      created_at: new Date().toISOString(),
      uploaded_at: new Date().toISOString(),
      synced: false,
      sync_status:'pending',
      is_offline: true,
      error:'',
    }))

    const photoTable = await getOfflineTable(offlinePhotoTables)

    if (offlinePhotoRecords.length > 0 && !photoTable?.add && !photoTable?.bulkAdd) {
      throw new Error('No compatible offline photo table was found. Please check offlineDb.ts table names.'
      )
    }

    if (photoTable?.bulkAdd && offlinePhotoRecords.length > 0) {
      await photoTable.bulkAdd(offlinePhotoRecords)
    } else if (photoTable?.add && offlinePhotoRecords.length > 0) {
      for (const photoRecord of offlinePhotoRecords) {
        await photoTable.add(photoRecord)
      }
    }

    await updateCachedProject(projectId, {
      status: projectStatus,
      physical_accomplishment: clampProgress(physicalAccomplishment),
      target_physical_accomplishment: clampProgress(targetPhysicalAccomplishment),
      target_physical_as_of: inspectionDate,
      target_physical_source:'manual',
      financial_accomplishment: clampProgress(financialAccomplishment),
      risk_level: autoRiskLevel,
      contract_expiration_date: project?.contract_expiration_date || null,
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification ? contractModificationType : null,
      revised_project_cost: hasContractModification ? toNumber(revisedProjectCost) : null,
      revised_contract_expiration_date: hasContractModification ? revisedContractExpirationDate : null,
      not_yet_started_reason: requiresUpdateReason ? cleanText(notYetStartedReason) : null,
      last_inspection_date: inspectionDate,
      ...latestCoordinatePatch,
      updated_at: currentTimestamp,
    })

    clearFormAfterSave()
    setMessage('Project update saved offline. Sync it when internet is available.')
    setSaveSuccessDialog({
      title:'Saved Offline',
      message:'Project update saved offline successfully. Sync it when internet is available.',
      mode:'offline',
    })

    await loadOfflineData()
  }

  function clearFormAfterSave() {
    setIssues('')
    setRecommendations('')
    setRemarks('')
    setDisbursementAmount('')
    setNotYetStartedReason('')
    setInspectionDate(todayInputValue())
    setGpsMessage('')
    setInspectionLatitude('')
    setInspectionLongitude('')
    setTargetPhysicalAccomplishment(
      formatProgressInput(physicalAccomplishment || project?.physical_accomplishment || 0),
    )

    photoInputs.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    setPhotoInputs([])
  }

  function closeSuccessDialog() {
    const completedMode = saveSuccessDialog?.mode
    setSaveSuccessDialog(null)

    if (completedMode ==='online' && id) {
      navigate(`/projects/${id}`)
    }
  }

  if (loading) {
    return (
      <div className="pu-page">
        <div className="pu-loading-card">
          <div className="pu-spinner" />
          <p>Loading project update form...</p>
        </div>
      </div>
    )
  }

  if (projectMissingOffline) {
    return (
      <div className="pu-page">
        <div className="pu-empty-card">
          <p className="pu-eyebrow">Offline Project Not Available</p>
          <h2>This project is not cached on this device.</h2>
          <p>
            Open the Project Registry while online, wait for the project list to load,
            then try Offline Update again. The app needs the project record cached
            before it can save an offline inspection update.
          </p>
          <Link className="pu-secondary-btn" to="/projects">
            Back to Project Registry
          </Link>
        </div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="pu-page">
        <div className="pu-empty-card">
          <p className="pu-eyebrow">AOR Restricted</p>
          <h2>Project update access is restricted.</h2>
          <p>
            This project is outside your assigned Area of Responsibility. Please
            contact the system administrator if update access is needed.
          </p>
          <Link className="pu-secondary-btn" to={`/projects/${id}`}>
            Back to Project Details
          </Link>
        </div>
      </div>
    )
  }

  if (!canSubmit) {
    return (
      <div className="pu-page">
        <div className="pu-empty-card">
          <p className="pu-eyebrow">Unauthorized</p>
          <h2>Project update access is restricted.</h2>
          <p>
            Only Admin, RO Engineer, or assigned PO Engineer accounts can submit
            project updates within their assigned AOR.
          </p>
          <Link className="pu-secondary-btn" to={`/projects/${id}`}>
            Back to Project Details
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`pu-page ${isUpdateScrolled ?'is-pu-scrolled' :''}`}>
      <section className="pu-hero pu-update-hero-card">
        <div className="">
          <p className="pu-eyebrow">Project Update Form</p>
          <h1 className=" pu-update-hero-title">{project?.project_name ||'Project Update'}</h1>

          <div className="pu-location-line">
            <span>{project?.province ||'No province'}</span>
            <span>{project?.municipality ||'No LGU'}</span>
            <span>{project?.barangay ||'No barangay'}</span>
          </div>
        </div>

        <div className="pu-hero-status">
          <span className={`pu-badge ${getStatusClass(heroDisplayStatus)}`}>
            {heroDisplayStatus}
          </span>
          <span className={`pu-badge pu-variance-badge ${targetVarianceInfo.className}`}>
            {targetVarianceInfo.compactLabel}
          </span>
          <span className={`pu-badge ${getRiskClass(autoRiskLevel)}`}>
            {autoRiskLevel}
          </span>
        </div>
      </section>

      {!online && (
        <div className="pu-alert pu-alert-warning">
          You are currently offline. Updates will be saved locally and must be
          synced later.
        </div>
      )}

      {message && <div className="pu-alert pu-alert-success">{message}</div>}

      {errorMessage && (
        <div className="pu-alert pu-alert-danger">{errorMessage}</div>
      )}

      <section className="pu-summary-grid">
        <div className="pu-summary-card pu-progress-summary">
          <span>Physical</span>
          <strong>{formatPercent(currentPhysical)}</strong>
        </div>
        <div className="pu-summary-card pu-progress-summary">
          <span>Financial</span>
          <strong>{formatPercent(currentFinancial)}</strong>
        </div>
        <div className="pu-summary-card">
          <span>Latest Update</span>
          <strong>{latestUpdateAge.label}</strong>
        </div>
        <div className="pu-summary-card pu-variance-summary">
          <span>Variance</span>
          <strong className={targetVarianceInfo.className}>
            {targetVarianceInfo.label}
          </strong>
        </div>
      </section>

      <div className="pu-content-grid">
        <form className="pu-form-card" onSubmit={handleSubmit} noValidate>
          <div className="pu-card-header">
            <div>
              <p className="pu-eyebrow">Project Update</p>
              <h2>Project Update</h2>
              <span className="pu-field-mode-note">
                Use the large buttons first, then encode progress, status, contract actions, findings, photos, and final remarks.
              </span>
            </div>

            <div className={`pu-network-state ${online ?'online' :'offline'}`} aria-live="polite">
              <strong>{online ?'Online' :'Offline'}</strong>
              <span>{online ?'Will save to cloud' :'Will save to device'}</span>
            </div>
          </div>

          <div className="pu-update-section pu-section-quick">
            <div className="pu-section-heading">
              <span>01</span>
              <div>
                <strong>Capture and Update Date</strong>
                <small>Start with date, GPS, and photos using large outdoor-ready buttons.</small>
              </div>
            </div>

            <div className="pu-quick-grid">
              <div className="pu-field pu-date-field pu-full-field">
                <span>Update Date</span>

                <div className="pu-long-date-field">
                  <div>
                    <strong>{formatLongDate(inspectionDate)}</strong>
                    <small>Selected update date</small>
                  </div>

                  <label className={`pu-date-change-btn pu-date-picker-proxy ${saving ?'disabled' :''}`}>
                    Change Date
                    <input
                      ref={dateInputRef}
                      className="pu-native-date-input"
                      type="date"
                      value={inspectionDate}
                      onChange={(event) => setInspectionDate(event.target.value)}
                      required
                      disabled={saving}
                      aria-label="Update date"
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                className="pu-action-btn pu-action-gps"
                onClick={captureGps}
                disabled={gpsLoading || saving}
              >
                {gpsLoading ?'Capturing GPS...' :'Update GPS'}
                <span>Capture location</span>
              </button>

              <label className="pu-action-btn pu-action-photo">
                Add Photos
                <span>{photoInputs.length}/{MAX_PHOTOS_PER_UPDATE} selected</span>
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  onChange={handlePhotoSelect}
                  disabled={saving || photoInputs.length >= MAX_PHOTOS_PER_UPDATE}
                />
              </label>
            </div>

            <div className="pu-gps-inline-wrap">
              {gpsMessage && <div className="pu-gps-message pu-gps-message-inline">{gpsMessage}</div>}

              {hasInspectionCoordinates ? (
                <div className="pu-gps-inline-result">
                  <strong>{inspectionCoordinateStatus.isValid ?'GPS captured' :'GPS needs checking'}</strong>
                  <em>
                    {inspectionCoordinateStatus.isValid
                      ? `Lat ${inspectionCoordinateStatus.latitude?.toFixed(7) ||''} · Long ${inspectionCoordinateStatus.longitude?.toFixed(7) ||''}`
                      : inspectionCoordinateStatus.reason}
                  </em>
                </div>
              ) : (
                <div className="pu-gps-inline-result muted">
                  <strong>No GPS captured yet</strong>
                  <em>Tap Update GPS while you are at the project site. Coordinates will appear here.</em>
                </div>
              )}
            </div>
          </div>

          <div className="pu-update-section pu-section-progress">
            <div className="pu-section-heading">
              <span>02</span>
              <div>
                <strong>Progress and Financial</strong>
                <small>Encode progress values clearly for field updating.</small>
              </div>
            </div>

            <div className="pu-progress-grid">
              <label className="pu-field pu-field-important pu-progress-field">
                <span>Physical Accom. (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={physicalAccomplishment}
                  onChange={(event) => setPhysicalAccomplishment(event.target.value)}
                  placeholder="0"
                  required
                  disabled={saving}
                />
              </label>

              <label className="pu-field pu-progress-field">
                <span>Target (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={targetPhysicalAccomplishment}
                  onChange={(event) => handleTargetPhysicalChange(event.target.value)}
                  placeholder="0"
                  required
                  disabled={saving}
                />
              </label>

              <label className="pu-field pu-disbursement-field pu-progress-full">
                <span>Disbursement</span>
                <div className="pu-disbursement-control">
                  <input
                    type="text"
                    value={disbursementAmount}
                    onChange={(event) => setDisbursementAmount(event.target.value)}
                    onKeyDown={handleDisbursementKeyDown}
                    placeholder="Example: 500000 + 250000"
                    inputMode="decimal"
                    disabled={saving}
                  />

                  <button
                    type="button"
                    className="pu-disbursement-equals-btn"
                    onClick={() => applyDisbursementComputation()}
                    disabled={saving || projectCost <= 0}
                    aria-label="Compute disbursement and financial accomplishment"
                    title="Compute"
                  >
                    =
                  </button>
                </div>
                <small>Enter amount or expression, then tap =.</small>
              </label>

              <label className="pu-field pu-field-important pu-progress-field">
                <span>Financial Accom. (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={financialAccomplishment}
                  onChange={(event) => setFinancialAccomplishment(event.target.value)}
                  placeholder="0"
                  required
                  disabled={saving}
                />
              </label>

              <label className="pu-field pu-progress-field">
                <span>Risk Level</span>
                <div className="pu-readonly-risk">
                  <span className={`pu-badge ${getRiskClass(autoRiskLevel)}`}>
                    {autoRiskLevel}
                  </span>
                </div>
              </label>
            </div>

            <div className={`pu-variance-preview ${targetVarianceInfo.className}`}>
              <div>
                <span>Variance</span>
                <strong>{targetVarianceInfo.label}</strong>
              </div>
            </div>
          </div>

          <div className="pu-update-section pu-section-status">
            <div className="pu-section-heading">
              <span>03</span>
              <div>
                <strong>Project Status</strong>
                <small>All project statuses are available here because this is the main update page.</small>
              </div>
            </div>

            <div className="pu-field pu-full-field pu-status-field-block">
              <div className="pu-status-button-grid" role="radiogroup" aria-label="Project status">
                {statusOptions.map((status) => {
                  const isActive = projectStatus === status
                  const normalizedStatus = normalizeText(status)
                  const isCriticalStatus = normalizedStatus.includes('suspend') || normalizedStatus.includes('terminate')
                  const isAdministrativeStatus = normalizedStatus.includes('procurement') || normalizedStatus.includes('not yet')

                  return (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      className={`pu-choice-card pu-status-choice ${isActive ?'active' :''} ${isCriticalStatus ?'critical' :''} ${isAdministrativeStatus ?'administrative' :''}`}
                      onClick={() => handleProjectStatusChange(status)}
                      disabled={saving}
                    >
                      <strong>{status}</strong>
                      <small>{getStatusHelperText(status)}</small>
                    </button>
                  )
                })}
              </div>
            </div>

            {isNotYetStartedSelected ? (
              <div className="pu-field pu-full-field">
                <span>{projectReasonLabel} *</span>
                <div className="pu-reason-chip-grid" role="radiogroup" aria-label="Reason for not yet started">
                  {NOT_YET_STARTED_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      role="radio"
                      aria-checked={notYetStartedReason === reason}
                      className={`pu-reason-chip ${notYetStartedReason === reason ?'active' :''}`}
                      onClick={() => setNotYetStartedReason(reason)}
                      disabled={saving}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <label className="pu-field pu-full-field pu-critical-reason-field">
                <span>{projectReasonLabel} {requiresUpdateReason ?'*' :''}</span>
                <textarea
                  value={notYetStartedReason}
                  onChange={(event) => setNotYetStartedReason(event.target.value)}
                  required={requiresUpdateReason}
                  disabled={!requiresUpdateReason || saving}
                  placeholder={
                    requiresUpdateReason
                      ?'State the reason/justification for this critical status or contract modification.'
                      :'Reason field is enabled only for critical status or contract modification.'
                  }
                  rows={3}
                />
              </label>
            )}
          </div>

          <div className="pu-update-section pu-section-contract">
            <div className="pu-section-heading">
              <span>04</span>
              <div>
                <strong>Contract Modification</strong>
                <small>Use this only for VO, SO, EOT, Combination, or expired contract correction.</small>
              </div>
            </div>

            <div className="pu-form-grid">
              <div className="pu-field">
                <span>Contract Expiration Date</span>
                <div className="pu-long-date-field">
                  <div>
                    <strong>{formatLongDate(project?.contract_expiration_date)}</strong>
                    <small>Original contract expiration</small>
                  </div>
                </div>
              </div>

              <div className="pu-field pu-full-field">
                <span>Approved Contract Modification?</span>
                <div className="pu-two-choice-grid" role="radiogroup" aria-label="Approved contract modification">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!hasContractModification}
                    className={`pu-choice-card ${!hasContractModification ?'active' :''}`}
                    onClick={() => setHasContractModification(false)}
                    disabled={saving || isSuspendedSelected}
                  >
                    <strong>No</strong>
                    <small>Normal update only</small>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={hasContractModification}
                    className={`pu-choice-card ${hasContractModification ?'active' :''}`}
                    onClick={() => setHasContractModification(true)}
                    disabled={saving || isSuspendedSelected}
                  >
                    <strong>Yes</strong>
                    <small>{isSuspendedSelected ?'Required by Suspended status' :'VO, SO, EOT, or Combination'}</small>
                  </button>
                </div>
              </div>

              {hasContractModification && (
                <div className="pu-field pu-full-field">
                  <span>Type of Modification *</span>
                  <div className="pu-modification-grid" role="radiogroup" aria-label="Type of modification">
                    {contractModificationTypeOptions.map((option) => {
                      const isActive = contractModificationType === option
                      const isCriticalModification = normalizeText(option).includes('suspension')

                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          className={`pu-choice-card pu-modification-choice ${isActive ?'active' :''} ${isCriticalModification ?'critical' :''}`}
                          onClick={() => handleContractModificationTypeChange(option)}
                          disabled={saving}
                        >
                          <strong>{option}</strong>
                          <small>{getModificationHelperText(option)}</small>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {contractInfo.isExpired && (
                <div className="pu-contract-warning pu-full-field">
                  <strong>Contract Warning</strong>
                  <span>{contractInfo.warningMessage}</span>
                  <span>Risk is automatically classified as High until a valid revised expiration date is encoded.</span>
                </div>
              )}

              {hasContractModification && (
                <>
                  <label className="pu-field">
                    <span>Revised Project Cost *</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={revisedProjectCost}
                      onChange={(event) => setRevisedProjectCost(event.target.value)}
                      disabled={saving}
                      placeholder="0.00"
                      required
                    />
                  </label>

                  <div className="pu-field pu-date-field">
                    <span>Revised Contract Expiration Date *</span>

                    <div className="pu-long-date-field pu-revised-date-display">
                      <div>
                        <strong>{formatLongDate(revisedContractExpirationDate)}</strong>
                        <small>Revised contract expiration</small>
                      </div>

                      <label className={`pu-date-change-btn pu-date-picker-proxy ${saving ?'disabled' :''}`}>
                        Change Date
                        <input
                          ref={revisedContractExpirationDateInputRef}
                          className="pu-native-date-input"
                          type="date"
                          value={revisedContractExpirationDate}
                          onChange={(event) => setRevisedContractExpirationDate(event.target.value)}
                          disabled={saving}
                          required
                          aria-label="Revised contract expiration date"
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="pu-update-section pu-section-notes">
            <div className="pu-section-heading">
              <span>05</span>
              <div>
                <strong>Notes and Photo Documentation</strong>
                <small>Encode findings, recommendations, final remarks, and review selected photos.</small>
              </div>
            </div>

            <div className="pu-textarea-grid">
              <label className="pu-field">
                <span>Issues / Findings</span>
              <textarea
                value={issues}
                onChange={(event) => setIssues(event.target.value)}
                placeholder="Encode observed issues, defects, delay causes, or field findings."
              />
            </label>

            <label className="pu-field">
              <span>Recommendations</span>
              <textarea
                value={recommendations}
                onChange={(event) => setRecommendations(event.target.value)}
                placeholder="Encode corrective actions, engineering recommendations, or instructions to the LGU/contractor."
              />
            </label>

            <label className="pu-field pu-full-field">
              <span>Remarks</span>
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Encode additional notes, agreements, or inspection observations."
              />
            </label>
          </div>

          <div className="pu-photo-section">
            <div className="pu-photo-header">
              <div>
                <p className="pu-eyebrow">Photo Documentation</p>
                <h3>Upload Update Photos</h3>
                <p>
                  JPG, PNG, WebP, and HEIC files can be uploaded. HEIC preview
                  may not display in Chrome, but the file can still be saved.
                </p>
              </div>

            </div>

            {photoInputs.length === 0 ? (
              <div className="pu-photo-empty">
                No photos selected yet. Use the Add Photos button in Section 01 when documentation is required.
              </div>
            ) : (
              <div className="pu-photo-grid">
                {photoInputs.map((photo, index) => {
                  const unsupported = isUnsupportedPreview(photo.file.name)

                  return (
                    <div className="pu-photo-card" key={photo.id}>
                      {unsupported ? (
                        <div className="pu-photo-placeholder">
                          <strong>HEIC Preview Not Supported</strong>
                          <span>{photo.file.name}</span>
                        </div>
                      ) : (
                        <div
                          className="pu-photo-preview"
                          style={{
                            backgroundImage: `url(${photo.previewUrl})`,
                          }}
                        />
                      )}

                      <div className="pu-photo-meta">
                        <strong>Photo {index + 1}</strong>
                        <span>{photo.file.name}</span>
                        <small>
                          {photo.compressed
                            ? `Optimized: ${formatFileSize(photo.originalSize || 0)} → ${formatFileSize(photo.compressedSize || photo.file.size)}`
                            : `Size: ${formatFileSize(photo.file.size)}`}
                        </small>
                      </div>

                      <input
                        type="text"
                        value={photo.caption}
                        onChange={(event) =>
                          updatePhotoCaption(photo.id, event.target.value)
                        }
                        placeholder="Optional caption"
                      />

                      <button
                        type="button"
                        className="pu-remove-photo-btn"
                        onClick={() => removePhoto(photo.id)}
                        disabled={saving}
                      >
                        Remove Photo
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          </div>

          <div className="pu-submit-bar pu-single-save-bar">
            <button
              type="submit"
              className={`pu-main-save-btn ${online ?'online' :'offline'}`}
              disabled={saving}
            >
              {saving ?'Saving Update...' : online ?'Save Update' :'Save Offline'}
              <span>{online ?'Online detected · submit now' :'No internet · save to this device'}</span>
            </button>

            <Link className="pu-secondary-btn pu-cancel-link" to={`/projects/${id}`}>
              Cancel
            </Link>
          </div>
        </form>

        <aside className="pu-side-panel">
          <div className="pu-side-card">
            <div className="pu-card-header compact">
              <div>
                <p className="pu-eyebrow">Update History</p>
                <h3>Latest Records</h3>
              </div>
              <span className="pu-count-pill">
                {recentUpdates.length} shown
              </span>
            </div>

            {recentUpdates.length === 0 ? (
              <div className="pu-empty-mini">
                No recent update records found for this project.
              </div>
            ) : (
              <div className="pu-recent-list">
                {recentUpdates.slice(0, RECENT_UPDATE_LIMIT).map((update, index) => (
                  <div className="pu-recent-item" key={update.id || index}>
                    <div>
                      <strong>{formatLongDate(update.inspection_date)}</strong>
                      {update.sync_status ==='pending' && (
                        <span className="pu-pending-pill">Pending Sync</span>
                      )}
                    </div>

                    <p>
                      {getDaysSinceDate(getUpdateDateValue(update)).label}
                    </p>

                    <p>
                      Physical: {formatPercent(update.physical_accomplishment)}
                    </p>
                    <p>
                      Target: {formatPercent(getTargetPhysicalInfo(update, update.inspection_date).targetPhysical)}
                    </p>
                    {(() => {
                      const updateVariance = getTargetPhysicalInfo(update, update.inspection_date)

                      return (
                        <p>
                          Variance:{''}
                          <strong className={updateVariance.className}>
                            {updateVariance.label}
                          </strong>
                        </p>
                      )
                    })()}
                    <p>
                      Financial:{''}
                      {formatPercent(update.financial_accomplishment)}
                    </p>
                    <p>
                      GPS:{''}
                      {hasCoordinateValue(update.inspection_latitude) &&
                      hasCoordinateValue(update.inspection_longitude)
                        ? `${formatCoordinate(
                            update.inspection_latitude
                          )}, ${formatCoordinate(update.inspection_longitude)}`
                        :'No GPS recorded'}
                    </p>

                    <span className={`pu-badge ${getRiskClass(autoRiskLevel === 'None' ? 'None' : update.risk_level)}`}>
                      {autoRiskLevel === 'None' ? 'None' : update.risk_level ||'No Risk'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>


      {/* PMS10_MODAL_PORTAL_START */}
      {portalReady
        ? createPortal(
            <>


      {noticeDialog && (
        <div className="pu-modal-overlay" role="alertdialog" aria-modal="true" aria-label={noticeDialog.title}>
          <div className={`pu-save-modal pu-notice-modal ${noticeDialog.tone}`}>
            <div className="pu-notice-icon">
              {noticeDialog.tone ==='danger' ?'!' : noticeDialog.tone ==='warning' ?'!' :'i'}
            </div>
            <h3>{noticeDialog.title}</h3>
            <p>{noticeDialog.message}</p>
            <button
              type="button"
              className="pu-primary-btn"
              onClick={() => setNoticeDialog(null)}
            >
              OK, Review
            </button>
          </div>
        </div>
      )}

      {confirmSaveOpen && (
        <div className="pu-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm project update save">
          <div className="pu-save-modal">
            <p className="pu-eyebrow">Confirm Update</p>
            <h3>Save this project update?</h3>
            <p>Review the summary below. Continue saving this project update?</p>

            <div className="pu-save-summary-grid">
              <span>Status <strong>{heroDisplayStatus}</strong></span>
              <span>Physical <strong>{formatPercent(physicalAccomplishment)}</strong></span>
              <span>Target <strong>{formatPercent(targetPhysicalAccomplishment)}</strong></span>
              <span>Financial <strong>{formatPercent(financialAccomplishment)}</strong></span>
              <span>Risk <strong>{autoRiskLevel}</strong></span>
              <span>Photos <strong>{photoInputs.length}/{MAX_PHOTOS_PER_UPDATE}</strong></span>
            </div>

            <div className="pu-modal-actions">
              <button
                type="button"
                className="pu-secondary-btn"
                onClick={() => setConfirmSaveOpen(false)}
                disabled={saving}
              >
                Review Again
              </button>
              <button
                type="button"
                className="pu-primary-btn"
                onClick={confirmSaveUpdate}
                disabled={saving}
              >
                {saving ?'Saving...' : online ?'Yes, Save Update' :'Yes, Save Offline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveSuccessDialog && (
        <div className="pu-modal-overlay pu-success-overlay" role="status" aria-live="polite">
          <div className="pu-save-modal pu-success-modal">
            <div className="pu-success-icon">✓</div>
            <h3>{saveSuccessDialog.title}</h3>
            <p>{saveSuccessDialog.message}</p>
            <button
              type="button"
              className="pu-primary-btn"
              onClick={closeSuccessDialog}
            >
              {saveSuccessDialog.mode ==='online' ?'OK, View Project' :'OK'}
            </button>
          </div>
        </div>
      )}
            </>,
            document.body,
          )
        : null}
      {/* PMS10_MODAL_PORTAL_END */}

      {portalReady
        ? createPortal(
            <button
            type="button"
            className="pu-back-fab"
            onClick={() => navigate(`/projects/${id}`)}
            aria-label="Back to project details"
            title="Back to Project Details"
            >
            <IconBack />
            </button>
            ,
            document.body,
          )
        : null}
    </div>
  )
}
