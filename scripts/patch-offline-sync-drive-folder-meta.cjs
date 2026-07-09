const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/services/offlineSyncService.ts')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

if (!code.includes('function getOfflineDriveFundingYear')) {
  const lastImportMatch = [...code.matchAll(/^import .*$/gm)].pop()
  if (!lastImportMatch) {
    console.error('Could not find import section in offlineSyncService.ts')
    process.exit(1)
  }

  const insertIndex = lastImportMatch.index + lastImportMatch[0].length
  const helpers = `

function getOfflineDriveFundingYear(update: any) {
  const rawValue =
    update?.funding_year ||
    update?.fiscal_year ||
    update?.year ||
    update?.funding_year_id ||
    ''

  const match = String(rawValue).match(/\\b(20\\d{2}|19\\d{2})\\b/)

  if (match?.[1]) return match[1]

  const inspectionDate = String(update?.inspection_date || '')

  return inspectionDate.match(/^(\\d{4})-/)?.[1] || ''
}

function getOfflineDriveFundingSource(update: any) {
  return String(
    update?.funding_source ||
      update?.funding_program ||
      update?.program ||
      update?.program_name ||
      '',
  ).trim()
}
`
  code = code.slice(0, insertIndex) + helpers + code.slice(insertIndex)
  changed = true
  console.log('Added offline Drive folder helper functions.')
}

if (!code.includes('fundingYear: getOfflineDriveFundingYear(update)')) {
  code = code.replace(
    /(\s+projectTitle: update\.project_name \|\| `Project \$\{update\.project_id\}`,\n)(\s+)(uploadedBy: update\.engineer_id \|\| 'Offline PMS10 User',)/,
    `$1$2inspectionDate: update.inspection_date || '',\n$2fundingYear: getOfflineDriveFundingYear(update),\n$2fundingSource: getOfflineDriveFundingSource(update),\n$2fundingProgram: getOfflineDriveFundingSource(update),\n$2$3`,
  )
  changed = true
  console.log('Added offline Drive folder metadata to uploadProjectPhotoToDrive.')
}

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched src/services/offlineSyncService.ts')
} else {
  console.log('No offlineSyncService.ts changes needed.')
}
