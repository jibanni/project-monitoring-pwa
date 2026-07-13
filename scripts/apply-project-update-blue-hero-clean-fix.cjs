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
  'pu-update-hero-card',
  'pu-update-hero-title',
]

const oldCssMarkers = [
  'PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX',
  'PMS10 PROJECT UPDATE HERO SWIPEABLE TITLE',
  'PMS10 REMOVE PROJECT UPDATE HERO BANNER',
  'PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX',
  'PMS10 PROJECT UPDATE TITLE PILL READABLE FIX',
  'PMS10 PROJECT UPDATE RETURN BLUE HERO BIGGER FONT',
  'PMS10 PROJECT UPDATE BLUE HERO CLEAN FIX',
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
    if (/hero|banner|summary|header/i.test(tagText)) {
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

function removeCssBlocks(filePath, markers) {
  let css = fs.readFileSync(filePath, 'utf8')

  for (const marker of markers) {
    let oldIndex = css.indexOf(marker)

    while (oldIndex >= 0) {
      const start = css.lastIndexOf('/*', oldIndex)
      const safeStart = start >= 0 ? start : oldIndex
      const next = css.indexOf('/* =========================', oldIndex + marker.length)

      css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
      oldIndex = css.indexOf(marker)
    }
  }

  fs.writeFileSync(filePath, css)
}

function appendCss(filePath, cssBlock) {
  let css = fs.readFileSync(filePath, 'utf8')
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
    source = addClassToOpeningTag(source, heroStart, 'pu-update-hero-card')
  }

  const h1Start = source.indexOf('<h1', updateFormIndex)
  if (h1Start >= 0 && h1Start < updateFormIndex + 5000) {
    source = addClassToOpeningTag(source, h1Start, 'pu-update-hero-title')
  }

  if (source !== original) {
    backup(filePath, 'project-update-blue-hero-clean')
    fs.writeFileSync(filePath, source)
    modifiedTsxCount += 1
    console.log(`Updated ${path.relative(projectRoot, filePath)}`)
  }
}

if (modifiedTsxCount === 0) {
  console.error('Found Project Update candidate files but no safe TSX change was made.')
  process.exit(1)
}

backup(layoutCssPath, 'project-update-blue-hero-clean')
removeCssBlocks(layoutCssPath, oldCssMarkers)

const cssBlock = `
/* =========================
   PMS10 PROJECT UPDATE BLUE HERO CLEAN FIX
   Cleans previous overlapping project update hero experiments.
========================= */

.pu-update-hero-card {
  display: block !important;
  position: relative !important;

  min-height: 248px !important;
  max-height: 326px !important;
  height: auto !important;

  margin: 12px 14px 14px !important;
  padding: 28px 30px 26px !important;

  border: 0 !important;
  border-radius: 30px !important;

  color: #ffffff !important;
  background:
    radial-gradient(circle at 87% 20%, rgba(255, 255, 255, 0.18) 0 22%, transparent 23%),
    radial-gradient(circle at 104% 86%, rgba(255, 255, 255, 0.12) 0 26%, transparent 27%),
    linear-gradient(135deg, #0d3f78 0%, #145ba3 55%, #2373c4 100%) !important;

  box-shadow: 0 18px 40px rgba(15, 79, 143, 0.22) !important;
  overflow: hidden !important;
}

.pu-update-hero-card::before {
  content: "" !important;
  position: absolute !important;
  inset: -70px auto auto -90px !important;
  width: 300px !important;
  height: 300px !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.08) !important;
  pointer-events: none !important;
}

.pu-update-hero-card::after {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  border-radius: inherit !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  pointer-events: none !important;
}

.pu-update-hero-card * {
  position: relative !important;
  z-index: 1 !important;
  text-shadow: none !important;
}

/* Label */
.pu-update-hero-card p:first-child,
.pu-update-hero-card [class*='eyebrow'],
.pu-update-hero-card [class*='kicker'] {
  margin: 0 0 14px !important;
  color: #ffb020 !important;
  font-size: 0.78rem !important;
  line-height: 1.05 !important;
  font-weight: 950 !important;
  letter-spacing: 0.18em !important;
  text-transform: uppercase !important;
}

/* Project title: no border, no background, no pill effect */
.pu-update-hero-title,
.pu-update-hero-card h1 {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;

  width: 100% !important;
  max-width: 100% !important;
  min-height: 0 !important;

  margin: 0 !important;
  padding: 0 !important;

  overflow: hidden !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;

  color: #ffffff !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;

  font-size: clamp(1.9rem, 8.6vw, 3.15rem) !important;
  line-height: 1.02 !important;
  letter-spacing: -0.06em !important;
  font-weight: 950 !important;
}

/* Meta/chip groups should wrap naturally and should never become full-width colored bars */
.pu-update-hero-card [class*='meta'],
.pu-update-hero-card [class*='actions'],
.pu-update-hero-card [class*='summary'],
.pu-update-hero-card [class*='location'],
.pu-update-hero-card [class*='chips'],
.pu-update-hero-card [class*='badges'] {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 9px !important;
  margin-top: 16px !important;
  width: auto !important;
  max-width: 100% !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

/* Generic small chips only. Avoid [class*='status'] and [class*='complete'] because those often match containers. */
.pu-update-hero-card [class*='chip'],
.pu-update-hero-card [class*='pill'],
.pu-update-hero-card [class*='badge'] {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;

  width: auto !important;
  max-width: 100% !important;
  min-height: 32px !important;

  margin: 0 !important;
  padding: 8px 13px !important;

  border-radius: 999px !important;
  border: 1px solid rgba(255, 255, 255, 0.26) !important;
  background: rgba(255, 255, 255, 0.15) !important;
  box-shadow: none !important;

  color: rgba(255, 255, 255, 0.95) !important;
  font-size: 0.76rem !important;
  line-height: 1 !important;
  font-weight: 950 !important;
  letter-spacing: 0.02em !important;
}

/* Correct accidental color strips from previous broad selectors */
.pu-update-hero-card [class*='status'],
.pu-update-hero-card [class*='complete'],
.pu-update-hero-card [class*='risk'],
.pu-update-hero-card [class*='progress'] {
  max-width: 100% !important;
  box-shadow: none !important;
}

/* The bottom status/progress/risk chips should stay as individual pills. */
.pu-update-hero-card [class*='status'] > *,
.pu-update-hero-card [class*='complete'] > *,
.pu-update-hero-card [class*='risk'] > *,
.pu-update-hero-card [class*='progress'] > * {
  width: auto !important;
}

@media (min-width: 901px) {
  .pu-update-hero-card {
    min-height: 240px !important;
    max-height: 326px !important;
    padding: 30px 36px 28px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(2.2rem, 4.8vw, 4.05rem) !important;
  }
}

@media (max-width: 900px) {
  .pu-update-hero-card {
    min-height: 244px !important;
    max-height: 318px !important;
    margin: 12px 14px 14px !important;
    padding: 26px 30px 24px !important;
    border-radius: 28px !important;
  }

  .pu-update-hero-card p:first-child,
  .pu-update-hero-card [class*='eyebrow'],
  .pu-update-hero-card [class*='kicker'] {
    font-size: 0.72rem !important;
    margin-bottom: 12px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(1.86rem, 8.8vw, 2.92rem) !important;
    line-height: 1.03 !important;
    -webkit-line-clamp: 3 !important;
  }

  .pu-update-hero-card [class*='meta'],
  .pu-update-hero-card [class*='actions'],
  .pu-update-hero-card [class*='summary'],
  .pu-update-hero-card [class*='location'],
  .pu-update-hero-card [class*='chips'],
  .pu-update-hero-card [class*='badges'] {
    gap: 8px !important;
    margin-top: 14px !important;
  }

  .pu-update-hero-card [class*='chip'],
  .pu-update-hero-card [class*='pill'],
  .pu-update-hero-card [class*='badge'] {
    min-height: 31px !important;
    padding: 7px 12px !important;
    font-size: 0.72rem !important;
  }
}

@media (max-width: 420px) {
  .pu-update-hero-card {
    min-height: 230px !important;
    max-height: 304px !important;
    margin: 10px 12px 12px !important;
    padding: 24px 26px 23px !important;
    border-radius: 26px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(1.62rem, 8vw, 2.45rem) !important;
    -webkit-line-clamp: 3 !important;
  }

  .pu-update-hero-card [class*='chip'],
  .pu-update-hero-card [class*='pill'],
  .pu-update-hero-card [class*='badge'] {
    min-height: 30px !important;
    padding: 7px 11px !important;
    font-size: 0.68rem !important;
  }
}
`

appendCss(layoutCssPath, cssBlock)

console.log('Project Update blue hero clean fix applied.')
console.log('Removed previous Project Update hero CSS experiments.')
console.log('Removed old problematic class names and added safe new classes.')
