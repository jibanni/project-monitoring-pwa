import { getPmsProjectStatus, getPmsRiskLevel } from './projectStatus'
import { isProjectEligibleForAggregatePerformance } from './projectMetricEligibility'

type ProjectRecord = Record<string, any>

export type ExecutiveDashboardPdfOptions = {
  area: string
  program: string
  fundingYears: string[]
  dataSource: 'official' | 'onsite'
  generatedAt?: Date
}

type StatusBucket = 'Completed' | 'Ongoing' | 'Not Yet Started' | 'Other'

type Summary = {
  province: string
  lgu: string
  projects: ProjectRecord[]
  barangays: number
  completed: number
  ongoing: number
  notStarted: number
  other: number
}

const PAGE: [number, number] = [215.9, 330.2] // Folio landscape, matching other PMS10 report exports.
const MARGIN = 12
const NAVY: [number, number, number] = [13, 50, 92]
const GREEN: [number, number, number] = [26, 154, 91]
const RED: [number, number, number] = [221, 53, 62]
const SLATE: [number, number, number] = [101, 119, 141]
const AMBER: [number, number, number] = [217, 150, 33]
const BORDER: [number, number, number] = [216, 226, 239]

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(text(value).replace(/,/g, '').replace(/%/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`
}

function shortMoney(amount: unknown): string {
  if (amount == null || text(amount) === '') return '-'
  const value = numeric(amount)
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toLocaleString('en-PH', { maximumFractionDigits: 2 })
}

function regionProvince(project: ProjectRecord): string {
  const province = text(project.province ?? project.province_name ?? project.aor_province)
  const lgu = text(project.lgu ?? project.municipality ?? project.city_municipality ?? project.city)
  const combined = `${province} ${lgu}`.toLowerCase()
  if (combined.includes('cagayan de oro')) return 'Cagayan de Oro City'
  if (combined.includes('iligan')) return 'Iligan City'
  if (/bukidnon/i.test(province)) return 'Bukidnon'
  if (/camiguin/i.test(province)) return 'Camiguin'
  if (/lanao del norte/i.test(province)) return 'Lanao del Norte'
  if (/misamis occidental/i.test(province)) return 'Misamis Occidental'
  if (/misamis oriental/i.test(province)) return 'Misamis Oriental'
  return province || 'Unspecified Province'
}

function projectLgu(project: ProjectRecord): string {
  return text(project.lgu ?? project.municipality ?? project.city_municipality ?? project.city ?? project.local_government_unit) || 'Unspecified LGU'
}

function projectTitle(project: ProjectRecord): string {
  return text(project.project_name ?? project.project_title ?? project.title ?? project.name) || 'Untitled Project'
}

function projectCode(project: ProjectRecord): string {
  return text(project.subaybayan_project_code ?? project.project_code ?? project.code ?? project.reference_code) || '-'
}

function projectCost(project: ProjectRecord): number {
  if (text(project.subaybayan_project_code)) return numeric(project.budget)
  return numeric(project.project_cost ?? project.amount ?? project.budget ?? project.total_project_cost ?? project.approved_budget)
}

function finance(project: ProjectRecord): number {
  return Math.max(0, Math.min(100, numeric(
    project.financial_accomplishment ?? project.financial_progress ?? project.actual_financial_accomplishment,
  )))
}

function physical(project: ProjectRecord): string {
  const value = project.physical_accomplishment ?? project.physical_progress ?? project.actual_physical_accomplishment
  return value == null || text(value) === '' ? '-' : percent(numeric(value))
}

function formatDate(value: unknown): string {
  if (value == null || text(value) === '') return '-'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

function nadaiDate(project: ProjectRecord): Date | null {
  // Use the explicit NADAI field first, then the fund-download aliases used by PMS10.
  const candidates = [
    project.nadai_date, project.fund_download_date, project.date_fund_downloaded,
    project.fund_release_date, project.nadai_received_date, project.download_date, project.release_date,
  ]
  for (const value of candidates) {
    if (value == null || text(value) === '') continue
    const date = new Date(String(value))
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function statusGroup(project: ProjectRecord): StatusBucket {
  const value = getPmsProjectStatus(project)
  if (value === 'Completed') return 'Completed'
  if (value === 'Ongoing') return 'Ongoing'
  if (value === 'Not Yet Started' || value === 'Under Procurement') return 'Not Yet Started'
  return 'Other'
}

function summarize(projects: ProjectRecord[]): Summary[] {
  const map = new Map<string, Summary>()
  for (const project of projects) {
    const province = regionProvince(project)
    const lgu = projectLgu(project)
    const key = `${province.toLowerCase()}|${lgu.toLowerCase()}`
    let row = map.get(key)
    if (!row) {
      row = { province, lgu, projects: [], barangays: 0, completed: 0, ongoing: 0, notStarted: 0, other: 0 }
      map.set(key, row)
    }
    row.projects.push(project)
    const status = statusGroup(project)
    if (status === 'Completed') row.completed += 1
    else if (status === 'Ongoing') row.ongoing += 1
    else if (status === 'Not Yet Started') row.notStarted += 1
    else row.other += 1
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    barangays: new Set(row.projects.map((p) => text(p.barangay ?? p.barangay_name).toUpperCase()).filter(Boolean)).size,
  })).sort((a, b) => a.province.localeCompare(b.province) || a.lgu.localeCompare(b.lgu))
}

function financeWeighted(projects: ProjectRecord[]): number {
  const eligible = projects.filter(isProjectEligibleForAggregatePerformance)
  const denominator = eligible.reduce((sum, item) => sum + projectCost(item), 0)
  return denominator > 0
    ? eligible.reduce((sum, item) => sum + projectCost(item) * finance(item), 0) / denominator
    : 0
}

async function loadImage(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    const blob = await response.blob()
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

function fill(doc: any, color: [number, number, number]) { doc.setFillColor(...color) }
function ink(doc: any, color: [number, number, number]) { doc.setTextColor(...color) }
function border(doc: any, color: [number, number, number]) { doc.setDrawColor(...color) }

function pageBase(doc: any) {
  fill(doc, [249, 251, 254])
  doc.rect(0, 0, PAGE[1], PAGE[0], 'F')
}

function drawHeader(
  doc: any,
  images: { dilg?: string; bagong?: string },
  subtitle: string,
) {
  pageBase(doc)
  const width = PAGE[1]
  if (images.dilg) doc.addImage(images.dilg, 'PNG', 16, 8, 19, 19)
  if (images.bagong) doc.addImage(images.bagong, 'PNG', width - 35, 5.5, 20, 22)
  ink(doc, [66, 78, 91])
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text('Republic of the Philippines', width / 2, 9.4, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.1); ink(doc, NAVY)
  doc.text('DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', width / 2, 15.4, { align: 'center' })
  doc.setFontSize(8.1)
  doc.text('REGIONAL OFFICE X - NORTHERN MINDANAO', width / 2, 20.2, { align: 'center' })
  ink(doc, [101, 119, 141]); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1)
  doc.text('PROJECT DEVELOPMENT AND MANAGEMENT UNIT  |  PMS10', width / 2, 25, { align: 'center' })
  border(doc, BORDER); doc.setLineWidth(0.35); doc.line(MARGIN, 30, width - MARGIN, 30)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13.3); ink(doc, NAVY)
  doc.text('EXECUTIVE PROJECT MONITORING REPORT', MARGIN, 37.7)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); ink(doc, SLATE)
  doc.text(subtitle, MARGIN, 42.8)
}

function addScope(doc: any, options: ExecutiveDashboardPdfOptions, projects: ProjectRecord[]) {
  const years = options.fundingYears.length ? options.fundingYears.map((value) => `FY ${value}`).join(', ') : 'All Funding Years'
  fill(doc, [230, 239, 250]); doc.roundedRect(MARGIN, 46, PAGE[1] - MARGIN * 2, 12, 3, 3, 'F')
  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  const scope = `AREA: ${options.area}    |    PROGRAM: ${options.program}    |    YEAR: ${years}`
  const clipped = doc.splitTextToSize(scope, PAGE[1] - MARGIN * 2 - 14).slice(0, 2)
  doc.text(clipped, MARGIN + 5, 51.2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); ink(doc, SLATE)
  doc.text(`DATA: ${options.dataSource === 'official' ? 'SUBAYBAYAN OFFICIAL' : 'ACTUAL ON-SITE'}    |    ${projects.length.toLocaleString('en-PH')} PROJECTS`, PAGE[1] - MARGIN - 5, 56, { align: 'right' })
}

function metricCard(
  doc: any, x: number, value: string, label: string, accent: [number, number, number], detail: string,
) {
  const y = 63, w = 73.5, h = 36
  fill(doc, [255, 255, 255]); border(doc, BORDER)
  doc.roundedRect(x, y, w, h, 4, 4, 'FD')
  fill(doc, accent); doc.roundedRect(x, y, 2.8, h, 1.5, 1.5, 'F')
  ink(doc, accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(22)
  doc.text(value, x + 6, y + 18)
  ink(doc, NAVY); doc.setFontSize(8.7)
  doc.text(label, x + 6, y + 25.3)
  ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.7)
  doc.text(detail, x + 6, y + 31.6)
}

function drawExecutivePage(
  doc: any,
  images: { dilg?: string; bagong?: string },
  projects: ProjectRecord[],
  options: ExecutiveDashboardPdfOptions,
) {
  const date = options.generatedAt ?? new Date()
  drawHeader(doc, images, `Generated ${formatDate(date.toISOString())}  |  Landscape executive summary`)
  addScope(doc, options, projects)
  const count = projects.length
  const complete = projects.filter((project) => statusGroup(project) === 'Completed').length
  const risk = projects.filter((project) => getPmsRiskLevel(project) === 'High').length
  const fin = financeWeighted(projects)
  const value = (count ? complete / count * 100 : 0)
  const cardGap = 4
  for (const [i, metric] of [
    [count.toLocaleString('en-PH'), 'TOTAL PROJECTS', NAVY, 'Current filtered portfolio'],
    [percent(value), 'COMPLETION RATE', GREEN, `${complete} of ${count} completed`],
    [percent(fin), 'FINANCIAL', [79, 112, 182], 'Weighted by official cost'],
    [risk.toLocaleString('en-PH'), 'HIGH RISK', RED, 'Requires monitoring'],
  ].entries()) {
    const [number, label, color, detail] = metric as [string, string, [number, number, number], string]
    metricCard(doc, MARGIN + i * (73.5 + cardGap), number, label, color, detail)
  }

  // Status distribution: all statuses reconcile to total projects.
  fill(doc, [255, 255, 255]); border(doc, BORDER)
  doc.roundedRect(MARGIN, 104, PAGE[1] - MARGIN * 2, 38, 4, 4, 'FD')
  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('PROJECT IMPLEMENTATION STATUS', MARGIN + 6, 112)
  const categories: [StatusBucket, [number, number, number]][] = [
    ['Completed', GREEN], ['Ongoing', [38, 104, 201]], ['Not Yet Started', SLATE], ['Other', AMBER],
  ]
  let x = MARGIN + 6
  const barW = PAGE[1] - MARGIN * 2 - 12
  fill(doc, [228, 233, 241]); doc.roundedRect(x, 117, barW, 7, 2, 2, 'F')
  if (count) {
    categories.forEach(([category, color]) => {
      const n = projects.filter((p) => statusGroup(p) === category).length
      const segment = n / count * barW
      if (segment > 0) { fill(doc, color); doc.rect(x, 117, segment, 7, 'F'); x += segment }
    })
  }
  categories.forEach(([category, color], index) => {
    const countHere = projects.filter((project) => statusGroup(project) === category).length
    const px = MARGIN + 6 + index * 74.5
    fill(doc, color); doc.circle(px + 1.4, 132.5, 1.4, 'F')
    ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.7)
    doc.text(`${category}: ${countHere}`, px + 5, 134)
  })

  const nadai = projects.map((p) => ({ project: p, date: nadaiDate(p) }))
  const byYear = new Map<number, ProjectRecord[]>()
  nadai.forEach(({ project, date }) => {
    if (date) {
      const y = date.getFullYear()
      byYear.set(y, [...(byYear.get(y) || []), project])
    }
  })
  const years = [...byYear.keys()].sort((a, b) => a - b)
  fill(doc, [255, 255, 255]); border(doc, BORDER)
  doc.roundedRect(MARGIN, 148, PAGE[1] - MARGIN * 2, 45, 4, 4, 'FD')
  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('PROGRESS BY NADAI / FUND DOWNLOAD YEAR', MARGIN + 6, 156.2)
  ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text(`${nadai.length - nadai.filter((p) => !p.date).length} of ${count} have a recorded NADAI / download date`, PAGE[1] - MARGIN - 6, 156.2, { align: 'right' })

  const yearRows = years.length ? years.slice(0, 6) : []
  if (!yearRows.length) {
    doc.text('No fund download dates are recorded for the current filters.', MARGIN + 6, 170)
  }
  const startX = MARGIN + 6
  const columnWidth = (PAGE[1] - MARGIN * 2 - 12) / Math.min(3, Math.max(1, yearRows.length))
  yearRows.forEach((year, i) => {
    const group = byYear.get(year) || []
    const row = Math.floor(i / 3), col = i % 3
    const xx = startX + col * columnWidth, yy = 164 + row * 13.1
    const progress = group.length ? 100 * group.filter((p) => statusGroup(p) === 'Completed').length / group.length : 0
    ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6)
    doc.text(`NADAI ${year}  |  ${group.length} projects`, xx, yy)
    fill(doc, [227, 233, 241]); doc.roundedRect(xx, yy + 2, columnWidth - 20, 3.5, 1.7, 1.7, 'F')
    fill(doc, GREEN); if (progress > 0) doc.roundedRect(xx, yy + 2, (columnWidth - 20) * progress / 100, 3.5, 1.7, 1.7, 'F')
    ink(doc, GREEN); doc.setFontSize(7); doc.text(percent(progress), xx + columnWidth - 17, yy + 5)
  })
  if (years.length > yearRows.length) {
    ink(doc, SLATE); doc.setFontSize(6.8)
    doc.text(`+ ${years.length - yearRows.length} additional NADAI years in the project register`, PAGE[1] - MARGIN - 5, 189, { align: 'right' })
  }
  ink(doc, SLATE); doc.setFontSize(6.5)
  doc.text('Completion = Completed / Total Projects. Other = suspended, cancelled, terminated or unclassified. Financial % follows PMS10 source values.', MARGIN, 199.2)
}

function addFooters(doc: any, options: ExecutiveDashboardPdfOptions) {
  const pages = doc.getNumberOfPages()
  const date = options.generatedAt ?? new Date()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    border(doc, BORDER); doc.setLineWidth(0.2); doc.line(MARGIN, 204.5, PAGE[1] - MARGIN, 204.5)
    ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8)
    doc.text(`PMS10 | ${options.dataSource === 'official' ? 'SubayBAYAN Official' : 'Actual On-Site'} | Exported ${date.toLocaleString('en-PH')}`, MARGIN, 209)
    doc.text(`Page ${p} of ${pages}`, PAGE[1] - MARGIN, 209, { align: 'right' })
  }
}

export async function exportExecutiveDashboardPdf(
  projects: ProjectRecord[],
  options: ExecutiveDashboardPdfOptions,
): Promise<void> {
  // Load PDF libraries only when requested; keep Dashboard startup lightweight.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'),
  ])
  const [dilg, bagong] = await Promise.all([
    loadImage('/aide-memoire-dilg-logo.png'),
    loadImage('/aide-memoire-bagong-pilipinas.png'),
  ])
  const images = { dilg, bagong }
  const generatedAt = options.generatedAt ?? new Date()
  const context = { ...options, generatedAt }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: PAGE, compress: true })
  const width = PAGE[1] - MARGIN * 2

  drawExecutivePage(doc, images, projects, context)

  // Page 2+: Province / LGU matrix matching the user's reference layout.
  doc.addPage()
  drawHeader(doc, images, 'Province / LGU implementation matrix  |  Data reflects current dashboard filters')
  addScope(doc, context, projects)
  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
  doc.text('SUMMARY BY PROVINCE / LGU', MARGIN, 65)

  const groups = summarize(projects)
  const matrixRows: (string | number)[][] = groups.map((row) => [
    row.province, row.lgu, row.projects.length, row.barangays,
    row.notStarted, row.ongoing, row.completed, row.other,
    percent(row.projects.length ? row.completed / row.projects.length * 100 : 0),
  ])
  const uniqueBarangays = new Set(projects.map((p) => `${regionProvince(p)}|${projectLgu(p)}|${text(p.barangay).toUpperCase()}`).filter((v) => !v.endsWith('|'))).size
  const otherCount = projects.filter((p) => statusGroup(p) === 'Other').length
  matrixRows.push([
    'REGION X TOTAL', `${groups.length} LGUs`, projects.length, uniqueBarangays,
    projects.filter((p) => statusGroup(p) === 'Not Yet Started').length,
    projects.filter((p) => statusGroup(p) === 'Ongoing').length,
    projects.filter((p) => statusGroup(p) === 'Completed').length, otherCount,
    percent(projects.length ? projects.filter((p) => statusGroup(p) === 'Completed').length / projects.length * 100 : 0),
  ])

  autoTable(doc, {
    startY: 69,
    margin: { left: MARGIN, right: MARGIN, top: 62, bottom: 17 },
    tableWidth: width,
    head: [[
      'PROVINCE / HUC', 'LGU', 'NUMBER OF PROJECTS', 'NUMBER OF BARANGAYS',
      'NOT YET STARTED / PROCUREMENT', 'ONGOING IMPLEMENTATION', 'COMPLETED', 'OTHER', '% COMPLETION',
    ]],
    body: matrixRows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, textColor: [25, 47, 75], lineColor: BORDER, lineWidth: 0.15, cellPadding: 2.4, valign: 'middle' },
    headStyles: { fillColor: [17, 78, 137], textColor: 255, fontSize: 7.1, fontStyle: 'bold', halign: 'center', minCellHeight: 14 },
    alternateRowStyles: { fillColor: [241, 246, 251] },
    columnStyles: { 0: { cellWidth: 37 }, 1: { cellWidth: 42 }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' } },
    didParseCell(data: any) {
      if (data.section === 'body' && data.row.index === matrixRows.length - 1) {
        data.cell.styles.fillColor = [220, 234, 249]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    didDrawPage(data: any) {
      if (data.pageNumber > 1) {
        drawHeader(doc, images, 'Province / LGU implementation matrix (continued)')
        addScope(doc, context, projects)
      }
    },
  })

  // Project register, sorted by geography. All projects under current filters,
  // including missing NADAI or financial values, are retained.
  doc.addPage()
  drawHeader(doc, images, 'Project-level annex  |  Official source information and latest recorded dates')
  addScope(doc, context, projects)
  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
  doc.text('FILTERED PROJECT REGISTER', MARGIN, 65)

  const ordered = [...projects].sort((a, b) =>
    regionProvince(a).localeCompare(regionProvince(b)) ||
    projectLgu(a).localeCompare(projectLgu(b)) ||
    projectTitle(a).localeCompare(projectTitle(b)),
  )

  const detailRows = ordered.map((project) => [
    projectCode(project),
    `${regionProvince(project)} / ${projectLgu(project)}`,
    projectTitle(project),
    text(project.barangay ?? project.barangay_name) || '-',
    getPmsProjectStatus(project),
    physical(project),
    project.financial_accomplishment == null ? '-' : percent(finance(project)),
    formatDate(nadaiDate(project)?.toISOString()),
    shortMoney(project.reverted_funds),
  ])

  autoTable(doc, {
    startY: 69,
    margin: { left: MARGIN, right: MARGIN, top: 62, bottom: 17 },
    tableWidth: width,
    head: [[
      'PROJECT CODE', 'PROVINCE / LGU', 'PROJECT TITLE', 'BARANGAY',
      'STATUS', 'PHYSICAL', 'FINANCIAL', 'NADAI DOWNLOAD', 'REVERTED FUNDS',
    ]],
    body: detailRows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.7, textColor: [28, 52, 79], lineColor: BORDER, lineWidth: 0.12, cellPadding: 1.8, valign: 'middle' },
    headStyles: { fillColor: [17, 78, 137], textColor: 255, fontSize: 6.7, fontStyle: 'bold', halign: 'center', minCellHeight: 10 },
    alternateRowStyles: { fillColor: [243, 247, 251] },
    columnStyles: {
      0: { cellWidth: 37 }, 1: { cellWidth: 38 }, 2: { cellWidth: 81 },
      3: { cellWidth: 27 }, 4: { cellWidth: 29 }, 5: { cellWidth: 17 },
      6: { cellWidth: 17 }, 7: { cellWidth: 28 }, 8: { cellWidth: 32 },
    },
    didDrawPage(data: any) {
      if (data.pageNumber > 1) {
        drawHeader(doc, images, 'Filtered project register (continued)')
        addScope(doc, context, projects)
      }
    },
  })

  addFooters(doc, context)
  const tag = [options.area, options.program, options.fundingYears.join('-') || 'AllFY']
    .map((v) => v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0,28))
    .join('_')
  doc.save(`PMS10_Executive_Report_${tag}_${generatedAt.toISOString().slice(0, 10)}.pdf`)
}
