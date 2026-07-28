const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()

function rel(filePath) {
  return path.relative(projectRoot, filePath)
}

function restoreFromBackup(target, candidates, required = false) {
  for (const suffix of candidates) {
    const backup = `${target}.${suffix}.bak`

    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, target)
      console.log(`Restored ${rel(target)} from ${rel(backup)}`)
      return true
    }
  }

  const message = `No backup found for ${rel(target)} using: ${candidates.join(', ')}`

  if (required) {
    console.error(message)
    process.exitCode = 1
  } else {
    console.log(message)
  }

  return false
}

function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    console.log(`Removed ${rel(filePath)}`)
  }
}

/*
  Target state:
  Revert to the app state before the request:
  "make sure that the app cannot be zoomed except for the map leaflet"

  This means:
  - remove the zoom-lock utility and viewport changes
  - restore main.tsx / index.html / layout.css from disable zoom backups
  - restore ProjectMap.tsx and projectMap.css from the backup made just before
    the later banner/marker visibility patches
*/

restoreFromBackup(
  path.join(projectRoot, 'index.html'),
  ['disable-app-zoom-except-map'],
  true,
)

restoreFromBackup(
  path.join(projectRoot, 'src/main.tsx'),
  [
    'disable-app-zoom-except-map',
    'fix-disable-zoom-import',
  ],
  true,
)

restoreFromBackup(
  path.join(projectRoot, 'src/styles/layout.css'),
  [
    'disable-app-zoom-except-map',
    'gis-banner-stack-order-final',
    'restore-gis-banner-mobile-fix',
    'map-banner-marker-visibility-fix',
  ],
  false,
)

restoreFromBackup(
  path.join(projectRoot, 'src/pages/ProjectMap.tsx'),
  [
    'map-banner-marker-visibility-fix',
    'gis-banner-stack-order-final',
    'center-pressed-marker-fix',
  ],
  false,
)

restoreFromBackup(
  path.join(projectRoot, 'src/styles/projectMap.css'),
  [
    'map-banner-marker-visibility-fix',
    'gis-banner-stack-order-final',
    'restore-gis-banner-mobile-fix',
    'center-pressed-marker-fix',
  ],
  false,
)

removeFile(path.join(projectRoot, 'src/utils/disableAppZoomExceptMap.ts'))

console.log('')
if (process.exitCode) {
  console.log('Rollback finished with missing required backup(s). Check messages above.')
} else {
  console.log('Rollback complete. Run npm run build next.')
}
