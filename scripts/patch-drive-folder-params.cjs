const fs = require('fs')
const path = require('path')

const root = process.cwd()

function patchFile(relativePath, patches) {
  const filePath = path.join(root, relativePath)

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${relativePath}`)
  }

  let content = fs.readFileSync(filePath, 'utf8')
  let changed = false

  for (const patch of patches) {
    if (content.includes(patch.expected)) {
      continue
    }

    if (!content.includes(patch.search)) {
      console.warn(`Skipped patch in ${relativePath}: search text not found.`)
      continue
    }

    content = content.replace(patch.search, patch.replace)
    changed = true
  }

  if (changed) {
    fs.writeFileSync(filePath, content)
    console.log(`Patched ${relativePath}`)
  } else {
    console.log(`No changes needed for ${relativePath}`)
  }
}

patchFile('src/pages/ProjectUpdates.tsx', [
  {
    expected: `inspectionDate,\n        uploadedBy,`,
    search: `projectTitle,\n        uploadedBy,`,
    replace: `projectTitle,\n        inspectionDate,\n        uploadedBy,`,
  },
])

patchFile('src/services/offlineSyncService.ts', [
  {
    expected: `inspectionDate: update.inspection_date || '',\n        uploadedBy: update.engineer_id || 'Offline PMS10 User',`,
    search: `projectTitle: update.project_name || \`Project \${update.project_id}\`,\n        uploadedBy: update.engineer_id || 'Offline PMS10 User',`,
    replace: `projectTitle: update.project_name || \`Project \${update.project_id}\`,\n        inspectionDate: update.inspection_date || '',\n        uploadedBy: update.engineer_id || 'Offline PMS10 User',`,
  },
])
