const fs = require('fs')
const path = require('path')

const servicePath = path.join(process.cwd(), 'src/services/subayImportService.ts')
const pagePath = path.join(process.cwd(), 'src/pages/SubayImport.tsx')

if (!fs.existsSync(servicePath)) {
  console.error('Missing file:', servicePath)
  process.exit(1)
}

if (!fs.existsSync(pagePath)) {
  console.error('Missing file:', pagePath)
  process.exit(1)
}

let service = fs.readFileSync(servicePath, 'utf8')
let page = fs.readFileSync(pagePath, 'utf8')
let changed = false

// 1. Add minimum funding year constant.
if (!service.includes('export const SUBAY_MIN_FUNDING_YEAR = 2023')) {
  const importLine = "import { toProjectTitleCase } from '../utils/projectTitleCase'\n"
  if (!service.includes(importLine)) {
    console.error('Could not find projectTitleCase import in subayImportService.ts')
    process.exit(1)
  }

  service = service.replace(
    importLine,
    `${importLine}\nexport const SUBAY_MIN_FUNDING_YEAR = 2023\n`,
  )
  changed = true
  console.log('Added SUBAY_MIN_FUNDING_YEAR constant.')
}

// 2. Add funding year filtering inside row parser.
if (!service.includes('Skipped row because FUNDING YEAR is missing.')) {
  const marker = '      seenCodes.add(projectCode)\n'
  const filterBlock = `      const fundingYear = parseFundingYear(getCell(row, headerMap, 'fundingYear'))

      if (!fundingYear) {
        issues.push({
          sheetName,
          rowNumber,
          message: 'Skipped row because FUNDING YEAR is missing.',
        })
        return
      }

      if (fundingYear < SUBAY_MIN_FUNDING_YEAR) {
        issues.push({
          sheetName,
          rowNumber,
          message: \`Skipped row because funding year \${fundingYear} is below FY \${SUBAY_MIN_FUNDING_YEAR}.\`,
        })
        return
      }

      seenCodes.add(projectCode)
`

  if (!service.includes(marker)) {
    console.error('Could not find seenCodes.add(projectCode) marker in subayImportService.ts')
    process.exit(1)
  }

  service = service.replace(marker, filterBlock)
  changed = true
  console.log('Added FY 2023 onwards filtering.')
}

// 3. Use computed fundingYear in records.push.
if (service.includes("fundingYear: parseFundingYear(getCell(row, headerMap, 'fundingYear'))")) {
  service = service.replace(
    "fundingYear: parseFundingYear(getCell(row, headerMap, 'fundingYear'))",
    'fundingYear',
  )
  changed = true
  console.log('Replaced inline fundingYear parser with computed fundingYear.')
}

// 4. Import SUBAY_MIN_FUNDING_YEAR in SubayImport page.
if (!page.includes('SUBAY_MIN_FUNDING_YEAR')) {
  page = page.replace(
    "  projectPayloadFromSubayRecord,\n} from '../services/subayImportService'",
    "  projectPayloadFromSubayRecord,\n  SUBAY_MIN_FUNDING_YEAR,\n} from '../services/subayImportService'",
  )
  changed = true
  console.log('Imported SUBAY_MIN_FUNDING_YEAR in SubayImport.tsx.')
}

// If the previous check found SUBAY_MIN in text due to copied text, ensure import is present.
if (page.includes('SUBAY_MIN_FUNDING_YEAR') && !page.match(/SUBAY_MIN_FUNDING_YEAR,[\s\S]*from '..\/services\/subayImportService'/)) {
  page = page.replace(
    "  projectPayloadFromSubayRecord,\n} from '../services/subayImportService'",
    "  projectPayloadFromSubayRecord,\n  SUBAY_MIN_FUNDING_YEAR,\n} from '../services/subayImportService'",
  )
  changed = true
}

// 5. Update visible instruction text.
page = page.replace(
  'Upload a SubayBAYAN XLS/XLSX masterlist. PMS10 will use PROJECT CODE\n            to update existing projects, link matching manual records, and add new\n            projects without duplicating inspection history.',
  'Upload a SubayBAYAN XLS/XLSX masterlist. PMS10 will include only FY {SUBAY_MIN_FUNDING_YEAR} onwards and use PROJECT CODE to update existing projects, link matching manual records, and add new projects without duplicating inspection history.',
)

page = page.replace(
  'Accepted formats: .xls and .xlsx. The importer will automatically find\n              the header row containing PROJECT CODE and PROJECT TITLE.',
  'Accepted formats: .xls and .xlsx. The importer will automatically find the header row containing PROJECT CODE and PROJECT TITLE. Only FY {SUBAY_MIN_FUNDING_YEAR} onwards will be included.',
)

page = page.replace(
  'PROJECT CODE is the main matching key. Existing PMS10 inspection\n              updates, photos, and Google Drive records are preserved.',
  'PROJECT CODE is the main matching key. Only FY {SUBAY_MIN_FUNDING_YEAR} onwards will be included. Existing PMS10 inspection updates, photos, and Google Drive records are preserved.',
)

fs.writeFileSync(servicePath, service)
fs.writeFileSync(pagePath, page)

if (!changed) {
  console.log('No structural changes needed; text updates may still have been applied.')
}

console.log('SubayBAYAN import is now filtered to FY 2023 onwards.')
