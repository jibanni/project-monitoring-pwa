import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  baseFundingProgram, buildProgramFilterOptions, CANONICAL_PROGRAMS,
  getProjectFundingProgram, normalizeFundingProgramName, normalizeProgramName,
  PROJECT_FORM_FUNDING_SOURCES, projectFormFundingSources,
} from '../src/utils/program.ts'
import {
  defaultRpmesSheet, parseRpmesValues, readRpmesSourceLinks,
  rpmesCodeCohort, rpmesOfficialCohort, rpmesSourceKey, rpmesYearOptions,
} from '../src/utils/rpmesStatusComparison.ts'

test('regular and UA retain their distinct labels for every registered program', () => {
  for (const program of CANONICAL_PROGRAMS) {
    assert.equal(normalizeFundingProgramName(program), program)
    assert.equal(normalizeFundingProgramName(program + '-UA'), program + '-UA')
    assert.equal(baseFundingProgram(program + '-UA'), program)
    assert.ok(PROJECT_FORM_FUNDING_SOURCES.some((option) => normalizeFundingProgramName(option) === program + '-UA'), program)
    assert.deepEqual(buildProgramFilterOptions([program + '-UA', program]), [program, program + '-UA'])
  }
  assert.equal(normalizeProgramName('LGSF - SBDP UA'), 'SBDP')
  assert.equal(normalizeFundingProgramName('FY 2025 · LGSF - SBDP UA'), 'SBDP-UA')
  assert.equal(normalizeFundingProgramName('Growth Equity Fund (Unprogrammed Appropriations)'), 'GEF-UA')
  assert.equal(normalizeFundingProgramName('Custom Funding UA'), 'Custom Funding-UA')
  assert.equal(normalizeFundingProgramName('GUAVA'), 'GUAVA')
  assert.ok(projectFormFundingSources('LGSF - SBDP UA').includes('LGSF - SBDP UA'))
})

test('older official records keep the UA classification in their code', () => {
  assert.equal(getProjectFundingProgram({ funding_source:'SBDP', subaybayan_project_code:'SBDP-UA-2024-01' }), 'SBDP-UA')
  assert.equal(getProjectFundingProgram({ funding_source:'FALGU', subaybayan_project_code:'FALGU-2026-UA-01' }), 'FALGU-UA')
  assert.equal(getProjectFundingProgram({ funding_source:'SubayBAYAN', subaybayan_project_code:'LGSF-GGG–UA–2026–01' }), 'GREEN, GREEN, GREEN-UA')
  assert.equal(getProjectFundingProgram({ funding_source:'FALGU', subaybayan_project_code:'FALGU-2026-GUADALUPE-01' }), 'FALGU')
})

test('standard RPMES rows can mix regular and UA, but cannot mix programs, years, or provinces', () => {
  const regular = ['GEF-2026-01', 'Bukidnon', 'Talakag', 'A', 'Ongoing']
  const ua = ['GEF-UA-26-02', 'Bukidnon', 'Manolo Fortich', 'B', 'Completed']
  assert.deepEqual(parseRpmesValues([regular, ua], 'Bukidnon', '2026', 'GEF').map((row) => row.municipality), ['Talakag'])
  assert.deepEqual(parseRpmesValues([regular, ua], 'Bukidnon', '2026-UA', 'GEF').map((row) => row.municipality), ['Manolo Fortich'])
  assert.throws(() => parseRpmesValues([regular, ua], 'Bukidnon', '2026-UA', 'FALGU'), /program, year and UA/)
  assert.throws(() => parseRpmesValues([regular, ua], 'Bukidnon', '2025-UA', 'GEF'), /program, year and UA/)
  assert.throws(() => parseRpmesValues([regular, ua], 'Camiguin', '2026-UA', 'GEF'), /Camiguin/)
  assert.throws(() => parseRpmesValues([regular], 'Bukidnon', '2026-UA', 'GEF'), /No GEF 2026-UA/)
  assert.throws(() => parseRpmesValues([ua, ua], 'Bukidnon', '2026-UA', 'GEF'), /duplicate/)
  assert.equal(rpmesCodeCohort('3GP-2026-UA-42', 'GREEN, GREEN, GREEN'), '2026-UA')
  assert.equal(rpmesCodeCohort('LIME-20-UA-2026-10', 'LIME-20'), '2026-UA')
})

test('RPMES selects only official projects from the matching fiscal year and classification', () => {
  const base = { funding_source:'LGSF-GEF', funding_year:2026, subaybayan_project_code:'GEF-26-UA-01' }
  assert.equal(rpmesOfficialCohort(base, 'GEF'), '2026-UA')
  assert.equal(rpmesOfficialCohort({...base, funding_source:'LGSF-GEF-UA', subaybayan_project_code:'GEF-2026-01'}, 'GEF'), '2026-UA')
  assert.equal(rpmesOfficialCohort({...base, funding_year:2025}, 'GEF'), undefined)
  assert.equal(rpmesOfficialCohort({...base, pms10_progress_source:'onsite'}, 'GEF'), undefined)
  assert.equal(rpmesOfficialCohort(base, 'SBDP'), undefined)
  assert.ok(rpmesYearOptions([{...base, funding_year:2022}], 'GEF').includes('2022-UA'))
})

test('existing RPMES links survive and new links are isolated by program, year, UA and province', () => {
  const value = 'GEF-rpmes-workbook-id-12345'
  const legacy = 'SBDP-rpmes-workbook-id-12345'
  const key = rpmesSourceKey('2026-UA', 'Bukidnon', 'GEF')
  const links = readRpmesSourceLinks({ [key]: value }, { Bukidnon: legacy })
  assert.equal(links[key], value)
  assert.equal(links[rpmesSourceKey('2025', 'Bukidnon')], legacy)
  assert.equal(links[rpmesSourceKey('2026-UA', 'Bukidnon', 'FALGU')], undefined)
  assert.equal(links[rpmesSourceKey('2026', 'Bukidnon', 'GEF')], undefined)
  assert.equal(links[rpmesSourceKey('2026-UA', 'Camiguin', 'GEF')], undefined)
  assert.equal(defaultRpmesSheet('2025', 'Bukidnon', 'GEF'), undefined)
})
