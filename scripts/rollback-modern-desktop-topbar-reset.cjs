const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()

const files = [
  'src/styles/layout.css',
  'src/styles/dashboard.css',
  'src/styles/projects.css',
]

for (const file of files) {
  const filePath = path.join(projectRoot, file)
  const backupPath = `${filePath}.modern-topbar.bak`

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath)
    console.log(`Restored ${file}`)
  } else {
    console.log(`No backup found for ${file}`)
  }
}

console.log('Rollback completed.')
