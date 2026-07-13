const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const srcDir = path.join(projectRoot, 'src')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

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

function addClassToOpeningTag(source, tagStart, classNameToAdd) {
  const tagEnd = source.indexOf('>', tagStart)
  if (tagEnd < 0) return source

  const tagText = source.slice(tagStart, tagEnd)

  if (tagText.includes(classNameToAdd)) return source

  // className="..."
  const doubleClassMatch = tagText.match(/className="([^"]*)"/)
  if (doubleClassMatch) {
    const updatedTagText = tagText.replace(
      doubleClassMatch[0],
      `className="${doubleClassMatch[1]} ${classNameToAdd}"`,
    )
    return source.slice(0, tagStart) + updatedTagText + source.slice(tagEnd)
  }

  // className='...'
  const singleClassMatch = tagText.match(/className='([^']*)'/)
  if (singleClassMatch) {
    const updatedTagText = tagText.replace(
      singleClassMatch[0],
      `className='${singleClassMatch[1]} ${classNameToAdd}'`,
    )
    return source.slice(0, tagStart) + updatedTagText + source.slice(tagEnd)
  }

  // className={`...`}
  const templateClassMatch = tagText.match(/className=\{`([^`]*)`\}/)
  if (templateClassMatch) {
    const updatedTagText = tagText.replace(
      templateClassMatch[0],
      `className={\`${templateClassMatch[1]} ${classNameToAdd}\`}`,
    )
    return source.slice(0, tagStart) + updatedTagText + source.slice(tagEnd)
  }

  // No className.
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
  console.error('No changes were made.')
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

  // Add a compact class to the nearest hero/container before the label.
  const before = source.slice(Math.max(0, updateFormIndex - 2500), updateFormIndex)
  const localSection = before.lastIndexOf('<section')
  const localDiv = before.lastIndexOf('<div')
  const localHeroStart = Math.max(localSection, localDiv)

  if (localHeroStart >= 0) {
    const absoluteHeroStart = Math.max(0, updateFormIndex - 2500) + localHeroStart
    source = addClassToOpeningTag(
      source,
      absoluteHeroStart,
      'project-update-compact-hero',
    )
  }

  // Add a compact class to the first h1 after the project update form label.
  const h1Start = source.indexOf('<h1', updateFormIndex)
  if (h1Start >= 0 && h1Start < updateFormIndex + 3500) {
    source = addClassToOpeningTag(
      source,
      h1Start,
      'project-update-compact-title',
    )
  }

  if (source !== original) {
    backup(filePath, 'project-update-hero-title-clamp')
    fs.writeFileSync(filePath, source)
    modifiedTsxCount += 1
    console.log(`Updated ${path.relative(projectRoot, filePath)}`)
  }
}

if (modifiedTsxCount === 0) {
  console.error('Found candidate files but could not safely add compact hero classes.')
  console.error('No CSS was applied.')
  process.exit(1)
}

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

backup(layoutCssPath, 'project-update-hero-title-clamp')

const cssBlock = `
/* =========================
   PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX
   Prevents long project titles from making the Project Update hero full-screen.
========================= */

.project-update-compact-hero {
  overflow: hidden !important;
}

.project-update-compact-title {
  overflow: hidden !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;
  hyphens: auto !important;
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;
}

@media (min-width: 901px) {
  .project-update-compact-hero {
    min-height: 178px !important;
    max-height: 238px !important;
    padding-top: 28px !important;
    padding-bottom: 26px !important;
  }

  .project-update-compact-title {
    max-width: 1000px !important;
    font-size: clamp(2.15rem, 4.3vw, 3.65rem) !important;
    line-height: 1.02 !important;
    letter-spacing: -0.055em !important;
  }
}

@media (max-width: 900px) {
  .project-update-compact-hero {
    min-height: 220px !important;
    max-height: 272px !important;
    padding: 28px 32px 24px !important;
  }

  .project-update-compact-title {
    max-width: 100% !important;
    font-size: clamp(1.85rem, 8.4vw, 2.65rem) !important;
    line-height: 1.04 !important;
    letter-spacing: -0.055em !important;
    -webkit-line-clamp: 3 !important;
  }

  .project-update-compact-hero p,
  .project-update-compact-hero .project-update-compact-title + p {
    max-width: 100% !important;
  }

  .project-update-compact-hero .status-chip,
  .project-update-compact-hero .project-chip,
  .project-update-compact-hero [class*='chip'],
  .project-update-compact-hero [class*='pill'],
  .project-update-compact-hero [class*='meta'] {
    flex-wrap: nowrap !important;
  }
}

@media (max-width: 420px) {
  .project-update-compact-hero {
    min-height: 204px !important;
    max-height: 248px !important;
    padding: 24px 28px 22px !important;
  }

  .project-update-compact-title {
    font-size: clamp(1.55rem, 7.6vw, 2.12rem) !important;
    line-height: 1.05 !important;
    -webkit-line-clamp: 3 !important;
  }
}

/* When the hero is merged/sticky, keep the title to one line. */
.is-scrolled .project-update-compact-title,
.app-scrolled .project-update-compact-title,
.project-update-page.is-scrolled .project-update-compact-title,
.project-updates-page.is-scrolled .project-update-compact-title,
.updates-page.is-scrolled .project-update-compact-title {
  display: block !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
  overflow: hidden !important;
  -webkit-line-clamp: unset !important;
}
`

appendOrReplaceCss(
  layoutCssPath,
  'PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX',
  cssBlock,
)

console.log('Project Update hero title clamp fix applied.')
console.log('Long project titles will now be limited to 3 lines in the hero.')
console.log('Full title remains available in the page content/details below if already displayed there.')
