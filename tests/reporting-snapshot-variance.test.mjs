import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareReportingProjects } from '../src/utils/reportingSnapshotVariance.ts'

const project = (id, status = 'Ongoing') => ({
  id, code: 'SBDP-2025-' + id, title: 'Project ' + id, province: 'Bukidnon',
  municipality: 'Talakag', program: 'SBDP', fundingYear: 2025, status,
  physical: status === 'Completed' ? 100 : 55, financial: null,
})

test('compares totals and explains movements, arrivals and missing records', () => {
  const result = compareReportingProjects(
    [project('1'), project('2', 'Completed'), project('3')],
    [project('1', 'Completed'), project('2', 'Completed'), project('4', 'Under Procurement')],
  )
  assert.deepEqual(result.summary[0], { label: 'Total projects', before: 3, after: 3, delta: 0 })
  assert.deepEqual(result.summary.find(({ label }) => label === 'Completed'), { label: 'Completed', before: 1, after: 2, delta: 1 })
  assert.deepEqual(result.changes.map(({ kind }) => kind), ['Revised', 'Not found in latest data', 'Added'])
  assert.deepEqual(result.changes[0].fields, ['Status', 'Physical accomplishment'])
  assert.equal(result.changes[1].after, null)
})
test('matches unique reissued identifiers but prioritizes stable project IDs', () => {
  const first = project('1')
  const second = project('2')
  assert.deepEqual(compareReportingProjects([first], [{ ...first, id: 'new' }]).changes, [])
  const result = compareReportingProjects([first, second], [{ ...second, code: first.code }])
  assert.deepEqual(result.changes.map(({ kind }) => kind), ['Not found in latest data', 'Revised'])
  assert.deepEqual(result.changes[1].fields, ['Project code'])
})
test('does not merge duplicate codes or treat a null figure as zero', () => {
  const first = project('1')
  const second = { ...project('2'), code: first.code, financial: 0 }
  const result = compareReportingProjects([first, second], [{ ...first, id: 'new' }, { ...second, financial: null }])
  assert.deepEqual(result.changes.map(({ kind }) => kind), ['Not found in latest data', 'Revised', 'Added'])
  assert.deepEqual(result.changes[1].fields, ['Financial accomplishment'])
})
