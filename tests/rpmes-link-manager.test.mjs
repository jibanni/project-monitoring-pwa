import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultRpmesSheet, prepareRpmesLinkSettings, readRpmesSourceLinks, resolveRpmesSheet,
  rpmesLinkSlots, rpmesSheetLink, rpmesSourceKey,
} from '../src/utils/rpmesStatusComparison.ts'

const regular = 'fixture-rpmes-regular-id-0001'
const ua = 'fixture-rpmes-ua-id-00000001'
const legacy = 'fixture-rpmes-legacy-id-00001'

test('exposes five provinces for each of the two variants in a year', () => {
  const slots = rpmesLinkSlots('2026')
  assert.equal(slots.length, 10)
  assert.equal(new Set(slots.map(({ key }) => key)).size, 10)
  assert.deepEqual(slots.filter(({ province }) => province === 'Camiguin').map(({ label, key }) => [label, key]), [
    ['SBDP', '2026:Camiguin'], ['SBDP-UA', '2026-UA:Camiguin'],
  ])
  assert.deepEqual(rpmesLinkSlots('2026-UA'), [])
})

test('saves independent links across years, variants and provinces without fetching data', () => {
  const links = { '2024:Camiguin': legacy }
  const a = rpmesSourceKey('2026', 'Bukidnon')
  const b = rpmesSourceKey('2026-UA', 'Bukidnon')
  const c = rpmesSourceKey('2025-UA', 'Camiguin')
  const result = prepareRpmesLinkSettings(links, ['2024', '2025', '2026'].flatMap(rpmesLinkSlots), {
    [a]: rpmesSheetLink(regular) + '?gid=123#gid=123',
    [b]: rpmesSheetLink(ua),
    [c]: rpmesSheetLink(ua),
  })
  assert.deepEqual(result.invalid, [])
  assert.deepEqual(new Set(result.changed), new Set([a, b, c]))
  const reloaded = readRpmesSourceLinks(JSON.parse(JSON.stringify(result.next)), {})
  assert.equal(resolveRpmesSheet(reloaded, '2026', 'Bukidnon'), regular)
  assert.equal(resolveRpmesSheet(reloaded, '2026-UA', 'Bukidnon'), ua)
  assert.equal(resolveRpmesSheet(reloaded, '2025-UA', 'Camiguin'), ua)
  assert.equal(resolveRpmesSheet(reloaded, '2024', 'Camiguin'), legacy)
  assert.equal(resolveRpmesSheet(reloaded, '2026-UA', 'Camiguin'), undefined)
})

test('identifies malformed URLs and leaves source links unchanged until committed', () => {
  const links = { '2026:Camiguin': regular }
  const slot = rpmesSourceKey('2026', 'Camiguin')
  const result = prepareRpmesLinkSettings(links, rpmesLinkSlots('2026'), { [slot]: 'https://other.example/workbook' })
  assert.equal(result.invalid[0].key, slot)
  assert.equal(result.invalid[0].year, '2026')
  assert.deepEqual(result.changed, [])
  assert.deepEqual(result.next, links)
})

test('can clear links without old or default ones reappearing after reload', () => {
  const key = rpmesSourceKey('2025', 'Bukidnon')
  const links = readRpmesSourceLinks({}, { Bukidnon: legacy })
  assert.ok(defaultRpmesSheet('2025', 'Bukidnon'))
  assert.equal(resolveRpmesSheet(links, '2025', 'Bukidnon'), legacy)
  const result = prepareRpmesLinkSettings(links, rpmesLinkSlots('2025'), { [key]: '   ' })
  assert.equal(result.next[key], null)
  const reloaded = readRpmesSourceLinks(JSON.parse(JSON.stringify(result.next)), { Bukidnon: legacy })
  assert.equal(resolveRpmesSheet(reloaded, '2025', 'Bukidnon'), undefined)
  assert.equal(resolveRpmesSheet(reloaded, '2025', 'Misamis Oriental'), defaultRpmesSheet('2025', 'Misamis Oriental'))
})
