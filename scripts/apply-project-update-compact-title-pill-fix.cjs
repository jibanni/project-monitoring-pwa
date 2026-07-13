const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const srcDir = path.join(projectRoot, 'src')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

const oldProjectUpdateClasses = [
  'project-update-compact-hero',
  'project-update-compact-title',
  'project-update-swipe-hero',
  'project-update-swipe-title',
  'project-update-hero-hidden-field-mode',
  'project-update-title-pill-card',
  'project-update-title-pill-text',
]

const oldCssMarkers = [
  'PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX',
  'PMS10 PROJECT UPDATE HERO SWIPEABLE TITLE',
  'PMS10 REMOVE PROJECT UPDATE HERO BANNER',
  'PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX',
]

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

function cleanClassTokens(source) {
  let cleaned = source

  for (const className of oldProjectUpdateClasses) {
    const re = new RegExp(`\\s*${className}`, 'g')
    cleaned = cleaned.replace(re, '')
  }

  cleaned = cleaned
    .replace(/className="\s+/g, 'className="')
    .replace(/\s+"/g, '"')
    .replace(/className='\s+/g, "className='")
    .replace(/\s+'/g, "'")
    .replace(/className=\{`\s+/g, 'className={`')
    .replace(/\s+`\}/g, '`}')

  return cleaned
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

function findBestHeroStart(source, updateFormIndex) {
  const windowStart = Math.max(0, updateFormIndex - 5000)
  const before = source.slice(windowStart, updateFormIndex)

  const openingTagRe = /<(section|div)\b[^>]*>/g
  const matches = []
  let match

  while ((match = openingTagRe.exec(before)) !== null) {
    const tagText = match[0]
    if (/hero|banner|summary/i.test(tagText)) {
      matches.push(windowStart + match.index)
    }
  }

  if (matches.length > 0) {
    return matches[matches.length - 1]
  }

  const localSection = before.lastIndexOf('<section')
  const localDiv = before.lastIndexOf('<div')
  const localStart = Math.max(localSection, localDiv)

  return localStart >= 0 ? windowStart + localStart : -1
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

function appendOrReplaceCss(filePath, marker, cssBlock) {
  let css = fs.readFileSync(filePath, 'utf8')

  for (const oldMarker of oldCssMarkers) {
    let oldIndex = css.indexOf(oldMarker)

    while (oldIndex >= 0) {
      const start = css.lastIndexOf('/*', oldIndex)
      const safeStart = start >= 0 ? start : oldIndex
      const next = css.indexOf('/* =========================', oldIndex + oldMarker.length)
      css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
      oldIndex = css.indexOf(oldMarker)
    }
  }

  css += cssBlock
  fs.writeFileSync(filePath, css)
}

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const pageFiles = walkFiles(srcDir, (filePath) => filePath.endsWith('.tsx'))

const candidates = pageFiles.filter((filePath) => {
  const text = fs.readFileSync(filePath, 'utf8')
  return (
    text.includes('PROJECT UPDATE FORM') ||
    text.includes('Project Update Form') ||
    text.includes('PROJECT UPDATES') ||
    text.includes('Project Updates')
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
  const original = source

  source = cleanClassTokens(source)

  const updateFormIndex =
    source.indexOf('PROJECT UPDATE FORM') >= 0
      ? source.indexOf('PROJECT UPDATE FORM')
      : source.indexOf('Project Update Form') >= 0
        ? source.indexOf('Project Update Form')
        : source.indexOf('PROJECT UPDATES') >= 0
          ? source.indexOf('PROJECT UPDATES')
          : source.indexOf('Project Updates')

  if (updateFormIndex < 0) continue

  const heroStart = findBestHeroStart(source, updateFormIndex)
  if (heroStart >= 0) {
    source = addClassToOpeningTag(
      source,
      heroStart,
      'project-update-title-pill-card',
    )
  }

  const h1Start = source.indexOf('<h1', updateFormIndex)
  if (h1Start >= 0 && h1Start < updateFormIndex + 5000) {
    source = addClassToOpeningTag(
      source,
      h1Start,
      'project-update-title-pill-text',
    )
  }

  if (source !== original) {
    backup(filePath, 'project-update-compact-title-pill')
    fs.writeFileSync(filePath, source)
    modifiedTsxCount += 1
    console.log(`Updated ${path.relative(projectRoot, filePath)}`)
  }
}

if (modifiedTsxCount === 0) {
  console.error('Found Project Update candidate files but no safe TSX change was made.')
  process.exit(1)
}

backup(layoutCssPath, 'project-update-compact-title-pill')

for (const marker of oldCssMarkers) {
  removeCssBlock(layoutCssPath, marker)
}

const cssBlock = `
/* =========================
   PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX
   Field mode: replaces the large blue Project Update hero with a compact title/status pill card.
========================= */

.project-update-title-pill-card {
  min-height: 0 !important;
  max-height: none !important;
  height: auto !important;

  margin: 12px 0 12px !important;
  padding: 12px 14px !important;

  border-radius: 22px !important;
  border: 1px solid rgba(148, 163, 184, 0.24) !important;
  background: rgba(255, 255, 255, 0.94) !important;
  color: #0f172a !important;

  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08) !important;
  overflow: visible !important;
}

.project-update-title-pill-card::before,
.project-update-title-pill-card::after {
  display: none !important;
  content: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

.project-update-title-pill-card * {
  text-shadow: none !important;
}

.project-update-title-pill-card p:first-child,
.project-update-title-pill-card [class*='eyebrow'],
.project-update-title-pill-card [class*='kicker'] {
  margin: 0 0 6px !important;
  color: #0f4f8f !important;
  font-size: 0.68rem !important;
  line-height: 1.05 !important;
  font-weight: 950 !important;
  letter-spacing: 0.16em !important;
  text-transform: uppercase !important;
}

.project-update-title-pill-text {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;

  margin: 0 !important;
  max-width: 100% !important;

  overflow: hidden !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;

  color: #0f172a !important;
  font-size: clamp(1rem, 2.6vw, 1.35rem) !important;
  line-height: 1.18 !important;
  letter-spacing: -0.025em !important;
  font-weight: 950 !important;
}

.project-update-title-pill-card [class*='chip'],
.project-update-title-pill-card [class*='pill'],
.project-update-title-pill-card [class*='badge'],
.project-update-title-pill-card [class*='status'] {
  min-height: 28px !important;
  padding: 6px 10px !important;
  border-radius: 999px !important;
  font-size: 0.7rem !important;
  line-height: 1 !important;
}

.project-update-title-pill-card [class*='meta'],
.project-update-title-pill-card [class*='actions'],
.project-update-title-pill-card [class*='summary'] {
  margin-top: 10px !important;
  gap: 7px !important;
}

@media (max-width: 900px) {
  .project-update-title-pill-card {
    margin: 10px 12px 12px !important;
    padding: 12px 12px !important;
    border-radius: 20px !important;
  }

  .project-update-title-pill-text {
    font-size: clamp(0.94rem, 4.6vw, 1.16rem) !important;
    line-height: 1.18 !important;
    -webkit-line-clamp: 2 !important;
  }

  .project-update-title-pill-card p:first-child,
  .project-update-title-pill-card [class*='eyebrow'],
  .project-update-title-pill-card [class*='kicker'] {
    font-size: 0.62rem !important;
    margin-bottom: 5px !important;
  }

  .project-update-title-pill-card [class*='chip'],
  .project-update-title-pill-card [class*='pill'],
  .project-update-title-pill-card [class*='badge'],
  .project-update-title-pill-card [class*='status'] {
    min-height: 26px !important;
    padding: 6px 9px !important;
    font-size: 0.64rem !important;
  }
}

@media (max-width: 420px) {
  .project-update-title-pill-card {
    margin: 10px 10px 10px !important;
    padding: 11px 11px !important;
    border-radius: 18px !important;
  }

  .project-update-title-pill-text {
    font-size: clamp(0.9rem, 4.3vw, 1.05rem) !important;
  }
}
`

appendOrReplaceCss(
  layoutCssPath,
  'PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX',
  cssBlock,
)

console.log('Project Update compact title pill fix applied.')
console.log('Large blue update hero is converted into a compact field-friendly title/status card.')
