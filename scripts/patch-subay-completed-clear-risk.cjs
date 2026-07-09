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

// Ensure imported completed projects are saved as None risk even if SubayBAYAN says High Risk.
if (!code.includes('function isSubayCompletedRecord')) {
  const marker = "function normalizeRiskLevel(value: unknown) {"
  const helper = `function isSubayCompletedRecord(status: unknown, physicalAccomplishment: unknown) {
  const normalizedStatus = textValue(status).toLowerCase()
  const physical = parseNumber(physicalAccomplishment)

  return physical >= 100 || normalizedStatus.includes('complete')
}

`
  replaceOnce(marker, helper + marker, 'isSubayCompletedRecord helper')
}

if (!code.includes("risk_level: isSubayCompletedRecord(record.status, record.physicalAccomplishment)")) {
  replaceOnce(
    "    risk_level: record.riskLevel || 'None',",
    "    risk_level: isSubayCompletedRecord(record.status, record.physicalAccomplishment)\n      ? 'None'\n      : record.riskLevel || 'None',",
    'clear risk_level for completed SubayBAYAN records',
  )
}

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched src/services/subayImportService.ts so completed imported projects are not High Risk.')
} else {
  console.log('No changes made. File may already be patched or markers differ.')
}
