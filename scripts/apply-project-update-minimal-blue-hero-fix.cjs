const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.project-update-minimal-blue-hero.bak`
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
  'PMS10 PROJECT UPDATE BLUE HERO CLEAN FIX',
  'PMS10 PROJECT UPDATE MINIMAL BLUE HERO FIX',
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
   PMS10 PROJECT UPDATE MINIMAL BLUE HERO FIX
   Cleaner field-friendly update hero: no extra bubbles, no pill overload.
========================= */

.pu-update-hero-card {
  display: block !important;
  position: relative !important;
  min-height: 218px !important;
  max-height: 292px !important;
  height: auto !important;
  margin: 10px 14px 12px !important;
  padding: 26px 30px 24px !important;
  border: 0 !important;
  border-radius: 28px !important;
  color: #ffffff !important;
  background: linear-gradient(135deg, #0d3f78 0%, #135aa1 58%, #2373c4 100%) !important;
  box-shadow: 0 16px 34px rgba(15, 79, 143, 0.2) !important;
  overflow: hidden !important;
}

/* Remove decorative bubbles / glass overlays from previous versions */
.pu-update-hero-card::before,
.pu-update-hero-card::after {
  display: none !important;
  content: none !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.pu-update-hero-card * {
  position: relative !important;
  z-index: 1 !important;
  text-shadow: none !important;
}

/* Eyebrow label */
.pu-update-hero-card p:first-child,
.pu-update-hero-card [class*='eyebrow'],
.pu-update-hero-card [class*='kicker'] {
  margin: 0 0 13px !important;
  color: #ffb020 !important;
  font-size: 0.76rem !important;
  line-height: 1.05 !important;
  font-weight: 950 !important;
  letter-spacing: 0.18em !important;
  text-transform: uppercase !important;
}

/* Project title */
.pu-update-hero-title,
.pu-update-hero-card h1 {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;
  width: 100% !important;
  max-width: 100% !important;
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
  font-size: clamp(1.75rem, 8vw, 2.78rem) !important;
  line-height: 1.04 !important;
  letter-spacing: -0.055em !important;
  font-weight: 950 !important;
}

/* Meta groups: plain text row, not pill-heavy */
.pu-update-hero-card [class*='meta'],
.pu-update-hero-card [class*='actions'],
.pu-update-hero-card [class*='summary'],
.pu-update-hero-card [class*='location'],
.pu-update-hero-card [class*='chips'],
.pu-update-hero-card [class*='badges'] {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 8px !important;
  width: auto !important;
  max-width: 100% !important;
  margin-top: 14px !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

/* Convert all chips/badges/pills inside the update hero into clean inline labels */
.pu-update-hero-card [class*='chip'],
.pu-update-hero-card [class*='pill'],
.pu-update-hero-card [class*='badge'] {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: auto !important;
  max-width: 100% !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: rgba(255, 255, 255, 0.88) !important;
  font-size: 0.76rem !important;
  line-height: 1.15 !important;
  font-weight: 900 !important;
  letter-spacing: 0.03em !important;
}

/* Subtle separator instead of multiple bubble pills */
.pu-update-hero-card [class*='chip']:not(:last-child)::after,
.pu-update-hero-card [class*='pill']:not(:last-child)::after,
.pu-update-hero-card [class*='badge']:not(:last-child)::after {
  content: "•" !important;
  display: inline-block !important;
  margin-left: 8px !important;
  color: rgba(255, 255, 255, 0.38) !important;
}

/* Prevent previous broad rules from creating full-width colored strips */
.pu-update-hero-card [class*='status'],
.pu-update-hero-card [class*='complete'],
.pu-update-hero-card [class*='risk'],
.pu-update-hero-card [class*='progress'] {
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.pu-update-hero-card [class*='risk'],
.pu-update-hero-card [class*='high'] {
  color: #fecaca !important;
}

.pu-update-hero-card [class*='complete'],
.pu-update-hero-card [class*='completed'] {
  color: #bbf7d0 !important;
}

@media (min-width: 901px) {
  .pu-update-hero-card {
    min-height: 226px !important;
    max-height: 304px !important;
    padding: 28px 34px 26px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(2.05rem, 4.4vw, 3.65rem) !important;
  }
}

@media (max-width: 900px) {
  .pu-update-hero-card {
    min-height: 216px !important;
    max-height: 292px !important;
    margin: 10px 14px 12px !important;
    padding: 25px 28px 23px !important;
    border-radius: 27px !important;
  }

  .pu-update-hero-card p:first-child,
  .pu-update-hero-card [class*='eyebrow'],
  .pu-update-hero-card [class*='kicker'] {
    font-size: 0.72rem !important;
    margin-bottom: 12px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(1.72rem, 8.2vw, 2.55rem) !important;
    line-height: 1.04 !important;
    -webkit-line-clamp: 3 !important;
  }

  .pu-update-hero-card [class*='chip'],
  .pu-update-hero-card [class*='pill'],
  .pu-update-hero-card [class*='badge'] {
    font-size: 0.72rem !important;
  }
}

@media (max-width: 420px) {
  .pu-update-hero-card {
    min-height: 204px !important;
    max-height: 278px !important;
    margin: 9px 12px 11px !important;
    padding: 23px 24px 22px !important;
    border-radius: 25px !important;
  }

  .pu-update-hero-title,
  .pu-update-hero-card h1 {
    font-size: clamp(1.48rem, 7.3vw, 2.12rem) !important;
    -webkit-line-clamp: 3 !important;
  }

  .pu-update-hero-card [class*='chip'],
  .pu-update-hero-card [class*='pill'],
  .pu-update-hero-card [class*='badge'] {
    font-size: 0.68rem !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)
console.log('Project Update minimal blue hero fix applied.')
