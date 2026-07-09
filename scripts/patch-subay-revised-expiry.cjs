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

// 1. Add revisedContractExpirationDate to the SubayImportRecord type.
replaceOnce(
  "  contractExpirationDate: string | null\n  sourceSummary: string",
  "  contractExpirationDate: string | null\n  revisedContractExpirationDate: string | null\n  sourceSummary: string",
  "SubayImportRecord.revisedContractExpirationDate",
)

// 2. Add header key.
replaceOnce(
  "  | 'contractExpirationDate'",
  "  | 'contractExpirationDate'\n  | 'revisedContractExpirationDate'",
  "HeaderKey.revisedContractExpirationDate",
)

// 3. Add aliases. This targets the ACCOMPLISHMENT > TOTAL ACCOMPLISHMENT > DATE column.
//    It should not replace the original DATE OF EXPIRATION OF CONTRACT.
replaceOnce(
  "  contractExpirationDate: [\n    'DATE OF EXPIRATION OF CONTRACT',\n    'CONTRACT EXPIRATION DATE',\n    'EXPIRATION DATE',\n  ],",
  "  contractExpirationDate: [\n    'DATE OF EXPIRATION OF CONTRACT',\n    'CONTRACT EXPIRATION DATE',\n    'EXPIRATION DATE',\n  ],\n  revisedContractExpirationDate: [\n    'ACCOMPLISHMENT DATE',\n    'TOTAL ACCOMPLISHMENT DATE',\n    'ACCOMPLISHMENT TOTAL ACCOMPLISHMENT DATE',\n    'TOTAL ACCOMPLISHMENT',\n  ],",
  "HEADER_ALIASES.revisedContractExpirationDate",
)

// 4. Improve createHeaderDescriptors by including the left non-empty header.
replaceOnce(
  "  let carriedHeader = ''\n\n  for (let index = 0; index < maxColumns; index += 1) {",
  "  let carriedHeader = ''\n  let leftHeader = ''\n\n  for (let index = 0; index < maxColumns; index += 1) {",
  "createHeaderDescriptors.leftHeader variable",
)

replaceOnce(
  "    if (mainHeader) {\n      carriedHeader = mainHeader\n    }\n\n    const candidates = uniqueStrings([",
  "    if (mainHeader) {\n      carriedHeader = mainHeader\n    }\n\n    const candidates = uniqueStrings([",
  "createHeaderDescriptors keep carriedHeader marker",
)

if (!code.includes("      `${leftHeader} ${mainHeader}`,")) {
  replaceOnce(
    "      `${previousHeader} ${mainHeader}`,\n      `${previousHeader} ${mainHeader} ${subHeader}`,",
    "      `${previousHeader} ${mainHeader}`,\n      `${leftHeader} ${mainHeader}`,\n      `${leftHeader} ${mainHeader} ${subHeader}`,\n      `${previousHeader} ${mainHeader} ${subHeader}`,",
    "createHeaderDescriptors leftHeader candidates",
  )
}

if (!code.includes("    if (mainHeader) leftHeader = mainHeader")) {
  replaceOnce(
    "    descriptors.push({\n      index,\n      candidates,\n    })\n  }",
    "    descriptors.push({\n      index,\n      candidates,\n    })\n\n    if (mainHeader) leftHeader = mainHeader\n  }",
    "createHeaderDescriptors update leftHeader",
  )
}

// 5. Add scoring preference.
if (!code.includes("if (key === 'revisedContractExpirationDate')")) {
  replaceOnce(
    "  if (key === 'contractExpirationDate') {\n    if (normalizedCandidate.includes('EXPIRATION')) score += 60\n    if (normalizedCandidate.includes('CONTRACT')) score += 20\n    if (normalizedCandidate.includes('INTENDED')) score -= 80\n    score += index / 1000\n  }",
    "  if (key === 'contractExpirationDate') {\n    if (normalizedCandidate.includes('EXPIRATION')) score += 60\n    if (normalizedCandidate.includes('CONTRACT')) score += 20\n    if (normalizedCandidate.includes('ACCOMPLISHMENT')) score -= 90\n    if (normalizedCandidate.includes('INTENDED')) score -= 80\n    score += index / 1000\n  }\n\n  if (key === 'revisedContractExpirationDate') {\n    if (normalizedCandidate.includes('ACCOMPLISHMENT')) score += 80\n    if (normalizedCandidate.includes('TOTAL ACCOMPLISHMENT')) score += 80\n    if (normalizedCandidate.includes('DATE')) score += 20\n    if (normalizedCandidate.includes('EXPIRATION')) score -= 70\n    if (normalizedCandidate.includes('INTENDED')) score -= 70\n    score += index / 1000\n  }",
    "candidateScore.revisedContractExpirationDate",
  )
}

// 6. Add parser variable and record value.
replaceOnce(
  "      const contractExpirationDate = firstDate(getCell(row, headerMap, 'contractExpirationDate'))\n\n      records.push({",
  "      const contractExpirationDate = firstDate(getCell(row, headerMap, 'contractExpirationDate'))\n      const revisedContractExpirationDate = firstDate(getCell(row, headerMap, 'revisedContractExpirationDate'))\n\n      records.push({",
  "revised date variable",
)

replaceOnce(
  "        contractExpirationDate,\n        sourceSummary:",
  "        contractExpirationDate,\n        revisedContractExpirationDate,\n        sourceSummary:",
  "record.revisedContractExpirationDate",
)

// 7. Add payload field.
replaceOnce(
  "  if (record.contractExpirationDate) payload.contract_expiration_date = record.contractExpirationDate\n\n  return payload",
  "  if (record.contractExpirationDate) payload.contract_expiration_date = record.contractExpirationDate\n  if (record.revisedContractExpirationDate) payload.revised_contract_expiration_date = record.revisedContractExpirationDate\n\n  return payload",
  "payload.revised_contract_expiration_date",
)

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched src/services/subayImportService.ts for revised expiry from ACCOMPLISHMENT DATE.')
} else {
  console.log('No changes made. The file may already be patched or markers differ.')
}
