const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const srcDir = path.join(projectRoot, 'src')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')
const oldBackupSuffix = '.project-update-hero-title-clamp.bak'

function walkFiles(dir, matcher, results = []) {
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, results)
    } else if (matcher(fullPath)) {
      results.push(fullPath)
    }
  }

  return results
}

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function restoreClampBackups() {
  const backups = walkFiles(projectRoot, (filePath) => filePath.endsWith(oldBackupSuffix))

  if (backups.length === 0) {
    console.log('No old clamp backups found. Continuing with swipeable patch.')
    return
  }

  for (const backupPath of backups) {
    const originalPath = backupPath.slice(0, -oldBackupSuffix.length)
    fs.copyFileSync(backupPath, originalPath)
    console.log(`Restored old clamp backup: ${path.relative(projectRoot, originalPath)}`)
  }
}

function removeCssBlock(filePath, marker) {
  if (!fs.existsSync(filePath)) return

  let css = fs.readFileSync(filePath, 'utf8')
  let oldIndex = css.indexOf(marker)

  while (oldIndex >= 0) {
    const start = css.lastIndexOf('/*', oldIndex)
    const safeStart = start >= 0 ? start : oldIndex
    const next = css.indexOf('/* =========================', oldIndex + marker.length)

    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
    oldIndex = css.indexOf(marker)
  }

  fs.writeFileSync(filePath, css)
}

function addClassToOpeningTag(source, tagStart, classNameToAdd) {
  const tagEnd = source.indexOf('>', tagStart)
  if (tagEnd < 0) return source

  const tagText = source.slice(tagStart, tagEnd)

  if (tagText.includes(classNameToAdd)) return source

  const doubleClassMatch = tagText.match(/className="([^"]*)"/)
  if (doubleClassMatch) {
    const updatedTagText = tagText.replace(
      doubleClassMatch[0],
      `className="${doubleClassMatch[1]} ${classNameToAdd}"`,
    )
    return source.slice(0, tagStart) + updatedTagText + source.slice(tagEnd)
  }

  const singleClassMatch = tagText.match(/className='([^']*)'/)
  if (singleClassMatch) {
    const updatedTagText = tagText.replace(
      singleClassMatch[0],
      `className='${singleClassMatch[1]} ${classNameToAdd}'`,
    )
    return source.slice(0, tagStart) + updatedTagText + source.slice(tagEnd)
  }

  const templateClassMatch = tagText.match(/className=\{`([^`]*)`\}/)
  if (templateClassMatch) {
    const updatedTagText = tagText.replace(
      templateClassMatch[0],
      `className={\`${templateClassMatch[1]} ${classNameToAdd}\`}`,
    )
    return source.slice(0, tagStart) + updatedTagText + source.slice(tagEnd)
  }

  const updatedTagText = `${tagText} className="${classNameToAdd}"`
  return source.slice(0, tagStart) + updatedTagText + source.slice(tagEnd)
}

function appendOrReplaceCss(filePath, marker, cssBlock) {
  let css = fs.readFileSync(filePath, 'utf8')

  const oldIndex = css.indexOf(marker)
  if (oldIndex >= 0) {
    const start = css.lastIndexOf('/*', oldIndex)
    const safeStart = start >= 0 ? start : oldIndex
    const next = css.indexOf('/* =========================', oldIndex + marker.length)
    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
  }

  css += cssBlock
  fs.writeFileSync(filePath, css)
}

restoreClampBackups()

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

// Make sure the ugly clamp CSS block is gone even if backups were not found.
removeCssBlock(layoutCssPath, 'PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX')

const pageFiles = walkFiles(srcDir, (filePath) => filePath.endsWith('.tsx'))

const candidates = pageFiles.filter((filePath) => {
  const text = fs.readFileSync(filePath, 'utf8')
  return (
    text.includes('PROJECT UPDATE FORM') ||
    text.includes('Project Update Form') ||
    text.includes('Project Updates') ||
    text.includes('PROJECT UPDATES')
  )
})

if (candidates.length === 0) {
  console.error('Could not find the Project Update page TSX file.')
  console.error('Clamp rollback was done if backups existed, but swipeable classes were not added.')
  process.exit(1)
}

let modifiedTsxCount = 0

for (const filePath of candidates) {
  let source = fs.readFileSync(filePath, 'utf8')

  const updateFormIndex =
    source.indexOf('PROJECT UPDATE FORM') >= 0
      ? source.indexOf('PROJECT UPDATE FORM')
      : source.indexOf('Project Update Form') >= 0
        ? source.indexOf('Project Update Form')
        : source.indexOf('Project Updates') >= 0
          ? source.indexOf('Project Updates')
          : source.indexOf('PROJECT UPDATES')

  if (updateFormIndex < 0) continue

  const original = source

  const before = source.slice(Math.max(0, updateFormIndex - 2500), updateFormIndex)
  const localSection = before.lastIndexOf('<section')
  const localDiv = before.lastIndexOf('<div')
  const localHeroStart = Math.max(localSection, localDiv)

  if (localHeroStart >= 0) {
    const absoluteHeroStart = Math.max(0, updateFormIndex - 2500) + localHeroStart
    source = addClassToOpeningTag(
      source,
      absoluteHeroStart,
      'project-update-swipe-hero',
    )
  }

  const h1Start = source.indexOf('<h1', updateFormIndex)
  if (h1Start >= 0 && h1Start < updateFormIndex + 3500) {
    source = addClassToOpeningTag(
      source,
      h1Start,
      'project-update-swipe-title',
    )
  }

  if (source !== original) {
    backup(filePath, 'project-update-swipeable-hero')
    fs.writeFileSync(filePath, source)
    modifiedTsxCount += 1
    console.log(`Updated ${path.relative(projectRoot, filePath)}`)
  }
}

if (modifiedTsxCount === 0) {
  console.error('Found candidate files but could not safely add swipeable hero classes.')
  process.exit(1)
}

backup(layoutCssPath, 'project-update-swipeable-hero')

const cssBlock = `
/* =========================
   PMS10 PROJECT UPDATE HERO SWIPEABLE TITLE
   Keeps the original hero feel but makes long project titles swipe horizontally.
========================= */

.project-update-swipe-hero {
  overflow: hidden !important;
}

.project-update-swipe-title {
  display: block !important;
  max-width: 100% !important;
  white-space: nowrap !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  text-overflow: clip !important;
  -webkit-overflow-scrolling: touch !important;
  scrollbar-width: none !important;
  overscroll-behavior-x: contain !important;
  touch-action: pan-x pan-y !important;
  padding-bottom: 6px !important;
}

.project-update-swipe-title::-webkit-scrollbar {
  display: none !important;
}

@media (min-width: 901px) {
  .project-update-swipe-hero {
    min-height: 210px !important;
    max-height: 290px !important;
  }

  .project-update-swipe-title {
    font-size: clamp(2.7rem, 5.4vw, 5rem) !important;
    line-height: 1.02 !important;
    letter-spacing: -0.065em !important;
  }
}

@media (max-width: 900px) {
  .project-update-swipe-hero {
    min-height: 230px !important;
    max-height: 320px !important;
  }

  .project-update-swipe-title {
    font-size: clamp(2.45rem, 12vw, 4.4rem) !important;
    line-height: 1.02 !important;
    letter-spacing: -0.065em !important;
    padding-bottom: 10px !important;
  }
}

@media (max-width: 420px) {
  .project-update-swipe-hero {
    min-height: 214px !important;
    max-height: 292px !important;
  }

  .project-update-swipe-title {
    font-size: clamp(2.15rem, 11vw, 3.7rem) !important;
  }
}

/* When the hero is merged/sticky, keep the title single-line and swipeable. */
.is-scrolled .project-update-swipe-title,
.app-scrolled .project-update-swipe-title,
.project-update-page.is-scrolled .project-update-swipe-title,
.project-updates-page.is-scrolled .project-update-swipe-title,
.updates-page.is-scrolled .project-update-swipe-title {
  display: block !important;
  white-space: nowrap !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  text-overflow: clip !important;
}
`

appendOrReplaceCss(
  layoutCssPath,
  'PMS10 PROJECT UPDATE HERO SWIPEABLE TITLE',
  cssBlock,
)

console.log('Project Update swipeable hero title applied.')
console.log('Old clamp patch was restored/removed if found.')
console.log('Long project titles now stay on one line and can be swiped horizontally.')
