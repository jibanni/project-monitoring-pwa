export const FOLLOW_UP_PILOT_PROVINCE = 'Bukidnon'

export const FOLLOW_UP_STATUSES = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
} as const
export type FollowUpStatus = keyof typeof FOLLOW_UP_STATUSES
export type FollowUpTiming = 'overdue' | 'due_soon' | 'later' | 'unscheduled' | 'resolved'

export type FollowUpProject = {
  id: string
  project_name: string
  province: string
  municipality: string | null
}
export type InspectionSource = {
  id: string
  project_id: string
  inspection_date: string | null
  recommendations: string | null
  remarks: string | null
  project: FollowUpProject
}
export type FollowUpCandidate = {
  source: InspectionSource
  number: number
  recommendation: string
  suggestedDate: string
}
export type FollowUp = {
  id: string
  project_id: string
  source_update_id: string | null
  source_item: number
  recommendation: string
  responsible_person: string | null
  due_date: string | null
  status: FollowUpStatus
  resolution_note: string | null
  evidence_url: string | null
  updated_at: string
  project: FollowUpProject
}

const manilaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
})
const readableDate = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
})

export function manilaToday(now = new Date()) {
  const parts = manilaDate.formatToParts(now)
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)?.value).join('-')
}

export function dateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : ''
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function followUpTiming(row: { status: FollowUpStatus; due_date: string | null }, today: string): FollowUpTiming {
  if (row.status === 'resolved') return 'resolved'
  const due = dateOnly(row.due_date)
  if (!due) return 'unscheduled'
  if (due < today) return 'overdue'
  if (due <= addDays(today, 7)) return 'due_soon'
  return 'later'
}

export function followUpDateLabel(value: string | null) {
  return dateOnly(value) ? readableDate.format(new Date(`${value}T00:00:00Z`)) : 'Not recorded'
}

export function inspectionCandidates(source: InspectionSource): FollowUpCandidate[] {
  const recommendations = (source.recommendations ?? '').split(/\r?\n[ \t]*\r?\n/)
    .map((text) => text.trim()).filter(Boolean)
  const timelines = [...(source.remarks ?? '').matchAll(/^[ \t]*Timeline[ \t]+(\d+):[ \t]*([^\r\n]+)/gim)]
  // Older rows flatten findings into separate lists. Don't guess which
  // recommendation a date belongs to when several entries are present.
  const hint = recommendations.length === 1 && timelines.length === 1 && timelines[0][1] === '1'
    ? dateOnly(timelines[0][2].trim()) : ''
  return recommendations.map((recommendation, index) => ({
    source, number: index + 1, recommendation, suggestedDate: hint,
  }))
}

export function validEvidenceUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password &&
      value.startsWith('https://') && !/\s/.test(value)
  } catch {
    return false
  }
}

export function sourceKey(updateId: string, item: number) {
  return `${updateId}:${item}`
}

export function inspectionLink(projectId: string, updateId?: string | null) {
  return `/projects/${encodeURIComponent(projectId)}?section=inspections${updateId ? `&inspection=${encodeURIComponent(updateId)}` : ''}`
}
