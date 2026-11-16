import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addDays, dateOnly, followUpTiming, inspectionCandidates, inspectionLink, manilaToday, validEvidenceUrl,
} from '../src/utils/inspectionFollowUps.ts'

const source = {
  id: 'inspection', project_id: 'project', inspection_date: '2026-11-04',
  project: { id: 'project', project_name: 'Test project', province: 'Bukidnon', municipality: 'Talakag' },
}
test('uses the Manila date across midnight', () => {
  assert.equal(manilaToday(new Date('2026-11-16T15:59:59Z')), '2026-11-16')
  assert.equal(manilaToday(new Date('2026-11-16T16:00:00Z')), '2026-11-17')
  assert.equal(addDays('2026-12-28', 7), '2027-01-04')
})
test('buckets due dates and excludes resolved actions from reminders', () => {
  const timing = (due_date, status = 'open') => followUpTiming({ status, due_date }, '2026-11-16')
  assert.equal(timing('2026-11-15'), 'overdue')
  assert.equal(timing('2026-11-16'), 'due_soon')
  assert.equal(timing('2026-11-23', 'in_progress'), 'due_soon')
  assert.equal(timing('2026-11-24'), 'later')
  assert.equal(timing(null), 'unscheduled')
  assert.equal(timing('2026-11-15', 'resolved'), 'resolved')
  assert.equal(dateOnly('2026-02-30'), '')
})
test('only suggests an explicitly unambiguous ISO-date timeline', () => {
  assert.equal(inspectionCandidates({ ...source, recommendations: 'Replace guardrail.', remarks: 'Timeline 1: 2026-11-18' })[0].suggestedDate, '2026-11-18')
  const multi = inspectionCandidates({ ...source, recommendations: 'Replace guardrail.\n\nRepair drainage.', remarks: 'Timeline 1: 2026-11-18' })
  assert.deepEqual(multi.map((item) => [item.number, item.suggestedDate]), [[1, ''], [2, '']])
  assert.equal(inspectionCandidates({ ...source, recommendations: 'Replace guardrail.', remarks: 'Timeline 2: 2026-11-18' })[0].suggestedDate, '')
  assert.equal(inspectionCandidates({ ...source, recommendations: 'Replace guardrail.', remarks: 'Timeline 1: within three weeks' })[0].suggestedDate, '')
})
test('opens a specific inspection and accepts only HTTPS evidence links', () => {
  assert.equal(inspectionLink('project-id', 'inspection-id'), '/projects/project-id?section=inspections&inspection=inspection-id')
  assert.equal(inspectionLink('project-id', null), '/projects/project-id?section=inspections')
  assert.equal(validEvidenceUrl('https://drive.google.com/file/d/sample/view'), true)
  assert.equal(validEvidenceUrl('https://someone:pass@files.example/'), false)
  assert.equal(validEvidenceUrl('file:///private/data'), false)
  assert.equal(validEvidenceUrl('javascript:alert(1)'), false)
})
