import { getComputedRiskLevel } from './projectVariance'

type RiskLevel = 'None' | 'Low' | 'Moderate' | 'High'

type DeadlineBasis =
  | 'Revised Contract Expiry'
  | 'Contract Expiry'
  | 'Target Completion'
  | 'Status'
  | 'None'

type DeadlineRiskInfo = {
  level: RiskLevel
  basis: DeadlineBasis
  label: string
  effectiveDate: string | null
  daysRemaining: number | null
}

const HIGH_RISK_STATUSES = ['terminated', 'cancelled', 'canceled', 'suspended']
const COMPLETED_STATUSES = ['completed', 'complete']

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeDate(value: unknown) {
  const text = textValue(value)

  if (!text) return null

  const date = new Date(text)

  if (Number.isNaN(date.getTime())) return null

  date.setHours(0, 0, 0, 0)

  return date
}

function formatDateLabel(value: Date | null) {
  if (!value) return ''

  return value.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function daysBetween(fromDate: Date, toDate: Date) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const from = new Date(fromDate)
  const to = new Date(toDate)

  from.setHours(0, 0, 0, 0)
  to.setHours(0, 0, 0, 0)

  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY)
}

function normalizeRisk(value: unknown): RiskLevel {
  const risk = textValue(value).toLowerCase()

  if (!risk || risk.includes('none') || risk.includes('no risk')) return 'None'
  if (risk.includes('high')) return 'High'
  if (risk.includes('moderate') || risk.includes('medium')) return 'Moderate'
  if (risk.includes('low')) return 'Low'

  return 'None'
}

function riskScore(risk: RiskLevel) {
  if (risk === 'High') return 3
  if (risk === 'Moderate') return 2
  if (risk === 'Low') return 1
  return 0
}

function maxRisk(first: RiskLevel, second: RiskLevel): RiskLevel {
  return riskScore(first) >= riskScore(second) ? first : second
}

function getStatus(project: Record<string, any>) {
  return textValue(
    project.status ||
      project.project_status ||
      project.implementation_status ||
      project.current_status,
  ).toLowerCase()
}

function getPhysical(project: Record<string, any>) {
  return toNumber(
    project.physical_accomplishment ??
      project.physical_progress ??
      project.physical ??
      project.total_accomplishment ??
      0,
  )
}

export function isProjectCompleted(project: Record<string, any> | null | undefined) {
  if (!project) return false

  const status = getStatus(project)
  const physical = getPhysical(project)

  return (
    physical >= 100 ||
    COMPLETED_STATUSES.some((keyword) => status.includes(keyword))
  )
}

export function getEffectiveDeadline(project: Record<string, any>) {
  const revisedContractExpiry = normalizeDate(project.revised_contract_expiration_date)
  const contractExpiry = normalizeDate(project.contract_expiration_date)
  const targetCompletion = normalizeDate(project.target_completion_date)

  if (revisedContractExpiry) {
    return {
      date: revisedContractExpiry,
      basis: 'Revised Contract Expiry' as DeadlineBasis,
      label: 'revised contract expiry',
    }
  }

  if (contractExpiry) {
    return {
      date: contractExpiry,
      basis: 'Contract Expiry' as DeadlineBasis,
      label: 'contract expiry',
    }
  }

  if (targetCompletion) {
    return {
      date: targetCompletion,
      basis: 'Target Completion' as DeadlineBasis,
      label: 'target completion date',
    }
  }

  return {
    date: null,
    basis: 'None' as DeadlineBasis,
    label: '',
  }
}

export function getDeadlineRiskInfo(
  project: Record<string, any> | null | undefined,
  asOfDate: Date = new Date(),
): DeadlineRiskInfo {
  if (!project) {
    return {
      level: 'None',
      basis: 'None',
      label: 'No project deadline basis available.',
      effectiveDate: null,
      daysRemaining: null,
    }
  }

  const status = getStatus(project)
  const physical = getPhysical(project)

  if (isProjectCompleted(project)) {
    return {
      level: 'None',
      basis: 'None',
      label: 'Completed project: automatic high-risk tagging is cleared.',
      effectiveDate: null,
      daysRemaining: null,
    }
  }

  if (HIGH_RISK_STATUSES.some((keyword) => status.includes(keyword))) {
    return {
      level: 'High',
      basis: 'Status',
      label: 'Critical status: project is suspended, terminated, or cancelled.',
      effectiveDate: null,
      daysRemaining: null,
    }
  }

  const effectiveDeadline = getEffectiveDeadline(project)

  if (!effectiveDeadline.date) {
    return {
      level: 'None',
      basis: 'None',
      label: 'No target completion, contract expiry, or revised contract expiry date encoded.',
      effectiveDate: null,
      daysRemaining: null,
    }
  }

  const daysRemaining = daysBetween(asOfDate, effectiveDeadline.date)
  const dateLabel = formatDateLabel(effectiveDeadline.date)
  const isTargetFallback = effectiveDeadline.basis === 'Target Completion'

  if (daysRemaining < 0) {
    return {
      level: 'High',
      basis: effectiveDeadline.basis,
      label: `High risk: ${effectiveDeadline.label} already lapsed on ${dateLabel}.`,
      effectiveDate: effectiveDeadline.date.toISOString().slice(0, 10),
      daysRemaining,
    }
  }

  if (!isTargetFallback && daysRemaining <= 30 && physical < 80) {
    return {
      level: 'High',
      basis: effectiveDeadline.basis,
      label: `High risk: ${effectiveDeadline.label} is within ${daysRemaining} day(s) and physical accomplishment is below 80%.`,
      effectiveDate: effectiveDeadline.date.toISOString().slice(0, 10),
      daysRemaining,
    }
  }

  if (!isTargetFallback && daysRemaining <= 30 && physical < 100) {
    return {
      level: 'Moderate',
      basis: effectiveDeadline.basis,
      label: `Warning: ${effectiveDeadline.label} is within ${daysRemaining} day(s).`,
      effectiveDate: effectiveDeadline.date.toISOString().slice(0, 10),
      daysRemaining,
    }
  }

  if (isTargetFallback && daysRemaining <= 30 && physical < 80) {
    return {
      level: 'Moderate',
      basis: effectiveDeadline.basis,
      label: `Warning: no expiry date encoded; target completion is within ${daysRemaining} day(s).`,
      effectiveDate: effectiveDeadline.date.toISOString().slice(0, 10),
      daysRemaining,
    }
  }

  return {
    level: 'None',
    basis: effectiveDeadline.basis,
    label:
      effectiveDeadline.basis === 'Target Completion'
        ? 'No revised or original contract expiry encoded; target completion is used as fallback.'
        : `On track based on ${effectiveDeadline.label}.`,
    effectiveDate: effectiveDeadline.date.toISOString().slice(0, 10),
    daysRemaining,
  }
}

export function getComputedRiskLevelWithDeadline(project: Record<string, any> | null | undefined) {
  // Completed projects must not remain High Risk even if the old stored
  // risk_level from SubayBAYAN or manual encoding is High.
  if (isProjectCompleted(project)) {
    return 'None'
  }

  const baseRisk = normalizeRisk(getComputedRiskLevel(project || {}))
  const deadlineRisk = getDeadlineRiskInfo(project).level

  return maxRisk(baseRisk, deadlineRisk)
}

export function getDeadlineRiskBasisLabel(project: Record<string, any> | null | undefined) {
  return getDeadlineRiskInfo(project).label
}
