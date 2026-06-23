import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cleanupProjectPhotos } from '../services/photoService'
import { offlineDb } from '../lib/offlineDb'
import { useAuth } from '../context/AuthContext'
import {
  formatProgressInput,
  getTargetPhysicalInfo,
} from '../utils/projectVariance'
import { canUpdateProject } from '../utils/aorAccess'
import '../styles/projectUpdates.css'

type ProjectRecord = {
  id: string
  project_name?: string | null
  description?: string | null
  status?: string | null
  project_type?: string | null
  funding_source?: string | null
  implementing_office?: string | null
  contractor?: string | null
  budget?: number | string | null
  start_date?: string | null
  target_completion_date?: string | null
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
}

type SaveMode = 'online' | 'offline'

type CoordinateResult = {
  isValid: boolean
  latitude: number | null
  longitude: number | null
  wasSwapped: boolean
  reason: string
}

const PHOTO_BUCKET = 'project-photos'
const MAX_PHOTOS_PER_UPDATE = 10
const RECENT_UPDATE_LIMIT = 4

const statusOptions = [
  'Under Review',
  'Under Procurement',
  'Not Yet Started',
  'Ongoing',
  'Suspended',
  'Terminated',
  'Completed',
]

const offlineUpdateTables = [
  'offlineUpdates',
  'offline_updates',
  'pendingUpdates',
  'projectUpdates',
  'project_updates',
  'updates',
]

const offlinePhotoTables = [
  'offlinePhotos',
  'offline_photos',
  'pendingPhotos',
  'projectPhotos',
  'project_photos',
  'photos',
]

function makeLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function todayInputValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

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
  if (!value) return 'No record'

  const normalizedValue = value.length <= 10 ? `${value}T00:00:00` : value
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function cleanText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function safeFileName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase()
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
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function formatCoordinate(value: unknown) {
  const parsed = Number(value)

  if (Number.isFinite(parsed)) {
    return parsed.toFixed(7)
  }

  return String(value || '')
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
      reason: 'No GPS coordinates recorded.',
    }
  }

  if (!hasLatitude || !hasLongitude) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason: 'Latitude or longitude is incomplete.',
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
      reason: 'Latitude or longitude is not a valid number.',
    }
  }

  if (canBeLatitude(lat) && canBeLongitude(lng) && !isZeroCoordinate(lat, lng)) {
    if (isMindanaoCoordinate(lat, lng)) {
      return {
        isValid: true,
        latitude: lat,
        longitude: lng,
        wasSwapped: false,
        reason: 'Coordinates are valid.',
      }
    }

    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason:
        'Coordinates are valid globally but outside the Mindanao range. Please verify the encoded site location.',
    }
  }

  if (canBeLatitude(lng) && canBeLongitude(lat) && !isZeroCoordinate(lng, lat)) {
    if (isMindanaoCoordinate(lng, lat)) {
      return {
        isValid: true,
        latitude: lng,
        longitude: lat,
        wasSwapped: true,
        reason: 'Latitude and longitude appeared reversed and were corrected.',
      }
    }

    return {
      isValid: false,
      latitude: null,
      longitude: null,
      wasSwapped: false,
      reason:
        'Coordinates appear reversed, but the corrected location is still outside Mindanao. Please verify the encoded values.',
    }
  }

  return {
    isValid: false,
    latitude: null,
    longitude: null,
    wasSwapped: false,
    reason: 'Coordinates are outside the valid latitude/longitude range.',
  }
}

function getRiskClass(risk?: string | null) {
  const normalized = String(risk || '').toLowerCase()

  if (normalized.includes('high')) return 'pu-badge-danger'
  if (normalized.includes('moderate') || normalized.includes('medium')) {
    return 'pu-badge-warning'
  }
  if (normalized.includes('low')) return 'pu-badge-success'

  return 'pu-badge-neutral'
}

function getStatusClass(status?: string | null) {
  const normalized = String(status || '').toLowerCase()

  if (normalized.includes('completed')) return 'pu-badge-success'
  if (normalized.includes('ongoing')) return 'pu-badge-primary'
  if (normalized.includes('under review')) return 'pu-badge-warning'
  if (normalized.includes('under procurement')) return 'pu-badge-warning'
  if (normalized.includes('suspended') || normalized.includes('terminated')) {
    return 'pu-badge-danger'
  }
  if (normalized.includes('not yet')) return 'pu-badge-neutral'

  return 'pu-badge-neutral'
}

function getAutoRiskLevelFromVariance(variance: number) {
  if (!Number.isFinite(variance) || variance >= 0) return 'None'
  if (variance >= -5) return 'Low'
  if (variance > -10) return 'Moderate'
  return 'High'
}

function getGpsErrorMessage(error: GeolocationPositionError) {
  if (!window.isSecureContext) {
    return 'GPS requires HTTPS or localhost. Please open the app using localhost, HTTPS deployment, or manually encode the coordinates.'
  }

  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission was denied. Please allow location access in your browser settings, then try Update GPS again.'
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'GPS position is unavailable. Please turn on device location services, move to an open area, or manually encode the coordinates.'
  }

  if (error.code === error.TIMEOUT) {
    return 'GPS capture timed out. Please move to an open area with better signal and try again.'
  }

  return 'Unable to capture GPS. Please allow location permission and try again.'
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
    project_name: projectRecord.project_name || 'Untitled Project',
    status: projectRecord.status || 'Not Yet Started',
    municipality: projectRecord.municipality || '',
    province: projectRecord.province || '',
    barangay: projectRecord.barangay || '',
    physical_accomplishment: toNumber(projectRecord.physical_accomplishment),
    financial_accomplishment: toNumber(projectRecord.financial_accomplishment),
    risk_level: projectRecord.risk_level || 'None',
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
  const photoInputsRef = useRef<PhotoInput[]>([])

  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [recentUpdates, setRecentUpdates] = useState<ProjectUpdateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [projectMissingOffline, setProjectMissingOffline] = useState(false)
  const [saving, setSaving] = useState(false)
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [saveMode, setSaveMode] = useState<SaveMode>('online')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [inspectionDate, setInspectionDate] = useState(todayInputValue())
  const [projectStatus, setProjectStatus] = useState('Ongoing')
  const [physicalAccomplishment, setPhysicalAccomplishment] = useState('')
  const [targetPhysicalAccomplishment, setTargetPhysicalAccomplishment] = useState('')
  const targetPhysicalSource = 'manual' as const
  const [financialAccomplishment, setFinancialAccomplishment] = useState('')
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

  const targetVarianceInfo = useMemo(() => {
    return getTargetPhysicalInfo(
      {
        ...(project || {}),
        physical_accomplishment:
          physicalAccomplishment === ''
            ? project?.physical_accomplishment
            : physicalAccomplishment,
        target_physical_accomplishment: targetPhysicalAccomplishment,
        target_physical_as_of: inspectionDate,
        target_physical_source: 'manual',
      },
      inspectionDate,
    )
  }, [
    project,
    physicalAccomplishment,
    targetPhysicalAccomplishment,
    targetPhysicalSource,
    inspectionDate,
  ])

  const autoRiskLevel = useMemo(
    () => getAutoRiskLevelFromVariance(targetVarianceInfo.variance),
    [targetVarianceInfo.variance],
  )

  const inspectionCoordinateStatus = useMemo(() => {
    return normalizeCoordinatePair(inspectionLatitude, inspectionLongitude)
  }, [inspectionLatitude, inspectionLongitude])

  const hasInspectionCoordinates =
    inspectionLatitude.trim() !== '' || inspectionLongitude.trim() !== ''

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
      setSaveMode('online')
    }

    function handleOffline() {
      setOnline(false)
      setSaveMode('offline')
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
      setSaveMode('offline')
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


  function applyTargetPhysicalFromProject(projectRecord: ProjectRecord | null) {
    if (!projectRecord) {
      setTargetPhysicalAccomplishment('0')
      return
    }

    const storedTarget = String(projectRecord.target_physical_accomplishment ?? '').trim()

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
        setProjectStatus(onlineProject?.status || 'Ongoing')
        setPhysicalAccomplishment(
          onlineProject?.physical_accomplishment !== null &&
            onlineProject?.physical_accomplishment !== undefined
            ? String(onlineProject.physical_accomplishment)
            : ''
        )
        setFinancialAccomplishment(
          onlineProject?.financial_accomplishment !== null &&
            onlineProject?.financial_accomplishment !== undefined
            ? String(onlineProject.financial_accomplishment)
            : ''
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
    setProjectStatus(cachedProject?.status || 'Ongoing')
    setPhysicalAccomplishment(
      cachedProject?.physical_accomplishment !== null &&
        cachedProject?.physical_accomplishment !== undefined
        ? String(cachedProject.physical_accomplishment)
        : ''
    )
    setFinancialAccomplishment(
      cachedProject?.financial_accomplishment !== null &&
        cachedProject?.financial_accomplishment !== undefined
        ? String(cachedProject.financial_accomplishment)
        : ''
    )

    const offlineUpdates = await readOfflineTable(offlineUpdateTables)
    const filteredUpdates = offlineUpdates
      .filter((update: ProjectUpdateRecord) => update?.project_id === id)
      .sort((a: ProjectUpdateRecord, b: ProjectUpdateRecord) => {
        const dateA = new Date(
          a.inspection_date || a.created_at || '1970-01-01'
        ).getTime()
        const dateB = new Date(
          b.inspection_date || b.created_at || '1970-01-01'
        ).getTime()

        return dateB - dateA
      })
      .slice(0, RECENT_UPDATE_LIMIT)

    setRecentUpdates(filteredUpdates)
  }

  function openDatePicker() {
    const dateInput = dateInputRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null

    if (!dateInput) return

    if (dateInput.showPicker) {
      dateInput.showPicker()
      return
    }

    dateInput.focus()
    dateInput.click()
  }

  function handlePhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) return

    const imageFiles = files.filter(isLikelyImage)
    const rejectedCount = files.length - imageFiles.length

    const availableSlots = MAX_PHOTOS_PER_UPDATE - photoInputs.length
    const acceptedFiles = imageFiles.slice(0, Math.max(availableSlots, 0))

    const mappedPhotos = acceptedFiles.map((file) => ({
      id: makeLocalId(),
      file,
      previewUrl: URL.createObjectURL(file),
      caption: '',
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

    event.target.value = ''
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
      setErrorMessage('GPS is not supported by this browser or device.')
      return
    }

    if (!window.isSecureContext) {
      setErrorMessage(
        'GPS requires HTTPS or localhost. Please open the app using localhost, HTTPS deployment, or manually encode the coordinates.'
      )
      return
    }

    setGpsLoading(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude

        if (!isMindanaoCoordinate(latitude, longitude)) {
          setErrorMessage(
            'Captured GPS is outside the Mindanao range. Please verify your device location or manually encode the correct project coordinates.'
          )
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
        setErrorMessage(getGpsErrorMessage(error))
        setGpsLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    )
  }

  function swapInspectionCoordinates() {
    const normalized = normalizeCoordinatePair(inspectionLongitude, inspectionLatitude)

    setInspectionLatitude(formatCoordinate(inspectionLongitude))
    setInspectionLongitude(formatCoordinate(inspectionLatitude))
    setErrorMessage('')

    if (
      normalized.isValid &&
      normalized.latitude !== null &&
      normalized.longitude !== null
    ) {
      setGpsMessage(
        `Latitude and longitude were swapped. Current coordinates: Latitude ${normalized.latitude.toFixed(
          7
        )}, Longitude ${normalized.longitude.toFixed(7)}.`
      )
    } else {
      setGpsMessage('Latitude and longitude were swapped. Please verify the values before saving.')
    }
  }

  function validateForm() {
    if (!id) {
      return 'Project ID is missing.'
    }

    if (!canSubmit) {
      return 'You are not allowed to submit project updates.'
    }

    if (!inspectionDate) {
      return 'Please select the inspection date.'
    }

    if (physicalAccomplishment === '') {
      return 'Please enter the physical accomplishment.'
    }

    if (targetPhysicalAccomplishment === '') {
      return 'Please enter the target physical accomplishment.'
    }

    if (financialAccomplishment === '') {
      return 'Please enter the financial accomplishment.'
    }

    const physical = toNumber(physicalAccomplishment)
    const targetPhysical = toNumber(targetPhysicalAccomplishment)
    const financial = toNumber(financialAccomplishment)

    if (physical < 0 || physical > 100) {
      return 'Physical accomplishment must be between 0 and 100.'
    }

    if (targetPhysical < 0 || targetPhysical > 100) {
      return 'Target physical accomplishment must be between 0 and 100.'
    }

    if (financial < 0 || financial > 100) {
      return 'Financial accomplishment must be between 0 and 100.'
    }

    const hasLatitude = inspectionLatitude.trim() !== ''
    const hasLongitude = inspectionLongitude.trim() !== ''

    if (hasLatitude !== hasLongitude) {
      return 'Please provide both latitude and longitude, or leave both blank.'
    }

    if (hasLatitude && hasLongitude && !inspectionCoordinateStatus.isValid) {
      return inspectionCoordinateStatus.reason
    }

    return ''
  }

  function buildUpdatePayload(projectId: string): ProjectUpdateInsert {
    return {
      project_id: projectId,
      engineer_id: auth?.user?.id || auth?.profile?.id || null,
      inspection_date: inspectionDate,
      physical_accomplishment: clampProgress(physicalAccomplishment),
      target_physical_accomplishment: clampProgress(targetPhysicalAccomplishment),
      target_physical_source: 'manual',
      financial_accomplishment: clampProgress(financialAccomplishment),
      risk_level: autoRiskLevel,
      issues: cleanText(issues),
      recommendations: cleanText(recommendations),
      remarks: cleanText(remarks),
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
      setErrorMessage('You are not allowed to update this project based on your assigned AOR.')
      setMessage('')
      return
    }

    const validationError = validateForm()

    if (validationError) {
      setErrorMessage(validationError)
      setMessage('')
      return
    }

    setSaving(true)
    setErrorMessage('')
    setMessage('')

    try {
      if (saveMode === 'online' && online) {
        await saveOnline()
      } else {
        await saveOffline()
      }
    } catch (error: any) {
      console.error(error)
      setErrorMessage(
        error?.message ||
          'Unable to save project update. Please check the form and try again.'
      )
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
      target_physical_source: 'manual',
      financial_accomplishment: clampProgress(financialAccomplishment),
      risk_level: autoRiskLevel,
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

    setTimeout(() => {
      navigate(`/projects/${projectId}`)
    }, 700)
  }

  async function uploadPhotosOnline(projectId: string, updateId: string) {
    const photoRows = []

    for (let index = 0; index < photoInputs.length; index += 1) {
      const photo = photoInputs[index]
      const fileName = safeFileName(photo.file.name || `photo-${index + 1}`)
      const storagePath = `${projectId}/${updateId}/${Date.now()}-${index + 1}-${fileName}`

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, photo.file, {
          cacheControl: '3600',
          upsert: false,
          contentType: photo.file.type || undefined,
        })

      if (uploadError) {
        throw uploadError
      }

      const { data: publicUrlData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(storagePath)

      photoRows.push({
        project_id: projectId,
        project_update_id: updateId,
        photo_url: publicUrlData.publicUrl,
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

      await cleanupProjectPhotos(projectId, 5)
    }
  }

  async function saveOffline() {
    if (!id) return

    const projectId = id
    const updatePayload = buildUpdatePayload(projectId)
    const localUpdateId = makeLocalId()
    const currentTimestamp = new Date().toISOString()
    const latestCoordinatePatch = buildLatestCoordinatePatch()
    const projectName = project?.project_name || 'Untitled Project'

    const updateTable = await getOfflineTable(offlineUpdateTables)

    if (!updateTable?.add) {
      throw new Error(
        'No compatible offline update table was found. Please check offlineDb.ts table names.'
      )
    }

    const offlineUpdateRecord = {
      ...updatePayload,
      local_id: localUpdateId,
      project_name: projectName,
      status: projectStatus,
      synced: false,
      sync_status: 'pending',
      is_offline: true,
      error: '',
    }

    const offlineUpdateId = await updateTable.add(offlineUpdateRecord)

    const offlinePhotoRecords = photoInputs.map((photo, index) => ({
      offline_update_id: offlineUpdateId,
      local_update_id: localUpdateId,
      project_update_id: localUpdateId,
      project_id: projectId,
      project_name: projectName,
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
      sync_status: 'pending',
      is_offline: true,
      error: '',
    }))

    const photoTable = await getOfflineTable(offlinePhotoTables)

    if (offlinePhotoRecords.length > 0 && !photoTable?.add && !photoTable?.bulkAdd) {
      throw new Error(
        'No compatible offline photo table was found. Please check offlineDb.ts table names.'
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
      target_physical_source: 'manual',
      financial_accomplishment: clampProgress(financialAccomplishment),
      risk_level: autoRiskLevel,
      last_inspection_date: inspectionDate,
      ...latestCoordinatePatch,
      updated_at: currentTimestamp,
    })

    clearFormAfterSave()
    setMessage('Project update saved offline. Sync it when internet is available.')

    await loadOfflineData()
  }

  function clearFormAfterSave() {
    setIssues('')
    setRecommendations('')
    setRemarks('')
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
            contact the system administrator if access is needed.
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
            project inspection updates within their assigned AOR.
          </p>
          <Link className="pu-secondary-btn" to={`/projects/${id}`}>
            Back to Project Details
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`pu-page ${isUpdateScrolled ? 'is-pu-scrolled' : ''}`}>
      <section className="pu-hero">
        <div>
          <p className="pu-eyebrow">Project Update Form</p>
          <h1>{project?.project_name || 'Project Update'}</h1>

          <div className="pu-location-line">
            <span>{project?.province || 'No province'}</span>
            <span>{project?.municipality || 'No LGU'}</span>
            <span>{project?.barangay || 'No barangay'}</span>
          </div>
        </div>

        <div className="pu-hero-status">
          <span className={`pu-badge ${getStatusClass(project?.status)}`}>
            {project?.status || 'No Status'}
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
          <span>Target</span>
          <strong>{formatPercent(targetVarianceInfo.targetPhysical)}</strong>
        </div>
        <div className="pu-summary-card pu-variance-summary">
          <span>Variance</span>
          <strong className={targetVarianceInfo.className}>
            {targetVarianceInfo.label}
          </strong>
        </div>
      </section>

      <div className="pu-content-grid">
        <form className="pu-form-card" onSubmit={handleSubmit}>
          <div className="pu-card-header">
            <div>
              <p className="pu-eyebrow">Inspection Details</p>
              <h2>Field Update</h2>
              <span className="pu-field-mode-note">
                Progress, GPS, photos, issues, recommendations, and remarks in one field workflow.
              </span>
            </div>

            <div className="pu-save-mode">
              <button
                type="button"
                className={saveMode === 'online' ? 'active' : ''}
                onClick={() => setSaveMode('online')}
                disabled={!online || saving}
              >
                Online
              </button>
              <button
                type="button"
                className={saveMode === 'offline' ? 'active' : ''}
                onClick={() => setSaveMode('offline')}
                disabled={saving}
              >
                Offline
              </button>
            </div>
          </div>

          <div className="pu-field-action-strip" aria-label="Field quick actions">
            <button
              type="button"
              className="pu-action-btn pu-action-gps"
              onClick={captureGps}
              disabled={gpsLoading || saving}
            >
              {gpsLoading ? 'Capturing GPS...' : 'Update GPS'}
              <span>Use while on site</span>
            </button>

            <label className="pu-action-btn pu-action-photo">
              Add Photo
              <span>{photoInputs.length}/{MAX_PHOTOS_PER_UPDATE} selected</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                onChange={handlePhotoSelect}
                disabled={saving || photoInputs.length >= MAX_PHOTOS_PER_UPDATE}
              />
            </label>

            <button
              type="submit"
              className="pu-action-btn pu-action-save"
              disabled={saving || (saveMode === 'online' && !online)}
            >
              {saving
                ? 'Saving...'
                : saveMode === 'online'
                  ? 'Save Online'
                  : 'Save Offline'}
              <span>{saveMode === 'online' ? 'Submit now' : 'Save for sync'}</span>
            </button>
          </div>

          <div className="pu-form-grid">
            <label className="pu-field pu-date-field">
              <span>Inspection Date</span>

              <div className="pu-long-date-field">
                <div>
                  <strong>{formatLongDate(inspectionDate)}</strong>
                  <small>Selected inspection date</small>
                </div>

                <button
                  type="button"
                  className="pu-date-change-btn"
                  onClick={openDatePicker}
                  disabled={saving}
                >
                  Change Date
                </button>
              </div>

              <input
                ref={dateInputRef}
                className="pu-hidden-date-input"
                type="date"
                value={inspectionDate}
                onChange={(event) => setInspectionDate(event.target.value)}
                required
                aria-label="Inspection date"
              />
            </label>

            <label className="pu-field">
              <span>Project Status</span>
              <select
                value={projectStatus}
                onChange={(event) => setProjectStatus(event.target.value)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="pu-field">
              <span>Physical Accomplishment (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={physicalAccomplishment}
                onChange={(event) =>
                  setPhysicalAccomplishment(event.target.value)
                }
                placeholder="Example: 75.50"
                required
              />
            </label>

            <label className="pu-field">
              <span>Target Physical (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={targetPhysicalAccomplishment}
                onChange={(event) => handleTargetPhysicalChange(event.target.value)}
                placeholder="Example: 75.50"
                required
              />
            </label>

            <label className="pu-field">
              <span>Financial Accomplishment (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={financialAccomplishment}
                onChange={(event) =>
                  setFinancialAccomplishment(event.target.value)
                }
                placeholder="Example: 68.25"
                required
              />
            </label>

            <label className="pu-field">
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

          <div className="pu-gps-card pu-gps-simple-card">
            <div>
              <p className="pu-eyebrow">GPS Capture</p>
              <h3>Inspection Location</h3>
              <p>
                Tap once while you are at the project site. The app will fill in
                the latitude and longitude below. Manual encoding is available
                only when device GPS is unavailable.
              </p>
            </div>

            <button
              type="button"
              className="pu-gps-btn"
              onClick={captureGps}
              disabled={gpsLoading || saving}
            >
              {gpsLoading ? 'Capturing GPS...' : 'Update GPS'}
            </button>
          </div>

          {gpsMessage && <div className="pu-gps-message">{gpsMessage}</div>}

          <div className="pu-form-grid">
            <label className="pu-field">
              <span>Inspection Latitude</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={inspectionLatitude}
                onChange={(event) => setInspectionLatitude(event.target.value)}
                placeholder="Example: 8.556091"
              />
            </label>

            <label className="pu-field">
              <span>Inspection Longitude</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={inspectionLongitude}
                onChange={(event) => setInspectionLongitude(event.target.value)}
                placeholder="Example: 125.028244"
              />
            </label>
          </div>

          {hasInspectionCoordinates && (
            <div className="pu-coordinate-review">
              <div>
                <strong>
                  {inspectionCoordinateStatus.isValid
                    ? inspectionCoordinateStatus.wasSwapped
                      ? 'Coordinates appear reversed but will be corrected when saved.'
                      : 'Coordinates look valid for Mindanao.'
                    : 'Coordinates need correction.'}
                </strong>
                <span>
                  {inspectionCoordinateStatus.isValid
                    ? `Latitude ${
                        inspectionCoordinateStatus.latitude?.toFixed(7) || ''
                      }, Longitude ${
                        inspectionCoordinateStatus.longitude?.toFixed(7) || ''
                      }`
                    : inspectionCoordinateStatus.reason}
                </span>
              </div>

              <button
                type="button"
                className="pu-coordinate-btn"
                onClick={swapInspectionCoordinates}
                disabled={saving}
              >
                Swap Latitude / Longitude
              </button>
            </div>
          )}

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
                <h3>Upload Inspection Photos</h3>
                <p>
                  JPG, PNG, WebP, and HEIC files can be uploaded. HEIC preview
                  may not display in Chrome, but the file can still be saved.
                </p>
              </div>

              <label className="pu-photo-picker">
                Add / Take Photos
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  onChange={handlePhotoSelect}
                  disabled={saving || photoInputs.length >= MAX_PHOTOS_PER_UPDATE}
                />
              </label>
            </div>

            {photoInputs.length === 0 ? (
              <div className="pu-photo-empty">
                No photos selected yet. Add field photos before saving if photo
                documentation is required.
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

          <div className="pu-submit-bar">
            <button
              type="submit"
              className="pu-primary-btn"
              disabled={saving || (saveMode === 'online' && !online)}
            >
              {saving
                ? 'Saving...'
                : saveMode === 'online'
                  ? 'Save Online'
                  : 'Save Offline'}
            </button>

            <Link className="pu-secondary-btn" to={`/projects/${id}`}>
              Cancel
            </Link>
          </div>
        </form>

        <aside className="pu-side-panel">
          <div className="pu-side-card">
            <p className="pu-eyebrow">Field Reminder</p>
            <h3>Before Saving</h3>

            <ul className="pu-checklist">
              <li>Verify actual physical progress on site.</li>
              <li>Capture GPS while physically at the project location.</li>
              <li>Attach clear photos of progress, issues, and corrections.</li>
              <li>Encode findings and recommendations clearly.</li>
              <li>Use Offline Save if signal is unstable during inspection.</li>
            </ul>
          </div>

          <div className="pu-side-card">
            <div className="pu-card-header compact">
              <div>
                <p className="pu-eyebrow">Recent Updates</p>
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
                      {update.sync_status === 'pending' && (
                        <span className="pu-pending-pill">Pending Sync</span>
                      )}
                    </div>

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
                          Variance:{' '}
                          <strong className={updateVariance.className}>
                            {updateVariance.label}
                          </strong>
                        </p>
                      )
                    })()}
                    <p>
                      Financial:{' '}
                      {formatPercent(update.financial_accomplishment)}
                    </p>
                    <p>
                      GPS:{' '}
                      {hasCoordinateValue(update.inspection_latitude) &&
                      hasCoordinateValue(update.inspection_longitude)
                        ? `${formatCoordinate(
                            update.inspection_latitude
                          )}, ${formatCoordinate(update.inspection_longitude)}`
                        : 'No GPS recorded'}
                    </p>

                    <span className={`pu-badge ${getRiskClass(update.risk_level)}`}>
                      {update.risk_level || 'No Risk'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

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
