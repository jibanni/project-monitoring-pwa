import { useEffect, useMemo, useRef, useState } from'react'
import { createPortal } from'react-dom'
import type { ChangeEvent, FormEvent, KeyboardEvent } from'react'
import { Link, useLocation, useNavigate, useParams } from'react-router-dom'
import { supabase } from'../lib/supabase'
import { updateSharedProjectCache } from'../lib/projectDataCache'
import { aideMemoireDocumentToBlob, aideMemoirePhotoAssetToBlob, getAideMemoirePhotoAssets, getLatestAideMemoireDocument, offlineDb, saveAideMemoireDocument, saveAideMemoireRecord, type AideMemoireAttendance, type AideMemoireFinding, type AideMemoirePhoto, type OfflineAideMemoire, type OfflineAideMemoireDocument } from'../lib/offlineDb'
import { useAuth } from'../context/AuthContext'
import {
  formatProgressInput,
  getContractExpirationInfo,
  getProjectReasonLabel,
  getStatusFromContractModification,
  getTargetPhysicalInfo,
  requiresProjectReason,
} from'../utils/projectVariance'
import { getPmsRiskLevel } from'../utils/projectStatus'
import { canUpdateProject, getCanonicalRole } from'../utils/aorAccess'
import { getDilgOfficeDirectoryEntry, normalizeDilgOfficeLocation } from'../data/dilgOfficeDirectory'
import { getDrivePhotoUrl, uploadProjectPhotoToDrive } from'../services/googleDrivePhotoUploadService'
import { compressInspectionImage } from'../utils/imageCompression'
import ActionMenu from'../components/ActionMenu'
import AideMemoireGenerationDialog from'../components/AideMemoireGenerationDialog'
import'../styles/projectUpdates.css'
import'../styles/projectUpdatesModalFix.css'
import'../styles/projectUpdateSubpage.css'

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
  project_code?: string | null
  subaybayan_project_code?: string | null
  lgu_reference_code?: string | null
  reference_code?: string | null
  lgu_equity?: number | string | null
  mode_of_implementation?: string | null
  contractor_office_address?: string | null
  contractor_address?: string | null
  contract_perfection_date?: string | null
  date_of_perfection_of_contract?: string | null
  ntp_receipt_date?: string | null
  date_of_receipt_of_ntp?: string | null
  contract_amount?: number | string | null
  contract_duration?: number | string | null
  revised_contract_duration?: number | string | null
  disbursement_amount?: number | string | null
}

type ProjectUpdateRouteState = {
  project?: ProjectRecord | null
}


function isIosLikeDevice() {
  if (typeof navigator === 'undefined') return false

  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''

  return /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function openPdfOutsideCurrentApp(documentRecord: OfflineAideMemoireDocument) {
  const objectUrl = URL.createObjectURL(aideMemoireDocumentToBlob(documentRecord))
  const link = document.createElement('a')

  link.href = objectUrl
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.setAttribute('aria-hidden', 'true')
  link.style.position = 'fixed'
  link.style.left = '-9999px'

  document.body.appendChild(link)
  link.click()
  link.remove()

  // Keep the object URL alive long enough for iOS Quick Look/Safari to finish
  // claiming the file. Revoking immediately can leave a blank or frozen view.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000)
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
  latitude?: number | null
  longitude?: number | null
  capturedAt?: string
  findingId?: string
  photoKind?: 'finding' | 'additional'
}

type PhotoCaptureMetadata = {
  latitude: number | null
  longitude: number | null
  capturedAt: string
  gpsMessage: string
}

type SaveMode ='online' |'offline'
type UpdateType = 'site' | 'office'

type SaveSuccessDialog = {
  title: string
  message: string
  mode: SaveMode
  updateRef: string
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

const RECENT_UPDATE_LIMIT = 4

const statusOptions = ['Ongoing', 'Completed', 'Suspended', 'Terminated']

const WIZARD_STEPS = [
  { number: 1, title: 'Inspection Details', shortTitle: 'Inspection' },
  { number: 2, title: 'Progress and Financial', shortTitle: 'Progress' },
  { number: 3, title: 'Project Status', shortTitle: 'Status' },
  { number: 4, title: 'Contract Monitoring', shortTitle: 'Contract' },
  { number: 5, title: 'Photo Findings and Recommendations', shortTitle: 'Findings' },
  { number: 6, title: 'General Observations', shortTitle: 'Observations' },
  { number: 7, title: 'Attendance', shortTitle: 'Attendance' },
  { number: 8, title: 'Additional Photos and Final Review', shortTitle: 'Review' },
] as const

const OFFICE_WIZARD_STEP_NUMBERS = new Set([1, 2, 3, 4, 8])

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

function cleanText(value?: string | null) {
  const trimmed = (value ?? '').trim()
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

function getPhotoCoordinatePair(latitude: unknown, longitude: unknown) {
  const normalized = normalizeCoordinatePair(latitude, longitude)
  if (!normalized.isValid || normalized.latitude === null || normalized.longitude === null) {
    return null
  }
  return {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
  }
}

function getRiskClass(risk?: string | null) {
  const normalized = String(risk ||'').toLowerCase()

  if (normalized.includes('high')) return'pu-risk-high'
  if (normalized.includes('moderate') || normalized.includes('medium')) return'pu-risk-moderate'
  if (normalized.includes('low')) return'pu-risk-low'

  return'pu-risk-none'
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

function requestGeolocation(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function isRecentGpsPosition(position: GeolocationPosition | null, maxAgeMs = 120_000) {
  return Boolean(position && Date.now() - Number(position.timestamp || 0) <= maxAgeMs)
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
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


function createAideRowId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createBlankAideFinding(): AideMemoireFinding {
  return {
    id: createAideRowId('finding'),
    finding: '',
    recommendation: '',
    timeline: '',
    remarks: '',
    photo_refs: [],
  }
}

function createBlankAideAttendee(): AideMemoireAttendance {
  return {
    id: createAideRowId('attendee'),
    name: '',
    designation_agency: '',
  }
}

function normalizeUpdateStatus(value: unknown, physical: unknown) {
  if (clampProgress(physical) >= 100) return 'Completed'

  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'suspended') return 'Suspended'
  if (normalized === 'terminated') return 'Terminated'
  return 'Ongoing'
}

function getProjectCodeValue(projectRecord?: ProjectRecord | null) {
  return String(
    projectRecord?.project_code ||
      projectRecord?.subaybayan_project_code ||
      projectRecord?.lgu_reference_code ||
      projectRecord?.reference_code ||
      '',
  ).trim()
}

function getProjectFundingYearValue(projectRecord?: ProjectRecord | null) {
  return String(
    projectRecord?.funding_year ||
      projectRecord?.fiscal_year ||
      projectRecord?.year ||
      '',
  ).replace(/^FY\s*/i, '').trim()
}

function getExactProjectLocation(projectRecord?: ProjectRecord | null) {
  return [projectRecord?.barangay, projectRecord?.municipality, projectRecord?.province]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')
}

function calculateDateDifference(startValue?: string | null, endValue?: string | null) {
  if (!startValue || !endValue) return ''
  const start = new Date(`${String(startValue).slice(0, 10)}T00:00:00Z`).getTime()
  const end = new Date(`${String(endValue).slice(0, 10)}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return ''
  return String(Math.floor((end - start) / 86400000))
}

function getAideOfficeLocation(projectRecord: ProjectRecord | null, authContext: any) {
  const role = getCanonicalRole(authContext?.profile?.role)
  if (authContext?.isAdmin || authContext?.isROEngineer || role === 'RO Engineer') {
    return 'REGIONAL OFFICE 10'
  }

  const assignedProvince = normalizeDilgOfficeLocation(authContext?.profile?.province)
  if (assignedProvince) return assignedProvince
  return normalizeDilgOfficeLocation(projectRecord?.province)
}

function hasAideFindingContent(row: AideMemoireFinding) {
  return Boolean(
    String(row.finding || '').trim() ||
      String(row.recommendation || '').trim() ||
      String(row.timeline || '').trim() ||
      String(row.remarks || '').trim() ||
      (row.photo_refs || []).length > 0,
  )
}

function formatPhotoCoordinateRemarks(row: AideMemoireFinding, photos: PhotoInput[]) {
  const linkedPhotos = photos.filter((photo) => (row.photo_refs || []).includes(photo.id))
  const coordinateLines = linkedPhotos.map((photo, index) => {
    const coordinates = getPhotoCoordinatePair(photo.latitude, photo.longitude)
    if (!coordinates) return `Photo ${index + 1}: GPS not available`
    return `Photo ${index + 1} GPS: ${coordinates.latitude.toFixed(7)}, ${coordinates.longitude.toFixed(7)}`
  })

  return [String(row.remarks || '').trim(), ...coordinateLines].filter(Boolean).join('\n')
}

function hasAideAttendeeContent(row: AideMemoireAttendance) {
  return Boolean(String(row.name || '').trim() || String(row.designation_agency || '').trim())
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18 9 12l6-6" fill="none" />
    </svg>
  )
}

function IconDraft() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h11l3 3v13H5V4Z" fill="none" />
      <path d="M8 4v6h8V4" fill="none" />
      <path d="M8 20v-6h8v6" fill="none" />
    </svg>
  )
}

function IconGallery() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5.5 17 4.2-4.1 3.1 2.8 2.2-2.1 3.5 3.4" />
    </svg>
  )
}

function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8l4 4v14H6V3Z" fill="none" />
      <path d="M14 3v5h5" fill="none" />
      <path d="M8 16h8M8 12h8" fill="none" />
    </svg>
  )
}

function SavingDots() {
  return (
    <span className="pms10-save-dots" aria-hidden="true">
      <i className="pms10-save-dot" />
      <i className="pms10-save-dot" />
      <i className="pms10-save-dot" />
    </span>
  )
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

function getHeroTitleSizeClass(value?: string | null) {
  const length = String(value ?? '').trim().length

  if (length <= 24) return 'pu-title-short'
  if (length <= 42) return 'pu-title-medium'
  if (length <= 68) return 'pu-title-long'
  return 'pu-title-extra-long'
}

export default function ProjectUpdates() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth() as any
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const revisedContractExpirationDateInputRef = useRef<HTMLInputElement | null>(null)
  const photoInputsRef = useRef<PhotoInput[]>([])
  const wizardTopRef = useRef<HTMLDivElement | null>(null)
  const wizardProgressRef = useRef<HTMLDivElement | null>(null)
  const wizardStepButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const findingInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const attendeeInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const restoredDraftIdRef = useRef<string | null>(null)
  const autoSaveTimerRef = useRef<number | null>(null)
  const draftSavePromiseRef = useRef<Promise<OfflineAideMemoire> | null>(null)
  const lastGpsPositionRef = useRef<GeolocationPosition | null>(null)
  const lastAutoSaveFingerprintRef = useRef('')
  const autoSaveSuspendedRef = useRef(false)

  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [recentUpdates, setRecentUpdates] = useState<ProjectUpdateRecord[]>([])
  const [recentUpdateIndex, setRecentUpdateIndex] = useState(0)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [projectMissingOffline, setProjectMissingOffline] = useState(false)
  const [saving, setSaving] = useState(false)
  const [online, setOnline] = useState(
    typeof navigator !=='undefined' ? navigator.onLine : true
  )
  const [, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [inspectionDate, setInspectionDate] = useState(todayInputValue())
  const [projectStatus, setProjectStatus] = useState('Ongoing')
  const [physicalAccomplishment, setPhysicalAccomplishment] = useState('')
  const [targetPhysicalAccomplishment, setTargetPhysicalAccomplishment] = useState('')
  const targetPhysicalSource ='manual' as const
  const [financialAccomplishment, setFinancialAccomplishment] = useState('')
  const [disbursementAmount, setDisbursementAmount] = useState('')
  const [hasNewDisbursement, setHasNewDisbursement] = useState(false)
  const [contractAmount, setContractAmount] = useState('')
  const [notYetStartedReason, setNotYetStartedReason] = useState('')
  const [hasContractModification, setHasContractModification] = useState(false)
  const [contractModificationType, setContractModificationType] = useState('')
  const [hasRevisedProjectCost, setHasRevisedProjectCost] = useState(false)
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
  const [aideGenerationRequest, setAideGenerationRequest] = useState<{ updateRef: string; source: 'online' | 'offline' } | null>(null)
  const [noticeDialog, setNoticeDialog] = useState<NoticeDialog>(null)
  const [aideFindings, setAideFindings] = useState<AideMemoireFinding[]>([createBlankAideFinding()])
  const [noFindingsObserved, setNoFindingsObserved] = useState(false)
  const [noAttendees, setNoAttendees] = useState(false)
  const [updateType, setUpdateType] = useState<UpdateType>('site')
  const [aideAttendance, setAideAttendance] = useState<AideMemoireAttendance[]>([createBlankAideAttendee()])
  const [generalObservations, setGeneralObservations] = useState('')
  const [modeOfImplementation, setModeOfImplementation] = useState('BY CONTRACT')
  const [workingAideDraft, setWorkingAideDraft] = useState<OfflineAideMemoire | null>(null)
  const [workingDraftLoaded, setWorkingDraftLoaded] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [latestPdfRecord, setLatestPdfRecord] = useState<OfflineAideMemoireDocument | null>(null)
  const [wizardStep, setWizardStep] = useState(1)
  const [maxReachedStep, setMaxReachedStep] = useState(1)
  const [wizardError, setWizardError] = useState('')

  const isOfficeUpdate = updateType === 'office'
  const visibleWizardSteps = useMemo(
    () => isOfficeUpdate
      ? WIZARD_STEPS.filter((step) => OFFICE_WIZARD_STEP_NUMBERS.has(step.number))
      : [...WIZARD_STEPS],
    [isOfficeUpdate],
  )
  const currentVisibleStepIndex = Math.max(
    0,
    visibleWizardSteps.findIndex((step) => step.number === wizardStep),
  )
  const currentVisibleStepNumber = currentVisibleStepIndex + 1
  const isFinalWizardStep = currentVisibleStepIndex >= visibleWizardSteps.length - 1
  const nextVisibleWizardStep = visibleWizardSteps[currentVisibleStepIndex + 1] || null

  const routeProject = useMemo(() => {
    const state = location.state as ProjectUpdateRouteState | null
    const candidate = state?.project

    if (!candidate?.id || !id) return null

    return String(candidate.id) === String(id) ? candidate : null
  }, [location.state, id])


  const draftOwnerKey = String(auth?.user?.id || auth?.profile?.id || 'local-user').replace(/[^a-zA-Z0-9_-]/g, '-')
  const workingUpdateRef = id ? `working-${id}-${draftOwnerKey}` : ''
  const workingDraftId = id && workingUpdateRef ? `aide-${id}-offline-${workingUpdateRef}` : ''

  const workingDraftFingerprint = useMemo(
    () =>
      JSON.stringify({
        inspectionDate,
        projectStatus,
        physicalAccomplishment,
        targetPhysicalAccomplishment,
        financialAccomplishment,
        disbursementAmount,
        hasNewDisbursement,
        contractAmount,
        notYetStartedReason,
        hasContractModification,
        contractModificationType,
        hasRevisedProjectCost,
        revisedProjectCost,
        revisedContractExpirationDate,
        inspectionLatitude,
        inspectionLongitude,
        aideFindings,
        noFindingsObserved,
        noAttendees,
        updateType,
        aideAttendance,
        generalObservations,
        modeOfImplementation,
        wizardStep,
        maxReachedStep,
        photos: photoInputs.map((photo) => ({
          id: photo.id,
          name: photo.file.name,
          size: photo.file.size,
          lastModified: photo.file.lastModified,
          caption: photo.caption,
          latitude: photo.latitude ?? null,
          longitude: photo.longitude ?? null,
          capturedAt: photo.capturedAt || '',
          findingId: photo.findingId || '',
          photoKind: photo.photoKind || 'additional',
        })),
      }),
    [
      inspectionDate,
      projectStatus,
      physicalAccomplishment,
      targetPhysicalAccomplishment,
      financialAccomplishment,
      disbursementAmount,
      hasNewDisbursement,
      contractAmount,
      notYetStartedReason,
      hasContractModification,
      contractModificationType,
      hasRevisedProjectCost,
      revisedProjectCost,
      revisedContractExpirationDate,
      inspectionLatitude,
      inspectionLongitude,
      aideFindings,
      noFindingsObserved,
      noAttendees,
      updateType,
      aideAttendance,
      generalObservations,
      modeOfImplementation,
      wizardStep,
      maxReachedStep,
      photoInputs,
    ],
  )

  const hasMeaningfulWorkingUpdate = useMemo(() => {
    if (!project) return false

    const defaultStatus = normalizeUpdateStatus(project.status, project.physical_accomplishment)
    const defaultContractAmount = String(project.contract_amount ?? project.budget ?? '')
    const defaultMode = String(project.mode_of_implementation || 'BY CONTRACT').trim().toUpperCase()

    return Boolean(
      wizardStep > 1 ||
        maxReachedStep > 1 ||
        inspectionDate !== todayInputValue() ||
        projectStatus !== defaultStatus ||
        physicalAccomplishment !== String(project.physical_accomplishment ?? '') ||
        targetPhysicalAccomplishment ||
        financialAccomplishment !== String(project.financial_accomplishment ?? '') ||
        hasNewDisbursement ||
        disbursementAmount !== String(project.disbursement_amount ?? '') ||
        (contractAmount && contractAmount !== defaultContractAmount) ||
        notYetStartedReason ||
        hasContractModification ||
        contractModificationType ||
        hasRevisedProjectCost ||
        revisedProjectCost ||
        revisedContractExpirationDate ||
        inspectionLatitude ||
        inspectionLongitude ||
        aideFindings.some(hasAideFindingContent) ||
        noFindingsObserved ||
        noAttendees ||
        updateType !== 'site' ||
        aideAttendance.some(hasAideAttendeeContent) ||
        generalObservations ||
        photoInputs.length > 0 ||
        modeOfImplementation !== defaultMode
    )
  }, [
    project,
    wizardStep,
    maxReachedStep,
    inspectionDate,
    projectStatus,
    physicalAccomplishment,
    targetPhysicalAccomplishment,
    financialAccomplishment,
    disbursementAmount,
    hasNewDisbursement,
    contractAmount,
    notYetStartedReason,
    hasContractModification,
    contractModificationType,
    hasRevisedProjectCost,
    revisedProjectCost,
    revisedContractExpirationDate,
    inspectionLatitude,
    inspectionLongitude,
    aideFindings,
    noFindingsObserved,
    noAttendees,
    updateType,
    aideAttendance,
    generalObservations,
    photoInputs.length,
    modeOfImplementation,
  ])

  const effectiveContractAmount = useMemo(
    () => toNumber(contractAmount || project?.contract_amount || project?.budget),
    [contractAmount, project?.contract_amount, project?.budget],
  )

  const effectiveDisbursementAmount = useMemo(
    () => toNumber(disbursementAmount || project?.disbursement_amount),
    [disbursementAmount, project?.disbursement_amount],
  )

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

  useEffect(() => {
    setRecentUpdateIndex((current) =>
      Math.min(current, Math.max(0, recentUpdates.length - 1)),
    )
  }, [recentUpdates.length])

  useEffect(() => {
    setRecentUpdateIndex(0)
  }, [id])

  useEffect(() => {
    if (!project || workingAideDraft) return
    const storedMode = String(project.mode_of_implementation || '').trim().toUpperCase()
    if (storedMode === 'BY ADMINISTRATION' || storedMode === 'OTHER' || storedMode === 'BY CONTRACT') {
      setModeOfImplementation(storedMode)
    } else {
      setModeOfImplementation('BY CONTRACT')
    }

    setContractAmount(String(project.contract_amount ?? project.budget ?? ''))
    setDisbursementAmount(String(project.disbursement_amount ?? ''))
    setHasNewDisbursement(false)
  }, [project?.id, project?.mode_of_implementation, project?.contract_amount, project?.budget, project?.disbursement_amount, workingAideDraft?.id])

  useEffect(() => {
    centerWizardStep(wizardStep)
  }, [wizardStep])

  useEffect(() => {
    const completedRows = aideFindings.filter(hasAideFindingContent)
    setIssues(completedRows.map((row) => row.finding.trim()).filter(Boolean).join('\n\n'))
    setRecommendations(completedRows.map((row) => row.recommendation.trim()).filter(Boolean).join('\n\n'))

    const structuredRemarks = completedRows
      .map((row, index) => {
        const parts = [
          row.timeline.trim() ? `Timeline ${index + 1}: ${row.timeline.trim()}` : '',
          formatPhotoCoordinateRemarks(row, photoInputs)
            ? `Remarks ${index + 1}: ${formatPhotoCoordinateRemarks(row, photoInputs)}`
            : '',
        ].filter(Boolean)
        return parts.join('\n')
      })
      .filter(Boolean)
      .join('\n\n')

    setRemarks([generalObservations.trim(), structuredRemarks].filter(Boolean).join('\n\n'))
  }, [aideFindings, generalObservations, photoInputs])

  useEffect(() => {
    if (!requiresUpdateReason && notYetStartedReason) {
      setNotYetStartedReason('')
    }
  }, [requiresUpdateReason, notYetStartedReason])

  useEffect(() => {
    if (!hasContractModification) {
      setContractModificationType('')
      setHasRevisedProjectCost(false)
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
        revised_project_cost: hasRevisedProjectCost ? revisedProjectCost : null,
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
    hasRevisedProjectCost,
    revisedProjectCost,
    revisedContractExpirationDate,
  ])

  const contractInfo = useMemo(() => {
    return getContractExpirationInfo({
      contract_expiration_date: project?.contract_expiration_date,
      has_contract_modification: hasContractModification,
      contract_modification_type: activeModificationType,
      revised_project_cost: hasRevisedProjectCost ? revisedProjectCost : null,
      revised_contract_expiration_date: revisedContractExpirationDate,
    })
  }, [
    project?.contract_expiration_date,
    hasContractModification,
    activeModificationType,
    hasRevisedProjectCost,
    revisedProjectCost,
    revisedContractExpirationDate,
  ])

  const autoRiskLevel = useMemo(
    () => getPmsRiskLevel({
      ...(project || {}),
      status: projectStatus,
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
      revised_project_cost: hasRevisedProjectCost ? revisedProjectCost : null,
      revised_contract_expiration_date: revisedContractExpirationDate,
    }),
    [
      project,
      projectStatus,
      physicalAccomplishment,
      targetPhysicalAccomplishment,
      inspectionDate,
      hasContractModification,
      activeModificationType,
      hasRevisedProjectCost,
      revisedProjectCost,
      revisedContractExpirationDate,
    ],
  )

  const normalizedHeroRisk = normalizeText(autoRiskLevel)
  const heroRiskLabel =
    !normalizedHeroRisk ||
    normalizedHeroRisk ==='none' ||
    normalizedHeroRisk ==='no risk'
      ?'No Risk'
      : autoRiskLevel
  const heroRiskTone = normalizedHeroRisk.includes('high')
    ? 'high'
    : normalizedHeroRisk.includes('moderate') || normalizedHeroRisk.includes('medium')
      ? 'moderate'
      : normalizedHeroRisk.includes('low')
        ? 'low'
        : 'none'
  const heroVarianceTone = targetVarianceInfo.className === 'behind'
    ? 'negative'
    : targetVarianceInfo.className === 'ahead'
      ? 'positive'
      : 'neutral'

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
    setWorkingDraftLoaded(false)
    void refreshWorkingAideDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingDraftId])


  useEffect(() => {
    void refreshLatestProjectOutputs()

    function handleRefreshLatestOutputs() {
      if (document.visibilityState === 'visible') void refreshLatestProjectOutputs()
    }

    window.addEventListener('focus', handleRefreshLatestOutputs)
    document.addEventListener('visibilitychange', handleRefreshLatestOutputs)

    return () => {
      window.removeEventListener('focus', handleRefreshLatestOutputs)
      document.removeEventListener('visibilitychange', handleRefreshLatestOutputs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])


  useEffect(() => {
    if (!workingAideDraft || !project) return
    if (restoredDraftIdRef.current === workingAideDraft.id) return

    restoredDraftIdRef.current = workingAideDraft.id
    void restoreWorkingAideDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingAideDraft?.id, project?.id])

  useEffect(() => {
    if (
      !workingDraftLoaded ||
      loading ||
      !project ||
      !workingDraftId ||
      saving ||
      autoSaveSuspendedRef.current ||
      !hasMeaningfulWorkingUpdate ||
      lastAutoSaveFingerprintRef.current === workingDraftFingerprint
    ) {
      return
    }

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null
      void saveLatestUpdateDraft({ silent: true }).catch((error) => {
        console.error('Automatic Project Update draft save failed.', error)
      })
    }, 650)

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workingDraftLoaded,
    loading,
    project?.id,
    workingDraftId,
    saving,
    hasMeaningfulWorkingUpdate,
    workingDraftFingerprint,
  ])

  useEffect(() => {
    function flushWorkingDraft() {
      if (
        !workingDraftLoaded ||
        !project ||
        !workingDraftId ||
        autoSaveSuspendedRef.current ||
        !hasMeaningfulWorkingUpdate
      ) {
        return
      }

      void saveLatestUpdateDraft({ silent: true }).catch((error) => {
        console.error('Unable to preserve the Project Update before leaving the page.', error)
      })
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushWorkingDraft()
    }

    window.addEventListener('pagehide', flushWorkingDraft)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', flushWorkingDraft)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workingDraftLoaded,
    project?.id,
    workingDraftId,
    hasMeaningfulWorkingUpdate,
    workingDraftFingerprint,
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
      setHasRevisedProjectCost(false)
      setRevisedProjectCost('')
      setRevisedContractExpirationDate('')
      setNotYetStartedReason('')
      return
    }

    const hasModification =
      projectRecord.has_contract_modification === true ||
      String(projectRecord.has_contract_modification ||'').toLowerCase() ==='yes' ||
      String(projectRecord.has_contract_modification ||'').toLowerCase() ==='true'

    const hasStoredRevisedCost =
      projectRecord.revised_project_cost !== null &&
      projectRecord.revised_project_cost !== undefined &&
      String(projectRecord.revised_project_cost).trim() !== ''

    setHasContractModification(hasModification)
    setContractModificationType(projectRecord.contract_modification_type ||'')
    setHasRevisedProjectCost(hasStoredRevisedCost)
    setRevisedProjectCost(hasStoredRevisedCost ? String(projectRecord.revised_project_cost) : '')
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

  function handleUpdateTypeChange(nextType: UpdateType) {
    setUpdateType(nextType)
    setWizardStep(1)
    setMaxReachedStep(1)
    setWizardError('')

    if (nextType === 'office') {
      setNoFindingsObserved(true)
      setNoAttendees(true)
      setAideFindings([createBlankAideFinding()])
      setAideAttendance([createBlankAideAttendee()])
      setGeneralObservations('')
      setInspectionLatitude('')
      setInspectionLongitude('')
      setGpsMessage('')
      return
    }

    setNoFindingsObserved(false)
    setNoAttendees(false)
  }

  function handleDisbursementModeChange(hasNewValue: boolean) {
    setHasNewDisbursement(hasNewValue)

    if (!hasNewValue) {
      setDisbursementAmount(String(project?.disbursement_amount ?? ''))
      setFinancialAccomplishment(
        formatProgressInput(project?.financial_accomplishment ?? financialAccomplishment ?? 0),
      )
    }
  }


  function applyDisbursementComputation(rawValue = disbursementAmount) {
    try {
      if (effectiveContractAmount <= 0) {
        setErrorMessage('Contract Amount is required before computing financial accomplishment from disbursement.')
        return
      }

      const amount = evaluateAmountExpression(rawValue)
      const percentage = Math.min(100, Math.max(0, (amount / effectiveContractAmount) * 100))

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
    const lines = [`Update Type: ${isOfficeUpdate ? 'Office Update' : 'Site Update'}`]

    if (requiresUpdateReason && notYetStartedReason) {
      lines.push(`${projectReasonLabel}: ${notYetStartedReason}`)
    }

    if (remarksValue) lines.push(remarksValue)

    return lines.join('\n\n')
  }



  async function refreshWorkingAideDraft() {
    if (!workingDraftId) {
      setWorkingDraftLoaded(true)
      return
    }

    try {
      const draft = await offlineDb.aide_memoires.get(workingDraftId)
      setWorkingAideDraft(draft || null)
      lastAutoSaveFingerprintRef.current = draft ? JSON.stringify(draft.update_snapshot || {}) : ''
    } catch (error) {
      console.error('Unable to load the latest Project Update draft.', error)
    } finally {
      setWorkingDraftLoaded(true)
    }
  }

  async function restoreWorkingAideDraft(draftOverride?: OfflineAideMemoire) {
    const draft = draftOverride || workingAideDraft
    if (!draft) return 1

    const snapshot = (draft.update_snapshot || {}) as Record<string, any>
    setInspectionDate(String(snapshot.inspection_date || draft.inspection_date || todayInputValue()).slice(0, 10))
    setProjectStatus(normalizeUpdateStatus(snapshot.status, snapshot.physical_accomplishment))
    setPhysicalAccomplishment(String(snapshot.physical_accomplishment ?? draft.actual_to_date ?? ''))
    setTargetPhysicalAccomplishment(String(snapshot.target_physical_accomplishment ?? draft.target_to_date ?? ''))
    setFinancialAccomplishment(String(snapshot.financial_accomplishment ?? draft.financial_accomplishment ?? ''))
    setDisbursementAmount(String(snapshot.disbursement_amount ?? draft.total_disbursement ?? project?.disbursement_amount ?? ''))
    setHasNewDisbursement(Boolean(snapshot.has_new_disbursement))
    setContractAmount(String(snapshot.contract_amount ?? draft.contract_amount ?? project?.contract_amount ?? project?.budget ?? ''))
    setHasContractModification(Boolean(snapshot.has_contract_modification))
    setContractModificationType(String(snapshot.contract_modification_type || ''))
    const restoredRevisedCost = String(snapshot.revised_project_cost ?? '').trim()
    setHasRevisedProjectCost(
      snapshot.has_revised_project_cost === true || restoredRevisedCost !== '',
    )
    setRevisedProjectCost(restoredRevisedCost)
    setRevisedContractExpirationDate(String(snapshot.revised_contract_expiration_date || draft.revised_expiration_date || '').slice(0, 10))
    setInspectionLatitude(String(snapshot.inspection_latitude ?? ''))
    setInspectionLongitude(String(snapshot.inspection_longitude ?? ''))
    setAideFindings(draft.findings?.length ? draft.findings.map((row) => ({ ...row })) : [createBlankAideFinding()])
    setNoFindingsObserved(Boolean(snapshot.no_findings_observed))
    setNoAttendees(Boolean(snapshot.no_attendees))
    setUpdateType(snapshot.update_type === 'office' ? 'office' : 'site')
    setAideAttendance(draft.attendance?.length ? draft.attendance.map((row) => ({ ...row })) : [createBlankAideAttendee()])
    setGeneralObservations(draft.general_observations || '')
    setModeOfImplementation(
      String(snapshot.mode_of_implementation || draft.mode_of_implementation || project?.mode_of_implementation || 'BY CONTRACT'),
    )
    const restoredWizardStep = Math.min(8, Math.max(1, Number(snapshot.wizard_step || 1)))
    const restoredMaxStep = Math.min(8, Math.max(restoredWizardStep, Number(snapshot.max_reached_step || restoredWizardStep)))
    setWizardStep(restoredWizardStep)
    setMaxReachedStep(restoredMaxStep)

    photoInputsRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    const assets = await getAideMemoirePhotoAssets(draft.id)
    const assetMap = new Map(assets.map((asset) => [asset.photo_ref, asset]))
    const restoredPhotos = (draft.photos || []).flatMap<PhotoInput>((photo) => {
      const asset = assetMap.get(photo.photo_ref)
      const blob = asset ? aideMemoirePhotoAssetToBlob(asset) : photo.file_blob
      if (!blob) return []

      const file = new File([blob], photo.file_name || `aide-photo-${photo.photo_number}.jpg`, {
        type: photo.file_type || blob.type || 'image/jpeg',
      })

      return [
        {
          id: photo.id || createAideRowId('photo'),
          file,
          previewUrl: URL.createObjectURL(file),
          caption: photo.caption || '',
          originalSize: file.size,
          compressedSize: file.size,
          compressed: true,
          latitude: photo.latitude ?? null,
          longitude: photo.longitude ?? null,
          capturedAt: photo.captured_at || '',
          findingId: photo.finding_id || '',
          photoKind: photo.photo_kind || (photo.finding_id ? 'finding' : 'additional'),
        },
      ]
    })
    setPhotoInputs(restoredPhotos)
    return restoredWizardStep
  }

  function getInspectionPhotoCaption(photo: PhotoInput, index: number) {
    if (photo.photoKind !== 'finding') return cleanText(photo.caption)

    const linkedFinding = aideFindings.find((row) => (row.photo_refs || []).includes(photo.id))
    return cleanText(photo.caption) || cleanText(linkedFinding?.finding) || `Finding photo ${index + 1}`
  }

  function buildAideMemoireRecord(
    updateRef: string,
    updateSource: 'online' | 'offline',
    recordStatus: 'draft' | 'final',
  ): OfflineAideMemoire {
    if (!id || !project) throw new Error('Project information is not available.')

    const now = new Date().toISOString()
    const officeLocation = getAideOfficeLocation(project, auth)
    const office = getDilgOfficeDirectoryEntry(officeLocation)
    const parsedCost = effectiveContractAmount
    const parsedDisbursement = effectiveDisbursementAmount
    const photos: AideMemoirePhoto[] = photoInputs.map((photo, index) => ({
      id: photo.id,
      photo_ref: photo.id,
      photo_number: index + 1,
      caption: getInspectionPhotoCaption(photo, index) ?? '',
      file_name: photo.file.name,
      file_type: photo.file.type,
      file_blob: photo.file,
      latitude: photo.latitude ?? null,
      longitude: photo.longitude ?? null,
      captured_at: photo.capturedAt || '',
      finding_id: photo.findingId || '',
      photo_kind: photo.photoKind || 'additional',
    }))

    return {
      id: `aide-${id}-${updateSource}-${updateRef}`,
      project_id: id,
      update_ref: updateRef,
      update_source: updateSource,
      created_by: auth?.user?.id || auth?.profile?.id || null,
      province_huc: office.location || officeLocation || String(project.province || ''),
      office_name: office.officeName || '',
      office_address: office.address || '',
      inspection_date: inspectionDate,
      project_title: String(project.project_name || ''),
      program: getDriveFundingSource(project),
      project_code: getProjectCodeValue(project),
      funding_year: getProjectFundingYearValue(project),
      national_subsidy: project.budget === null || project.budget === undefined ? '' : String(project.budget),
      lgu_equity: project.lgu_equity === null || project.lgu_equity === undefined ? '' : String(project.lgu_equity),
      project_type: String(project.project_type || ''),
      exact_location: getExactProjectLocation(project),
      implementing_unit: String(project.implementing_office || project.municipality || ''),
      mode_of_implementation: modeOfImplementation || 'BY CONTRACT',
      contractor_name: String(project.contractor || ''),
      contractor_office_address: String(project.contractor_office_address || project.contractor_address || ''),
      contract_perfection_date: String(project.contract_perfection_date || project.date_of_perfection_of_contract || '').slice(0, 10),
      ntp_receipt_date: String(project.ntp_receipt_date || project.date_of_receipt_of_ntp || project.start_date || '').slice(0, 10),
      contract_amount: contractAmount || String(project.contract_amount ?? project.budget ?? ''),
      contract_duration: String(project.contract_duration || calculateDateDifference(project.ntp_receipt_date || project.date_of_receipt_of_ntp || project.start_date, project.contract_expiration_date) || ''),
      revised_contract_duration: String(project.revised_contract_duration || calculateDateDifference(project.ntp_receipt_date || project.date_of_receipt_of_ntp || project.start_date, revisedContractExpirationDate) || ''),
      original_expiration_date: String(project.contract_expiration_date || '').slice(0, 10),
      revised_expiration_date: revisedContractExpirationDate || String(project.revised_contract_expiration_date || '').slice(0, 10),
      target_to_date: targetPhysicalAccomplishment,
      actual_to_date: physicalAccomplishment,
      physical_variance: String(Number((toNumber(physicalAccomplishment) - toNumber(targetPhysicalAccomplishment)).toFixed(2))),
      balance: parsedCost > 0 ? String(Math.max(0, parsedCost - parsedDisbursement)) : '',
      total_disbursement: String(effectiveDisbursementAmount),
      financial_accomplishment: financialAccomplishment,
      findings: isOfficeUpdate
        ? []
        : aideFindings.filter(hasAideFindingContent).map((row) => ({
            ...row,
            photo_refs: [...(row.photo_refs || [])],
          })),
      general_observations: isOfficeUpdate ? '' : generalObservations,
      attendance: isOfficeUpdate || noAttendees
        ? []
        : aideAttendance.filter(hasAideAttendeeContent).map((row) => ({ ...row })),
      photos,
      project_snapshot: { ...project },
      update_snapshot: {
        inspection_date: inspectionDate,
        status: projectStatus,
        physical_accomplishment: physicalAccomplishment,
        target_physical_accomplishment: targetPhysicalAccomplishment,
        financial_accomplishment: financialAccomplishment,
        disbursement_amount: String(effectiveDisbursementAmount),
        has_new_disbursement: hasNewDisbursement,
        contract_amount: contractAmount || String(project.contract_amount ?? project.budget ?? ''),
        has_contract_modification: hasContractModification,
        contract_modification_type: contractModificationType,
        has_revised_project_cost: hasRevisedProjectCost,
        revised_project_cost: hasRevisedProjectCost ? revisedProjectCost : null,
        revised_contract_expiration_date: revisedContractExpirationDate,
        inspection_latitude: inspectionLatitude,
        inspection_longitude: inspectionLongitude,
        findings: aideFindings,
        no_findings_observed: isOfficeUpdate ? true : noFindingsObserved,
        no_attendees: isOfficeUpdate ? true : noAttendees,
        update_type: updateType,
        attendance: isOfficeUpdate || noAttendees ? [] : aideAttendance,
        general_observations: isOfficeUpdate ? '' : generalObservations,
        mode_of_implementation: modeOfImplementation || 'BY CONTRACT',
        wizard_step: wizardStep,
        max_reached_step: maxReachedStep,
      },
      status: recordStatus,
      sync_status: 'local',
      synced: false,
      created_at: recordStatus === 'draft' && workingAideDraft?.created_at ? workingAideDraft.created_at : now,
      updated_at: now,
    }
  }

  async function saveLatestUpdateDraft(options: { silent?: boolean } = {}) {
    if (!workingUpdateRef || !workingDraftId) throw new Error('Draft reference is unavailable.')

    const silent = Boolean(options.silent)
    const requestedFingerprint = workingDraftFingerprint

    if (draftSavePromiseRef.current) {
      const activeResult = await promiseWithTimeout(
        draftSavePromiseRef.current,
        12_000,
        'The previous local draft save is taking longer than expected. You may continue navigating while PMS10 finishes it in the background.',
      )

      if (silent || lastAutoSaveFingerprintRef.current === requestedFingerprint) {
        return activeResult
      }
    }

    if (!silent) setDraftSaving(true)

    const draft = buildAideMemoireRecord(workingUpdateRef, 'offline', 'draft')
    const savePromise = saveAideMemoireRecord(draft).then((storedDraft) => {
      setWorkingAideDraft(storedDraft)
      lastAutoSaveFingerprintRef.current = requestedFingerprint
      return storedDraft
    })

    draftSavePromiseRef.current = savePromise
    void savePromise.finally(() => {
      if (draftSavePromiseRef.current === savePromise) {
        draftSavePromiseRef.current = null
      }
    }).catch(() => undefined)

    try {
      return await promiseWithTimeout(
        savePromise,
        15_000,
        'Draft saving is still finishing on this device. PMS10 has released the page so you can continue navigating; please try Save Draft again after a moment.',
      )
    } finally {
      if (!silent) setDraftSaving(false)
    }
  }


  async function saveUpdateDraftFromFab() {
    setErrorMessage('')
    try {
      await saveLatestUpdateDraft()
      setNoticeDialog({
        title: 'Draft Saved Successfully',
        message:
          'The latest Project Update draft was saved on this device. Open this project and use Resume Draft to continue from the saved step.',
        tone: 'info',
      })
    } catch (error: any) {
      console.error('Unable to save the Project Update draft.', error)
      setNoticeDialog({
        title: 'Draft Not Saved',
        message: error?.message || 'Unable to save the draft on this device. Please try again.',
        tone: 'danger',
      })
    }
  }

  async function finalizeAideMemoireForSavedUpdate(updateRef: string, source: 'online' | 'offline') {
    if (!updateRef) return
    const finalRecord = buildAideMemoireRecord(updateRef, source, 'final')
    await saveAideMemoireRecord(finalRecord)
    if (workingDraftId) await offlineDb.aide_memoires.delete(workingDraftId)
    setWorkingAideDraft(null)
  }


  async function refreshLatestProjectOutputs() {
    if (!id) {
      setLatestPdfRecord(null)
      return
    }

    try {
      let latestPdf = await getLatestAideMemoireDocument(id, 'pdf')
      if (!latestPdf) {
        const records = await offlineDb.aide_memoires.where('project_id').equals(id).toArray()
        const legacyRecord = records
          .filter((record) => Boolean(record.latest_pdf_blob))
          .sort((first, second) =>
            String(second.latest_pdf_generated_at || second.updated_at || '').localeCompare(
              String(first.latest_pdf_generated_at || first.updated_at || ''),
            ),
          )[0]

        if (legacyRecord?.latest_pdf_blob) {
          latestPdf = await saveAideMemoireDocument({
            aideMemoireId: legacyRecord.id,
            projectId: id,
            updateRef: legacyRecord.update_ref,
            format: 'pdf',
            fileName: legacyRecord.latest_pdf_file_name || 'Aide_Memoire.pdf',
            blob: legacyRecord.latest_pdf_blob,
            generatedAt: legacyRecord.latest_pdf_generated_at || legacyRecord.updated_at,
          })
        }
      }
      setLatestPdfRecord(latestPdf)
    } catch (error) {
      console.error('Unable to load the latest locally generated Aide Memoire PDF.', error)
      setLatestPdfRecord(null)
    }
  }

  function viewLatestProjectPdf() {
    if (!id || !latestPdfRecord) return

    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) activeElement.blur()

    // iOS PWA/WebKit can freeze when a Blob PDF is embedded in an iframe.
    // Open the local PDF in the native Safari/Quick Look viewer instead and
    // leave the Project Update page alive in the app.
    if (isIosLikeDevice()) {
      try {
        openPdfOutsideCurrentApp(latestPdfRecord)
        return
      } catch (openError) {
        console.error('Unable to open the latest PDF in the native viewer.', openError)
      }
    }

    const params = new URLSearchParams({
      documentId: latestPdfRecord.id,
      from: 'update',
      returnTo: `/projects/${id}/updates`,
    })

    navigate(`/projects/${id}/aide-memoire/pdf?${params.toString()}`)
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
        setProjectStatus(normalizeUpdateStatus(onlineProject?.status, onlineProject?.physical_accomplishment))
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
    setProjectStatus(normalizeUpdateStatus(cachedProject?.status, cachedProject?.physical_accomplishment))
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
      .filter((update: ProjectUpdateRecord & { photo_retry_only?: boolean }) =>
        update?.project_id === id && !update.photo_retry_only,
      )
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

  function cacheGpsPosition(position: GeolocationPosition) {
    const normalized = normalizeCoordinatePair(position.coords.latitude, position.coords.longitude)
    if (normalized.isValid) lastGpsPositionRef.current = position
    return normalized
  }


  async function capturePhotoMetadata(): Promise<PhotoCaptureMetadata> {
    const capturedAt = new Date().toISOString()

    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) {
      return {
        latitude: null,
        longitude: null,
        capturedAt,
        gpsMessage: 'Photo saved without GPS. Location services were unavailable.',
      }
    }

    const inspectionCoordinates = normalizeCoordinatePair(inspectionLatitude, inspectionLongitude)
    if (inspectionCoordinates.isValid) {
      return {
        latitude: inspectionCoordinates.latitude,
        longitude: inspectionCoordinates.longitude,
        capturedAt,
        gpsMessage: `GPS captured: ${Number(inspectionCoordinates.latitude).toFixed(7)}, ${Number(inspectionCoordinates.longitude).toFixed(7)}`,
      }
    }

    const cachedPosition = lastGpsPositionRef.current
    if (isRecentGpsPosition(cachedPosition)) {
      const normalized = cacheGpsPosition(cachedPosition as GeolocationPosition)
      if (normalized.isValid) {
        return {
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          capturedAt,
          gpsMessage: `GPS captured: ${Number(normalized.latitude).toFixed(7)}, ${Number(normalized.longitude).toFixed(7)}`,
        }
      }
    }

    let lastError: GeolocationPositionError | null = null

    try {
      const quickPosition = await requestGeolocation({
        enableHighAccuracy: false,
        timeout: 3_500,
        maximumAge: 120_000,
      })
      const normalized = cacheGpsPosition(quickPosition)
      if (normalized.isValid) {
        return {
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          capturedAt,
          gpsMessage: `GPS captured: ${Number(normalized.latitude).toFixed(7)}, ${Number(normalized.longitude).toFixed(7)}`,
        }
      }
    } catch (gpsError) {
      lastError = gpsError as GeolocationPositionError
    }

    try {
      const precisePosition = await requestGeolocation({
        enableHighAccuracy: true,
        timeout: 8_000,
        maximumAge: 0,
      })
      const normalized = cacheGpsPosition(precisePosition)
      return {
        latitude: normalized.isValid ? normalized.latitude : null,
        longitude: normalized.isValid ? normalized.longitude : null,
        capturedAt,
        gpsMessage: normalized.isValid
          ? `GPS captured: ${Number(normalized.latitude).toFixed(7)}, ${Number(normalized.longitude).toFixed(7)}`
          : normalized.reason,
      }
    } catch (gpsError) {
      lastError = gpsError as GeolocationPositionError
      return {
        latitude: null,
        longitude: null,
        capturedAt,
        gpsMessage: lastError ? getGpsErrorMessage(lastError) : 'GPS location could not be captured.',
      }
    }
  }


  async function retryPhotoGps(photoId: string) {
    setPhotoProcessing(true)
    setErrorMessage('')
    setMessage('Capturing GPS location…')

    try {
      const metadata = await capturePhotoMetadata()
      if (metadata.latitude === null || metadata.longitude === null) {
        setErrorMessage(metadata.gpsMessage || 'GPS location could not be captured.')
        setMessage('')
        return
      }

      setPhotoInputs((photos) => photos.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              latitude: metadata.latitude,
              longitude: metadata.longitude,
              capturedAt: metadata.capturedAt,
            }
          : photo,
      ))

      if (!inspectionLatitude.trim() && !inspectionLongitude.trim()) {
        setInspectionLatitude(String(metadata.latitude))
        setInspectionLongitude(String(metadata.longitude))
      }

      setMessage(`GPS updated: ${metadata.latitude.toFixed(7)}, ${metadata.longitude.toFixed(7)}`)
    } finally {
      setPhotoProcessing(false)
    }
  }

  async function processSelectedPhotos(
    files: File[],
    options: { findingId?: string; photoKind: 'finding' | 'additional'; captureGps?: boolean },
  ) {
    const imageFiles = files.filter(isLikelyImage)
    const rejectedCount = files.length - imageFiles.length

    if (imageFiles.length === 0) {
      if (rejectedCount > 0) {
        setErrorMessage(`${rejectedCount} file(s) were skipped because they are not images.`)
      }
      return [] as PhotoInput[]
    }

    setPhotoProcessing(true)
    setErrorMessage('')
    setMessage(`Preparing ${imageFiles.length} inspection photo(s)…`)

    try {
      const metadataPromise: Promise<PhotoCaptureMetadata> = options.captureGps
        ? capturePhotoMetadata()
        : Promise.resolve({
            latitude: null,
            longitude: null,
            capturedAt: new Date().toISOString(),
            gpsMessage: '',
          })

      const preparedPhotos: Array<{
        file: File
        originalSize: number
        compressedSize: number
        compressed: boolean
      }> = []
      const warnings: string[] = []
      let originalBytes = 0
      let compressedBytes = 0

      for (const sourceFile of imageFiles) {
        originalBytes += sourceFile.size

        try {
          const result = await compressInspectionImage(sourceFile)
          compressedBytes += result.compressedSize
          preparedPhotos.push({
            file: result.file,
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            compressed: result.compressed,
          })
        } catch (compressionError: any) {
          console.warn(`Unable to compress ${sourceFile.name}; keeping the original image.`, compressionError)
          compressedBytes += sourceFile.size
          preparedPhotos.push({
            file: sourceFile,
            originalSize: sourceFile.size,
            compressedSize: sourceFile.size,
            compressed: false,
          })
          warnings.push(`${sourceFile.name} could not be compressed on this device.`)
        }
      }

      const metadata = await metadataPromise
      const mappedPhotos: PhotoInput[] = preparedPhotos.map((prepared) => ({
        id: makeLocalId(),
        file: prepared.file,
        previewUrl: URL.createObjectURL(prepared.file),
        caption: '',
        originalSize: prepared.originalSize,
        compressedSize: prepared.compressedSize,
        compressed: prepared.compressed,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        capturedAt: metadata.capturedAt,
        findingId: options.findingId,
        photoKind: options.photoKind,
      }))

      setPhotoInputs((previous) => [...previous, ...mappedPhotos])

      if (
        options.captureGps &&
        metadata.latitude !== null &&
        metadata.longitude !== null &&
        !inspectionLatitude.trim() &&
        !inspectionLongitude.trim()
      ) {
        setInspectionLatitude(String(metadata.latitude))
        setInspectionLongitude(String(metadata.longitude))
      }

      if (options.findingId && mappedPhotos.length > 0) {
        const refs = mappedPhotos.map((photo) => photo.id)
        setAideFindings((rows) => rows.map((row) =>
          row.id === options.findingId
            ? { ...row, photo_refs: [...new Set([...(row.photo_refs || []), ...refs])] }
            : row,
        ))
      }

      const originalMb = originalBytes / (1024 * 1024)
      const compressedMb = compressedBytes / (1024 * 1024)
      const savedPercent = originalBytes > 0
        ? Math.max(0, Math.round((1 - compressedBytes / originalBytes) * 100))
        : 0
      const skippedMessage = rejectedCount > 0 ? ` ${rejectedCount} non-image file(s) were skipped.` : ''
      const warningMessage = warnings.length > 0 ? ` ${warnings.length} photo(s) kept their original size.` : ''
      const gpsMessage = options.captureGps ? ` ${metadata.gpsMessage}` : ''

      setMessage(
        `${mappedPhotos.length} photo(s) ready. ${originalMb.toFixed(1)} MB was reduced to ${compressedMb.toFixed(1)} MB (${savedPercent}% smaller).${gpsMessage}${skippedMessage}${warningMessage}`,
      )

      if (rejectedCount > 0 || warnings.length > 0 || (options.captureGps && metadata.latitude === null)) {
        setErrorMessage(`${gpsMessage}${skippedMessage}${warningMessage}`.trim())
      }

      return mappedPhotos
    } catch (photoError) {
      console.error(photoError)
      setErrorMessage('Unable to process the selected photo(s). Please try again.')
      setMessage('')
      return [] as PhotoInput[]
    } finally {
      setPhotoProcessing(false)
    }
  }

  function focusFindingAfterPhoto(findingId: string) {
    let attempts = 0

    const focusFinding = () => {
      attempts += 1
      const input = findingInputRefs.current[findingId]

      if (!input) {
        if (attempts < 10) window.setTimeout(focusFinding, 80)
        return
      }

      input.scrollIntoView({ behavior: 'smooth', block: 'center' })

      window.setTimeout(() => {
        try {
          input.focus({ preventScroll: true })
        } catch {
          input.focus()
        }

        const cursorPosition = input.value.length
        input.setSelectionRange(cursorPosition, cursorPosition)
      }, 280)
    }

    window.requestAnimationFrame(focusFinding)
  }

  async function handlePhotoSelect(
    event: ChangeEvent<HTMLInputElement>,
    captureGps = false,
  ) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return
    await processSelectedPhotos(files, { photoKind: 'additional', captureGps })
  }

  async function handleFindingPhotoSelect(
    event: ChangeEvent<HTMLInputElement>,
    findingId?: string,
    captureGps = true,
  ) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return

    let targetId = findingId
    if (!targetId) {
      const blankRow = aideFindings.find((row) => !hasAideFindingContent(row))
      const target = blankRow || createBlankAideFinding()
      targetId = target.id
      if (!blankRow) setAideFindings((rows) => [...rows, target])
    }

    const mapped = await processSelectedPhotos(files, {
      findingId: targetId,
      photoKind: 'finding',
      captureGps,
    })

    if (mapped.length > 0 && targetId) {
      focusFindingAfterPhoto(targetId)
    }
  }

  function removePhoto(photoId: string) {
    setAideFindings((rows) => rows.map((row) => ({
      ...row,
      photo_refs: (row.photo_refs || []).filter((ref) => ref !== photoId),
    })))

    setPhotoInputs((previous) => {
      const photoToRemove = previous.find((photo) => photo.id === photoId)

      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.previewUrl)
      }

      return previous.filter((photo) => photo.id !== photoId)
    })
  }

  async function captureGps() {
    setGpsMessage('')
    setErrorMessage('')

    if (!navigator.geolocation) {
      const gpsError = 'GPS is not supported by this browser or device.'
      setErrorMessage(gpsError)
      setNoticeDialog({ title: 'GPS Unavailable', message: gpsError, tone: 'warning' })
      return
    }

    if (!window.isSecureContext) {
      const gpsError = 'GPS requires HTTPS or localhost. Please open the app using localhost, HTTPS deployment, or manually encode the coordinates.'
      setErrorMessage(gpsError)
      setNoticeDialog({ title: 'GPS Permission Needed', message: gpsError, tone: 'warning' })
      return
    }

    setGpsLoading(true)

    try {
      const quickPosition = isRecentGpsPosition(lastGpsPositionRef.current)
        ? lastGpsPositionRef.current as GeolocationPosition
        : await requestGeolocation({
            enableHighAccuracy: false,
            timeout: 4_000,
            maximumAge: 120_000,
          })

      const quickCoordinates = cacheGpsPosition(quickPosition)
      if (!quickCoordinates.isValid) {
        throw new Error(quickCoordinates.reason)
      }

      setInspectionLatitude(Number(quickCoordinates.latitude).toFixed(7))
      setInspectionLongitude(Number(quickCoordinates.longitude).toFixed(7))
      setGpsMessage(`GPS captured quickly with approximately ${Math.round(quickPosition.coords.accuracy)}m accuracy. Refining in the background…`)
      setGpsLoading(false)

      void requestGeolocation({
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      }).then((precisePosition) => {
        const preciseCoordinates = cacheGpsPosition(precisePosition)
        if (!preciseCoordinates.isValid) return
        if (precisePosition.coords.accuracy > quickPosition.coords.accuracy) return

        setInspectionLatitude(Number(preciseCoordinates.latitude).toFixed(7))
        setInspectionLongitude(Number(preciseCoordinates.longitude).toFixed(7))
        setGpsMessage(`GPS refined successfully with approximately ${Math.round(precisePosition.coords.accuracy)}m accuracy.`)
      }).catch(() => undefined)
    } catch {
      try {
        const precisePosition = await requestGeolocation({
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 0,
        })
        const preciseCoordinates = cacheGpsPosition(precisePosition)

        if (!preciseCoordinates.isValid) {
          throw new Error(preciseCoordinates.reason)
        }

        setInspectionLatitude(Number(preciseCoordinates.latitude).toFixed(7))
        setInspectionLongitude(Number(preciseCoordinates.longitude).toFixed(7))
        setGpsMessage(`GPS updated successfully with approximately ${Math.round(precisePosition.coords.accuracy)}m accuracy.`)
        setErrorMessage('')
      } catch (error) {
        console.error(error)
        const gpsError = typeof (error as GeolocationPositionError)?.code === 'number'
          ? getGpsErrorMessage(error as GeolocationPositionError)
          : error instanceof Error
            ? error.message
            : 'Unable to capture GPS.'
        setErrorMessage(gpsError)
        setNoticeDialog({ title: 'GPS Capture Failed', message: gpsError, tone: 'warning' })
      } finally {
        setGpsLoading(false)
      }
    }
  }


  function validateWizardStep(step: number) {
    if (step === 1) {
      if (!inspectionDate) return 'Please select the update date.'
      if (!updateType) return 'Please select Site Update or Office Update.'
      return ''
    }

    if (step === 2) {
      if (physicalAccomplishment === '') return 'Please enter the physical accomplishment.'
      if (targetPhysicalAccomplishment === '') return 'Please enter the target physical accomplishment.'
      if (financialAccomplishment === '') return 'Please enter the financial accomplishment.'
      if (hasNewDisbursement && disbursementAmount.trim() === '') {
        return 'Please enter the updated total disbursement.'
      }

      const physical = toNumber(physicalAccomplishment)
      const target = toNumber(targetPhysicalAccomplishment)
      const financial = toNumber(financialAccomplishment)
      if (physical < 0 || physical > 100) return 'Physical accomplishment must be between 0 and 100.'
      if (target < 0 || target > 100) return 'Target physical accomplishment must be between 0 and 100.'
      if (financial < 0 || financial > 100) return 'Financial accomplishment must be between 0 and 100.'
      return ''
    }

    if (step === 3) {
      if (!projectStatus) return 'Please select the project status.'
      if (isNotYetStartedSelected && !notYetStartedReason.trim()) {
        return `Please provide the ${projectReasonLabel.toLowerCase()}.`
      }
      return ''
    }

    if (step === 4) {
      if (hasContractModification && !contractModificationType.trim()) {
        return 'Please select the type of contract modification.'
      }
      if (hasContractModification && hasRevisedProjectCost && !revisedProjectCost.trim()) {
        return 'Please enter the revised project cost.'
      }
      if (hasContractModification && !revisedContractExpirationDate.trim()) {
        return 'Please enter the revised contract expiration date.'
      }
      if (requiresUpdateReason && !isNotYetStartedSelected && !notYetStartedReason.trim()) {
        return `Please provide the ${projectReasonLabel.toLowerCase()}.`
      }
      return ''
    }

    if (step === 5) {
      if (isOfficeUpdate || noFindingsObserved) return ''

      const contentRows = aideFindings.filter(hasAideFindingContent)
      if (contentRows.length === 0) {
        return 'Add at least one finding or select “No findings observed.”'
      }

      const incompleteRow = contentRows.find(
        (row) => !row.finding.trim() || !row.recommendation.trim() || !row.timeline.trim(),
      )
      if (incompleteRow) {
        return 'Each finding must include a finding, recommendation, and timeline date.'
      }

      const findingWithoutPhoto = contentRows.find((row) => (row.photo_refs || []).length === 0)
      if (findingWithoutPhoto) {
        return 'Attach at least one supporting photo to every finding.'
      }
      return ''
    }

    if (step === 6) {
      if (isOfficeUpdate) return ''
      if (!generalObservations.trim()) {
        return 'Please enter the general observations. Enter “No additional observations” when none apply.'
      }
      return ''
    }

    if (step === 7) {
      if (isOfficeUpdate || noAttendees) return ''

      const attendees = aideAttendance.filter(hasAideAttendeeContent)
      if (attendees.length === 0) return 'Please add at least one attendee or select “No attendees.”'
      if (attendees.some((row) => !row.name.trim() || !row.designation_agency.trim())) {
        return 'Each attendee must include a name and designation/agency.'
      }
      return ''
    }

    return ''
  }

  function centerWizardStep(step: number) {
    window.requestAnimationFrame(() => {
      const container = wizardProgressRef.current
      const stepButton = wizardStepButtonRefs.current[step]

      if (!container || !stepButton) return

      const targetLeft =
        stepButton.offsetLeft - (container.clientWidth - stepButton.offsetWidth) / 2

      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      })
    })
  }

  function scrollToWizardTop() {
    window.requestAnimationFrame(() => {
      wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      centerWizardStep(wizardStep)
    })
  }


  function addAttendeeRow() {
    const existingBlankRow = aideAttendance.find((row) => !hasAideAttendeeContent(row))
    const targetRow = existingBlankRow || createBlankAideAttendee()

    if (!existingBlankRow) {
      setAideAttendance((rows) => [...rows, targetRow])
    }

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const input = attendeeInputRefs.current[targetRow.id]
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        input?.focus({ preventScroll: true })
      }, 0)
    })
  }

  async function goToNextWizardStep() {
    const stepError = validateWizardStep(wizardStep)
    if (stepError) {
      setWizardError(stepError)
      setNoticeDialog({ title: 'Complete This Step', message: stepError, tone: 'warning' })
      return
    }

    setWizardError('')

    try {
      await saveLatestUpdateDraft()
    } catch (error) {
      console.error('Unable to preserve the working update.', error)
    }

    const nextStep = nextVisibleWizardStep?.number ?? wizardStep
    setWizardStep(nextStep)
    setMaxReachedStep((current) => Math.max(current, nextStep))
    scrollToWizardTop()
  }

  function goToPreviousWizardStep() {
    setWizardError('')
    const previousStep = visibleWizardSteps[Math.max(0, currentVisibleStepIndex - 1)]?.number || 1
    setWizardStep(previousStep)
    scrollToWizardTop()
  }

  function jumpToWizardStep(step: number) {
    if (step > maxReachedStep) return
    setWizardError('')
    setWizardStep(step)
    scrollToWizardTop()
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

    if (isNotYetStartedSelected && !notYetStartedReason.trim()) {
      return `Please provide the ${projectReasonLabel.toLowerCase()}.`
    }

    if (hasContractModification && !contractModificationType.trim()) {
      return'Please select the type of contract modification.'
    }

    if (hasContractModification && hasRevisedProjectCost && !revisedProjectCost.trim()) {
      return'Please enter the revised project cost.'
    }

    if (hasContractModification && !revisedContractExpirationDate.trim()) {
      return'Please enter the revised contract expiration date.'
    }

    if (requiresUpdateReason && !isNotYetStartedSelected && !notYetStartedReason.trim()) {
      return `Please provide the ${projectReasonLabel.toLowerCase()}.`
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

    for (const stepEntry of visibleWizardSteps) {
      const step = stepEntry.number
      const stepError = validateWizardStep(step)
      if (stepError) {
        setWizardStep(step)
        setMaxReachedStep((current) => Math.max(current, step))
        scrollToWizardTop()
        return stepError
      }
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
      disbursement_amount: effectiveDisbursementAmount,
      risk_level: autoRiskLevel,
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification ? contractModificationType : null,
      revised_project_cost:
        hasContractModification && hasRevisedProjectCost
          ? toNumber(revisedProjectCost)
          : null,
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

    await updateSharedProjectCache(projectId, projectPatch)
    setProject((current) => current ? { ...current, ...projectPatch } : current)

    let photoUploadResult = {
      uploadedCount: 0,
      queuedCount: 0,
      failedMessages: [] as string[],
    }

    if (photoInputs.length > 0 && updateId) {
      photoUploadResult = await uploadPhotosOnline(projectId, String(updateId))
    }

    await finalizeAideMemoireForSavedUpdate(String(updateId || ''), 'online')
    await refreshLatestProjectOutputs()
    clearFormAfterSave()

    const hasQueuedPhotos = photoUploadResult.queuedCount > 0
    const successMessage = hasQueuedPhotos
      ? `Project update saved. ${photoUploadResult.queuedCount} compressed photo(s) remain safely on this device for Offline Sync.`
      : 'Project update saved online successfully.'

    setMessage(successMessage)
    setSaveSuccessDialog({
      title: hasQueuedPhotos ? 'Update Saved — Drive Upload Pending' : 'Update Saved',
      message: hasQueuedPhotos
        ? `The inspection update is saved and the Aide Memoire can be generated now, even without syncing. ${photoUploadResult.uploadedCount} photo(s) reached Google Drive and ${photoUploadResult.queuedCount} compressed photo(s) remain safely on this device for Offline Sync.`
        : 'Project update saved successfully. The project record and compressed photos have been updated.',
      mode:'online',
      updateRef: String(updateId || ''),
    })

  }

  async function queueFailedOnlinePhotos(
    projectId: string,
    updateId: string,
    failedPhotos: Array<{ photo: PhotoInput; index: number; message: string }>,
  ) {
    if (failedPhotos.length === 0) return 0

    const localQueueId = `photo-retry-${updateId}-${Date.now()}`
    const currentTimestamp = new Date().toISOString()
    const projectName = project?.project_name || 'Untitled Project'
    const driveFundingYear = getDriveFundingYear(project, inspectionDate)
    const driveFundingSource = getDriveFundingSource(project)
    const updatePayload = buildUpdatePayload(projectId)

    const offlineUpdateId = await offlineDb.project_updates.add({
      ...updatePayload,
      local_id: localQueueId,
      online_update_id: updateId,
      project_name: projectName,
      funding_year: driveFundingYear || null,
      funding_source: driveFundingSource || project?.funding_source || null,
      funding_program: driveFundingSource || null,
      status: projectStatus,
      contract_expiration_date: project?.contract_expiration_date || null,
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification ? contractModificationType : null,
      revised_project_cost:
        hasContractModification && hasRevisedProjectCost
          ? toNumber(revisedProjectCost)
          : null,
      revised_contract_expiration_date: hasContractModification
        ? revisedContractExpirationDate
        : null,
      not_yet_started_reason: requiresUpdateReason ? cleanText(notYetStartedReason) : null,
      updated_at: currentTimestamp,
      synced: false,
      sync_status: 'pending',
      is_offline: false,
      error: failedPhotos.map((item) => item.message).filter(Boolean).join(' | '),
      photo_retry_only: true,
    } as any)

    const photoRows = await Promise.all(failedPhotos.map(async ({ photo, index, message }) => ({
      offline_update_id: offlineUpdateId,
      local_update_id: localQueueId,
      project_update_id: updateId,
      project_id: projectId,
      project_name: projectName,
      funding_year: driveFundingYear || null,
      funding_source: driveFundingSource || project?.funding_source || null,
      funding_program: driveFundingSource || null,
      file_data: await photo.file.arrayBuffer(),
      file_name: photo.file.name,
      file_type: photo.file.type,
      file_size: photo.file.size,
      caption: getInspectionPhotoCaption(photo, index) ?? '',
      created_at: currentTimestamp,
      uploaded_at: currentTimestamp,
      synced: false,
      sync_status: 'pending',
      is_offline: true,
      error: message,
    })))

    await offlineDb.project_photos.bulkAdd(photoRows)
    return photoRows.length
  }

  async function uploadPhotosOnline(projectId: string, updateId: string) {
    const projectTitle = project?.project_name || 'Untitled Project'
    const driveFundingYear = getDriveFundingYear(project, inspectionDate)
    const driveFundingSource = getDriveFundingSource(project)
    const uploadedBy =
      auth?.profile?.full_name ||
      auth?.profile?.email ||
      auth?.user?.email ||
      auth?.user?.id ||
      auth?.profile?.id ||
      'PMS10 User'

    let uploadedCount = 0
    const failedPhotos: Array<{ photo: PhotoInput; index: number; message: string }> = []

    for (let index = 0; index < photoInputs.length; index += 1) {
      const photo = photoInputs[index]

      try {
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

        const { error: photoInsertError } = await supabase.from('project_photos').insert([
          {
            project_id: projectId,
            project_update_id: updateId,
            photo_url: getDrivePhotoUrl(uploadedFile),
            caption: getInspectionPhotoCaption(photo, index) ?? '',
            uploaded_at: new Date().toISOString(),
          },
        ])

        if (photoInsertError) throw photoInsertError
        uploadedCount += 1
      } catch (error: any) {
        console.error(`Unable to upload project photo ${index + 1}.`, error)
        failedPhotos.push({
          photo,
          index,
          message:
            error?.message ||
            'Google Drive photo upload failed. This photo was queued for Offline Sync.',
        })
      }
    }

    let queuedCount = 0

    if (failedPhotos.length > 0) {
      try {
        queuedCount = await queueFailedOnlinePhotos(projectId, updateId, failedPhotos)
      } catch (queueError) {
        console.error('Unable to queue failed online photos for Offline Sync.', queueError)
      }
    }

    return {
      uploadedCount,
      queuedCount,
      failedMessages: failedPhotos.map((item) => item.message),
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
      revised_project_cost:
        hasContractModification && hasRevisedProjectCost
          ? toNumber(revisedProjectCost)
          : null,
      revised_contract_expiration_date: hasContractModification ? revisedContractExpirationDate : null,
      disbursement_amount: effectiveDisbursementAmount,
      update_type: updateType,
      no_attendees: isOfficeUpdate ? true : noAttendees,
      not_yet_started_reason: requiresUpdateReason ? cleanText(notYetStartedReason) : null,
      synced: false,
      sync_status:'pending',
      is_offline: true,
      error:'',
    }

    const offlineUpdateId = await updateTable.add(offlineUpdateRecord)

    const offlinePhotoRecords = await Promise.all(photoInputs.map(async (photo, index) => ({
      offline_update_id: offlineUpdateId,
      local_update_id: localUpdateId,
      project_update_id: localUpdateId,
      project_id: projectId,
      project_name: projectName,
      funding_year: driveFundingYear || null,
      funding_source: driveFundingSource || project?.funding_source || null,
      funding_program: driveFundingSource || null,
      file_data: await photo.file.arrayBuffer(),
      file_name: photo.file.name,
      file_type: photo.file.type,
      file_size: photo.file.size,
      caption: getInspectionPhotoCaption(photo, index) ?? '',
      created_at: new Date().toISOString(),
      uploaded_at: new Date().toISOString(),
      synced: false,
      sync_status:'pending',
      is_offline: true,
      error:'',
    })))

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
      disbursement_amount: effectiveDisbursementAmount,
      risk_level: autoRiskLevel,
      contract_expiration_date: project?.contract_expiration_date || null,
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification ? contractModificationType : null,
      revised_project_cost:
        hasContractModification && hasRevisedProjectCost
          ? toNumber(revisedProjectCost)
          : null,
      revised_contract_expiration_date: hasContractModification ? revisedContractExpirationDate : null,
      not_yet_started_reason: requiresUpdateReason ? cleanText(notYetStartedReason) : null,
      last_inspection_date: inspectionDate,
      ...latestCoordinatePatch,
      updated_at: currentTimestamp,
    })

    await updateSharedProjectCache(projectId, {
      status: projectStatus,
      physical_accomplishment: clampProgress(physicalAccomplishment),
      target_physical_accomplishment: clampProgress(targetPhysicalAccomplishment),
      target_physical_as_of: inspectionDate,
      target_physical_source: 'manual',
      financial_accomplishment: clampProgress(financialAccomplishment),
      disbursement_amount: effectiveDisbursementAmount,
      risk_level: autoRiskLevel,
      contract_expiration_date: project?.contract_expiration_date || null,
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification ? contractModificationType : null,
      revised_project_cost:
        hasContractModification && hasRevisedProjectCost
          ? toNumber(revisedProjectCost)
          : null,
      revised_contract_expiration_date: hasContractModification ? revisedContractExpirationDate : null,
      not_yet_started_reason: requiresUpdateReason ? cleanText(notYetStartedReason) : null,
      last_inspection_date: inspectionDate,
      ...latestCoordinatePatch,
      updated_at: currentTimestamp,
    })

    await finalizeAideMemoireForSavedUpdate(localUpdateId, 'offline')
    await refreshLatestProjectOutputs()
    clearFormAfterSave()
    setMessage('Project update saved offline. Sync it when internet is available.')
    setSaveSuccessDialog({
      title:'Saved Offline — Ready to Generate',
      message:'The inspection update and compressed photo files are safely stored on this device. You can generate the Aide Memoire now without synchronizing, then use Offline Sync when internet is available.',
      mode:'offline',
      updateRef: localUpdateId,
    })

    await loadOfflineData()
  }

  function clearFormAfterSave() {
    autoSaveSuspendedRef.current = true
    setIssues('')
    setRecommendations('')
    setRemarks('')
    setAideFindings([createBlankAideFinding()])
    setNoFindingsObserved(false)
    setNoAttendees(false)
    setUpdateType('site')
    setAideAttendance([createBlankAideAttendee()])
    setGeneralObservations('')
    setDisbursementAmount(String(project?.disbursement_amount ?? ''))
    setHasNewDisbursement(false)
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
    setWizardStep(1)
    setMaxReachedStep(1)
    setWizardError('')
  }

  function closeSuccessDialog() {
    setSaveSuccessDialog(null)

    if (id) {
      navigate(`/projects/${id}`)
    }
  }

  function prepareAideMemoire() {
    if (!id || !saveSuccessDialog?.updateRef) return

    const source = saveSuccessDialog.mode === 'offline' ? 'offline' : 'online'
    setAideGenerationRequest({ updateRef: saveSuccessDialog.updateRef, source })
    setSaveSuccessDialog(null)
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
            Only Admin, RO Engineer, assigned PO Engineer, or PEO accounts can submit
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
        <div className="pu-update-hero-content">
          <p className="pu-eyebrow">Project Update</p>
          <h1
            className={`pu-update-hero-title ${getHeroTitleSizeClass(project?.project_name)}`}
            title={project?.project_name || 'Project Update'}
          >
            {project?.project_name || 'Project Update'}
          </h1>

          <p className="pu-compact-location" aria-label="Project location">
            {[
              toLocationTitleCase(project?.barangay),
              toLocationTitleCase(project?.municipality),
              toLocationTitleCase(project?.province),
            ]
              .filter(Boolean)
              .join(', ') || 'Location Not Available'}
          </p>

          <p className="pu-flat-monitoring" aria-label="Project status, variance, and risk">
            <span className="pu-flat-monitoring__value pu-flat-monitoring__status">
              {heroDisplayStatus}
            </span>
            <span className="pu-flat-monitoring__separator" aria-hidden="true">•</span>
            <span
              className="pu-flat-monitoring__value pu-flat-monitoring__variance"
              data-tone={heroVarianceTone}
            >
              {targetVarianceInfo.compactLabel}
            </span>
            <span className="pu-flat-monitoring__separator" aria-hidden="true">•</span>
            <span
              className="pu-flat-monitoring__value pu-flat-monitoring__risk"
              data-tone={heroRiskTone}
            >
              {heroRiskLabel}
            </span>
          </p>
        </div>
      </section>

      {!online && (
        <div className="pu-alert pu-alert-warning">
          You are currently offline. Updates will be saved locally and must be
          synced later.
        </div>
      )}

      {errorMessage && (
        <div className="pu-alert pu-alert-danger">{errorMessage}</div>
      )}

      <div className="pu-content-grid pu-update-subpage-system">
        <form className="pu-form-card pu-wizard-form-card" onSubmit={handleSubmit} noValidate>
          <div className="pu-wizard-shell" ref={wizardTopRef}>
            <div className="pu-wizard-title-row">
              <span className="pu-wizard-count">Step {currentVisibleStepNumber} of {visibleWizardSteps.length}</span>
            </div>

            <div className="pu-wizard-progress" ref={wizardProgressRef} aria-label="Project Update steps">
              {visibleWizardSteps.map((step, visibleIndex) => {
                const isCurrent = wizardStep === step.number
                const isReached = step.number <= maxReachedStep
                const isCompleted = step.number < wizardStep || (step.number < maxReachedStep && !isCurrent)

                return (
                  <button
                    key={step.number}
                    ref={(element) => {
                      wizardStepButtonRefs.current[step.number] = element
                    }}
                    type="button"
                    className={`${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`}
                    onClick={() => jumpToWizardStep(step.number)}
                    disabled={!isReached}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`${step.number}. ${step.title}${isCompleted ? ', completed' : isCurrent ? ', current step' : ''}`}
                    title={step.title}
                  >
                    <span aria-hidden="true">{visibleIndex + 1}</span>
                    {isCurrent && (
                      <strong className="pu-wizard-active-step-title">{step.shortTitle}</strong>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="pu-wizard-step-summary">
              <small>
                {nextVisibleWizardStep
                  ? `Next: ${nextVisibleWizardStep.number === 8 && isOfficeUpdate ? 'Documentation Photos and Final Review' : nextVisibleWizardStep.title}`
                  : 'Final review and submission'}
              </small>
            </div>

            {wizardError && <div className="pu-wizard-error">{wizardError}</div>}
          </div>

          {wizardStep === 1 && (
          <div className="pu-update-section pu-section-quick">
            <div className="pu-section-heading">
              <span>01</span>
              <div>
                <strong>Update Date and Type</strong>
                <small>Choose whether this update is prepared at the project site or from the office.</small>
              </div>
            </div>

            <div className="pu-field pu-full-field pu-update-type-field">
              <span>Type of Update</span>
              <div className="pu-two-choice-grid" role="radiogroup" aria-label="Type of project update">
                <button
                  type="button"
                  role="radio"
                  aria-checked={updateType === 'site'}
                  className={`pu-choice-card ${updateType === 'site' ? 'active' : ''}`}
                  onClick={() => handleUpdateTypeChange('site')}
                  disabled={saving}
                >
                  <strong>Site Update</strong>
                  <small>Full inspection workflow with GPS, findings, observations, attendance, and photos</small>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={updateType === 'office'}
                  className={`pu-choice-card ${updateType === 'office' ? 'active' : ''}`}
                  onClick={() => handleUpdateTypeChange('office')}
                  disabled={saving}
                >
                  <strong>Office Update</strong>
                  <small>Progress and contract monitoring with documentation photos only</small>
                </button>
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

                  <label className={`pu-date-change-btn pu-date-picker-proxy ${saving ? 'disabled' : ''}`}>
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

              {!isOfficeUpdate && (
                <button
                  type="button"
                  className="pu-action-btn pu-action-gps"
                  onClick={captureGps}
                  disabled={gpsLoading || saving}
                >
                  {gpsLoading ? 'Capturing GPS...' : 'Update GPS'}
                  <span>Capture location</span>
                </button>
              )}
            </div>

            {!isOfficeUpdate ? (
              <div className="pu-gps-inline-wrap">
                {gpsMessage && <div className="pu-gps-message pu-gps-message-inline">{gpsMessage}</div>}

                {hasInspectionCoordinates ? (
                  <div className="pu-gps-inline-result">
                    <strong>{inspectionCoordinateStatus.isValid ? 'GPS captured' : 'GPS needs checking'}</strong>
                    <em>
                      {inspectionCoordinateStatus.isValid
                        ? `Lat ${inspectionCoordinateStatus.latitude?.toFixed(7) || ''} · Long ${inspectionCoordinateStatus.longitude?.toFixed(7) || ''}`
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
            ) : (
              <div className="pu-office-update-note">
                Office Update does not require inspection GPS, findings, general observations, or attendance.
              </div>
            )}

            <label className="pu-field pu-full-field pu-mode-of-implementation-field">
              <span>Mode of Implementation</span>
              <select
                value={modeOfImplementation}
                onChange={(event) => setModeOfImplementation(event.target.value)}
                disabled={saving}
              >
                <option value="BY CONTRACT">BY CONTRACT</option>
                <option value="BY ADMINISTRATION">BY ADMINISTRATION</option>
                <option value="OTHER">OTHER</option>
              </select>
              <small>Defaults to BY CONTRACT. Change only when the approved implementation mode is different.</small>
            </label>
          </div>
          )}

          {wizardStep === 2 && (
          <div className="pu-update-section pu-section-progress">
            <div className="pu-section-heading">
              <span>02</span>
              <div>
                <strong>Progress and Financial</strong>
                <small>Enter accomplishment and financial data.</small>
              </div>
            </div>

            <div className="pu-progress-grid">
              <label className="pu-field pu-field-important pu-progress-field">
                <span>Physical Accomplishment (%)</span>
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
                <span>Target Accomplishment (%)</span>
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

              <label className="pu-field pu-progress-full">
                <span>Contract Amount (₱)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={contractAmount}
                  onChange={(event) => setContractAmount(event.target.value)}
                  placeholder="0.00"
                  disabled={saving}
                />
                <small>Defaults to Project Cost but remains editable for the awarded contract amount.</small>
              </label>

              <div className="pu-field pu-full-field pu-disbursement-mode-field">
                <span>Disbursement Update</span>
                <div className="pu-two-choice-grid" role="radiogroup" aria-label="Disbursement update">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!hasNewDisbursement}
                    className={`pu-choice-card ${!hasNewDisbursement ? 'active' : ''}`}
                    onClick={() => handleDisbursementModeChange(false)}
                    disabled={saving}
                  >
                    <strong>No New Disbursement</strong>
                    <small>Retain ₱{effectiveDisbursementAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={hasNewDisbursement}
                    className={`pu-choice-card ${hasNewDisbursement ? 'active' : ''}`}
                    onClick={() => handleDisbursementModeChange(true)}
                    disabled={saving}
                  >
                    <strong>Update Disbursement</strong>
                    <small>Enter a new cumulative amount or expression</small>
                  </button>
                </div>
              </div>

              {hasNewDisbursement ? (
                <label className="pu-field pu-disbursement-field pu-progress-full">
                  <span>Updated Disbursement (₱)</span>
                  <div className="pu-disbursement-control">
                    <input
                      type="text"
                      value={disbursementAmount}
                      onChange={(event) => setDisbursementAmount(event.target.value)}
                      onKeyDown={handleDisbursementKeyDown}
                      placeholder="0.00"
                      inputMode="decimal"
                      disabled={saving}
                    />

                    <button
                      type="button"
                      className="pu-disbursement-equals-btn"
                      onClick={() => applyDisbursementComputation()}
                      disabled={saving || effectiveContractAmount <= 0}
                      aria-label="Compute disbursement and financial accomplishment"
                      title="Compute"
                    >
                      =
                    </button>
                  </div>
                  <small>Enter the new cumulative amount or expression, then tap =.</small>
                </label>
              ) : (
                <div className="pu-retained-disbursement pu-progress-full">
                  <span>Retained Total Disbursement</span>
                  <strong>₱{effectiveDisbursementAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <small>No change will be applied to the stored disbursement.</small>
                </div>
              )}

              <label className="pu-field pu-field-important pu-progress-field">
                <span>Financial Accomplishment (%)</span>
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
          )}

          {wizardStep === 3 && (
          <div className="pu-update-section pu-section-status">
            <div className="pu-section-heading">
              <span>03</span>
              <div>
                <strong>Project Status</strong>
                <small>Select the current implementation status.</small>
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

            {isNotYetStartedSelected && (
              <div className="pu-field pu-full-field">
                <span>{projectReasonLabel} *</span>
                <div className="pu-reason-chip-grid" role="radiogroup" aria-label="Reason for not yet started">
                  {NOT_YET_STARTED_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      role="radio"
                      aria-checked={notYetStartedReason === reason}
                      className={`pu-reason-chip ${notYetStartedReason === reason ? 'active' : ''}`}
                      onClick={() => setNotYetStartedReason(reason)}
                      disabled={saving}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {wizardStep === 4 && (
          <div className="pu-update-section pu-section-contract">
            <div className="pu-section-heading">
              <span>04</span>
              <div>
                <strong>Contract Modification</strong>
                <small>Record approved contract changes only.</small>
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
                  <div className="pu-field pu-full-field">
                    <span>Project Cost Revision?</span>
                    <div className="pu-two-choice-grid" role="radiogroup" aria-label="Project cost revision">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!hasRevisedProjectCost}
                        className={`pu-choice-card ${!hasRevisedProjectCost ? 'active' : ''}`}
                        onClick={() => {
                          setHasRevisedProjectCost(false)
                          setRevisedProjectCost('')
                        }}
                        disabled={saving}
                      >
                        <strong>No Revision</strong>
                        <small>Retain the current project cost</small>
                      </button>

                      <button
                        type="button"
                        role="radio"
                        aria-checked={hasRevisedProjectCost}
                        className={`pu-choice-card ${hasRevisedProjectCost ? 'active' : ''}`}
                        onClick={() => setHasRevisedProjectCost(true)}
                        disabled={saving}
                      >
                        <strong>Revised Cost</strong>
                        <small>Enter the approved revised amount</small>
                      </button>
                    </div>
                  </div>

                  {hasRevisedProjectCost && (
                    <label className="pu-field pu-full-field">
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
                  )}

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

              {requiresUpdateReason && !isNotYetStartedSelected && (
                <label className="pu-field pu-full-field pu-contract-reason-field">
                  <span>{projectReasonLabel} *</span>
                  <textarea
                    value={notYetStartedReason}
                    onChange={(event) => setNotYetStartedReason(event.target.value)}
                    required
                    disabled={saving}
                    placeholder="State the reason or justification for the variation, suspension, termination, or other approved contract change."
                    rows={3}
                  />
                  <small>This reason is recorded with the contract modification or critical project status.</small>
                </label>
              )}
            </div>
          </div>
          )}

          {wizardStep === 5 && (
            <div className="pu-update-section pu-section-notes pu-wizard-section pu-photo-findings-step">
              <div className="pu-section-heading">
                <span>05</span>
                <div>
                  <strong>Photo Findings and Recommendations</strong>
                  <small>Capture evidence and encode the linked finding.</small>
                </div>
              </div>

              <label className="pu-no-findings-toggle">
                <input
                  type="checkbox"
                  checked={noFindingsObserved}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setNoFindingsObserved(checked)
                    if (checked) {
                      setPhotoInputs((photos) => {
                        photos.filter((photo) => photo.photoKind === 'finding').forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
                        return photos.filter((photo) => photo.photoKind !== 'finding')
                      })
                      setAideFindings([createBlankAideFinding()])
                    }
                  }}
                />
                <span>No findings observed during this inspection</span>
              </label>

              {!noFindingsObserved && (
                <>
                  <div className="pu-photo-finding-intro pu-photo-finding-toolbar">
                    <div>
                      <h3>Photo Evidence</h3>
                      <p>Tap once, then choose Photo Library, Take Photo, or Choose Files. Every selection is appended to the list below.</p>
                    </div>

                    <div className="pu-photo-source-actions pu-single-finding-photo-actions">
                      <label className="pu-gallery-select-btn pu-photo-source-btn pu-unified-photo-source-btn">
                        <IconGallery />
                        <span>Capture / Upload Photo</span>
                        <input
                          type="file"
                          accept="image/*,.heic,.heif"
                          multiple
                          onChange={(event) => void handleFindingPhotoSelect(event, undefined, false)}
                          disabled={saving || photoProcessing}
                        />
                      </label>
                    </div>
                  </div>

                  {aideFindings.filter(hasAideFindingContent).length === 0 ? (
                    <div className="pu-photo-empty pu-finding-photo-empty">
                      No finding photos added yet. Use Capture / Upload Photo above.
                    </div>
                  ) : (
                    <div className="pu-aide-row-list pu-photo-finding-list">
                      {aideFindings.filter(hasAideFindingContent).map((row, index) => {
                        const linkedPhotos = photoInputs.filter((photo) => (row.photo_refs || []).includes(photo.id))
                        return (
                          <article className="pu-aide-edit-row pu-photo-finding-card" key={row.id}>
                            <div className="pu-aide-row-title">
                              <div>
                                <strong>Finding {index + 1}</strong>
                                <small>{linkedPhotos.length} photo{linkedPhotos.length === 1 ? '' : 's'} in this finding</small>
                              </div>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => {
                                  const linkedIds = new Set(linkedPhotos.map((photo) => photo.id))
                                  setPhotoInputs((photos) => {
                                    photos.filter((photo) => linkedIds.has(photo.id)).forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
                                    return photos.filter((photo) => !linkedIds.has(photo.id))
                                  })
                                  setAideFindings((rows) => {
                                    const next = rows.filter((item) => item.id !== row.id)
                                    return next.length ? next : [createBlankAideFinding()]
                                  })
                                }}
                              >
                                Remove
                              </button>
                            </div>

                            <div className="pu-finding-photo-strip">
                              {linkedPhotos.map((photo, photoIndex) => {
                                const coordinates = getPhotoCoordinatePair(photo.latitude, photo.longitude)
                                return (
                                  <div className="pu-finding-photo-item" key={photo.id}>
                                    <div className="pu-finding-photo-preview" style={{ backgroundImage: `url(${photo.previewUrl})` }} />
                                    <div>
                                      <strong>
                                        {linkedPhotos.length > 1
                                          ? `Photo ${index + 1}.${photoIndex + 1}`
                                          : `Photo ${index + 1}`}
                                      </strong>
                                      <span>
                                        {coordinates
                                          ? `${coordinates.latitude.toFixed(7)}, ${coordinates.longitude.toFixed(7)}`
                                          : 'GPS not available'}
                                      </span>
                                    </div>
                                    <div className="pu-finding-photo-actions">
                                      {!coordinates ? (
                                        <button
                                          type="button"
                                          className="pu-photo-gps-btn"
                                          onClick={() => void retryPhotoGps(photo.id)}
                                          disabled={photoProcessing || saving}
                                        >
                                          Add GPS
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="pu-photo-remove-btn"
                                        onClick={() => removePhoto(photo.id)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            <label className="pu-field pu-full-field">
                              <span>Finding</span>
                              <textarea
                                ref={(element) => {
                                  findingInputRefs.current[row.id] = element
                                }}
                                value={row.finding}
                                onChange={(event) =>
                                  setAideFindings((rows) =>
                                    rows.map((item) => item.id === row.id ? { ...item, finding: event.target.value } : item),
                                  )
                                }
                                placeholder="Observed issue, defect, delay cause, or field finding"
                              />
                            </label>

                            <label className="pu-field pu-full-field">
                              <span>Recommendation</span>
                              <textarea
                                value={row.recommendation}
                                onChange={(event) =>
                                  setAideFindings((rows) =>
                                    rows.map((item) => item.id === row.id ? { ...item, recommendation: event.target.value } : item),
                                  )
                                }
                                placeholder="Required corrective action or recommendation"
                              />
                            </label>

                            <div className="pu-aide-two-column">
                              <label className="pu-field">
                                <span>Timeline Date</span>
                                <input
                                  type="date"
                                  value={row.timeline}
                                  onChange={(event) =>
                                    setAideFindings((rows) =>
                                      rows.map((item) => item.id === row.id ? { ...item, timeline: event.target.value } : item),
                                    )
                                  }
                                />
                              </label>

                              <label className="pu-field">
                                <span>Remarks</span>
                                <input
                                  type="text"
                                  value={row.remarks}
                                  onChange={(event) =>
                                    setAideFindings((rows) =>
                                      rows.map((item) => item.id === row.id ? { ...item, remarks: event.target.value } : item),
                                    )
                                  }
                                  placeholder="Optional current action or status"
                                />
                              </label>
                            </div>

                            <div className="pu-coordinate-note">
                              GPS coordinates from linked photos will be added automatically to the Aide Memoire Remarks column.
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {wizardStep === 6 && (
            <div className="pu-update-section pu-section-notes pu-wizard-section">
              <div className="pu-section-heading">
                <span>06</span>
                <div>
                  <strong>General Observations</strong>
                  <small>Summarize the site condition and inspection context.</small>
                </div>
              </div>

              <label className="pu-field pu-full-field pu-general-observations-field">
                <span>General Observations</span>
                <textarea
                  value={generalObservations}
                  onChange={(event) => setGeneralObservations(event.target.value)}
                  placeholder="Enter No additional observations when none apply."
                  rows={7}
                />
              </label>
            </div>
          )}

          {wizardStep === 7 && !isOfficeUpdate && (
            <div className="pu-update-section pu-section-notes pu-wizard-section">
              <div className="pu-section-heading">
                <span>07</span>
                <div>
                  <strong>Attendance</strong>
                  <small>Record the inspection attendees or confirm that no attendee was available.</small>
                </div>
              </div>

              <label className="pu-no-attendees-toggle">
                <input
                  type="checkbox"
                  checked={noAttendees}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setNoAttendees(checked)
                    if (checked) setAideAttendance([createBlankAideAttendee()])
                  }}
                  disabled={saving}
                />
                <span>
                  <strong>No attendees for this site update</strong>
                  <small>Use when the update was completed without an LGU/LPMC attendee.</small>
                </span>
              </label>

              {!noAttendees && (
                <>
                  <div className="pu-aide-section-heading">
                    <div>
                      <h3>Inspection Attendance</h3>
                      <p>Name and designation/agency are required for every attendee.</p>
                    </div>
                    <button type="button" onClick={addAttendeeRow}>
                      + Add Attendee
                    </button>
                  </div>

                  <div className="pu-aide-row-list">
                    {aideAttendance.map((row, index) => (
                      <article className="pu-aide-edit-row compact" key={row.id}>
                        <div className="pu-aide-row-title">
                          <strong>Attendee {index + 1}</strong>
                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              setAideAttendance((rows) => {
                                const next = rows.filter((item) => item.id !== row.id)
                                return next.length ? next : [createBlankAideAttendee()]
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <div className="pu-aide-two-column">
                          <label className="pu-field">
                            <span>Name</span>
                            <input
                              ref={(element) => {
                                attendeeInputRefs.current[row.id] = element
                              }}
                              type="text"
                              value={row.name}
                              onChange={(event) =>
                                setAideAttendance((rows) =>
                                  rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item),
                                )
                              }
                            />
                          </label>
                          <label className="pu-field">
                            <span>Designation / Agency</span>
                            <input
                              type="text"
                              value={row.designation_agency}
                              onChange={(event) =>
                                setAideAttendance((rows) =>
                                  rows.map((item) => item.id === row.id ? { ...item, designation_agency: event.target.value } : item),
                                )
                              }
                            />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {wizardStep === 8 && (
            <div className="pu-update-section pu-section-notes pu-wizard-section pu-review-step">
              <div className="pu-section-heading">
                <span>{isOfficeUpdate ? '05' : '08'}</span>
                <div>
                  <strong>{isOfficeUpdate ? 'Documentation Photos and Final Review' : 'Additional Photos and Final Review'}</strong>
                  <small>Add caption-free documentation photos, then review the update.</small>
                </div>
              </div>

              <div className="pu-optional-photo-picker">
                <div className="pu-photo-source-actions pu-optional-photo-source-actions">
                  <label className="pu-gallery-select-btn pu-photo-source-btn pu-unified-photo-source-btn">
                    <IconGallery />
                    <span>Capture / Upload Documentation Photo</span>
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      onChange={(event) => void handlePhotoSelect(event, false)}
                      disabled={saving || photoProcessing}
                    />
                  </label>
                </div>

                <span className="pu-photo-selection-count">
                  {photoInputs.filter((photo) => photo.photoKind !== 'finding').length} documentation photo(s) selected · no caption required
                </span>
              </div>

              {photoInputs.filter((photo) => photo.photoKind !== 'finding').length === 0 ? (
                <div className="pu-photo-empty">No documentation photos selected. Photos are optional for both Site and Office Updates.</div>
              ) : (
                <div className="pu-photo-grid">
                  {photoInputs.filter((photo) => photo.photoKind !== 'finding').map((photo, index) => {
                    const unsupported = isUnsupportedPreview(photo.file.name)
                    return (
                      <div className="pu-photo-card" key={photo.id}>
                        {unsupported ? (
                          <div className="pu-photo-placeholder">
                            <strong>Preview Not Supported</strong>
                            <span>{photo.file.name}</span>
                          </div>
                        ) : (
                          <div className="pu-photo-preview" style={{ backgroundImage: `url(${photo.previewUrl})` }} />
                        )}
                        <div className="pu-photo-meta">
                          <strong>Documentation Photo {index + 1}</strong>
                          <span>{photo.file.name}</span>
                        </div>
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

              <div className="pu-wizard-review-grid">
                <div><span>Inspection Date</span><strong>{formatLongDate(inspectionDate)}</strong></div>
                <div><span>Status</span><strong>{projectStatus}</strong></div>
                <div><span>Physical</span><strong>{formatPercent(physicalAccomplishment)}</strong></div>
                <div><span>Target</span><strong>{formatPercent(targetPhysicalAccomplishment)}</strong></div>
                <div><span>Financial</span><strong>{formatPercent(financialAccomplishment)}</strong></div>
                <div><span>Risk</span><strong>{autoRiskLevel}</strong></div>
                <div><span>Findings</span><strong>{noFindingsObserved ? 'None observed' : aideFindings.filter(hasAideFindingContent).length}</strong></div>
                <div><span>Attendees</span><strong>{aideAttendance.filter(hasAideAttendeeContent).length}</strong></div>
                <div><span>Finding Photos</span><strong>{photoInputs.filter((photo) => photo.photoKind === 'finding').length}</strong></div>
                <div><span>Additional Photos</span><strong>{photoInputs.filter((photo) => photo.photoKind !== 'finding').length}</strong></div>
              </div>
            </div>
          )}


          <div className="pu-submit-bar pu-wizard-navigation">
            {wizardStep > 1 ? (
              <button
                type="button"
                className="pu-secondary-btn pu-wizard-back-btn"
                onClick={goToPreviousWizardStep}
                disabled={saving || photoProcessing}
              >
                Back
              </button>
            ) : (
              <Link className="pu-secondary-btn pu-wizard-back-btn" to={`/projects/${id}`}>
                Return to Project
              </Link>
            )}

            {!isFinalWizardStep ? (
              <button
                type="button"
                className="pu-primary-btn pu-wizard-next-btn"
                onClick={() => void goToNextWizardStep()}
                disabled={saving || photoProcessing}
              >
                {photoProcessing ? 'Compressing Photos…' : 'Next'}
              </button>
            ) : (
              <button
                type="submit"
                className={`pu-main-save-btn ${online ? 'online' : 'offline'}`}
                disabled={saving || photoProcessing}
              >
                <span className="pu-main-save-label">
                  {photoProcessing ? (
                    'Compressing Photos…'
                  ) : saving ? (
                    <>Saving Update<SavingDots /></>
                  ) : online ? (
                    'Submit Update'
                  ) : (
                    'Submit Offline'
                  )}
                </span>
                <span className="pu-main-save-subtitle">
                  {online ? 'Online detected · submit now' : 'No internet · save to this device'}
                </span>
              </button>
            )}
          </div>
        </form>

        <aside className="pu-side-panel">
          <div className={`pu-side-card pu-history-card ${historyExpanded ? 'is-expanded' : ''}`}>
            <button
              type="button"
              className="pu-history-toggle"
              onClick={() => setHistoryExpanded((current) => !current)}
              aria-expanded={historyExpanded}
              aria-controls="pu-latest-record-panel"
            >
              <span className="pu-history-toggle-copy">
                <strong>Latest Record</strong>
                <small>
                  {recentUpdates.length === 0
                    ? 'No recent update available'
                    : `${formatLongDate(recentUpdates[0]?.inspection_date)} · Physical ${formatPercent(
                        recentUpdates[0]?.physical_accomplishment,
                      )} · Financial ${formatPercent(recentUpdates[0]?.financial_accomplishment)}`}
                </small>
              </span>
              <span className="pu-history-toggle-icon" aria-hidden="true">
                {historyExpanded ? '−' : '+'}
              </span>
            </button>

            {historyExpanded && (
              <div id="pu-latest-record-panel" className="pu-history-panel">
                {recentUpdates.length > 0 && (
                  <div className="pu-history-pager" aria-label="Browse update history">
                    <button
                      type="button"
                      onClick={() => setRecentUpdateIndex((current) => Math.max(0, current - 1))}
                      disabled={recentUpdateIndex === 0}
                      aria-label="Show newer update"
                    >
                      ‹
                    </button>
                    <span>{recentUpdateIndex + 1} of {recentUpdates.length}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setRecentUpdateIndex((current) =>
                          Math.min(recentUpdates.length - 1, current + 1),
                        )
                      }
                      disabled={recentUpdateIndex >= recentUpdates.length - 1}
                      aria-label="Show older update"
                    >
                      ›
                    </button>
                  </div>
                )}

                {recentUpdates.length === 0 ? (
                  <div className="pu-empty-mini">
                    No recent update records found for this project.
                  </div>
                ) : (
                  <div className="pu-recent-list">
                    {(() => {
                      const update = recentUpdates[recentUpdateIndex]
                      if (!update) return null

                      const updateVariance = getTargetPhysicalInfo(update, update.inspection_date)

                      return (
                        <div className="pu-recent-item" key={update.id || recentUpdateIndex}>
                          <div className="pu-recent-item-heading">
                            <strong>{formatLongDate(update.inspection_date)}</strong>
                            {update.sync_status === 'pending' && (
                              <span className="pu-pending-pill">Pending Sync</span>
                            )}
                          </div>

                          <p className="pu-recent-age">{getDaysSinceDate(getUpdateDateValue(update)).label}</p>
                          <div className="pu-recent-metrics">
                            <span>Physical <strong>{formatPercent(update.physical_accomplishment)}</strong></span>
                            <span>Target <strong>{formatPercent(updateVariance.targetPhysical)}</strong></span>
                            <span>
                              Variance{' '}
                              <strong className={updateVariance.className}>
                                {updateVariance.label}
                              </strong>
                            </span>
                            <span>Financial <strong>{formatPercent(update.financial_accomplishment)}</strong></span>
                          </div>
                          <p className="pu-recent-gps">
                            GPS:{' '}
                            {hasCoordinateValue(update.inspection_latitude) &&
                            hasCoordinateValue(update.inspection_longitude)
                              ? `${formatCoordinate(update.inspection_latitude)}, ${formatCoordinate(
                                  update.inspection_longitude,
                                )}`
                              : 'No GPS recorded'}
                          </p>

                          <span
                            className={`pu-badge ${getRiskClass(
                              autoRiskLevel === 'None' ? 'None' : update.risk_level,
                            )}`}
                          >
                            {autoRiskLevel === 'None' ? 'None' : update.risk_level || 'No Risk'}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )}
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
              {noticeDialog.tone === 'info' ? 'OK' : 'OK, Review'}
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
              <span>Photos <strong>{photoInputs.length}</strong></span>
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
                {saving ? (
                  <span className="pu-inline-saving">Saving<SavingDots /></span>
                ) : online ? (
                  'Yes, Save Update'
                ) : (
                  'Yes, Save Offline'
                )}
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
            <div className="pu-modal-actions">
              <button
                type="button"
                className="pu-secondary-btn"
                onClick={closeSuccessDialog}
              >
                View Project
              </button>
              <button
                type="button"
                className="pu-primary-btn"
                onClick={prepareAideMemoire}
                disabled={!saveSuccessDialog.updateRef}
              >
                Generate Aide Memoire
              </button>
            </div>
          </div>
        </div>
      )}
            </>,
            document.body,
          )
        : null}
      {/* PMS10_MODAL_PORTAL_END */}

      {id && aideGenerationRequest && (
        <AideMemoireGenerationDialog
          open
          projectId={id}
          updateRef={aideGenerationRequest.updateRef}
          source={aideGenerationRequest.source}
          returnTo={`/projects/${id}/updates`}
          onClose={() => setAideGenerationRequest(null)}
          onGenerated={refreshLatestProjectOutputs}
        />
      )}

      <ActionMenu
        ariaLabel="Project Update actions"
        launcherLabel="Project Update actions"
        items={[
          {
            id: 'save-draft',
            label: draftSaving ? 'Saving Draft…' : 'Save Draft',
            icon: <IconDraft />,
            tone: 'document',
            disabled: saving || draftSaving || photoProcessing,
            onSelect: () => void saveUpdateDraftFromFab(),
          },
          {
            id: 'latest-pdf',
            label: 'Latest PDF',
            icon: <IconPdf />,
            tone: 'primary',
            hidden: !latestPdfRecord,
            onSelect: viewLatestProjectPdf,
          },
          {
            id: 'back',
            label: 'Back to Project',
            icon: <IconBack />,
            tone: 'neutral',
            onSelect: () => navigate(`/projects/${id}`),
          },
        ]}
      />
    </div>
  )
}
