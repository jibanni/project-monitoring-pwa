import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import '../styles/createProject.css'

type CoordinateStatus =
  | {
      isValid: true
      latitude: number
      longitude: number
      message: string
      canSwap: false
    }
  | {
      isValid: false
      latitude: null
      longitude: null
      message: string
      canSwap: boolean
      swappedLatitude?: number
      swappedLongitude?: number
    }

type ProjectInsert = {
  project_name: string
  description: string
  status: string
  project_type: string
  funding_source: string
  implementing_office: string | null
  contractor: string | null
  budget: number
  start_date: string | null
  target_completion_date: string | null
  barangay: string
  municipality: string
  province: string
  latitude: number | null
  longitude: number | null
  physical_accomplishment: number
  financial_accomplishment: number
  risk_level: string
  last_inspection_date: string | null
  updated_at: string
}

const STATUS_OPTIONS = [
  'Not Yet Started',
  'Ongoing',
  'Completed',
  'Delayed',
  'Suspended',
]

const PROJECT_TYPE_OPTIONS = [
  'Road',
  'Bridge',
  'Water Supply',
  'Building',
  'Drainage / Flood Control',
  'Evacuation Facility',
  'Other Infrastructure',
]

const FUNDING_SOURCE_OPTIONS = [
  'RAPID Growth Project',
  'LGSF-FALGU',
  'LGSF-GEF',
  'LGSF-SBDP',
  'LGSF-SAFPB',
  'SALINTUBIG',
  'CMGP / KALSADA',
  'Other',
]

const RISK_OPTIONS = ['Low', 'Moderate', 'High']

const MINDANAO_BOUNDS = {
  minLat: 4,
  maxLat: 10.8,
  minLng: 119,
  maxLng: 127.8,
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())

  return Number.isFinite(parsed) ? parsed : 0
}

function parseCoordinate(value: string) {
  if (!value.trim()) return null

  const parsed = Number(value.replace(/,/g, '').trim())

  return Number.isFinite(parsed) ? parsed : null
}

function clampProgress(value: string) {
  const numberValue = toNumber(value)

  if (numberValue < 0) return 0
  if (numberValue > 100) return 100

  return numberValue
}

function isValidLatitude(value: number) {
  return value >= -90 && value <= 90
}

function isValidLongitude(value: number) {
  return value >= -180 && value <= 180
}

function isGloballyValidCoordinate(latitude: number, longitude: number) {
  return isValidLatitude(latitude) && isValidLongitude(longitude)
}

function isMindanaoCoordinate(latitude: number, longitude: number) {
  return (
    latitude >= MINDANAO_BOUNDS.minLat &&
    latitude <= MINDANAO_BOUNDS.maxLat &&
    longitude >= MINDANAO_BOUNDS.minLng &&
    longitude <= MINDANAO_BOUNDS.maxLng
  )
}

function getCoordinateStatus(latitudeValue: string, longitudeValue: string): CoordinateStatus {
  const hasLatitude = latitudeValue.trim().length > 0
  const hasLongitude = longitudeValue.trim().length > 0

  if (!hasLatitude && !hasLongitude) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      message: 'No coordinates provided. You may save the project without GPS and update it later during inspection.',
      canSwap: false,
    }
  }

  if (!hasLatitude || !hasLongitude) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      message: 'Latitude and longitude are both required if you want to save GPS coordinates.',
      canSwap: false,
    }
  }

  const latitude = parseCoordinate(latitudeValue)
  const longitude = parseCoordinate(longitudeValue)

  if (latitude === null || longitude === null) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      message: 'Latitude or longitude is not a valid number.',
      canSwap: false,
    }
  }

  if (latitude === 0 && longitude === 0) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      message: 'Coordinates 0,0 cannot be used.',
      canSwap: false,
    }
  }

  if (
    isGloballyValidCoordinate(latitude, longitude) &&
    isMindanaoCoordinate(latitude, longitude)
  ) {
    return {
      isValid: true,
      latitude,
      longitude,
      message: 'Coordinates are valid and inside the Mindanao map range.',
      canSwap: false,
    }
  }

  const swappedLatitude = longitude
  const swappedLongitude = latitude

  if (
    isGloballyValidCoordinate(swappedLatitude, swappedLongitude) &&
    isMindanaoCoordinate(swappedLatitude, swappedLongitude)
  ) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      message: 'Coordinates appear reversed. You can use the Swap Coordinates button.',
      canSwap: true,
      swappedLatitude,
      swappedLongitude,
    }
  }

  if (!isGloballyValidCoordinate(latitude, longitude)) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      message: 'Coordinates are outside valid latitude/longitude limits.',
      canSwap: false,
    }
  }

  return {
    isValid: false,
    latitude: null,
    longitude: null,
    message:
      'Coordinates are valid globally but outside the Mindanao range. Please verify the project location before saving.',
    canSwap: false,
  }
}

function formatCoordinate(value: number) {
  return value.toFixed(7)
}

function cleanText(value: string) {
  const cleaned = value.trim()
  return cleaned.length > 0 ? cleaned : null
}

export default function CreateProject() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [projectName, setProjectName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('Not Yet Started')
  const [projectType, setProjectType] = useState('Road')
  const [fundingSource, setFundingSource] = useState('RAPID Growth Project')
  const [implementingOffice, setImplementingOffice] = useState('')
  const [contractor, setContractor] = useState('')
  const [projectCost, setProjectCost] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetCompletionDate, setTargetCompletionDate] = useState('')
  const [barangay, setBarangay] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [province, setProvince] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [physicalAccomplishment, setPhysicalAccomplishment] = useState('0')
  const [financialAccomplishment, setFinancialAccomplishment] = useState('0')
  const [riskLevel, setRiskLevel] = useState('Low')

  const [saving, setSaving] = useState(false)
  const [gettingGps, setGettingGps] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const coordinateStatus = useMemo(() => {
    return getCoordinateStatus(latitude, longitude)
  }, [latitude, longitude])

  const canSubmit = useMemo(() => {
    return (
      textValue(projectName).length > 0 &&
      textValue(description).length > 0 &&
      textValue(status).length > 0 &&
      textValue(projectType).length > 0 &&
      textValue(fundingSource).length > 0 &&
      textValue(barangay).length > 0 &&
      textValue(municipality).length > 0 &&
      textValue(province).length > 0 &&
      !saving
    )
  }, [
    projectName,
    description,
    status,
    projectType,
    fundingSource,
    barangay,
    municipality,
    province,
    saving,
  ])

  function swapCoordinates() {
    if (!coordinateStatus.canSwap) return

    setLatitude(formatCoordinate(coordinateStatus.swappedLatitude || 0))
    setLongitude(formatCoordinate(coordinateStatus.swappedLongitude || 0))
  }

  function useCurrentGps() {
    setErrorMessage('')
    setSuccessMessage('')

    if (!navigator.geolocation) {
      setErrorMessage('GPS is not supported by this browser or device.')
      return
    }

    setGettingGps(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLatitude = position.coords.latitude
        const currentLongitude = position.coords.longitude

        if (!isMindanaoCoordinate(currentLatitude, currentLongitude)) {
          setGettingGps(false)
          setErrorMessage(
            'Current GPS was detected, but it is outside the Mindanao range. Please verify your location or enter coordinates manually.',
          )
          return
        }

        setLatitude(formatCoordinate(currentLatitude))
        setLongitude(formatCoordinate(currentLongitude))
        setGettingGps(false)
        setSuccessMessage('Current GPS coordinates were added to the project form.')
      },
      (error) => {
        let message = 'Unable to get current GPS location.'

        if (error.code === error.PERMISSION_DENIED) {
          message =
            'Location permission was denied. Please allow location access in your browser settings.'
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          message =
            'Location is currently unavailable. Please check device location services.'
        }

        if (error.code === error.TIMEOUT) {
          message = 'GPS request timed out. Please try again.'
        }

        setGettingGps(false)
        setErrorMessage(message)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setErrorMessage('')
    setSuccessMessage('')

    if (!canSubmit) {
      setErrorMessage('Please complete all required fields before saving.')
      return
    }

    const hasAnyCoordinate = latitude.trim().length > 0 || longitude.trim().length > 0

    if (hasAnyCoordinate && !coordinateStatus.isValid) {
      setErrorMessage(coordinateStatus.message)
      return
    }

    const payload: ProjectInsert = {
      project_name: projectName.trim(),
      description: description.trim(),
      status,
      project_type: projectType,
      funding_source: fundingSource,
      implementing_office: cleanText(implementingOffice),
      contractor: cleanText(contractor),
      budget: toNumber(projectCost),
      start_date: startDate || null,
      target_completion_date: targetCompletionDate || null,
      barangay: barangay.trim(),
      municipality: municipality.trim(),
      province: province.trim(),
      latitude: coordinateStatus.isValid ? coordinateStatus.latitude : null,
      longitude: coordinateStatus.isValid ? coordinateStatus.longitude : null,
      physical_accomplishment: clampProgress(physicalAccomplishment),
      financial_accomplishment: clampProgress(financialAccomplishment),
      risk_level: riskLevel,
      last_inspection_date: null,
      updated_at: new Date().toISOString(),
    }

    try {
      setSaving(true)

      const { data, error } = await supabase
        .from('projects')
        .insert(payload)
        .select('id')
        .single()

      if (error) throw error

      setSuccessMessage('Project was created successfully.')

      if (data?.id) {
        navigate(`/projects/${data.id}`, { replace: true })
      } else {
        navigate('/projects', { replace: true })
      }
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to create project. Please check the required fields and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="create-project-page">
        <section className="create-project-access-card">
          <h1>Admin Access Required</h1>
          <p>Only Admin users can create new projects.</p>
          <button type="button" onClick={() => navigate('/projects')}>
            Back to Projects
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="create-project-page">
      <section className="create-project-hero">
        <div>
          <p className="create-project-eyebrow">Project Registration</p>
          <h1>Create Project</h1>
          <p>
            Register a new DILG-PDMU monitored project with location, funding,
            implementation, progress, risk, and optional GPS coordinates.
          </p>
        </div>

        <div className="create-project-hero-actions">
          <button type="button" onClick={() => navigate('/projects')}>
            Back to Projects
          </button>
        </div>
      </section>

      {(errorMessage || successMessage) && (
        <section
          className={`create-project-alert ${errorMessage ? 'error' : 'success'}`}
        >
          {errorMessage || successMessage}
        </section>
      )}

      <form className="create-project-form" onSubmit={handleSubmit}>
        <section className="create-project-card">
          <div className="create-project-card-header">
            <div>
              <h2>Project Information</h2>
              <p>Enter the basic project details and implementation classification.</p>
            </div>
          </div>

          <div className="create-project-grid">
            <label className="span-2">
              Project Name <strong>*</strong>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Enter project name"
              />
            </label>

            <label className="span-2">
              Description <strong>*</strong>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Briefly describe the project scope"
                rows={4}
              />
            </label>

            <label>
              Status <strong>*</strong>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Project Type <strong>*</strong>
              <select
                value={projectType}
                onChange={(event) => setProjectType(event.target.value)}
              >
                {PROJECT_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Funding Source <strong>*</strong>
              <select
                value={fundingSource}
                onChange={(event) => setFundingSource(event.target.value)}
              >
                {FUNDING_SOURCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Risk Level
              <select
                value={riskLevel}
                onChange={(event) => setRiskLevel(event.target.value)}
              >
                {RISK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Implementing Office
              <input
                value={implementingOffice}
                onChange={(event) => setImplementingOffice(event.target.value)}
                placeholder="Example: LGU / City Engineering Office"
              />
            </label>

            <label>
              Contractor
              <input
                value={contractor}
                onChange={(event) => setContractor(event.target.value)}
                placeholder="Enter contractor name if available"
              />
            </label>
          </div>
        </section>

        <section className="create-project-card">
          <div className="create-project-card-header">
            <div>
              <h2>Location and GPS</h2>
              <p>
                Coordinates are optional during creation. Invalid or out-of-Mindanao
                coordinates will not be saved.
              </p>
            </div>

            <button
              type="button"
              className="create-project-secondary-btn"
              onClick={useCurrentGps}
              disabled={gettingGps}
            >
              {gettingGps ? 'Getting GPS...' : 'Use Current GPS'}
            </button>
          </div>

          <div className="create-project-grid">
            <label>
              Province <strong>*</strong>
              <input
                value={province}
                onChange={(event) => setProvince(event.target.value)}
                placeholder="Example: Bukidnon"
              />
            </label>

            <label>
              Municipality / LGU <strong>*</strong>
              <input
                value={municipality}
                onChange={(event) => setMunicipality(event.target.value)}
                placeholder="Example: Quezon"
              />
            </label>

            <label>
              Barangay <strong>*</strong>
              <input
                value={barangay}
                onChange={(event) => setBarangay(event.target.value)}
                placeholder="Example: Santo Niño"
              />
            </label>

            <div className="create-project-location-note">
              <strong>Mindanao GPS Range</strong>
              <span>Latitude: 4 to 10.8</span>
              <span>Longitude: 119 to 127.8</span>
            </div>

            <label>
              Latitude
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="Example: 7.9000000"
                inputMode="decimal"
              />
            </label>

            <label>
              Longitude
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="Example: 124.9000000"
                inputMode="decimal"
              />
            </label>
          </div>

          <div
            className={`create-project-coordinate-status ${
              coordinateStatus.isValid ? 'valid' : 'warning'
            }`}
          >
            <div>
              <strong>{coordinateStatus.isValid ? 'GPS Ready' : 'GPS Notice'}</strong>
              <p>{coordinateStatus.message}</p>
            </div>

            {coordinateStatus.canSwap && (
              <button type="button" onClick={swapCoordinates}>
                Swap Coordinates
              </button>
            )}
          </div>
        </section>

        <section className="create-project-card">
          <div className="create-project-card-header">
            <div>
              <h2>Cost, Schedule, and Progress</h2>
              <p>Set the initial project cost, dates, and accomplishment values.</p>
            </div>
          </div>

          <div className="create-project-grid">
            <label>
              Project Cost
              <input
                value={projectCost}
                onChange={(event) => setProjectCost(event.target.value)}
                placeholder="Example: 10000000"
                inputMode="decimal"
              />
            </label>

            <label>
              Start Date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label>
              Target Completion Date
              <input
                type="date"
                value={targetCompletionDate}
                onChange={(event) => setTargetCompletionDate(event.target.value)}
              />
            </label>

            <div className="create-project-progress-note">
              <strong>Initial Accomplishment</strong>
              <span>Use 0% for new projects that have not yet started.</span>
            </div>

            <label>
              Physical Accomplishment
              <input
                value={physicalAccomplishment}
                onChange={(event) => setPhysicalAccomplishment(event.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
            </label>

            <label>
              Financial Accomplishment
              <input
                value={financialAccomplishment}
                onChange={(event) => setFinancialAccomplishment(event.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
            </label>
          </div>
        </section>

        <section className="create-project-actions-card">
          <div>
            <h2>Ready to Save?</h2>
            <p>Review the required fields before creating the project record.</p>
          </div>

          <div className="create-project-actions">
            <button
              type="button"
              className="create-project-cancel-btn"
              onClick={() => navigate('/projects')}
              disabled={saving}
            >
              Cancel
            </button>

            <button type="submit" className="create-project-submit-btn" disabled={!canSubmit}>
              {saving ? 'Saving Project...' : 'Save Project'}
            </button>
          </div>
        </section>
      </form>
    </div>
  )
}