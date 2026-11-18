import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRpmesViewSession } from '../src/lib/rpmesViewSession.ts'

test('a fresh RPMES workspace opens with no selected year', () => {
  const view = createRpmesViewSession().getSnapshot()
  assert.equal(view.reportingYear, '')
  assert.equal(view.isUa, false)
  assert.equal(view.selected, '')
  assert.equal(view.differencesOnly, false)
  assert.deepEqual(view.sheets, {})
})

test('an authenticated workspace retains comparison state across subscriptions', () => {
  const workspace = createRpmesViewSession()
  const seen = []
  const unsubscribe = workspace.subscribe(() => seen.push(workspace.getSnapshot()))
  workspace.update({ reportingYear: '2025', isUa: true, selected: 'Bukidnon', loading: true })
  unsubscribe()
  const checkedAt = new Date('2026-11-18T08:00:00Z')
  workspace.update((view) => ({ sheets: {
    ...view.sheets, '2025-UA:Bukidnon': { rows: [], checkedAt, spreadsheetId: 'fixture' },
  }, loading: false, differencesOnly: true }))
  assert.equal(seen.length, 1)
  assert.equal(seen[0].loading, true)
  assert.equal(workspace.getSnapshot().reportingYear, '2025')
  assert.equal(workspace.getSnapshot().isUa, true)
  assert.equal(workspace.getSnapshot().selected, 'Bukidnon')
  assert.equal(workspace.getSnapshot().differencesOnly, true)
  assert.equal(workspace.getSnapshot().sheets['2025-UA:Bukidnon'].checkedAt, checkedAt)
  assert.deepEqual(createRpmesViewSession().getSnapshot().sheets, {})
})
