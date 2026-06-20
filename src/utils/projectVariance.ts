export type ProjectVarianceInput = {
  start_date?: unknown
  target_completion_date?: unknown
  physical_accomplishment?: unknown
  target_physical_accomplishment?: unknown
  target_physical_as_of?: unknown
  target_physical_source?: unknown
  last_inspection_date?: unknown
  updated_at?: unknown
  created_at?: unknown
}

export type ProjectVarianceInfo = {
  actualPhysical: number
  targetPhysical: number
  variance: number
  asOfDate: string
  source: 'manual' | 'auto'
  className: 'ahead' | 'behind' | 'on-track'
  label: string
  compactLabel: string
  statusText: string
  asOfLabel: string
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function toProgressNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())

  if (!Number.isFinite(parsed)) return 0
  if (parsed < 0) return 0
  if (parsed > 100) return 100

  return parsed
}

function parseDate(value: unknown) {
  const text = textValue(value)
  if (!text) return null

  const date = new Date(text.length <= 10 ? `${text}T00:00:00` : text)
  if (Number.isNaN(date.getTime())) return null

  return date
}

function toDateInput(value: unknown) {
  const date = parseDate(value)
  if (!date) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getTodayInput() {
  return toDateInput(new Date().toISOString())
}

function hasManualTarget(project: ProjectVarianceInput) {
  return textValue(project.target_physical_accomplishment) !== ''
}

export function getAutoTargetPhysical(
  project: ProjectVarianceInput | null | undefined,
  asOfOverride?: unknown,
) {
  if (!project) return 0

  const startDate = parseDate(project.start_date)
  const targetDate = parseDate(project.target_completion_date)
  const asOfDate =
    parseDate(asOfOverride) ||
    parseDate(project.target_physical_as_of) ||
    parseDate(project.last_inspection_date) ||
    new Date()

  if (!startDate || !targetDate) {
    return toProgressNumber(project.physical_accomplishment)
  }

  const totalDuration = targetDate.getTime() - startDate.getTime()

  if (totalDuration <= 0) {
    return asOfDate.getTime() >= startDate.getTime() ? 100 : 0
  }

  const elapsed = asOfDate.getTime() - startDate.getTime()
  const percent = (elapsed / totalDuration) * 100

  return toProgressNumber(percent)
}

export function formatProgressInput(value: unknown) {
  const numberValue = toProgressNumber(value)
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2).replace(/\.00$/, '')
}

export function formatSignedVariance(value: unknown) {
  const parsed = Number(value)
  const numberValue = Number.isFinite(parsed) ? parsed : 0
  const rounded = Math.abs(numberValue) < 0.005 ? 0 : numberValue
  const formatted = Math.abs(rounded).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

  if (rounded > 0) return `+${formatted}%`
  if (rounded < 0) return `-${formatted}%`
  return '0%'
}

export function formatAsOfDate(value: unknown) {
  const date = parseDate(value)

  if (!date) return 'No date'

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function getVarianceClassName(value: unknown): ProjectVarianceInfo['className'] {
  const parsed = Number(value)
  const numberValue = Number.isFinite(parsed) ? parsed : 0

  if (numberValue < -0.004) return 'behind'
  if (numberValue > 0.004) return 'ahead'

  return 'on-track'
}

export function getTargetPhysicalInfo(
  project: ProjectVarianceInput | null | undefined,
  asOfOverride?: unknown,
): ProjectVarianceInfo {
  const safeProject = project || {}
  const actualPhysical = toProgressNumber(safeProject.physical_accomplishment)
  const asOfDate =
    toDateInput(asOfOverride) ||
    toDateInput(safeProject.target_physical_as_of) ||
    toDateInput(safeProject.last_inspection_date) ||
    toDateInput(safeProject.updated_at) ||
    getTodayInput()
  const source: ProjectVarianceInfo['source'] = hasManualTarget(safeProject)
    ? 'manual'
    : 'auto'
  const targetPhysical = source === 'manual'
    ? toProgressNumber(safeProject.target_physical_accomplishment)
    : getAutoTargetPhysical(safeProject, asOfDate)
  const variance = actualPhysical - targetPhysical
  const className = getVarianceClassName(variance)
  const compactVariance = formatSignedVariance(variance)
  const statusText = ''

  return {
    actualPhysical,
    targetPhysical,
    variance,
    asOfDate,
    source,
    className,
    label: compactVariance,
    compactLabel: compactVariance,
    statusText,
    asOfLabel: `As of ${formatAsOfDate(asOfDate)}`,
  }
}
