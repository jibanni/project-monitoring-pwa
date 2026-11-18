export type ReportingProject = {
  id: string
  code: string
  title: string | null
  province: string | null
  municipality: string | null
  program: string
  fundingYear: number | null
  status: string
  physical: number | null
  financial: number | null
}

export type ReportingChange = {
  kind: 'Added' | 'Not found in latest data' | 'Revised'
  before: ReportingProject | null
  after: ReportingProject | null
  fields: string[]
}

export const REPORTING_STATUS_ORDER = ['Under Procurement', 'Not Yet Started', 'Ongoing',
  'Completed', 'Suspended', 'Terminated', 'Cancelled'] as const

const fields = [
  ['code', 'Project code'], ['title', 'Project title'], ['province', 'Province'], ['municipality', 'LGU'],
  ['program', 'Program'], ['fundingYear', 'Funding year'], ['status', 'Status'],
  ['physical', 'Physical accomplishment'], ['financial', 'Financial accomplishment'],
] as const

function codeKey(project: ReportingProject) {
  return project.code.trim().toUpperCase()
}

function uniqueCodes(rows: ReportingProject[]) {
  const codes = new Map<string, ReportingProject | null>()
  rows.forEach((row) => {
    const key = codeKey(row)
    if (key) codes.set(key, codes.has(key) ? null : row)
  })
  return codes
}

export function compareReportingProjects(baseline: ReportingProject[], current: ReportingProject[]) {
  const beforeIds = new Set(baseline.map(({ id }) => id))
  const currentIds = new Map(current.map((row) => [row.id, row]))
  const beforeCodes = uniqueCodes(baseline)
  const currentCodes = uniqueCodes(current)
  const used = new Set<string>()
  const changes: ReportingChange[] = []

  for (const before of baseline) {
    const code = codeKey(before)
    const codeMatch = beforeCodes.get(code) === before ? currentCodes.get(code) : null
    // A stable PMS10 ID takes precedence over a code that has been reassigned.
    const after = currentIds.get(before.id) ?? (codeMatch && !beforeIds.has(codeMatch.id) ? codeMatch : null)
    if (!after) {
      changes.push({ kind: 'Not found in latest data', before, after: null, fields: [] })
      continue
    }

    used.add(after.id)
    const changedFields = fields.filter(([key]) => before[key] !== after[key]).map(([, label]) => label)
    if (changedFields.length) changes.push({ kind: 'Revised', before, after, fields: changedFields })
  }
  current.filter(({ id }) => !used.has(id)).forEach((after) => {
    changes.push({ kind: 'Added', before: null, after, fields: [] })
  })

  const counts = (rows: ReportingProject[]) => {
    const tally = new Map<string, number>()
    rows.forEach(({ status }) => tally.set(status, (tally.get(status) ?? 0) + 1))
    return tally
  }
  const previousTotals = counts(baseline)
  const latestTotals = counts(current)
  const statusLabels = new Set<string>([...REPORTING_STATUS_ORDER, ...previousTotals.keys(), ...latestTotals.keys()])
  const summary = Array.from(statusLabels, (label) => {
    const before = previousTotals.get(label) ?? 0
    const after = latestTotals.get(label) ?? 0
    return { label, before, after, delta: after - before }
  }).filter(({ before, after }) => before > 0 || after > 0)
  summary.unshift({ label: 'Total projects', before: baseline.length, after: current.length, delta: current.length - baseline.length })
  return { summary, changes }
}
