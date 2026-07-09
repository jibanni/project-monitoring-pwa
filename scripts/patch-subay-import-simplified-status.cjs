const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/services/subayImportService.ts')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

function replaceOnce(search, replacement, label) {
  if (!code.includes(search)) {
    console.warn(`Marker not found, skipped: ${label}`)
    return
  }

  code = code.replace(search, replacement)
  changed = true
  console.log(`Patched: ${label}`)
}

if (!code.includes('function getSimplifiedImportStatus')) {
  const marker = 'export function projectPayloadFromSubayRecord(record: SubayImportRecord) {'
  const helper = `function hasImportContractEvidence(record: SubayImportRecord) {
  return (
    textValue(record.contractor).length > 0 ||
    parseNumber(record.contractAmount) > 0 ||
    textValue(record.startDate).length > 0 ||
    textValue(record.contractExpirationDate).length > 0 ||
    textValue((record as any).revisedContractExpirationDate).length > 0
  )
}

export function getSimplifiedImportStatus(record: SubayImportRecord) {
  const rawStatus = textValue(record.status).toLowerCase()
  const physical = parseNumber(record.physicalAccomplishment)

  if (physical >= 100 || rawStatus.includes('complete')) return 'Completed'
  if (rawStatus.includes('terminat')) return 'Terminated'
  if (rawStatus.includes('cancel')) return 'Cancelled'
  if (rawStatus.includes('suspend')) return 'Suspended'
  if (physical > 0) return 'Ongoing'
  if (hasImportContractEvidence(record)) return 'Not Yet Started'

  return 'Under Procurement'
}

`
  replaceOnce(marker, helper + marker, 'simplified import status helper')
}

replaceOnce(
  "    status: record.status || 'Not Yet Started',",
  "    status: getSimplifiedImportStatus(record),",
  'projectPayloadFromSubayRecord status normalization',
)

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched Subay import so PMS10 saves simplified statuses.')
} else {
  console.log('No changes made. It may already be patched or markers differ.')
}
