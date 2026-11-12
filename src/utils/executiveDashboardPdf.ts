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
  // Give the Bagong Pilipinas mark equal visual prominence while retaining
  // the existing header line and centered DILG office letterhead.
  if (images.bagong) {
    // The existing PNG is 499 x 520 px. Preserve its original aspect ratio
    // so the circular mark never appears stretched in the PDF letterhead.
    const logoHeight = 27.8
    const logoWidth = logoHeight * (499 / 520)
    doc.addImage(images.bagong, 'PNG', width - MARGIN - logoWidth, 1.1, logoWidth, logoHeight)
  }
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
  fill(doc, [230, 239, 250]); doc.roundedRect(MARGIN, 46, PAGE[1] - MARGIN * 2, 12, 1.5, 1.5, 'F')
  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  const scope = `AREA: ${options.area}    |    PROGRAM: ${options.program}    |    YEAR: ${years}`
  const clipped = doc.splitTextToSize(scope, PAGE[1] - MARGIN * 2 - 14).slice(0, 2)
  doc.text(clipped, MARGIN + 5, 51.2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); ink(doc, SLATE)
  doc.text(`DATA: ${options.dataSource === 'official' ? 'SUBAYBAYAN OFFICIAL' : 'ACTUAL ON-SITE'}    |    ${projects.length.toLocaleString('en-PH')} PROJECTS`, PAGE[1] - MARGIN - 5, 56, { align: 'right' })
}

function metricCard(
  doc: any, x: number, value: string, label: string,
  accent: [number, number, number], detail: string,
) {
  // Compact KPIs leave most of the cover to the graphs.
  const y = 61, w = 73.5, h = 24
  fill(doc, [255, 255, 255]); border(doc, BORDER)
  doc.roundedRect(x, y, w, h, 2.3, 2.3, 'FD')
  fill(doc, accent); doc.roundedRect(x, y, 2.6, h, 1.2, 1.2, 'F')
  ink(doc, accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(16.5)
  doc.text(value, x + 6, y + 10.6)
  ink(doc, NAVY); doc.setFontSize(7.5)
  doc.text(label, x + 6, y + 16.8)
  ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2)
  doc.text(detail, x + 6, y + 21.6)
}

/**
 * Render clean pies as one high-resolution image per chart. The previous
 * jsPDF triangle tessellation caused visible radial hairlines in PDF
 * viewers (even though the adjacent triangles shared the same color).
 * Canvas arc paths + same-color strokes eliminate those seams.
 * Only this on-demand export uses canvas; no live dashboard visuals change.
 */
function drawPie(
  doc: any, cx: number, cy: number, radius: number,
  sections: Array<{ value: number; color: [number, number, number] }>,
) {
  const pixelRadius = 260
  const side = pixelRadius * 2
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (!context) {
    // Fallback remains clean, even when canvas drawing is unavailable.
    fill(doc, [227, 234, 244])
    doc.circle(cx, cy, radius, 'F')
    return
  }

  const total = sections.reduce((sum, section) =>
    sum + (Number.isFinite(section.value) ? Math.max(0, section.value) : 0), 0)
  const base: [number, number, number] = [227, 234, 244]
  const colorCss = (color: [number, number, number]) => `rgb(${color.join(',')})`
  context.fillStyle = colorCss(base)
  context.beginPath()
  context.arc(pixelRadius, pixelRadius, pixelRadius - 2, 0, Math.PI * 2)
  context.fill()

  if (total > 0) {
    let angle = -Math.PI / 2
    for (const section of sections) {
      const value = Math.max(0, Number.isFinite(section.value) ? section.value : 0)
      if (!value) continue
      const sweep = (value / total) * Math.PI * 2
      const end = angle + sweep
      const color = colorCss(section.color)
      context.beginPath()
      context.moveTo(pixelRadius, pixelRadius)
      context.arc(pixelRadius, pixelRadius, pixelRadius - 2, angle, end)
      context.closePath()
      context.fillStyle = color
      context.fill()
      // Overpaint the antialiased slice edges with their own segment color.
      // This avoids the white radial lines that were visible in the PDF.
      context.strokeStyle = color
      context.lineWidth = 1.35
      context.stroke()
      angle = end
    }
  }
  doc.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    cx - radius, cy - radius, radius * 2, radius * 2,
  )
}

function drawRing(
  doc: any, cx: number, cy: number, radius: number,
  thickness: number, value: number, color: [number, number, number],
) {
  const amount = Math.max(0, Math.min(100, value))
  drawPie(doc, cx, cy, radius, [
    { value: amount, color },
    { value: 100 - amount, color: [227, 234, 244] },
  ])
  fill(doc, [255, 255, 255])
  doc.circle(cx, cy, radius - thickness, 'F')
}

function drawDoubleDonut(
  doc: any, cx: number, cy: number,
  physicalCompletion: number, financialAccomplishment: number,
  radius = 13.5,
) {
  drawRing(doc, cx, cy, radius, 4.3, physicalCompletion, GREEN)
  drawRing(doc, cx, cy, radius - 5.1, 3.4, financialAccomplishment, [85, 123, 193])
}

function drawExecutivePage(
  doc: any,
  images: { dilg?: string; bagong?: string },
  projects: ProjectRecord[],
  options: ExecutiveDashboardPdfOptions,
) {
  const date = options.generatedAt ?? new Date()
  drawHeader(doc, images, `Generated ${formatDate(date.toISOString())}`)
  addScope(doc, options, projects)

  const count = projects.length
  const completed = projects.filter((p) => statusGroup(p) === 'Completed').length
  const ongoing = projects.filter((p) => statusGroup(p) === 'Ongoing').length
  const notStarted = projects.filter((p) => statusGroup(p) === 'Not Yet Started').length
  const other = count - completed - ongoing - notStarted
  const highRisk = projects.filter((p) => getPmsRiskLevel(p) === 'High').length
  const completion = count ? completed / count * 100 : 0
  const financial = financeWeighted(projects)

  const metrics: Array<[string, string, [number, number, number], string]> = [
    [count.toLocaleString('en-PH'), 'TOTAL PROJECTS', NAVY, 'Filtered portfolio'],
    [percent(completion), 'COMPLETION RATE', GREEN, `${completed} of ${count} completed`],
    [percent(financial), 'FINANCIAL', [79, 112, 182], 'Cost-weighted progress'],
    [highRisk.toLocaleString('en-PH'), 'HIGH RISK', RED, 'Requires monitoring'],
  ]
  metrics.forEach(([value, label, color, detail], index) => {
    metricCard(doc, MARGIN + index * 77.5, value, label, color, detail)
  })

  // Status pie on the left and NADAI-year donuts on the right, comparable
  // in scale to the Executive Dashboard charts rather than the KPI row.
  const gap = 5
  const panelWidth = (PAGE[1] - MARGIN * 2 - gap) / 2
  const leftX = MARGIN
  const rightX = MARGIN + panelWidth + gap
  const panelY = 91
  const panelHeight = 107

  for (const x of [leftX, rightX]) {
    fill(doc, [255, 255, 255]); border(doc, BORDER)
    doc.roundedRect(x, panelY, panelWidth, panelHeight, 2.5, 2.5, 'FD')
  }

  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('PROJECT IMPLEMENTATION STATUS', leftX + 7, 100.7)
  ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1)
  doc.text(`${count} projects in current selection`, leftX + 7, 109.0)

  const statusSections: Array<{
    label: StatusBucket; value: number; color: [number, number, number]
  }> = [
    { label: 'Completed', value: completed, color: GREEN },
    { label: 'Ongoing', value: ongoing, color: [39, 102, 204] },
    { label: 'Not Yet Started', value: notStarted, color: SLATE },
    { label: 'Other', value: other, color: AMBER },
  ]
  const pieCenterX = leftX + panelWidth / 2
  const pieCenterY = 146.5
  const pieRadius = 28
  drawPie(doc, pieCenterX, pieCenterY, pieRadius,
    statusSections.map((item) => ({ value: item.value, color: item.color })))

  // Labels within visible slices; the compact legend always has exact counts.
  if (count > 0) {
    let arc = -Math.PI / 2
    statusSections.forEach((item) => {
      const sweep = item.value / count * Math.PI * 2
      if (item.value && sweep >= 0.34) {
        const mid = arc + sweep / 2
        const x = pieCenterX + Math.cos(mid) * (pieRadius * 0.59)
        const y = pieCenterY + Math.sin(mid) * (pieRadius * 0.59)
        ink(doc, [255, 255, 255])
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
        doc.text(String(item.value), x, y + 1.4, { align: 'center' })
      }
      arc += sweep
    })
  }

  // Keep the entire two-column legend centered directly below the pie.
  // Previously its columns were spread across the whole left panel.
  const legendColumnWidth = 60
  const legendStartX = pieCenterX - legendColumnWidth
  statusSections.forEach((item, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = legendStartX + col * legendColumnWidth
    const y = 183.5 + row * 8.2
    fill(doc, item.color); doc.circle(x + 1.3, y - 1.2, 1.35, 'F')
    ink(doc, item.color); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.9)
    doc.text(`${item.label}: ${item.value}`, x + 5, y)
  })

  ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.4)
  doc.text('PROGRESS BY FUND DOWNLOAD YEAR', rightX + 6, 100.7)

  const cohorts = new Map<number, ProjectRecord[]>()
  for (const project of projects) {
    const received = nadaiDate(project)
    if (!received) continue
    const year = received.getFullYear()
    cohorts.set(year, [...(cohorts.get(year) || []), project])
  }
  const years = [...cohorts.keys()].sort((a, b) => a - b)
  const recorded = [...cohorts.values()].reduce((sum, group) => sum + group.length, 0)
  ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1)
  doc.text(`${recorded} of ${count} projects with NADAI date`, rightX + 6, 109.0)

  const visibleYears = years.slice(0, 3)
  if (!visibleYears.length) {
    ink(doc, SLATE); doc.setFontSize(8.5)
    doc.text('No NADAI dates recorded for current selection.',
      rightX + panelWidth / 2, 150, { align: 'center' })
  } else {
    const columnWidth = panelWidth / visibleYears.length
    visibleYears.forEach((year, index) => {
      const group = cohorts.get(year) || []
      const done = group.filter((p) => statusGroup(p) === 'Completed').length
      const physicalRate = group.length ? done / group.length * 100 : 0
      const financialRate = financeWeighted(group)
      const centerX = rightX + columnWidth * (index + 0.5)
      // Keep project-count text clearly ABOVE the donut (previously the
      // count touched the chart's top), even when only one NADAI year exists.
      const radius = visibleYears.length === 1 ? 23.5 : visibleYears.length === 2 ? 21.0 : 16.5
      const centerY = 156

      ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8)
      doc.text(`NADAI ${year}`, centerX, 117.8, { align: 'center' })
      ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1)
      doc.text(`${group.length} ${group.length === 1 ? 'project' : 'projects'}`,
        centerX, 124.0, { align: 'center' })

      drawDoubleDonut(doc, centerX, centerY, physicalRate, financialRate, radius)

      // Compact centered legend below each chart; no overlapping arcs.
      const textSize = visibleYears.length === 3 ? 6.0 : 7.0
      const legendWidth = Math.min(columnWidth - 5, visibleYears.length === 3 ? 41 : 54)
      const legendLeft = centerX - legendWidth / 2
      const legendRight = centerX + legendWidth / 2
      const firstLine = 185.6
      const secondLine = 193.0
      fill(doc, GREEN); doc.circle(legendLeft + 1.2, firstLine - 1.1, 1.25, 'F')
      ink(doc, GREEN); doc.setFont('helvetica', 'bold'); doc.setFontSize(textSize)
      doc.text('Physical', legendLeft + 4.4, firstLine)
      doc.text(percent(physicalRate), legendRight, firstLine, { align: 'right' })
      fill(doc, [85, 123, 193]); doc.circle(legendLeft + 1.2, secondLine - 1.1, 1.25, 'F')
      ink(doc, [85, 123, 193])
      doc.text('Financial', legendLeft + 4.4, secondLine)
      doc.text(percent(financialRate), legendRight, secondLine, { align: 'right' })
    })
  }
  if (years.length > visibleYears.length) {
    ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
    doc.text(`+${years.length - visibleYears.length} NADAI year(s) in project register`,
      rightX + panelWidth - 6, 196, { align: 'right' })
  }
}

function drawProvinceOverviewPages(
  doc: any, images: { dilg?: string; bagong?: string },
  projects: ProjectRecord[], options: ExecutiveDashboardPdfOptions,
) {
  const map = new Map<string, ProjectRecord[]>()
  for (const project of projects) {
    const province = regionProvince(project)
    map.set(province, [...(map.get(province) || []), project])
  }
  const areas = [...map].map(([name, items]) => {
    const complete = items.filter((p) => statusGroup(p) === 'Completed').length
    return {
      name, count: items.length, complete,
      ongoing: items.filter((p) => statusGroup(p) === 'Ongoing').length,
      notStarted: items.filter((p) => statusGroup(p) === 'Not Yet Started').length,
      rate: items.length ? complete / items.length * 100 : 0,
      financial: financeWeighted(items),
      risk: items.filter((p) => getPmsRiskLevel(p) === 'High').length,
    }
  }).sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name))

  // For a single-area report the cover page already supplies the metrics.
  if (areas.length <= 1) return

  for (let offset = 0; offset < areas.length; offset += 8) {
    doc.addPage()
    drawHeader(doc, images, 'At-a-glance comparison of provincial and HUC performance')
    addScope(doc, options, projects)
    ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.7)
    doc.text('PERFORMANCE BY PROVINCE / HIGHLY URBANIZED CITY', MARGIN, 65)
    ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1)
    doc.text('Ranked by completion rate  |  Donut = completed / total projects', PAGE[1] - MARGIN, 65, { align: 'right' })

    areas.slice(offset, offset + 8).forEach((area, index) => {
      const row = Math.floor(index / 2), col = index % 2
      const x = MARGIN + col * 155.5, y = 70 + row * 32
      fill(doc, [255, 255, 255]); border(doc, BORDER)
      doc.roundedRect(x, y, 150, 29.4, 3.5, 3.5, 'FD')
      drawRing(doc, x + 17, y + 14.5, 11, 4.2, area.rate, GREEN)
      ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      const name = doc.splitTextToSize(area.name, 116).slice(0, 1)
      doc.text(`${offset + index + 1}. ${name[0]}`, x + 33, y + 7.5)
      ink(doc, GREEN); doc.setFontSize(12.3)
      doc.text(percent(area.rate), x + 33, y + 16)
      ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2)
      doc.text(`${area.complete} / ${area.count} completed`, x + 75, y + 15.3)
      ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4)
      doc.text(`Ongoing: ${area.ongoing}  |  Not started: ${area.notStarted}`, x + 75, y + 20.2)
      ink(doc, [65, 101, 169]); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.3)
      doc.text(`Financial: ${percent(area.financial)}`, x + 33, y + 24.8)
      ink(doc, area.risk > 0 ? RED : SLATE); doc.setFontSize(7.2)
      doc.text(`High Risk: ${area.risk}`, x + 112, y + 24.8)
    })
  }
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
  officialProjects: ProjectRecord[] = projects,
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

  // Do not append empty matrix/register pages for a filter scope with zero
  // projects. The executive cover clearly reports zero and remains the
  // only necessary page.
  if (!projects.length) {
    addFooters(doc, context)
    const emptyTag = [options.area, options.program, options.fundingYears.join('-') || 'AllFY']
      .map((value) => value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28))
      .join('_')
    doc.save(`PMS10_Executive_Report_${emptyTag}_${generatedAt.toISOString().slice(0, 10)}.pdf`)
    return
  }

  // Executive Director's at-a-glance province/HUC comparison immediately
  // follows the cover so regional differences are visible before detail tables.
  drawProvinceOverviewPages(doc, images, projects, context)

  // Province / LGU implementation matrix. drawHeader MUST run in
  // willDrawPage, not didDrawPage: the latter paints over completed rows,
  // which previously made full continuation pages appear completely blank.
  doc.addPage()
  const groups = summarize(projects)
  const matrixRows: any[][] = []

  const provinces = new Map<string, Summary[]>()
  for (const group of groups) {
    provinces.set(group.province, [...(provinces.get(group.province) || []), group])
  }

  const appendMatrixDetails = (group: Summary): (string | number)[] => [
    group.lgu, group.projects.length, group.barangays,
    group.notStarted, group.ongoing, group.completed, group.other,
    percent(group.projects.length ? group.completed / group.projects.length * 100 : 0),
  ]

  for (const [province, provinceRows] of provinces) {
    if (provinceRows.length <= 6) {
      // Real vertically merged province cell when the group fits a page.
      provinceRows.forEach((group, index) => {
        matrixRows.push([
          ...(index === 0 ? [{
            content: province, rowSpan: provinceRows.length,
            styles: { fontStyle: 'bold', fillColor: [235, 243, 252], valign: 'middle' },
          }] : []),
          ...appendMatrixDetails(group),
        ])
      })
    } else {
      // Large groups may span multiple pages. Use one merged province heading
      // instead of an unbreakable multi-page rowspan (which can cause blanks).
      matrixRows.push([{
        content: province.toUpperCase(),
        colSpan: 9,
        styles: { fontStyle: 'bold', textColor: NAVY, fillColor: [223, 235, 248] },
      }])
      provinceRows.forEach((group) => matrixRows.push(['', ...appendMatrixDetails(group)]))
    }
  }

  const uniqueBarangays = new Set(projects.map((p) =>
    `${regionProvince(p)}|${projectLgu(p)}|${text(p.barangay ?? p.barangay_name).toUpperCase()}`,
  ).filter((value) => !value.endsWith('|'))).size

  const completedCount = projects.filter((p) => statusGroup(p) === 'Completed').length
  matrixRows.push([
    'FILTERED TOTAL', `${groups.length} LGUs`, projects.length, uniqueBarangays,
    projects.filter((p) => statusGroup(p) === 'Not Yet Started').length,
    projects.filter((p) => statusGroup(p) === 'Ongoing').length,
    completedCount,
    projects.filter((p) => statusGroup(p) === 'Other').length,
    percent(projects.length ? completedCount / projects.length * 100 : 0),
  ])
  const lastMatrixRow = matrixRows.length - 1

  autoTable(doc, {
    startY: 69,
    margin: { left: MARGIN, right: MARGIN, top: 69, bottom: 17 },
    tableWidth: width,
    head: [[
      'PROVINCE / HUC', 'LGU', 'NUMBER OF PROJECTS', 'NUMBER OF BARANGAYS',
      'NOT YET STARTED / PROCUREMENT', 'ONGOING IMPLEMENTATION', 'COMPLETED', 'OTHER', '% COMPLETION',
    ]],
    body: matrixRows,
    theme: 'grid',
    styles: {
      font: 'helvetica', fontSize: 7.5, textColor: [25, 47, 75],
      lineColor: BORDER, lineWidth: 0.15, cellPadding: 2.4, valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [17, 78, 137], textColor: 255, fontSize: 7.1,
      fontStyle: 'bold', halign: 'center', minCellHeight: 14,
    },
    alternateRowStyles: { fillColor: [241, 246, 251] },
    columnStyles: {
      0: { cellWidth: 37 }, 1: { cellWidth: 42 },
      2: { halign: 'center' }, 3: { halign: 'center' },
      4: { halign: 'center' }, 5: { halign: 'center' },
      6: { halign: 'center' }, 7: { halign: 'center' },
      8: { halign: 'center' },
    },
    didParseCell(data: any) {
      if (data.section === 'body' && data.row.index === lastMatrixRow) {
        data.cell.styles.fillColor = [220, 234, 249]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    willDrawPage(data: any) {
      drawHeader(doc, images, data.pageNumber === 1
        ? 'Province / LGU implementation matrix | Current filters'
        : 'Province / LGU implementation matrix (continued)')
      addScope(doc, context, projects)
      ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
      doc.text('SUMMARY BY PROVINCE / LGU', MARGIN, 65)
    },
  })

  // Project-level annex with repeated table headings. Render each page's
  // background and DILG branding BEFORE drawing rows, never afterwards.
  doc.addPage()
  const ordered = [...projects].sort((a, b) =>
    regionProvince(a).localeCompare(regionProvince(b)) ||
    projectLgu(a).localeCompare(projectLgu(b)) ||
    projectTitle(a).localeCompare(projectTitle(b)),
  )
  const hasFullPhysicalAccomplishment = (project: ProjectRecord) => {
    const value = project.physical_accomplishment ??
      project.physical_progress ?? project.actual_physical_accomplishment
    return value != null && text(value) !== '' && numeric(value) >= 99.999
  }

  // The separate masterlist is authoritative even for On-Site reports.
  // Engineer snapshots replace status, risk_level and physical progress;
  // none of those snapshot values can determine official PDF risk causes.
  const officialById = new Map(officialProjects.map(
    (project) => [text(project.id), project] as const,
  ))
  const officialSourceFor = (project: ProjectRecord): ProjectRecord | undefined =>
    officialById.get(text(project.id)) ||
    (options.dataSource === 'official' ? project : undefined)

  type RiskLevel = 'None' | 'Low' | 'Moderate' | 'High'

  // SubayBAYAN FY 2025+ exports can contain multiple numbered components,
  // e.g. "1). -50.00\n2). -45.00" under CL SLIPPAGE. These fields must
  // NEVER be substituted with engineer/project_updates data.
  const sourceComponents = (raw: unknown): Array<{ number: number; value: string }> =>
    text(raw).replace(/\r/g, '').split('\n').map((line, index) => {
      const match = line.match(/^\s*(\d+)\)\.?\s*(.*)$/)
      return {
        number: match ? Number(match[1]) : index + 1,
        value: (match ? match[2] : line).trim(),
      }
    }).filter((entry) => Boolean(entry.value))

  const numericSlippage = (raw: string): number | null => {
    const match = raw.match(/^\s*([-+]?\d+(?:\.\d+)?)/)
    if (!match) return null
    const result = Number(match[1])
    return Number.isFinite(result) ? result : null
  }
  const sourceRemark = (raw: string): boolean =>
    Boolean(raw.trim()) && !/^(?:-|none|n\/a|nil|no remarks?|not applicable)$/i.test(raw.trim())

  const reportDay = new Date(
    context.generatedAt.getFullYear(),
    context.generatedAt.getMonth(),
    context.generatedAt.getDate(),
  )

  const getOfficialRiskInfo = (project: ProjectRecord): {
    level: RiskLevel
    remarks: string
  } => {
    const official = officialSourceFor(project)
    if (!official) return { level: 'None', remarks: '' }

    // Completed SubayBAYAN projects always remain No Risk.
    if (getPmsProjectStatus(official) === 'Completed') {
      return { level: 'None', remarks: '' }
    }

    // Keep the imported CM risk classification authoritative: the PDF
    // does not silently elevate it using engineer or forecast calculations.
    const level: RiskLevel = getPmsRiskLevel(official)
    if (level === 'None') return { level, remarks: '' }

    const reasons: string[] = []
    const rawSlippage = text(official.subay_source_slippage_raw)
    const rawRiskLabels = text(official.subay_source_risk_details_raw)
    const officialSourceRemarks = text(official.subay_source_remarks_raw)

    const riskComponents = sourceComponents(rawRiskLabels)
    const highIndices = riskComponents
      .filter((entry) => /high\s*risk/i.test(entry.value))
      .map((entry) => entry.number)
    const slipComponents = sourceComponents(rawSlippage)
      .map((entry) => ({ ...entry, numeric: numericSlippage(entry.value) }))
    const negative = slipComponents
      .filter((entry) => entry.numeric !== null && entry.numeric < 0)
      .sort((a, b) => (a.numeric ?? 0) - (b.numeric ?? 0))

    if (negative.length) {
      const shown = negative.slice(0, 3).map((entry) =>
        'Component ' + entry.number + ': ' + entry.numeric!.toFixed(2) + ' pp')
      reasons.push('CL negative slippage: ' + shown.join('; ') +
        (negative.length > shown.length ? ' (+' + (negative.length - shown.length) + ' more)' : ''))
    }

    // CP REMARKS comes from the original SubayBAYAN masterlist (not engineers).
    const officialNotes = sourceComponents(officialSourceRemarks)
      .filter((entry) => sourceRemark(entry.value))
    const seen = new Set<string>()
    const deduplicatedNotes = officialNotes.filter((entry) => {
      const value = entry.value.toLowerCase()
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })
    if (deduplicatedNotes.length) {
      const shown = deduplicatedNotes.slice(0, 2).map((entry) =>
        'Component ' + entry.number + ': ' + entry.value.slice(0, 145))
      reasons.push('SubayBAYAN remarks: ' + shown.join('; ') +
        (deduplicatedNotes.length > shown.length ? ' (additional source remarks omitted)' : ''))
    }

    // Prevailing revised contract expiry supersedes the original contract
    // expiry. Use ONLY fields from the official project record.
    const revisedExpiry = text(official.revised_contract_expiration_date)
    const originalExpiry = text(official.contract_expiration_date)
    const expiryText = revisedExpiry || originalExpiry
    if (expiryText) {
      const expiry = new Date(expiryText.slice(0, 10) + 'T00:00:00')
      if (!Number.isNaN(expiry.getTime())) {
        const daysRemaining = Math.round((expiry.getTime() - reportDay.getTime()) / 86400000)
        const contractLabel = revisedExpiry ? 'Revised contract' : 'Contract'
        if (daysRemaining < 0) {
          reasons.push(contractLabel + ' expired on ' + formatDate(expiryText))
        } else if (daysRemaining <= 30) {
          reasons.push(contractLabel + ' expires in ' + daysRemaining +
            (daysRemaining === 1 ? ' day' : ' days') +
            ' (' + formatDate(expiryText) + ')')
        }
      }
    }

    // Explicit official risk classification must never be mistaken for
    // evidence of slippage that the source does not actually report.
    const heading = 'SubayBAYAN ' + level + ' Risk'
    if (!reasons.length) {
      if (rawRiskLabels) {
        const components = highIndices.length
          ? ' (component ' + highIndices.slice(0, 4).join(', ') +
            (highIndices.length > 4 ? ', etc.' : '') + ')'
          : ''
        return {
          level,
          remarks: heading + components +
            ': Specific cause not stated in official source fields',
        }
      }
      return {
        level,
        remarks: heading +
          ': Detailed slippage/remarks not recorded in PMS10 yet; verify latest SubayBAYAN extract',
      }
    }
    return { level, remarks: heading + ': ' + reasons.join('; ') }
  }
  const officialRiskById = new Map(ordered.map(
    (project) => [text(project.id), getOfficialRiskInfo(project)] as const,
  ))
  const getOfficialRiskFor = (project: ProjectRecord) =>
    officialRiskById.get(text(project.id)) ||
    { level: 'None' as RiskLevel, remarks: '' }

  const getRevertedFundsAndRemarks = (project: ProjectRecord): string => {
    const hasReversion =
      project.reverted_funds !== null &&
      project.reverted_funds !== undefined &&
      text(project.reverted_funds) !== ''
    const amount = hasReversion
      ? `Reverted: PHP ${numeric(project.reverted_funds).toLocaleString('en-PH', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : ''
    const remarks = getOfficialRiskFor(project).remarks
    return [amount, remarks].filter(Boolean).join('\n') || '-'
  }

  const detailRows = ordered.map((project) => [
    regionProvince(project),
    projectLgu(project),
    projectTitle(project),
    text(project.barangay ?? project.barangay_name) || '-',
    getPmsProjectStatus(project),
    physical(project),
    project.financial_accomplishment == null || text(project.financial_accomplishment) === ''
      ? '-' : percent(finance(project)),
    formatDate(nadaiDate(project)?.toISOString()),
    getRevertedFundsAndRemarks(project),
  ])

  autoTable(doc, {
    startY: 69,
    margin: { left: MARGIN, right: MARGIN, top: 69, bottom: 17 },
    tableWidth: width,
    head: [[
      'PROVINCE / HUC', 'LGU', 'PROJECT TITLE', 'BARANGAY',
      'STATUS', 'PHYSICAL', 'FINANCIAL', 'NADAI DOWNLOAD', 'REVERTED FUNDS / REMARKS',
    ]],
    body: detailRows,
    theme: 'grid',
    styles: {
      font: 'helvetica', fontSize: 6.7, textColor: [28, 52, 79],
      lineColor: BORDER, lineWidth: 0.12, cellPadding: 1.8, valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [17, 78, 137], textColor: 255,
      fontSize: 6.7, fontStyle: 'bold', halign: 'center', minCellHeight: 10,
    },
    alternateRowStyles: { fillColor: [243, 247, 251] },
    columnStyles: {
      0: { cellWidth: 29 }, 1: { cellWidth: 28 }, 2: { cellWidth: 61 },
      3: { cellWidth: 18 }, 4: { cellWidth: 28 }, 5: { cellWidth: 17 },
      6: { cellWidth: 20 }, 7: { cellWidth: 25 }, 8: { cellWidth: 80 },
    },
    didParseCell(data: any) {
      if (data.section !== 'body') return
      const project = ordered[data.row.index]
      if (!project) return

      // Risk highlighting overrides all other row treatments. This makes
      // low, moderate and high risk projects easy to identify at a glance.
      const riskLevel = getOfficialRiskFor(project).level
      if (riskLevel !== 'None') {
        data.cell.styles.fillColor = riskLevel === 'High'
          ? [255, 230, 233]
          : [255, 244, 243]
        if (data.column.index === 4 || data.column.index === 8) {
          data.cell.styles.textColor = [187, 25, 45]
          data.cell.styles.fontStyle = 'bold'
        }
      } else if (hasFullPhysicalAccomplishment(project)) {
        data.cell.styles.fillColor = [231, 247, 236]
        if (data.column.index === 5) {
          data.cell.styles.textColor = [18, 120, 62]
          data.cell.styles.fontStyle = 'bold'
        }
      }

      // Preserve previous discrepancy highlighting: red finance only for
      // physically complete projects with a reported financial value <100%.
      const hasFinancialFigure =
        project.financial_accomplishment != null &&
        text(project.financial_accomplishment) !== ''
      if (
        data.column.index === 6 &&
        hasFullPhysicalAccomplishment(project) &&
        hasFinancialFigure &&
        finance(project) < 99.999
      ) {
        data.cell.styles.textColor = [194, 32, 47]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    willDrawPage(data: any) {
      drawHeader(doc, images, data.pageNumber === 1
        ? 'Filtered project register | Official source data and NADAI dates'
        : 'Filtered project register (continued)')
      addScope(doc, context, projects)
      ink(doc, NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
      doc.text('FILTERED PROJECT REGISTER', MARGIN, 65)
      ink(doc, SLATE); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2)
      doc.text('Red row = official SubayBAYAN risk   |   Green = 100% physical   |   Red financial = 100% physical, <100% financial',
        PAGE[1] - MARGIN, 65, { align: 'right' })
    },
  })

  addFooters(doc, context)
  const tag = [options.area, options.program, options.fundingYears.join('-') || 'AllFY']
    .map((v) => v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0,28))
    .join('_')
  doc.save(`PMS10_Executive_Report_${tag}_${generatedAt.toISOString().slice(0, 10)}.pdf`)
}
