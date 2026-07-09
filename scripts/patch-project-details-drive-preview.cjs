const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/ProjectDetails.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

if (!code.includes("from '../utils/driveImageUrl'")) {
  const lastImportMatch = [...code.matchAll(/^import .*$/gm)].pop()

  if (!lastImportMatch) {
    console.error('Could not find imports in ProjectDetails.tsx')
    process.exit(1)
  }

  const insertIndex = lastImportMatch.index + lastImportMatch[0].length
  code =
    code.slice(0, insertIndex) +
    "\nimport { getDriveImagePreviewUrl } from '../utils/driveImageUrl'" +
    code.slice(insertIndex)

  changed = true
  console.log('Added getDriveImagePreviewUrl import.')
} else {
  console.log('getDriveImagePreviewUrl import already exists.')
}

const before = code

// Convert common image src patterns using photo_url into preview-safe Drive thumbnail URLs.
// This handles existing Drive rows saved as webViewLink/webContentLink and new rows saved as thumbnail URLs.
code = code.replace(
  /src=\{([^{}]*?photo_url[^{}]*?)\}/g,
  (match, expr) => {
    if (expr.includes('getDriveImagePreviewUrl')) return match
    return `src={getDriveImagePreviewUrl(${expr})}`
  },
)

if (code !== before) {
  changed = true
  console.log('Patched image src={...photo_url...} usages.')
} else {
  console.log('No src={...photo_url...} usage found or already patched.')
}

fs.writeFileSync(filePath, code)

if (!changed) {
  console.log('No changes made to ProjectDetails.tsx.')
}
