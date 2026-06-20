import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import '../styles/editProject.css'
import '../styles/pageHero.css'

const MINDANAO_BOUNDS = {
  minLat: 4,
  maxLat: 10.8,
  minLng: 119,
  maxLng: 127.8,
}

type ProjectForm = {
  project_name: string
  description: string
  status: string
  project_type: string
  funding_source: string
  implementing_office: string
  contractor: string
  budget: string
  start_date: string
  target_completion_date: string
  barangay: string
  municipality: string
  province: string
  latitude: string
  longitude: string
  physical_accomplishment: string
  financial_accomplishment: string
  risk_level: string
  last_inspection_date: string
}

type CoordinateStatus = {
  state: 'blank' | 'valid' | 'invalid' | 'reversed'
  message: string
  latitude: number | null
  longitude: number | null
  canSwap: boolean
}

const emptyForm: ProjectForm = {
  project_name: '',
  description: '',
  status: 'Not Yet Started',
  project_type: '',
  funding_source: '',
  implementing_office: '',
  contractor: '',
  budget: '',
  start_date: '',
  target_completion_date: '',
  barangay: '',
  municipality: '',
  province: '',
  latitude: '',
  longitude: '',
  physical_accomplishment: '0',
  financial_accomplishment: '0',
  risk_level: 'Low',
  last_inspection_date: '',
}

const statusOptions = [
  'Not Yet Started',
  'Ongoing',
  'Completed',
  'Suspended',
  'Cancelled',
  'Terminated',
]

const riskOptions = ['Low', 'Moderate', 'High']

function cleanText(value: string) {
  const cleaned = value.trim()
  return cleaned.length > 0 ? cleaned : null
}

function dateInputValue(value: unknown) {
  if (!value || typeof value !== 'string') return ''
  return value.slice(0, 10)
}

function numberInputValue(value: unknown) {
  if (value === null || value === undefined) return ''
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? String(numericValue) : ''
}

function toNullableNumber(value: string) {
  const cleaned = value.trim()

  if (!cleaned) return null

  const numericValue = Number(cleaned)

  if (!Number.isFinite(numericValue)) return null

  return numericValue
}

function clampProgress(value: string) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return 0

  return Math.min(100, Math.max(0, numericValue))
}

function isWithinMindanao(latitude: number, longitude: number) {
  return (
    latitude >= MINDANAO_BOUNDS.minLat &&
    latitude <= MINDANAO_BOUNDS.maxLat &&
    longitude >= MINDANAO_BOUNDS.minLng &&
    longitude <= MINDANAO_BOUNDS.maxLng
  )
}

function analyzeCoordinates(latitudeValue: string, longitudeValue: string): CoordinateStatus {
  const latitudeText = latitudeValue.trim()
  const longitudeText = longitudeValue.trim()

  if (!latitudeText && !longitudeText) {
    return {
      state: 'blank',
      message: 'GPS is optional. Leave both fields blank if no coordinate is available.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  if (!latitudeText || !longitudeText) {
    return {
      state: 'invalid',
      message: 'Both latitude and longitude are required when adding GPS coordinates.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  const latitude = Number(latitudeText)
  const longitude = Number(longitudeText)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      state: 'invalid',
      message: 'Latitude and longitude must be valid numbers.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  if (latitude === 0 && longitude === 0) {
    return {
      state: 'invalid',
      message: 'Coordinates 0, 0 are invalid.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  if (isWithinMindanao(latitude, longitude)) {
    return {
      state: 'valid',
      message: 'GPS coordinate is valid and within Mindanao.',
      latitude,
      longitude,
      canSwap: false,
    }
  }

  if (isWithinMindanao(longitude, latitude)) {
    return {
      state: 'reversed',
      message: 'The coordinates appear reversed. Use Swap Coordinates before saving.',
      latitude: null,
      longitude: null,
      canSwap: true,
    }
  }

  return {
    state: 'invalid',
    message: 'GPS coordinate is outside the allowed Mindanao range.',
    latitude: null,
    longitude: null,
    canSwap: false,
  }
}

function formatPhp(value: string) {
  const amount = Number(value)

  if (!Number.isFinite(amount) || amount <= 0) return 'Php 0.00'

  return `Php ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(value: string) {
  const amount = clampProgress(value)

  return `${amount.toLocaleString('en-PH', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`
}


function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
      <path d="M9 12h10" />
    </svg>
  )
}

function IconDetails() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2.75h8.1L19 7.65V21.25H6V2.75Z" />
      <path d="M14 2.75V8h5" />
      <path d="M8.8 12h6.4" />
      <path d="M8.8 15.1h6.4" />
      <path d="M8.8 18.2h4.6" />
    </svg>
  )
}

export default function EditProject() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [portalReady, setPortalReady] = useState(false)

  const coordinateStatus = useMemo(
    () => analyzeCoordinates(form.latitude, form.longitude),
    [form.latitude, form.longitude]
  )

  const mergedStatusOptions = useMemo(() => {
    if (!form.status || statusOptions.includes(form.status)) return statusOptions
    return [form.status, ...statusOptions]
  }, [form.status])

  const mergedRiskOptions = useMemo(() => {
    if (!form.risk_level || riskOptions.includes(form.risk_level)) return riskOptions
    return [form.risk_level, ...riskOptions]
  }, [form.risk_level])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      navigate('/unauthorized', { replace: true })
      return
    }

    loadProject()
  }, [id, isAdmin, navigate])

  async function loadProject() {
    if (!id) {
      setPageError('Missing project ID.')
      setLoading(false)
      return
    }

    setLoading(true)
    setPageError('')
    setSuccessMessage('')

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      setPageError(error.message || 'Unable to load project details.')
      setLoading(false)
      return
    }

    if (!data) {
      setPageError('Project record was not found.')
      setLoading(false)
      return
    }

    setForm({
      project_name: data.project_name || '',
      description: data.description || '',
      status: data.status || 'Not Yet Started',
      project_type: data.project_type || '',
      funding_source: data.funding_source || '',
      implementing_office: data.implementing_office || '',
      contractor: data.contractor || '',
      budget: numberInputValue(data.budget),
      start_date: dateInputValue(data.start_date),
      target_completion_date: dateInputValue(data.target_completion_date),
      barangay: data.barangay || '',
      municipality: data.municipality || '',
      province: data.province || '',
      latitude: numberInputValue(data.latitude),
      longitude: numberInputValue(data.longitude),
      physical_accomplishment: numberInputValue(data.physical_accomplishment) || '0',
      financial_accomplishment: numberInputValue(data.financial_accomplishment) || '0',
      risk_level: data.risk_level || 'Low',
      last_inspection_date: dateInputValue(data.last_inspection_date),
    })

    setLoading(false)
  }

  function updateField(field: keyof ProjectForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))

    if (pageError) setPageError('')
    if (successMessage) setSuccessMessage('')
  }

  function swapCoordinates() {
    setForm((current) => ({
      ...current,
      latitude: current.longitude,
      longitude: current.latitude,
    }))
  }

  function validateForm() {
    if (!cleanText(form.project_name)) {
      return 'Project name is required.'
    }

    if (!cleanText(form.status)) {
      return 'Project status is required.'
    }

    if (!cleanText(form.risk_level)) {
      return 'Risk level is required.'
    }

    if (form.budget.trim()) {
      const amount = Number(form.budget)

      if (!Number.isFinite(amount) || amount < 0) {
        return 'Project Cost must be a valid amount.'
      }
    }

    const physicalValue = Number(form.physical_accomplishment)
    const financialValue = Number(form.financial_accomplishment)

    if (!Number.isFinite(physicalValue) || physicalValue < 0 || physicalValue > 100) {
      return 'Physical accomplishment must be from 0 to 100.'
    }

    if (!Number.isFinite(financialValue) || financialValue < 0 || financialValue > 100) {
      return 'Financial accomplishment must be from 0 to 100.'
    }

    if (coordinateStatus.state === 'invalid' || coordinateStatus.state === 'reversed') {
      return coordinateStatus.message
    }

    return ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!id) {
      setPageError('Missing project ID.')
      return
    }

    const validationError = validateForm()

    if (validationError) {
      setPageError(validationError)
      return
    }

    setSaving(true)
    setPageError('')
    setSuccessMessage('')

    const updatePayload = {
      project_name: cleanText(form.project_name) || 'Untitled Project',
      description: cleanText(form.description),
      status: cleanText(form.status) || 'Not Yet Started',
      project_type: cleanText(form.project_type),
      funding_source: cleanText(form.funding_source),
      implementing_office: cleanText(form.implementing_office),
      contractor: cleanText(form.contractor),
      budget: toNullableNumber(form.budget) ?? 0,
      start_date: cleanText(form.start_date),
      target_completion_date: cleanText(form.target_completion_date),
      barangay: cleanText(form.barangay),
      municipality: cleanText(form.municipality),
      province: cleanText(form.province),
      latitude: coordinateStatus.state === 'valid' ? coordinateStatus.latitude : null,
      longitude: coordinateStatus.state === 'valid' ? coordinateStatus.longitude : null,
      physical_accomplishment: clampProgress(form.physical_accomplishment),
      financial_accomplishment: clampProgress(form.financial_accomplishment),
      risk_level: cleanText(form.risk_level) || 'Low',
      last_inspection_date: cleanText(form.last_inspection_date),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      setPageError(error.message || 'Unable to update project.')
      setSaving(false)
      return
    }

    setSuccessMessage('Project details were updated successfully.')

    setTimeout(() => {
      navigate(`/projects/${id}`)
    }, 700)
  }

  if (!isAdmin) {
    return null
  }

  if (loading) {
    return (
      <main className="edit-project-page">
        <section className="edit-project-hero">
          <div className="edit-project-hero-content">
            <p className="edit-project-eyebrow">Project Administration</p>
            <h1>Edit Project</h1>
            <p>Loading enrolled project details from the project register.</p>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-loading">
            <div className="edit-project-loader" />
            <p>Loading project record...</p>
          </div>
        </section>
      </main>
    )
  }

  if (pageError && !form.project_name) {
    return (
      <main className="edit-project-page">
        <section className="edit-project-hero">
          <div className="edit-project-hero-content">
            <p className="edit-project-eyebrow">Project Administration</p>
            <h1>Edit Project</h1>
            <p>Review and update enrolled project details.</p>
          </div>

          <div className="edit-project-hero-actions">
            <Link to="/projects" className="edit-project-button edit-project-button-secondary">
              Back to Projects
            </Link>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-alert edit-project-alert-error">{pageError}</div>
        </section>
      </main>
    )
  }

  return (
    <main className="edit-project-page">
      <section className="edit-project-hero">
        <div className="edit-project-hero-content">
          <p className="edit-project-eyebrow">Project Administration</p>
          <h1>Edit Project</h1>
          <p>
            Update all enrolled project details including implementation profile, project cost,
            progress, risk level, inspection date, location, and GPS coordinates.
          </p>
        </div>

      </section>

      <section className="edit-project-summary-grid">
        <div className="edit-project-summary-card">
          <span>Project Status</span>
          <strong>{form.status || 'Not Set'}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Risk Level</span>
          <strong>{form.risk_level || 'Not Set'}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Project Cost</span>
          <strong>{formatPhp(form.budget)}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Physical</span>
          <strong>{formatPercent(form.physical_accomplishment)}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Financial</span>
          <strong>{formatPercent(form.financial_accomplishment)}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Last Inspection</span>
          <strong>{form.last_inspection_date || 'No Date'}</strong>
        </div>
      </section>

      <form className="edit-project-form" onSubmit={handleSubmit}>
        {pageError && <div className="edit-project-alert edit-project-alert-error">{pageError}</div>}
        {successMessage && (
          <div className="edit-project-alert edit-project-alert-success">{successMessage}</div>
        )}

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Basic Information</p>
              <h2>Project Profile</h2>
            </div>

            <span className="edit-project-section-badge">Admin Editable</span>
          </div>

          <div className="edit-project-grid">
            <label className="edit-project-field edit-project-field-wide">
              <span>Project Name</span>
              <input
                type="text"
                value={form.project_name}
                onChange={(event) => updateField('project_name', event.target.value)}
                placeholder="Enter project name"
                required
              />
            </label>

            <label className="edit-project-field edit-project-field-wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Enter project description"
                rows={4}
              />
            </label>

            <label className="edit-project-field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                required
              >
                {mergedStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="edit-project-field">
              <span>Risk Level</span>
              <select
                value={form.risk_level}
                onChange={(event) => updateField('risk_level', event.target.value)}
                required
              >
                {mergedRiskOptions.map((risk) => (
                  <option key={risk} value={risk}>
                    {risk}
                  </option>
                ))}
              </select>
            </label>

            <label className="edit-project-field">
              <span>Project Type</span>
              <input
                type="text"
                value={form.project_type}
                onChange={(event) => updateField('project_type', event.target.value)}
                placeholder="Road, Water System, Building, etc."
              />
            </label>

            <label className="edit-project-field">
              <span>Funding Source / Program</span>
              <input
                type="text"
                value={form.funding_source}
                onChange={(event) => updateField('funding_source', event.target.value)}
                placeholder="LGSF-FALGU, SBDP, SAFPB, etc."
              />
            </label>

            <label className="edit-project-field">
              <span>Implementing Office</span>
              <input
                type="text"
                value={form.implementing_office}
                onChange={(event) => updateField('implementing_office', event.target.value)}
                placeholder="Enter implementing office"
              />
            </label>

            <label className="edit-project-field">
              <span>Contractor</span>
              <input
                type="text"
                value={form.contractor}
                onChange={(event) => updateField('contractor', event.target.value)}
                placeholder="Enter contractor name"
              />
            </label>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Financial and Schedule</p>
              <h2>Project Cost and Dates</h2>
            </div>

            <div className="edit-project-cost-pill">{formatPhp(form.budget)}</div>
          </div>

          <div className="edit-project-grid">
            <label className="edit-project-field">
              <span>Project Cost</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.budget}
                onChange={(event) => updateField('budget', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="edit-project-field">
              <span>Start Date</span>
              <input
                type="date"
                value={form.start_date}
                onChange={(event) => updateField('start_date', event.target.value)}
              />
            </label>

            <label className="edit-project-field">
              <span>Target Completion Date</span>
              <input
                type="date"
                value={form.target_completion_date}
                onChange={(event) => updateField('target_completion_date', event.target.value)}
              />
            </label>

            <label className="edit-project-field">
              <span>Last Inspection Date</span>
              <input
                type="date"
                value={form.last_inspection_date}
                onChange={(event) => updateField('last_inspection_date', event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Progress Monitoring</p>
              <h2>Accomplishment</h2>
            </div>
          </div>

          <div className="edit-project-progress-grid">
            <label className="edit-project-progress-card">
              <div className="edit-project-progress-header">
                <span>Physical Accomplishment</span>
                <strong>{formatPercent(form.physical_accomplishment)}</strong>
              </div>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.physical_accomplishment}
                onChange={(event) => updateField('physical_accomplishment', event.target.value)}
                placeholder="0"
              />

              <div className="edit-project-progress-track">
                <div
                  className="edit-project-progress-fill"
                  style={{ width: `${clampProgress(form.physical_accomplishment)}%` }}
                />
              </div>
            </label>

            <label className="edit-project-progress-card">
              <div className="edit-project-progress-header">
                <span>Financial Accomplishment</span>
                <strong>{formatPercent(form.financial_accomplishment)}</strong>
              </div>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.financial_accomplishment}
                onChange={(event) => updateField('financial_accomplishment', event.target.value)}
                placeholder="0"
              />

              <div className="edit-project-progress-track">
                <div
                  className="edit-project-progress-fill"
                  style={{ width: `${clampProgress(form.financial_accomplishment)}%` }}
                />
              </div>
            </label>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Location</p>
              <h2>Project Location</h2>
            </div>
          </div>

          <div className="edit-project-grid">
            <label className="edit-project-field">
              <span>Province</span>
              <input
                type="text"
                value={form.province}
                onChange={(event) => updateField('province', event.target.value)}
                placeholder="Enter province"
              />
            </label>

            <label className="edit-project-field">
              <span>Municipality / City</span>
              <input
                type="text"
                value={form.municipality}
                onChange={(event) => updateField('municipality', event.target.value)}
                placeholder="Enter municipality or city"
              />
            </label>

            <label className="edit-project-field">
              <span>Barangay</span>
              <input
                type="text"
                value={form.barangay}
                onChange={(event) => updateField('barangay', event.target.value)}
                placeholder="Enter barangay"
              />
            </label>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>GIS Reference</p>
              <h2>Project Coordinates</h2>
            </div>

            {coordinateStatus.canSwap && (
              <button
                type="button"
                className="edit-project-button edit-project-button-warning"
                onClick={swapCoordinates}
              >
                Swap Coordinates
              </button>
            )}
          </div>

          <div className="edit-project-gps-box">
            <div className="edit-project-grid">
              <label className="edit-project-field">
                <span>Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(event) => updateField('latitude', event.target.value)}
                  placeholder="Example: 8.4542"
                />
              </label>

              <label className="edit-project-field">
                <span>Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(event) => updateField('longitude', event.target.value)}
                  placeholder="Example: 124.6319"
                />
              </label>
            </div>

            <div
              className={[
                'edit-project-coordinate-status',
                coordinateStatus.state === 'valid' ? 'edit-project-coordinate-valid' : '',
                coordinateStatus.state === 'invalid' || coordinateStatus.state === 'reversed'
                  ? 'edit-project-coordinate-invalid'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <strong>
                {coordinateStatus.state === 'valid'
                  ? 'Valid GPS'
                  : coordinateStatus.state === 'reversed'
                    ? 'Possible Reversed GPS'
                    : coordinateStatus.state === 'invalid'
                      ? 'Invalid GPS'
                      : 'Optional GPS'}
              </strong>
              <span>{coordinateStatus.message}</span>
            </div>
          </div>
        </section>

        <div className="edit-project-sticky-actions">
          <div>
            <span>Editing enrolled project record</span>
            <strong>{form.project_name || 'Untitled Project'}</strong>
          </div>

          <div className="edit-project-action-group">
            <Link
              to={`/projects/${id}`}
              className="edit-project-button edit-project-button-secondary"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="edit-project-button edit-project-button-primary"
              disabled={saving}
            >
              {saving ? 'Saving Changes...' : 'Save Project Changes'}
            </button>
          </div>
        </div>
      </form>

      {portalReady
        ? createPortal(
            <div className="edit-project-fab-stack" aria-label="Edit project quick actions">
              <button
                type="button"
                className="edit-project-fab edit-project-fab-back"
                onClick={() => navigate('/projects')}
                aria-label="Back to projects"
                title="Back to Projects"
              >
                <IconBack />
              </button>

              <button
                type="button"
                className="edit-project-fab edit-project-fab-details"
                onClick={() => navigate(`/projects/${id}`)}
                aria-label="View project details"
                title="View Details"
              >
                <IconDetails />
              </button>
            </div>,
            document.body,
          )
        : null}
    </main>
  )
}
