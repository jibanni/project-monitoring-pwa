const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/ProjectDetails.tsx')

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

if (!code.includes('<span>Revised Expiry</span>')) {
  replaceOnce(
`              <div className="pd-info-item">
                <span>Contract Expiry</span>
                <strong>{formatDate(project.revised_contract_expiration_date || project.contract_expiration_date)}</strong>
              </div>`,
`              <div className="pd-info-item">
                <span>Contract Expiry</span>
                <strong>{formatDate(project.contract_expiration_date)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Revised Expiry</span>
                <strong>{formatDate(project.revised_contract_expiration_date)}</strong>
              </div>`,
    'ProjectDetails visible Revised Expiry card',
  )
}

// Fallback if the exact block above is not present, insert after Target Completion.
if (!code.includes('<span>Revised Expiry</span>')) {
  replaceOnce(
`              <div className="pd-info-item">
                <span>Target Completion</span>
                <strong>{formatDate(project.target_completion_date)}</strong>
              </div>`,
`              <div className="pd-info-item">
                <span>Target Completion</span>
                <strong>{formatDate(project.target_completion_date)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Contract Expiry</span>
                <strong>{formatDate(project.contract_expiration_date)}</strong>
              </div>

              <div className="pd-info-item">
                <span>Revised Expiry</span>
                <strong>{formatDate(project.revised_contract_expiration_date)}</strong>
              </div>`,
    'ProjectDetails fallback Revised Expiry card',
  )
}

if (!code.includes("['Revised Expiry', project.revised_contract_expiration_date || '-']")) {
  replaceOnce(
    "        ['Contract Expiry', project.revised_contract_expiration_date || project.contract_expiration_date || '-'],",
    "        ['Contract Expiry', project.contract_expiration_date || '-'],\n        ['Revised Expiry', project.revised_contract_expiration_date || '-'],",
    'ProjectDetails PDF Revised Expiry',
  )
}

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched src/pages/ProjectDetails.tsx for three deadline fields.')
} else {
  console.log('No changes made. Markers may differ; send grep output if Revised Expiry does not show.')
}
