import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOnsiteProject, selectSubaybayanOfficialProjects } from '../src/utils/dashboardProjectSources.ts'

const official = {
  id: 'project', subaybayan_project_code: 'SBDP-2025-01', status: 'Not Yet Started',
  physical_accomplishment: 0, financial_accomplishment: 12, risk_level: 'High',
  latitude: 8.1, longitude: 124.5, last_inspection_date: null,
}
const field = {
  project_id: 'project', status: 'Ongoing', physical_accomplishment: '52',
  financial_accomplishment: 23, risk_level: 'Low', inspection_date: '2026-11-16',
  inspection_latitude: 8.3, inspection_longitude: 124.7,
}

test('official scope excludes records without the imported project link', () => {
  const rows = [official, { id: 'manual', project_code: 'SBDP-2025-02' }, { id: 'empty', subaybayan_project_code: ' ' }, buildOnsiteProject(official, field)]
  assert.deepEqual(selectSubaybayanOfficialProjects(rows), [official])
})

test('inspection progress, status, date and GPS overlay only a separate Actual snapshot', () => {
  const before = structuredClone(official)
  const actual = buildOnsiteProject(official, field)
  assert.deepEqual(official, before)
  assert.notEqual(actual, official)
  assert.equal(actual.status, 'Ongoing')
  assert.equal(actual.physical_accomplishment, 52)
  assert.equal(actual.financial_accomplishment, 23)
  assert.equal(actual.last_inspection_date, '2026-11-16')
  assert.deepEqual([actual.latitude, actual.longitude], [8.3, 124.7])
})

test('missing field values are not replaced with official observations', () => {
  assert.equal(buildOnsiteProject(official, undefined), null)
  assert.equal(buildOnsiteProject(official, { ...field, project_id: 'another-project' }), null)
  const actual = buildOnsiteProject(official, {
    ...field, status: 'Suspended', physical_accomplishment: 25, financial_accomplishment: null,
    inspection_latitude: null, inspection_longitude: null,
  })
  assert.equal(actual.status, 'Suspended')
  assert.equal(actual.financial_accomplishment, null)
  assert.equal(actual.target_physical_accomplishment, null)
  assert.equal(actual.latitude, null)
  assert.equal(actual.longitude, null)
  assert.equal(buildOnsiteProject(official, { ...field, physical_accomplishment: 100 }).risk_level, 'None')
})
