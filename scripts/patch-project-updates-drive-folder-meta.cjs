const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/ProjectUpdates.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

if (!code.includes('type DriveProjectMeta')) {
  const marker = "type ProjectUpdateRouteState = {\n  project?: ProjectRecord | null\n}\n"
  const insert = `${marker}\n` + 
`type DriveProjectMeta = ProjectRecord & {
  funding_year?: number | string | null
  funding_year_id?: number | string | null
  fiscal_year?: number | string | null
  year?: number | string | null
  program?: string | null
  funding_program?: string | null
  program_name?: string | null
}

`
  if (!code.includes(marker)) {
    console.error('Could not find ProjectUpdateRouteState marker.')
    process.exit(1)
  }
  code = code.replace(marker, insert)
  changed = true
  console.log('Added DriveProjectMeta type.')
}

if (!code.includes('function getDriveFundingYear')) {
  const marker = "const PHOTO_BUCKET = 'project-photos'\n"
  const helper = `function getDriveFundingYear(projectRecord?: DriveProjectMeta | null) {
  const rawValue =
    projectRecord?.funding_year ||
    projectRecord?.fiscal_year ||
    projectRecord?.year ||
    projectRecord?.funding_year_id ||
    ''

  const match = String(rawValue).match(/\\b(20\\d{2}|19\\d{2})\\b/)

  return match?.[1] || ''
}

function getDriveFundingSource(projectRecord?: DriveProjectMeta | null) {
  return String(
    projectRecord?.funding_source ||
      projectRecord?.funding_program ||
      projectRecord?.program ||
      projectRecord?.program_name ||
      '',
  ).trim()
}

`
  if (!code.includes(marker)) {
    console.error('Could not find PHOTO_BUCKET marker.')
    process.exit(1)
  }
  code = code.replace(marker, helper + marker)
  changed = true
  console.log('Added Drive folder helper functions.')
}

if (!code.includes('const driveProjectMeta = project as DriveProjectMeta | null')) {
  const marker = "    const projectTitle = project?.project_name || 'Untitled Project'\n"
  const insert = marker + 
"    const driveProjectMeta = project as DriveProjectMeta | null\n" +
"    const driveFundingYear = getDriveFundingYear(driveProjectMeta)\n" +
"    const driveFundingSource = getDriveFundingSource(driveProjectMeta)\n"
  if (!code.includes(marker)) {
    console.error('Could not find projectTitle marker in uploadPhotosOnline.')
    process.exit(1)
  }
  code = code.replace(marker, insert)
  changed = true
  console.log('Added online Drive folder metadata variables.')
}

if (!code.includes('fundingYear: driveFundingYear')) {
  code = code.replace(
    /(\s+projectTitle,\n)(\s+)(uploadedBy,)/,
    `$1$2inspectionDate,\n$2fundingYear: driveFundingYear,\n$2fundingSource: driveFundingSource,\n$2fundingProgram: driveFundingSource,\n$2$3`,
  )
  changed = true
  console.log('Added online Drive folder metadata to uploadProjectPhotoToDrive.')
}

if (!code.includes('funding_year: driveFundingYear || null')) {
  const marker = "      project_name: projectName,\n"
  const insert =
    marker +
    "      funding_year: getDriveFundingYear(project as DriveProjectMeta | null) || null,\n" +
    "      funding_source: getDriveFundingSource(project as DriveProjectMeta | null) || project?.funding_source || null,\n" +
    "      funding_program: getDriveFundingSource(project as DriveProjectMeta | null) || null,\n"

  if (!code.includes(marker)) {
    console.warn('Could not find offline project_name marker. Offline folder metadata was not added.')
  } else {
    code = code.replace(marker, insert)
    changed = true
    console.log('Added offline update Drive folder metadata.')
  }
}

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched src/pages/ProjectUpdates.tsx')
} else {
  console.log('No ProjectUpdates.tsx changes needed.')
}
