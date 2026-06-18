import { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import '../styles/reports.css'

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
  return `${toNumber(value).toFixed(2)}%`
}

function formatLongDate(value: string | null | undefined) {
  if (!value) return 'No date'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'No date'

  return date.toLocaleDateString('en-US', {
    month: 'long',
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

function cleanFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').toLowerCase()
}

export default function Reports() {
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
      setErrorMessage('Unable to load report data. Please check your connection and try again.')
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
        project.implementing_office,
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

  const totalProjectCost = useMemo(() => {
    return filteredProjects.reduce((sum, project) => {
      return sum + toNumber(project.budget)
    }, 0)
  }, [filteredProjects])

  const completedCount = useMemo(() => {
    return filteredProjects.filter((project) =>
      textValue(project.status).toLowerCase().includes('complete'),
    ).length
  }, [filteredProjects])

  const ongoingCount = useMemo(() => {
    return filteredProjects.filter((project) =>
      textValue(project.status).toLowerCase().includes('ongoing'),
    ).length
  }, [filteredProjects])

  const highRiskCount = useMemo(() => {
    return filteredProjects.filter((project) =>
      textValue(project.risk_level).toLowerCase().includes('high'),
    ).length
  }, [filteredProjects])

  const activeFilterCount = [
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    statusFilter,
    riskFilter,
  ].filter(Boolean).length

  function generatePdfReport() {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    const generatedDate = formatLongDate(new Date().toISOString())
    const title = 'DILG-PDMU Project Monitoring Report'

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(title, 14, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Department of the Interior and Local Government Region X', 14, 22)
    doc.text('Project Development and Management Unit', 14, 27)
    doc.text(`Generated: ${generatedDate}`, 14, 32)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Projects Found: ${filteredProjects.length}`, 14, 41)
    doc.text(`Total Project Cost: ${formatCurrency(totalProjectCost)}`, 66, 41)
    doc.text(`Completed: ${completedCount}`, 150, 41)
    doc.text(`Ongoing: ${ongoingCount}`, 190, 41)
    doc.text(`High Risk: ${highRiskCount}`, 230, 41)

    autoTable(doc, {
      startY: 48,
      head: [
        [
          'Project',
          'Province',
          'Municipality',
          'Barangay',
          'Funding Source',
          'Cost',
          'Status',
          'Risk',
          'Physical',
          'Financial',
          'Last Inspection',
        ],
      ],
      body: filteredProjects.map((project) => [
        textValue(project.project_name) || 'Untitled Project',
        textValue(project.province) || '-',
        textValue(project.municipality) || '-',
        textValue(project.barangay) || '-',
        textValue(project.funding_source || project.project_type) || '-',
        formatCurrency(project.budget),
        textValue(project.status) || '-',
        textValue(project.risk_level) || '-',
        formatPercent(project.physical_accomplishment),
        formatPercent(project.financial_accomplishment),
        formatLongDate(project.last_inspection_date),
      ]),
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [11, 55, 105],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250],
      },
      columnStyles: {
        0: { cellWidth: 45 },
        4: { cellWidth: 32 },
        5: { cellWidth: 28 },
      },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages()
        const pageSize = doc.internal.pageSize
        const pageWidth = pageSize.getWidth()
        const pageHeight = pageSize.getHeight()

        doc.setFontSize(8)
        doc.setTextColor(100)
        doc.text(
          `Page ${doc.getCurrentPageInfo().pageNumber} of ${pageCount}`,
          pageWidth - 34,
          pageHeight - 8,
        )
      },
    })

    doc.save(`${cleanFilename(title)}.pdf`)
  }

  function exportExcelReport() {
    const rows = filteredProjects.map((project) => ({
      Project: textValue(project.project_name) || 'Untitled Project',
      Description: textValue(project.description),
      Province: textValue(project.province),
      Municipality: textValue(project.municipality),
      Barangay: textValue(project.barangay),
      'Funding Source': textValue(project.funding_source),
      'Project Type': textValue(project.project_type),
      'Implementing Office': textValue(project.implementing_office),
      Contractor: textValue(project.contractor),
      'Project Cost': toNumber(project.budget),
      Status: textValue(project.status),
      'Risk Level': textValue(project.risk_level),
      'Physical Accomplishment': toNumber(project.physical_accomplishment),
      'Financial Accomplishment': toNumber(project.financial_accomplishment),
      'Start Date': formatLongDate(project.start_date),
      'Target Completion Date': formatLongDate(project.target_completion_date),
      'Last Inspection Date': formatLongDate(project.last_inspection_date),
      Latitude: textValue(project.latitude),
      Longitude: textValue(project.longitude),
    }))

    const summaryRows = [
      ['DILG-PDMU Project Monitoring Report'],
      ['Generated', formatLongDate(new Date().toISOString())],
      ['Projects Found', filteredProjects.length],
      ['Total Project Cost', totalProjectCost],
      ['Completed', completedCount],
      ['Ongoing', ongoingCount],
      ['High Risk', highRiskCount],
      [],
    ]

    const workbook = XLSX.utils.book_new()
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
    const dataSheet = XLSX.utils.json_to_sheet(rows)

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Projects')

    XLSX.writeFile(workbook, 'dilg-pdmu-project-monitoring-report.xlsx')
  }

  if (loading) {
    return (
      <div className="reports-page">
        <div className="reports-loading-card">
          <div className="reports-loader" />
          <h2>Loading Reports</h2>
          <p>Preparing project monitoring data...</p>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="reports-page">
        <div className="reports-error-card">
          <h2>Reports Error</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={loadProjects}>
            Reload Reports
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="reports-page">
      <section className="reports-hero">
        <div>
          <p className="reports-eyebrow">Reports Module</p>
          <h1>Project Reports</h1>
          <p>
            Generate project monitoring reports by province, LGU, funding source,
            implementation status, and risk level.
          </p>
        </div>

        <div className="reports-hero-actions">
          <button type="button" onClick={generatePdfReport}>
            Generate PDF
          </button>
          <button type="button" onClick={exportExcelReport}>
            Export Excel
          </button>
        </div>
      </section>

      <section className="reports-filter-card">
        <div className="reports-search-field">
          <label htmlFor="reports-search">Search</label>
          <input
            id="reports-search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search project, barangay, LGU, contractor, program..."
          />
        </div>

        <div className="reports-filter-grid">
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
            Municipality / LGU
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
            Program / Funding Source
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
            Risk Level
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

          <button type="button" className="reports-clear-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>

        <div className="reports-filter-footer">
          <span>{activeFilterCount} active filter/s</span>
          <span>{filteredProjects.length} project/s matched</span>
        </div>
      </section>

      <section className="reports-summary-grid">
        <div className="reports-summary-card">
          <span>Projects Found</span>
          <strong>{filteredProjects.length}</strong>
        </div>

        <div
          className="reports-summary-card reports-cost-card"
          title={formatCurrency(totalProjectCost)}
        >
          <span>Total Project Cost</span>
          <strong>{formatCompactCurrency(totalProjectCost)}</strong>
        </div>

        <div className="reports-summary-card">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </div>

        <div className="reports-summary-card">
          <span>Ongoing</span>
          <strong>{ongoingCount}</strong>
        </div>

        <div className="reports-summary-card">
          <span>High Risk</span>
          <strong>{highRiskCount}</strong>
        </div>
      </section>

      <section className="reports-table-card">
        <div className="reports-table-header">
          <div>
            <h2>Report Results</h2>
            <p>
              Showing {filteredProjects.length} of {projects.length} total project/s.
            </p>
          </div>

          <button type="button" onClick={loadProjects}>
            Refresh Data
          </button>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="reports-empty">
            <h3>No projects found</h3>
            <p>Adjust your filters or clear all filters to show available records.</p>
            <button type="button" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        ) : (
          <>
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Location</th>
                    <th>Funding Source</th>
                    <th>Project Cost</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Physical</th>
                    <th>Financial</th>
                    <th>Last Inspection</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProjects.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <strong>{textValue(project.project_name) || 'Untitled Project'}</strong>
                        <span>{textValue(project.project_type) || 'No project type'}</span>
                      </td>
                      <td>
                        <strong>
                          {textValue(project.municipality) || 'No Municipality'}
                        </strong>
                        <span>
                          {textValue(project.barangay) || 'No Barangay'},{' '}
                          {textValue(project.province) || 'No Province'}
                        </span>
                      </td>
                      <td>{textValue(project.funding_source) || '-'}</td>
                      <td>{formatCurrency(project.budget)}</td>
                      <td>
                        <span className={`reports-status ${getStatusClass(project.status)}`}>
                          {textValue(project.status) || 'No Status'}
                        </span>
                      </td>
                      <td>
                        <span className={`reports-risk ${getRiskClass(project.risk_level)}`}>
                          {textValue(project.risk_level) || 'No Risk'}
                        </span>
                      </td>
                      <td>{formatPercent(project.physical_accomplishment)}</td>
                      <td>{formatPercent(project.financial_accomplishment)}</td>
                      <td>{formatLongDate(project.last_inspection_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="reports-mobile-list">
              {filteredProjects.map((project) => (
                <article key={project.id} className="reports-mobile-card">
                  <div>
                    <h3>{textValue(project.project_name) || 'Untitled Project'}</h3>
                    <p>
                      {textValue(project.barangay) || 'No Barangay'},{' '}
                      {textValue(project.municipality) || 'No Municipality'},{' '}
                      {textValue(project.province) || 'No Province'}
                    </p>
                  </div>

                  <div className="reports-mobile-badges">
                    <span className={`reports-status ${getStatusClass(project.status)}`}>
                      {textValue(project.status) || 'No Status'}
                    </span>
                    <span className={`reports-risk ${getRiskClass(project.risk_level)}`}>
                      {textValue(project.risk_level) || 'No Risk'}
                    </span>
                  </div>

                  <div className="reports-mobile-grid">
                    <span>
                      <strong>Funding</strong>
                      {textValue(project.funding_source) || '-'}
                    </span>
                    <span>
                      <strong>Cost</strong>
                      {formatCurrency(project.budget)}
                    </span>
                    <span>
                      <strong>Physical</strong>
                      {formatPercent(project.physical_accomplishment)}
                    </span>
                    <span>
                      <strong>Financial</strong>
                      {formatPercent(project.financial_accomplishment)}
                    </span>
                    <span>
                      <strong>Last Inspection</strong>
                      {formatLongDate(project.last_inspection_date)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}