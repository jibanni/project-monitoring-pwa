const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.project-update-title-pill-readable.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(layoutCssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

const markers = [
  'PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX',
  'PMS10 PROJECT UPDATE TITLE PILL READABLE FIX',
]

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

css += `
/* =========================
   PMS10 PROJECT UPDATE TITLE PILL READABLE FIX
   Field-friendly update header: compact but readable.
========================= */

.project-update-title-pill-card {
  min-height: 0 !important;
  max-height: none !important;
  height: auto !important;

  margin: 12px 14px 14px !important;
  padding: 18px 18px 20px !important;

  border-radius: 24px !important;
  border: 1px solid rgba(148, 163, 184, 0.22) !important;
  background: rgba(255, 255, 255, 0.96) !important;
  color: #0f172a !important;

  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.1) !important;
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
  margin: 0 0 10px !important;
  color: #0f4f8f !important;
  font-size: 0.72rem !important;
  line-height: 1.05 !important;
  font-weight: 950 !important;
  letter-spacing: 0.18em !important;
  text-transform: uppercase !important;
}

.project-update-title-pill-text {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;

  margin: 0 !important;
  max-width: 100% !important;

  overflow: hidden !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;

  color: #0f172a !important;
  font-size: clamp(1.22rem, 4.8vw, 1.65rem) !important;
  line-height: 1.12 !important;
  letter-spacing: -0.035em !important;
  font-weight: 950 !important;
}

/* Make province / LGU / barangay chips readable on white card */
.project-update-title-pill-card [class*='chip'],
.project-update-title-pill-card [class*='pill'],
.project-update-title-pill-card [class*='badge'] {
  min-height: 32px !important;
  padding: 8px 12px !important;
  border-radius: 999px !important;
  font-size: 0.78rem !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  color: #334155 !important;
  background: #f1f5f9 !important;
  border: 1px solid rgba(148, 163, 184, 0.22) !important;
  box-shadow: none !important;
}

/* Keep critical/status chips visually distinct */
.project-update-title-pill-card [class*='complete'],
.project-update-title-pill-card [class*='completed'],
.project-update-title-pill-card [class*='status'] {
  color: #166534 !important;
  background: #dcfce7 !important;
  border-color: rgba(34, 197, 94, 0.24) !important;
}

.project-update-title-pill-card [class*='risk'],
.project-update-title-pill-card [class*='high'] {
  color: #b91c1c !important;
  background: #fee2e2 !important;
  border-color: rgba(239, 68, 68, 0.28) !important;
}

.project-update-title-pill-card [class*='meta'],
.project-update-title-pill-card [class*='actions'],
.project-update-title-pill-card [class*='summary'] {
  display: flex !important;
  flex-wrap: wrap !important;
  margin-top: 14px !important;
  gap: 8px !important;
}

/* If the original hero placed chips far apart/low, pull them back into normal flow */
.project-update-title-pill-card > * {
  position: relative !important;
  z-index: 1 !important;
}

@media (min-width: 901px) {
  .project-update-title-pill-card {
    padding: 20px 22px 22px !important;
  }

  .project-update-title-pill-text {
    font-size: clamp(1.35rem, 2.5vw, 1.85rem) !important;
    line-height: 1.12 !important;
  }
}

@media (max-width: 900px) {
  .project-update-title-pill-card {
    margin: 12px 14px 14px !important;
    padding: 17px 17px 19px !important;
    border-radius: 24px !important;
  }

  .project-update-title-pill-card p:first-child,
  .project-update-title-pill-card [class*='eyebrow'],
  .project-update-title-pill-card [class*='kicker'] {
    font-size: 0.68rem !important;
    margin-bottom: 9px !important;
  }

  .project-update-title-pill-text {
    font-size: clamp(1.12rem, 5.4vw, 1.48rem) !important;
    line-height: 1.13 !important;
    -webkit-line-clamp: 3 !important;
  }

  .project-update-title-pill-card [class*='chip'],
  .project-update-title-pill-card [class*='pill'],
  .project-update-title-pill-card [class*='badge'] {
    min-height: 31px !important;
    padding: 8px 11px !important;
    font-size: 0.72rem !important;
  }

  .project-update-title-pill-card [class*='meta'],
  .project-update-title-pill-card [class*='actions'],
  .project-update-title-pill-card [class*='summary'] {
    margin-top: 13px !important;
    gap: 7px !important;
  }
}

@media (max-width: 420px) {
  .project-update-title-pill-card {
    margin: 10px 12px 12px !important;
    padding: 16px 15px 18px !important;
    border-radius: 22px !important;
  }

  .project-update-title-pill-text {
    font-size: clamp(1.06rem, 5vw, 1.3rem) !important;
    line-height: 1.14 !important;
    -webkit-line-clamp: 3 !important;
  }

  .project-update-title-pill-card [class*='chip'],
  .project-update-title-pill-card [class*='pill'],
  .project-update-title-pill-card [class*='badge'] {
    min-height: 30px !important;
    padding: 7px 10px !important;
    font-size: 0.68rem !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Project Update title pill readable fix applied.')
console.log('Title is larger, readable, and clamped to 3 lines.')
console.log('Location/status chips are now visible on the white card.')
