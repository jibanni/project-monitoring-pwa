type ProjectLike = {
  physical_accomplishment?: number | string | null
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  start_date?: string | null
  target_completion_date?: string | null
  last_inspection_date?: string | null
  inspection_date?: string | null
}

export type TargetPhysicalInfo = {
  physical: number
  actualPhysical: number
  targetPhysical: number
  variance: number
  label: string
  compactLabel: string
  className: 'ahead' | 'behind' | 'on-track'
  asOfLabel: string
  sourceLabel: string
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').replace('%', '').trim())

  return Number.isFinite(parsed) ? parsed : 0
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

export function clampProgress(value: unknown): number {
  const parsed = toNumber(value)

  if (parsed < 0) return 0
  if (parsed > 100) return 100

  return parsed
}

export function roundVariance(value: unknown): number {
  const parsed = toNumber(value)
  return Math.round(parsed * 100) / 100
}

function formatNumberForPercent(value: number, decimalPlaces = 2): string {
  const rounded = roundVariance(value)

  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  })
}

export function formatSignedVariance(value: unknown, decimalPlaces = 2): string {
  const variance = roundVariance(value)

  if (!Number.isFinite(variance) || variance === 0) return '0%'

  const sign = variance > 0 ? '+' : ''
  return `${sign}${formatNumberForPercent(variance, decimalPlaces)}%`
}

export function formatProgressInput(value: unknown): string {
  if (!hasValue(value)) return ''

  const progress = clampProgress(value)

  if (Number.isInteger(progress)) {
    return String(progress)
  }

  return String(roundVariance(progress))
}

function formatLongDate(value?: string | null): string {
  if (!value) return 'No date'

  const normalized = value.length <= 10 ? `${value}T00:00:00` : value
  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) return 'No date'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function getRiskLevelFromVariance(
  value: unknown,
): 'None' | 'Low' | 'Moderate' | 'High' {
  const variance = roundVariance(value)

  if (!Number.isFinite(variance) || variance >= 0) return 'None'
  if (variance >= -5) return 'Low'
  if (variance > -10) return 'Moderate'

  return 'High'
}

export function getComputedRiskLevel(
  project?: ProjectLike | null,
): 'None' | 'Low' | 'Moderate' | 'High' {
  return getRiskLevelFromVariance(getTargetPhysicalInfo(project).variance)
}

/*
  Compatibility function only.
  Target Physical is now manual-only.
  This no longer computes time-elapsed target.
*/
export function getAutoTargetPhysical(project?: ProjectLike | null): number {
  if (!project) return 0

  if (hasValue(project.target_physical_accomplishment)) {
    return clampProgress(project.target_physical_accomplishment)
  }

  return 0
}

export function getTargetPhysicalInfo(
  project?: ProjectLike | null,
  asOfDate?: string | null,
): TargetPhysicalInfo {
  const actualPhysical = clampProgress(project?.physical_accomplishment)

  const targetPhysical = hasValue(project?.target_physical_accomplishment)
    ? clampProgress(project?.target_physical_accomplishment)
    : 0

  const variance = roundVariance(actualPhysical - targetPhysical)

  let className: TargetPhysicalInfo['className'] = 'on-track'

  if (variance > 0) className = 'ahead'
  if (variance < 0) className = 'behind'

  const dateSource =
    asOfDate ||
    project?.target_physical_as_of ||
    project?.inspection_date ||
    project?.last_inspection_date ||
    null

  return {
    physical: actualPhysical,
    actualPhysical,
    targetPhysical,
    variance,
    label: formatSignedVariance(variance),
    compactLabel: formatSignedVariance(variance),
    className,
    asOfLabel: dateSource ? `As of ${formatLongDate(dateSource)}` : 'As of inspection',
    sourceLabel: 'Manual target',
  }
}

export function getVarianceClassName(
  value: unknown,
): 'ahead' | 'behind' | 'on-track' {
  const variance = roundVariance(value)

  if (variance > 0) return 'ahead'
  if (variance < 0) return 'behind'

  return 'on-track'
}