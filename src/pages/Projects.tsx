import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import '../styles/projects.css'

type ProjectRow = {
  id: string
  project_name: string | null
  description: string | null
  status: string | null
  project_type: string | null
  funding_source: string | null
  implementing_office: string | null
  contractor: string | null
  budget: number | string | null
  start_date: string | null
  target_completion_date: string | null
  barangay: string | null
  municipality: string | null
  province: string | null
  latitude: number | string | null
  longitude: number | string | null
  physical_accomplishment: number | string | null
  financial_accomplishment: number | string | null
  risk_level: string | null
  last_inspection_date: string | null
  updated_at: string | null
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

function formatCurrency(value: unknown) {
  return (
    'Php ' +
    toNumber(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function formatCompactCurrency(value: unknown) {
  const amount = toNumber(value)
  const absAmount = Math.abs(amount)

  if (absAmount >= 1_000_000_000) {
    return `Php ${(amount / 1_000_000_000).toFixed(2)}B`
  }

  if (absAmount >= 1_000_000) {
    return `Php ${(amount / 1_000_000).toFixed(2)}M`
  }

  if (absAmount >= 1_000) {
    return `Php ${(amount / 1_000).toFixed(2)}K`
  }

  return formatCurrency(amount)
}

function formatPercent(value: unknown) {
  return `${toNumber(value).toFixed(0)}%`
}

function formatLongDate(value: string | null | undefined) {
  if (!value) return 'No date'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'No date'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusClass(status: string | null) {
  const normalized = textValue(status).toLowerCase()

  if (normalized.includes('complete')) return 'completed'
  if (normalized.includes('ongoing')) return 'ongoing'
  if (normalized.includes('not')) return 'not-started'
  if (normalized.includes('delayed')) return 'delayed'

  return 'default'
}

function getRiskClass(risk: string | null) {
  const normalized = textValue(risk).toLowerCase()

  if (normalized.includes('high')) return 'high'
  if (normalized.includes('moderate') || normalized.includes('medium')) {
    return 'moderate'
  }
  if (normalized.includes('low')) return 'low'

  return 'default'
}

function getProjectCardClass(risk: string | null) {
  const normalized = getRiskClass(risk)

  if (normalized === 'high') return 'project-card high-risk'
  if (normalized === 'moderate') return 'project-card moderate-risk'
  if (normalized === 'low') return 'project-card low-risk'

  return 'project-card'
}

export default function Projects() {
  const navigate = useNavigate()
  const { isAdmin, isEngineer } = useAuth()

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [searchTerm, setSearchTerm] = useState('')
  const [provinceFilter, setProvinceFilter] = useState('')
  const [municipalityFilter, setMunicipalityFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    try {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error

      setProjects((data || []) as ProjectRow[])
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load projects. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  function clearFilters() {
    setSearchTerm('')
    setProvinceFilter('')
    setMunicipalityFilter('')
    setProgramFilter('')
    setStatusFilter('')
    setRiskFilter('')
  }

  const provinces = useMemo(() => {
    return Array.from(
      new Set(projects.map((project) => textValue(project.province)).filter(Boolean)),
    ).sort()
  }, [projects])

  const municipalities = useMemo(() => {
    return Array.from(
      new Set(
        projects
          .filter((project) =>
            provinceFilter ? textValue(project.province) === provinceFilter : true,
          )
          .map((project) => textValue(project.municipality))
          .filter(Boolean),
      ),
    ).sort()
  }, [projects, provinceFilter])

  const programs = useMemo(() => {
    return Array.from(
      new Set(
        projects
          .map((project) => textValue(project.funding_source || project.project_type))
          .filter(Boolean),
      ),
    ).sort()
  }, [projects])

  const statuses = useMemo(() => {
    return Array.from(
      new Set(projects.map((project) => textValue(project.status)).filter(Boolean)),
    ).sort()
  }, [projects])

  const risks = useMemo(() => {
    return Array.from(
      new Set(projects.map((project) => textValue(project.risk_level)).filter(Boolean)),
    ).sort()
  }, [projects])

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const searchableText = [
        project.project_name,
        project.description,
        project.barangay,
        project.municipality,
        project.province,
        project.funding_source,
        project.project_type,
        project.status,
        project.risk_level,
        project.contractor,
      ]
        .map(textValue)
        .join(' ')
        .toLowerCase()

      const searchMatches = searchTerm.trim()
        ? searchableText.includes(searchTerm.trim().toLowerCase())
        : true

      const provinceMatches = provinceFilter
        ? textValue(project.province) === provinceFilter
        : true

      const municipalityMatches = municipalityFilter
        ? textValue(project.municipality) === municipalityFilter
        : true

      const programMatches = programFilter
        ? textValue(project.funding_source || project.project_type) === programFilter
        : true

      const statusMatches = statusFilter
        ? textValue(project.status) === statusFilter
        : true

      const riskMatches = riskFilter
        ? textValue(project.risk_level) === riskFilter
        : true

      return (
        searchMatches &&
        provinceMatches &&
        municipalityMatches &&
        programMatches &&
        statusMatches &&
        riskMatches
      )
    })
  }, [
    projects,
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    statusFilter,
    riskFilter,
  ])

  const totalCost = useMemo(() => {
    return filteredProjects.reduce((sum, project) => sum + toNumber(project.budget), 0)
  }, [filteredProjects])

  const notStartedCount = filteredProjects.filter((project) =>
    textValue(project.status).toLowerCase().includes('not'),
  ).length

  const ongoingCount = filteredProjects.filter((project) =>
    textValue(project.status).toLowerCase().includes('ongoing'),
  ).length

  const completedCount = filteredProjects.filter((project) =>
    textValue(project.status).toLowerCase().includes('complete'),
  ).length

  const highRiskCount = filteredProjects.filter((project) =>
    textValue(project.risk_level).toLowerCase().includes('high'),
  ).length

  const canUpdate = isAdmin || isEngineer

  if (loading) {
    return (
      <div className="projects-page">
        <div className="projects-loading-card">
          <div className="projects-loader" />
          <h2>Loading Projects</h2>
          <p>Preparing project cards...</p>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="projects-page">
        <div className="projects-error-card">
          <h2>Projects Error</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={loadProjects}>
            Reload Projects
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="projects-page">
      <section className="projects-hero">
        <div>
          <p className="projects-eyebrow">Project Register</p>
          <h1>Projects</h1>
          <p>
            Mobile-first project monitoring cards for field inspection, validation,
            and progress tracking.
          </p>
        </div>

        <div className="projects-hero-actions">
          <button type="button" className="projects-refresh-btn" onClick={loadProjects}>
            Refresh
          </button>

          {isAdmin && (
            <button
              type="button"
              className="projects-add-btn"
              onClick={() => navigate('/projects/create')}
            >
              Add Project
            </button>
          )}
        </div>
      </section>

      <section className="projects-summary-grid">
        <div className="projects-summary-card">
          <span>Total Projects</span>
          <strong>{filteredProjects.length}</strong>
        </div>

        <div className="projects-summary-card gray">
          <span>Not Yet Started</span>
          <strong>{notStartedCount}</strong>
        </div>

        <div className="projects-summary-card orange">
          <span>Ongoing</span>
          <strong>{ongoingCount}</strong>
        </div>

        <div className="projects-summary-card green">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </div>

        <div className="projects-summary-card red">
          <span>High Risk</span>
          <strong>{highRiskCount}</strong>
        </div>

        <div className="projects-summary-card projects-cost-card">
          <span>Filtered Project Cost</span>
          <strong>{formatCompactCurrency(totalCost)}</strong>
        </div>
      </section>

      <section className="projects-filter-card">
        <div className="projects-filter-header">
          <div>
            <h2>Filters</h2>
            <p>Search by project name, LGU, program, contractor, status, or risk.</p>
          </div>

          <button type="button" className="projects-clear-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>

        <div className="projects-filter-grid">
          <label>
            Search
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search project, LGU, program..."
            />
          </label>

          <label>
            Province
            <select
              value={provinceFilter}
              onChange={(event) => {
                setProvinceFilter(event.target.value)
                setMunicipalityFilter('')
              }}
            >
              <option value="">All Provinces</option>
              {provinces.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </label>

          <label>
            LGU / Municipality
            <select
              value={municipalityFilter}
              onChange={(event) => setMunicipalityFilter(event.target.value)}
            >
              <option value="">All LGUs</option>
              {municipalities.map((municipality) => (
                <option key={municipality} value={municipality}>
                  {municipality}
                </option>
              ))}
            </select>
          </label>

          <label>
            Program
            <select
              value={programFilter}
              onChange={(event) => setProgramFilter(event.target.value)}
            >
              <option value="">All Programs</option>
              {programs.map((program) => (
                <option key={program} value={program}>
                  {program}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All Status</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            Risk
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
            >
              <option value="">All Risk Levels</option>
              {risks.map((risk) => (
                <option key={risk} value={risk}>
                  {risk}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="projects-list-card">
        <div className="projects-list-header">
          <div>
            <h2>Project Cards</h2>
            <p>
              Showing {filteredProjects.length} of {projects.length} project records.
            </p>
          </div>

          <span className="projects-count-pill">{filteredProjects.length} records</span>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="projects-empty">
            <h3>No projects found</h3>
            <p>Adjust the filters or clear all filters to show available projects.</p>
          </div>
        ) : (
          <div className="projects-card-grid">
            {filteredProjects.map((project) => {
              const physical = Math.min(100, Math.max(0, toNumber(project.physical_accomplishment)))
              const financial = Math.min(100, Math.max(0, toNumber(project.financial_accomplishment)))

              return (
                <article key={project.id} className={getProjectCardClass(project.risk_level)}>
                  <div className="project-card-header">
                    <div>
                      <p className="project-location">
                        {textValue(project.province) || 'No Province'}
                      </p>
                      <h3>{textValue(project.project_name) || 'Untitled Project'}</h3>
                    </div>

                    <div className="project-badges">
                      <span className={`project-status ${getStatusClass(project.status)}`}>
                        {textValue(project.status) || 'No Status'}
                      </span>
                      <span className={`project-risk ${getRiskClass(project.risk_level)}`}>
                        {textValue(project.risk_level) || 'No Risk'}
                      </span>
                    </div>
                  </div>

                  <div className="project-info-grid">
                    <div className="project-info-item">
                      <span>Program</span>
                      <strong>
                        {textValue(project.funding_source || project.project_type) || '-'}
                      </strong>
                    </div>

                    <div className="project-info-item">
                      <span>Project Type</span>
                      <strong>{textValue(project.project_type) || '-'}</strong>
                    </div>

                    <div className="project-info-item">
                      <span>Location</span>
                      <strong>
                        {textValue(project.barangay) || 'No Barangay'},{' '}
                        {textValue(project.municipality) || 'No Municipality'}
                      </strong>
                    </div>

                    <div className="project-info-item">
                      <span>Project Cost</span>
                      <strong>{formatCurrency(project.budget)}</strong>
                    </div>
                  </div>

                  <div className="project-progress-group">
                    <div className="project-progress-row">
                      <div className="project-progress-label">
                        <span>Physical Accomplishment</span>
                        <strong>{formatPercent(physical)}</strong>
                      </div>
                      <div className="project-progress-track">
                        <div
                          className="project-progress-fill"
                          style={{ width: `${physical}%` }}
                        />
                      </div>
                    </div>

                    <div className="project-progress-row">
                      <div className="project-progress-label">
                        <span>Financial Accomplishment</span>
                        <strong>{formatPercent(financial)}</strong>
                      </div>
                      <div className="project-progress-track">
                        <div
                          className="project-progress-fill financial"
                          style={{ width: `${financial}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="project-last-inspection">
                    <span>Last Inspection</span>
                    <strong>{formatLongDate(project.last_inspection_date)}</strong>
                  </div>

                  <div className="project-actions">
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      View Details
                    </button>

                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${project.id}/updates`)}
                      >
                        Update
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}