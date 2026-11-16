import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareRpmesStatus, parseRpmesValues, rpmesCsvUrl, toPhysical } from '../src/utils/rpmesStatusComparison.ts'

const entry = (code, status, physical, province = 'Bukidnon') => ({ code, status, physical, province, municipality: 'Manolo Fortich', title: 'Sample project' })
const compare = (rpm, subay, physical) => compareRpmesStatus([entry('SBDP-2025-01', rpm)], [entry('sbdp-2025-01', subay, physical)])[0].result

test('loads only the intended Form 2 fields from fixed provincial workbooks', () => {
  const url = new URL(rpmesCsvUrl('Misamis Oriental'))
  assert.equal(url.origin, 'https://docs.google.com')
  assert.equal(url.searchParams.get('sheet'), 'RPMES Form 2')
  assert.match(url.searchParams.get('tq'), /select A,C,D,F,AB/)
  assert.equal(parseRpmesValues([['SBDP-2025-01', 'BUKIDNON', 'Sample LGU', 'Sample project', 'Completed']], 'Bukidnon')[0].status, 'Completed')
  assert.throws(() => parseRpmesValues([['SBDP-2025-01', 'MISAMIS ORIENTAL', 'Sample LGU', 'Sample project', 'Completed']], 'Bukidnon'))
  assert.throws(() => parseRpmesValues([['Sign in to Google']], 'Bukidnon'))
})

test('compares the imported stage and the numeric accomplishment without treating blanks as zero', () => {
  assert.equal(compare('Completed', 'Completed', 100), 'Match')
  assert.equal(compare('Ongoing (31-60%)', 'Ongoing', 30.1), 'Match')
  assert.equal(compare('Ongoing (31-60%)', 'Ongoing', 60), 'Match')
  assert.equal(compare('Ongoing (31-60%)', 'Ongoing', 70), 'Progress band mismatch')
  assert.equal(compare('Ongoing (31-60%)', 'Ongoing', null), 'Needs review')
  assert.equal(compare('Ongoing (31-60%)', 'Not Yet Started', null), 'Status mismatch')
  assert.equal(compare('Procurement (Notice to Proceed)', 'Not Yet Started', 0), 'Needs review')
  assert.equal(compare('Preparation of Documents', 'Not Yet Started', null), 'Needs review')
  assert.equal(compare('Procurement (Opening of Bids)', 'Under Procurement', null), 'Needs review')
  assert.equal(compare('', 'Ongoing', 20), 'Needs review')
  assert.equal(toPhysical(''), null)
  assert.equal(toPhysical('0%'), 0)
})

test('does not silently match legacy codes, other provinces, same titles or duplicates', () => {
  const results = compareRpmesStatus([
    entry('SBDP-2025-01', 'Completed'), entry('SBDP-2025-02', 'Completed'), entry('SBDP-2025-02', 'Completed'),
    entry('SBDP-2025-03', 'Completed', 100, 'Misamis Oriental'),
  ], [entry('SBDP-25-01', 'Completed', 100), entry('SBDP-2025-03', 'Completed', 100), entry('', 'Ongoing', 1)])
  assert.deepEqual(results.map((row) => row.result).sort(), ['Duplicate code', 'Missing code', 'RPMES only', 'RPMES only', 'SubayBAYAN only', 'SubayBAYAN only'])
})
