import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultRpmesSheet, parseRpmesValues, readRpmesSourceLinks, rpmesCsvUrl, rpmesSourceKey, rpmesSpreadsheetId, RPMES_COHORTS, RPMES_PROVINCES, sbdpCodeCohort, sbdpOfficialCohort, summarizeByLgu } from '../src/utils/rpmesStatusComparison.ts'
import { getCanonicalProjectLgu } from '../src/data/region10Directory.ts'

const entry = (municipality, barangay, status, province = 'Bukidnon') => ({ municipality, barangay, status, province })

test('reads the approved Form 2 columns including barangay and calculated status', () => {
  const url = new URL(rpmesCsvUrl(defaultRpmesSheet('2025', 'Misamis Oriental')))
  assert.equal(url.origin, 'https://docs.google.com')
  assert.equal(url.searchParams.get('sheet'), 'RPMES Form 2')
  assert.match(url.searchParams.get('tq'), /select A,C,D,E,AB/)
  const row = ['SBDP-2025-01', 'BUKIDNON', 'Talakag', 'SAGARAN', 'Completed']
  assert.deepEqual(parseRpmesValues([row], 'Bukidnon', '2025'), [entry('Talakag', 'SAGARAN', 'Completed')])
  assert.throws(() => parseRpmesValues([row], 'Misamis Oriental', '2025'))
  assert.throws(() => parseRpmesValues([row, row], 'Bukidnon', '2025'), /duplicate/)
  assert.throws(() => parseRpmesValues([['Sign in to Google']], 'Bukidnon', '2025'))
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
  assert.match(rpmesCsvUrl(id), /private-looking-example12345\/gviz/)
})

test('matches all eight cohorts and validates the sheet year and UA independently', () => {
  assert.equal(RPMES_COHORTS.length, 8)
  assert.equal(RPMES_PROVINCES.length, 5)
  for (const value of RPMES_COHORTS) {
    const code = value.endsWith('-UA') ? `SBDP-UA-${value.slice(0, 4)}-01` : `SBDP-${value}-01`
    assert.equal(sbdpCodeCohort(code), value)
    assert.equal(parseRpmesValues([[code, 'Camiguin', 'Mambajao', 'Barangay 1', 'Ongoing']], 'Camiguin', value).length, 1)
  }
  assert.equal(sbdpCodeCohort('SBDP-24-UA-10-01'), '2024-UA')
  assert.equal(sbdpCodeCohort('SBDP-25-10-04'), '2025')
  assert.equal(sbdpCodeCohort('FALGU-25-10-04'), undefined)
  const regular = ['SBDP-2025-01', 'Camiguin', 'Mambajao', 'Barangay 1', 'Completed']
  assert.throws(() => parseRpmesValues([regular], 'Camiguin', '2025-UA'), /year and UA/)
  assert.throws(() => parseRpmesValues([regular], 'Camiguin', '2026'), /year and UA/)
})

test('keeps existing links in 2025 and isolates stored links by cohort and province', () => {
  const id = 'legacy-spreadsheet-1234567'
  const ua = 'replacement-ua-sheet-12345'
  const links = readRpmesSourceLinks({ '2025-UA:Camiguin': ua, '2024:Lanao del Norte': 'invalid' }, { Bukidnon: id })
  assert.equal(links[rpmesSourceKey('2025', 'Bukidnon')], id)
  assert.equal(links[rpmesSourceKey('2025-UA', 'Bukidnon')], undefined)
  assert.equal(links[rpmesSourceKey('2025-UA', 'Camiguin')], ua)
  assert.equal(links[rpmesSourceKey('2024', 'Lanao del Norte')], undefined)
  assert.equal(defaultRpmesSheet('2026', 'Bukidnon'), undefined)
  assert.equal(defaultRpmesSheet('2025', 'Lanao del Norte'), undefined)
})

test('uses official project codes when stored program names collapse regular SBDP and UA', () => {
  const base = { funding_year: 2024, funding_source: 'SBDP' }
  assert.equal(sbdpOfficialCohort({ ...base, subaybayan_project_code: 'SBDP-UA-2024-10-01' }), '2024-UA')
  assert.equal(sbdpOfficialCohort({ ...base, subaybayan_project_code: 'SBDP-2024-10-01' }), '2024')
  assert.equal(sbdpOfficialCohort({ ...base, funding_source: 'LGSF - SBDP UA', subaybayan_project_code: 'SBDP-2024-10-01' }), '2024-UA')
  assert.equal(sbdpOfficialCohort({ ...base, subaybayan_project_code: 'SBDP-UA-2025-10-01' }), undefined)
  assert.equal(sbdpOfficialCohort({ ...base, subaybayan_project_code: 'SBDP-2024-10-01', pms10_progress_source: 'onsite' }), undefined)
})
