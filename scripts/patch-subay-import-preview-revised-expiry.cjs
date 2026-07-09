const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/pages/SubayImport.tsx')

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

if (!code.includes('<th>Revised Expiry</th>')) {
  replaceOnce(
    "                  <th>Contract Expiration</th>\n                </tr>",
    "                  <th>Contract Expiration</th>\n                  <th>Revised Expiry</th>\n                </tr>",
    "SubayImport revised expiry header",
  )
}

if (!code.includes('formatDate(row.record.revisedContractExpirationDate)')) {
  replaceOnce(
    "                    <td>{formatDate(row.record.contractExpirationDate)}</td>\n                  </tr>",
    "                    <td>{formatDate(row.record.contractExpirationDate)}</td>\n                    <td>{formatDate(row.record.revisedContractExpirationDate)}</td>\n                  </tr>",
    "SubayImport revised expiry cell",
  )
}

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Patched src/pages/SubayImport.tsx preview for Revised Expiry.')
} else {
  console.log('No changes made. File may already be patched or markers differ.')
}
