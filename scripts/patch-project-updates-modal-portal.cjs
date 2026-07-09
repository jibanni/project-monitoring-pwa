const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/ProjectUpdates.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file:', filePath)
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

if (!code.includes("import '../styles/projectUpdatesModalFix.css'")) {
  if (code.includes("import '../styles/projectUpdates.css'")) {
    code = code.replace(
      "import '../styles/projectUpdates.css'",
      "import '../styles/projectUpdates.css'\nimport '../styles/projectUpdatesModalFix.css'",
    )
  } else {
    const lastImportMatch = [...code.matchAll(/^import .*$/gm)].pop()
    if (!lastImportMatch) {
      console.error('Could not find import section in ProjectUpdates.tsx')
      process.exit(1)
    }

    const insertIndex = lastImportMatch.index + lastImportMatch[0].length
    code =
      code.slice(0, insertIndex) +
      "\nimport '../styles/projectUpdatesModalFix.css'" +
      code.slice(insertIndex)
  }

  changed = true
  console.log('Added projectUpdatesModalFix.css import.')
}

if (code.includes('/* PMS10_MODAL_PORTAL_START */')) {
  console.log('Modal portal patch already applied.')
  fs.writeFileSync(filePath, code)
  process.exit(0)
}

const startMarker = '\n\n      {noticeDialog && ('
const endMarker = '\n\n      {portalReady\n        ? createPortal(\n            <button'

const start = code.indexOf(startMarker)
const end = code.indexOf(endMarker, start)

if (start === -1 || end === -1) {
  console.error('Could not find modal block markers in ProjectUpdates.tsx.')
  console.error('Please send this output:')
  console.error('grep -n "noticeDialog\\|confirmSaveOpen\\|saveSuccessDialog\\|portalReady\\|pu-modal-overlay" src/pages/ProjectUpdates.tsx')
  process.exit(1)
}

const modalBlock = code.slice(start, end).trimEnd()

const replacement = `
      {/* PMS10_MODAL_PORTAL_START */}
      {portalReady
        ? createPortal(
            <>
${modalBlock}
            </>,
            document.body,
          )
        : null}
      {/* PMS10_MODAL_PORTAL_END */}`

code = code.slice(0, start) + '\n' + replacement + code.slice(end)

fs.writeFileSync(filePath, code)

console.log('Patched ProjectUpdates.tsx so pop-up prompts render through document.body portal.')
