import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRpmesValues, rpmesCsvUrl, rpmesSpreadsheetId, summarizeByLgu } from '../src/utils/rpmesStatusComparison.ts'
import { getCanonicalProjectLgu } from '../src/data/region10Directory.ts'

const entry = (municipality, barangay, status, province = 'Bukidnon') => ({ municipality, barangay, status, province })

test('reads the approved Form 2 columns including barangay and calculated status', () => {
  const url = new URL(rpmesCsvUrl('Misamis Oriental'))
  assert.equal(url.origin, 'https://docs.google.com')
  assert.equal(url.searchParams.get('sheet'), 'RPMES Form 2')
  assert.match(url.searchParams.get('tq'), /select A,C,D,E,AB/)
  const row = ['SBDP-2025-01', 'BUKIDNON', 'Talakag', 'SAGARAN', 'Completed']
  assert.deepEqual(parseRpmesValues([row], 'Bukidnon'), [entry('Talakag', 'SAGARAN', 'Completed')])
  assert.throws(() => parseRpmesValues([row], 'Misamis Oriental'))
  assert.throws(() => parseRpmesValues([row, row], 'Bukidnon'), /duplicate/)
  assert.throws(() => parseRpmesValues([['Sign in to Google']], 'Bukidnon'))
})

test('counts distinct barangays, classifies pre-implementation, and retains other statuses in the denominator', () => {
  const [result] = summarizeByLgu([
    entry('CITY OF MALAYBALAY', 'San Martin', 'Ongoing'),
    entry('CITY OF MALAYBALAY', ' SAN MARTIN ', 'Completed'),
    entry('CITY OF MALAYBALAY', '', 'Suspended'),
  ], [
    entry('Malaybalay City', 'San Martin', 'Procurement (Opening of Bids)'),
    entry('MALAYBALAY CITY', 'Brgy. San Martin', 'Preparation of Documents'),
    entry('Malaybalay City', 'Simaya', 'Ongoing (31–60%)'),
    entry('Malaybalay City', 'Simaya', 'Completed'),
  ], getCanonicalProjectLgu)
  assert.equal(result.lgu, 'Malaybalay City')
  assert.deepEqual(result.subay, {projects:3, barangays:1, notStarted:0, ongoing:1, completed:1, completion:1/3, other:1, missingBarangay:1})
  assert.deepEqual(result.rpmes, {projects:4, barangays:2, notStarted:2, ongoing:1, completed:1, completion:1/4, other:0, missingBarangay:0})
})

test('keeps same-named LGUs in different provinces separate and leaves zero-denominator completion blank', () => {
  const result = summarizeByLgu([
    entry('Magsaysay', 'Barangay 1', 'Completed', 'Misamis Oriental'),
  ], [entry('Magsaysay', 'Barangay 1', 'Completed', 'Misamis Occidental')], getCanonicalProjectLgu)
  assert.equal(result.length, 2)
  assert.equal(result[0].subay.completion, null)
  assert.equal(result[1].rpmes.completion, null)
})

test('accepts direct Google Sheets links and builds the Form 2 request independent of the link gid', () => {
  const id = 'private-looking-example12345'
  assert.equal(rpmesSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=0#gid=0`), id)
  assert.equal(rpmesSpreadsheetId(`https://docs.google.com.evil.test/spreadsheets/d/${id}/edit`), '')
  assert.equal(rpmesSpreadsheetId(`http://docs.google.com/spreadsheets/d/${id}`), '')
  assert.equal(rpmesSpreadsheetId(`https://user:pass@docs.google.com/spreadsheets/d/${id}/edit`), '')
  assert.equal(rpmesSpreadsheetId('https://docs.google.com/spreadsheets/d/e/hello/pubhtml'), '')
  assert.match(rpmesCsvUrl('Bukidnon', id), /private-looking-example12345\/gviz/)
})
