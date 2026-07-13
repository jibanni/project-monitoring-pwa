const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.project-update-return-blue-hero.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(layoutCssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

const markers = [
  'PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX',
  'PMS10 PROJECT UPDATE HERO SWIPEABLE TITLE',
  'PMS10 REMOVE PROJECT UPDATE HERO BANNER',
  'PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX',
  'PMS10 PROJECT UPDATE TITLE PILL READABLE FIX',
  'PMS10 PROJECT UPDATE RETURN BLUE HERO BIGGER FONT',
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
   PMS10 PROJECT UPDATE RETURN BLUE HERO BIGGER FONT
   Restores blue Project Update hero while keeping it controlled for field use.
========================= */

.project-update-title-pill-card,
.project-update-hero-hidden-field-mode,
.project-update-swipe-hero,
.project-update-compact-hero {
  display: block !important;
  position: relative !important;

  min-height: 260px !important;
  max-height: 360px !important;
  height: auto !important;

  margin: 14px 14px 14px !important;
  padding: 30px 32px 28px !important;

  border: 0 !important;
  border-radius: 30px !important;

  color: #ffffff !important;
  background:
    radial-gradient(circle at 88% 18%, rgba(255, 255, 255, 0.2) 0 24%, transparent 25%),
    linear-gradient(135deg, #0d3f78 0%, #12589f 52%, #2373c4 100%) !important;

  box-shadow: 0 18px 38px rgba(15, 79, 143, 0.22) !important;
  overflow: hidden !important;
}

.project-update-title-pill-card::before,
.project-update-hero-hidden-field-mode::before,
.project-update-swipe-hero::before,
.project-update-compact-hero::before {
  content: "" !important;
  position: absolute !important;
  inset: auto -70px -120px auto !important;
  width: 260px !important;
  height: 260px !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.11) !important;
  pointer-events: none !important;
}

.project-update-title-pill-card::after,
.project-update-hero-hidden-field-mode::after,
.project-update-swipe-hero::after,
.project-update-compact-hero::after {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  border-radius: inherit !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  pointer-events: none !important;
}

.project-update-title-pill-card *,
.project-update-hero-hidden-field-mode *,
.project-update-swipe-hero *,
.project-update-compact-hero * {
  position: relative !important;
  z-index: 1 !important;
}

.project-update-title-pill-card p:first-child,
.project-update-hero-hidden-field-mode p:first-child,
.project-update-swipe-hero p:first-child,
.project-update-compact-hero p:first-child,
.project-update-title-pill-card [class*='eyebrow'],
.project-update-title-pill-card [class*='kicker'],
.project-update-hero-hidden-field-mode [class*='eyebrow'],
.project-update-hero-hidden-field-mode [class*='kicker'],
.project-update-swipe-hero [class*='eyebrow'],
.project-update-swipe-hero [class*='kicker'],
.project-update-compact-hero [class*='eyebrow'],
.project-update-compact-hero [class*='kicker'] {
  margin: 0 0 12px !important;
  color: #ffb020 !important;
  font-size: 0.82rem !important;
  line-height: 1.05 !important;
  font-weight: 950 !important;
  letter-spacing: 0.18em !important;
  text-transform: uppercase !important;
  text-shadow: none !important;
}

.project-update-title-pill-text,
.project-update-swipe-title,
.project-update-compact-title,
.project-update-title-pill-card h1,
.project-update-hero-hidden-field-mode h1,
.project-update-swipe-hero h1,
.project-update-compact-hero h1 {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;

  max-width: 100% !important;
  margin: 0 !important;

  overflow: hidden !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;

  color: #ffffff !important;
  font-size: clamp(2.05rem, 8.5vw, 3.65rem) !important;
  line-height: 1.02 !important;
  letter-spacing: -0.065em !important;
  font-weight: 950 !important;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.12) !important;
}

/* Location/meta/status chips on blue hero */
.project-update-title-pill-card [class*='chip'],
.project-update-title-pill-card [class*='pill'],
.project-update-title-pill-card [class*='badge'],
.project-update-hero-hidden-field-mode [class*='chip'],
.project-update-hero-hidden-field-mode [class*='pill'],
.project-update-hero-hidden-field-mode [class*='badge'],
.project-update-swipe-hero [class*='chip'],
.project-update-swipe-hero [class*='pill'],
.project-update-swipe-hero [class*='badge'],
.project-update-compact-hero [class*='chip'],
.project-update-compact-hero [class*='pill'],
.project-update-compact-hero [class*='badge'] {
  min-height: 34px !important;
  padding: 8px 13px !important;
  border-radius: 999px !important;
  font-size: 0.78rem !important;
  line-height: 1 !important;
  font-weight: 950 !important;
  color: rgba(255, 255, 255, 0.94) !important;
  background: rgba(255, 255, 255, 0.14) !important;
  border: 1px solid rgba(255, 255, 255, 0.24) !important;
  box-shadow: none !important;
}

.project-update-title-pill-card [class*='meta'],
.project-update-title-pill-card [class*='actions'],
.project-update-title-pill-card [class*='summary'],
.project-update-hero-hidden-field-mode [class*='meta'],
.project-update-hero-hidden-field-mode [class*='actions'],
.project-update-hero-hidden-field-mode [class*='summary'],
.project-update-swipe-hero [class*='meta'],
.project-update-swipe-hero [class*='actions'],
.project-update-swipe-hero [class*='summary'],
.project-update-compact-hero [class*='meta'],
.project-update-compact-hero [class*='actions'],
.project-update-compact-hero [class*='summary'] {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 9px !important;
  margin-top: 16px !important;
}

/* Keep completed/progress/risk pills readable but compact */
.project-update-title-pill-card [class*='complete'],
.project-update-title-pill-card [class*='completed'],
.project-update-title-pill-card [class*='status'],
.project-update-hero-hidden-field-mode [class*='complete'],
.project-update-hero-hidden-field-mode [class*='completed'],
.project-update-hero-hidden-field-mode [class*='status'],
.project-update-swipe-hero [class*='complete'],
.project-update-swipe-hero [class*='completed'],
.project-update-swipe-hero [class*='status'],
.project-update-compact-hero [class*='complete'],
.project-update-compact-hero [class*='completed'],
.project-update-compact-hero [class*='status'] {
  color: #166534 !important;
  background: #dcfce7 !important;
  border-color: rgba(34, 197, 94, 0.26) !important;
}

.project-update-title-pill-card [class*='risk'],
.project-update-title-pill-card [class*='high'],
.project-update-hero-hidden-field-mode [class*='risk'],
.project-update-hero-hidden-field-mode [class*='high'],
.project-update-swipe-hero [class*='risk'],
.project-update-swipe-hero [class*='high'],
.project-update-compact-hero [class*='risk'],
.project-update-compact-hero [class*='high'] {
  color: #b91c1c !important;
  background: #fee2e2 !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
}

@media (min-width: 901px) {
  .project-update-title-pill-card,
  .project-update-hero-hidden-field-mode,
  .project-update-swipe-hero,
  .project-update-compact-hero {
    min-height: 245px !important;
    max-height: 345px !important;
    padding: 32px 36px 30px !important;
  }

  .project-update-title-pill-text,
  .project-update-swipe-title,
  .project-update-compact-title,
  .project-update-title-pill-card h1,
  .project-update-hero-hidden-field-mode h1,
  .project-update-swipe-hero h1,
  .project-update-compact-hero h1 {
    font-size: clamp(2.45rem, 4.8vw, 4.35rem) !important;
  }
}

@media (max-width: 900px) {
  .project-update-title-pill-card,
  .project-update-hero-hidden-field-mode,
  .project-update-swipe-hero,
  .project-update-compact-hero {
    min-height: 250px !important;
    max-height: 340px !important;
    margin: 12px 14px 14px !important;
    padding: 28px 30px 26px !important;
    border-radius: 28px !important;
  }

  .project-update-title-pill-card p:first-child,
  .project-update-hero-hidden-field-mode p:first-child,
  .project-update-swipe-hero p:first-child,
  .project-update-compact-hero p:first-child,
  .project-update-title-pill-card [class*='eyebrow'],
  .project-update-title-pill-card [class*='kicker'],
  .project-update-hero-hidden-field-mode [class*='eyebrow'],
  .project-update-hero-hidden-field-mode [class*='kicker'],
  .project-update-swipe-hero [class*='eyebrow'],
  .project-update-swipe-hero [class*='kicker'],
  .project-update-compact-hero [class*='eyebrow'],
  .project-update-compact-hero [class*='kicker'] {
    font-size: 0.74rem !important;
    margin-bottom: 11px !important;
  }

  .project-update-title-pill-text,
  .project-update-swipe-title,
  .project-update-compact-title,
  .project-update-title-pill-card h1,
  .project-update-hero-hidden-field-mode h1,
  .project-update-swipe-hero h1,
  .project-update-compact-hero h1 {
    font-size: clamp(2rem, 9.2vw, 3.15rem) !important;
    line-height: 1.03 !important;
    -webkit-line-clamp: 3 !important;
  }
}

@media (max-width: 420px) {
  .project-update-title-pill-card,
  .project-update-hero-hidden-field-mode,
  .project-update-swipe-hero,
  .project-update-compact-hero {
    min-height: 238px !important;
    max-height: 318px !important;
    margin: 10px 12px 12px !important;
    padding: 25px 26px 24px !important;
    border-radius: 26px !important;
  }

  .project-update-title-pill-text,
  .project-update-swipe-title,
  .project-update-compact-title,
  .project-update-title-pill-card h1,
  .project-update-hero-hidden-field-mode h1,
  .project-update-swipe-hero h1,
  .project-update-compact-hero h1 {
    font-size: clamp(1.75rem, 8.4vw, 2.65rem) !important;
    -webkit-line-clamp: 3 !important;
  }

  .project-update-title-pill-card [class*='chip'],
  .project-update-title-pill-card [class*='pill'],
  .project-update-title-pill-card [class*='badge'],
  .project-update-hero-hidden-field-mode [class*='chip'],
  .project-update-hero-hidden-field-mode [class*='pill'],
  .project-update-hero-hidden-field-mode [class*='badge'],
  .project-update-swipe-hero [class*='chip'],
  .project-update-swipe-hero [class*='pill'],
  .project-update-swipe-hero [class*='badge'],
  .project-update-compact-hero [class*='chip'],
  .project-update-compact-hero [class*='pill'],
  .project-update-compact-hero [class*='badge'] {
    min-height: 31px !important;
    padding: 7px 11px !important;
    font-size: 0.7rem !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Project Update blue hero restored with bigger controlled title.')
