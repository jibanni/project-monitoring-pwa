const fs = require('fs')
const path = require('path')

const root = process.cwd()
const layout = path.join(root, 'src/styles/layout.css')
const main = path.join(root, 'src/main.tsx')
const utils = path.join(root, 'src/utils')
const runtime = path.join(utils, 'pms10RuntimeHeroLogicFix.ts')

function fail(msg){ console.error(msg); process.exit(1) }
if (!fs.existsSync(layout)) fail('Missing src/styles/layout.css')
if (!fs.existsSync(main)) fail('Missing src/main.tsx')
if (!fs.existsSync(utils)) fs.mkdirSync(utils, { recursive: true })

function backup(file, suffix){
  const bak = `${file}.${suffix}.bak`
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak)
    console.log(`Backup created: ${path.relative(root, bak)}`)
  }
}

function removeBlocks(css, markers){
  let out = css
  for (const marker of markers) {
    let i = out.indexOf(marker)
    while (i >= 0) {
      const s = out.lastIndexOf('/*', i)
      const start = s >= 0 ? s : i
      const n = out.indexOf('/* =========================', i + marker.length)
      out = n >= 0 ? out.slice(0, start) + out.slice(n) : out.slice(0, start)
      i = out.indexOf(marker)
    }
  }
  return out
}

backup(layout, 'runtime-hero-logic-final')
backup(main, 'runtime-hero-logic-final')
if (fs.existsSync(runtime)) backup(runtime, 'runtime-hero-logic-final')

const oldMarkers = [
  'PMS10 PROJECT UPDATE HERO TITLE CLAMP FIX',
  'PMS10 PROJECT UPDATE HERO SWIPEABLE TITLE',
  'PMS10 REMOVE PROJECT UPDATE HERO BANNER',
  'PMS10 PROJECT UPDATE COMPACT TITLE PILL FIX',
  'PMS10 PROJECT UPDATE TITLE PILL READABLE FIX',
  'PMS10 PROJECT UPDATE RETURN BLUE HERO BIGGER FONT',
  'PMS10 PROJECT UPDATE BLUE HERO CLEAN FIX',
  'PMS10 PROJECT UPDATE MINIMAL BLUE HERO FIX',
  'PMS10 PROJECT UPDATE HERO PILLS FINAL FIX',
  'PMS10 UPDATE HERO PILLS TITLECASE FINAL FIX',
  'PMS10 PROJECT UPDATE SMALL PILLS HOTFIX',
  'PMS10 UPDATE HERO DETAILS BUBBLES HOTFIX',
  'PMS10 PROJECT UPDATE DETAILS-STYLE STATUS AND AUTOFIT TITLE',
  'PMS10 RUNTIME HERO LOGIC FINAL PATCH',
]

let css = fs.readFileSync(layout, 'utf8')
css = removeBlocks(css, oldMarkers)
css += `
/* =========================
   PMS10 RUNTIME HERO LOGIC FINAL PATCH
   Runtime controlled hero chips, auto-fit titles, title-case locations, tones.
========================= */

.pms10-tone-success{color:#166534!important;background:#dcfce7!important;border-color:rgba(34,197,94,.32)!important}
.pms10-tone-danger{color:#b91c1c!important;background:#fee2e2!important;border-color:rgba(239,68,68,.34)!important}
.pms10-tone-warning{color:#c2410c!important;background:#ffedd5!important;border-color:rgba(249,115,22,.34)!important}
.pms10-tone-info{color:#1d4ed8!important;background:#eff6ff!important;border-color:rgba(59,130,246,.34)!important}
.pms10-tone-neutral{color:rgba(255,255,255,.95)!important;background:rgba(255,255,255,.14)!important;border-color:rgba(255,255,255,.26)!important}
.pms10-value-success{color:#166534!important}.pms10-value-danger{color:#b91c1c!important}.pms10-value-warning{color:#c2410c!important}.pms10-value-info{color:#1d4ed8!important}.pms10-value-neutral{color:#475569!important}

.pms10-runtime-hero{position:relative!important;overflow:hidden!important;color:#fff!important}
.pms10-runtime-update-hero{min-height:224px!important;max-height:none!important;height:auto!important;margin:10px 14px 12px!important;padding:24px 28px 23px!important;border-radius:28px!important;background:linear-gradient(135deg,#0d3f78 0%,#155fa9 58%,#2373c4 100%)!important;box-shadow:0 16px 34px rgba(15,79,143,.2)!important}
.pms10-runtime-details-hero{max-height:none!important;height:auto!important}
.pms10-runtime-update-hero::before,.pms10-runtime-update-hero::after,.pu-update-hero-card::before,.pu-update-hero-card::after{display:none!important;content:none!important;background:transparent!important;border:0!important;box-shadow:none!important}
.pms10-runtime-hero *{position:relative!important;z-index:1!important;text-shadow:none!important}

.pms10-runtime-hero-title,.pms10-runtime-hero h1{display:block!important;white-space:normal!important;overflow:visible!important;text-overflow:unset!important;-webkit-line-clamp:unset!important;-webkit-box-orient:unset!important;max-width:100%!important;margin:0 0 14px!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:#fff!important;font-size:var(--pms10-title-size,clamp(1.55rem,7vw,2.45rem))!important;line-height:var(--pms10-title-line,1.035)!important;letter-spacing:-.055em!important;font-weight:950!important}
.pms10-runtime-details-hero .pms10-runtime-hero-title,.pms10-runtime-details-hero h1{font-size:var(--pms10-title-size,clamp(2.05rem,8.2vw,4.3rem))!important}

.pms10-runtime-chip-row,.pms10-runtime-hero [class*='meta'],.pms10-runtime-hero [class*='actions'],.pms10-runtime-hero [class*='summary'],.pms10-runtime-hero [class*='location'],.pms10-runtime-hero [class*='chips'],.pms10-runtime-hero [class*='badges'],.pms10-runtime-hero [class*='pills'],.pms10-runtime-hero [class*='status']:has(>*),.pms10-runtime-hero [class*='progress']:has(>*),.pms10-runtime-hero [class*='risk']:has(>*),.pms10-runtime-hero [class*='complete']:has(>*),.pms10-runtime-hero [class*='completed']:has(>*),.pms10-runtime-hero [class*='high']:has(>*),.pms10-runtime-hero [class*='medium']:has(>*),.pms10-runtime-hero [class*='low']:has(>*){display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:7px!important;row-gap:7px!important;width:auto!important;max-width:100%!important;min-height:0!important;margin-top:9px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}

.pms10-runtime-hero-chip{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;width:auto!important;max-width:max-content!important;min-width:0!important;min-height:30px!important;height:30px!important;margin:0!important;padding:6px 12px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.25)!important;background:rgba(255,255,255,.14)!important;box-shadow:none!important;color:rgba(255,255,255,.95)!important;font-size:.68rem!important;line-height:1!important;font-weight:900!important;letter-spacing:.02em!important;white-space:nowrap!important;text-transform:none!important}
.pms10-runtime-details-hero .pms10-runtime-hero-chip{min-height:34px!important;height:34px!important;padding:7px 15px!important;font-size:.74rem!important}
.pms10-runtime-hero-chip::after,.pms10-runtime-hero [class*='chip']::after,.pms10-runtime-hero [class*='pill']::after,.pms10-runtime-hero [class*='badge']::after{display:none!important;content:none!important}
.pms10-runtime-hero-chip.pms10-tone-success{color:#166534!important;background:#dcfce7!important;border-color:rgba(34,197,94,.32)!important}.pms10-runtime-hero-chip.pms10-tone-info{color:#1d4ed8!important;background:#eff6ff!important;border-color:rgba(59,130,246,.34)!important}.pms10-runtime-hero-chip.pms10-tone-danger{color:#b91c1c!important;background:#fee2e2!important;border-color:rgba(239,68,68,.34)!important}.pms10-runtime-hero-chip.pms10-tone-warning{color:#c2410c!important;background:#ffedd5!important;border-color:rgba(249,115,22,.34)!important}.pms10-runtime-hero-chip.pms10-tone-neutral{color:rgba(255,255,255,.95)!important;background:rgba(255,255,255,.14)!important;border-color:rgba(255,255,255,.26)!important}

[class*='province'],[class*='municip'],[class*='city'],[class*='barangay'],[class*='brgy'],[class*='lgu'],[class*='location'],[class*='address'],[data-field*='province'],[data-field*='municip'],[data-field*='city'],[data-field*='barangay'],[data-field*='brgy'],[data-field*='lgu'],[data-label*='province'],[data-label*='municip'],[data-label*='city'],[data-label*='barangay'],[data-label*='brgy'],[data-label*='lgu']{text-transform:none!important}
.pms10-runtime-value.pms10-value-success{color:#166534!important}.pms10-runtime-value.pms10-value-danger{color:#b91c1c!important}.pms10-runtime-value.pms10-value-warning{color:#c2410c!important}.pms10-runtime-value.pms10-value-info{color:#1d4ed8!important}.pms10-runtime-value.pms10-value-neutral{color:#475569!important}

@media(max-width:420px){.pms10-runtime-update-hero{min-height:212px!important;padding:22px 24px 22px!important;border-radius:25px!important}.pms10-runtime-hero-chip{min-height:27px!important;height:27px!important;padding:5px 10px!important;font-size:.62rem!important}.pms10-runtime-details-hero .pms10-runtime-hero-chip{min-height:31px!important;height:31px!important;padding:6px 12px!important;font-size:.68rem!important}}
`
fs.writeFileSync(layout, css)

const runtimeSource = `type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

const LOCATION_EXCLUDE = new Set(['ADMIN','ALL','ALL PROJECTS','CANCELLED','COMPLETED','CRITICAL','CRITICAL STATUS','DASHBOARD','DETAILS','DILG','FALGU','FILTER','HIGH','HIGH RISK','LOW','MEDIUM','NONE','NOT STARTED','NOT YET STARTED','ONGOING','PROJECT','PROJECTS','PROJECT UPDATE FORM','RISK','SUBAYBAYAN','SYNC','TERMINATED','UNDER PROCUREMENT','USERS'])
function cleanText(value: string | null | undefined){return (value ?? '').replace(/\\s+/g,' ').trim()}
function toLocationTitleCase(value: string){return value.toLowerCase().replace(/\\s+/g,' ').trim().replace(/[a-zñ]+(?:[-'][a-zñ]+)*/gi,(word)=>word.split(/([-'])/).map((part)=>part==='-'||part==="'"?part:part?part.charAt(0).toUpperCase()+part.slice(1):part).join(''))}
function shouldTitleCaseLocationSegment(segment: string){const trimmed=cleanText(segment);if(!trimmed||trimmed.length<3||trimmed.length>90)return false;if(/[0-9%₱$]/.test(trimmed))return false;const upper=trimmed.toUpperCase();if(LOCATION_EXCLUDE.has(upper))return false;if(upper.includes('PROJECT')||upper.includes('STATUS')||upper.includes('RISK'))return false;const letters=trimmed.replace(/[^A-Za-zÑñ]/g,'');if(letters.length<3)return false;const uppercaseLetters=letters.replace(/[^A-ZÑ]/g,'');return uppercaseLetters.length/letters.length>=0.65}
function titleCaseMixedLocationText(text: string){const leading=text.match(/^\\s*/)?.[0]??'';const trailing=text.match(/\\s*$/)?.[0]??'';const core=text.trim();if(!core)return text;const parts=core.split(/(,|•|\\||\\/| - )/g);const normalized=parts.map((part)=>{if(/^(,|•|\\||\\/| - )$/.test(part))return part;const segment=part.trim();if(!shouldTitleCaseLocationSegment(segment))return part;const a=part.match(/^\\s*/)?.[0]??'';const b=part.match(/\\s*$/)?.[0]??'';return \\`\\${a}\\${toLocationTitleCase(segment)}\\${b}\\`}).join('');if(normalized!==core)return \\`\\${leading}\\${normalized}\\${trailing}\\`;if(shouldTitleCaseLocationSegment(core))return \\`\\${leading}\\${toLocationTitleCase(core)}\\${trailing}\\`;return text}
function looksLocationScoped(element: Element){if(element.tagName==='OPTION')return true;const meta=[element.className,element.id,element.getAttribute('aria-label'),element.getAttribute('data-field'),element.getAttribute('data-label'),element.getAttribute('name'),element.getAttribute('placeholder')].filter(Boolean).join(' ');return /province|municip|city|barangay|brgy|lgu|location|address|place|meta|chip|pill|badge/i.test(meta)}
function normalizeLocationDisplay(){const elements=document.querySelectorAll<HTMLElement>(['[class*="province"]','[class*="municip"]','[class*="city"]','[class*="barangay"]','[class*="brgy"]','[class*="lgu"]','[class*="location"]','[class*="address"]','[class*="meta"]','[class*="chip"]','[class*="pill"]','[class*="badge"]','[data-field*="province"]','[data-field*="municip"]','[data-field*="city"]','[data-field*="barangay"]','[data-field*="brgy"]','[data-field*="lgu"]','[data-label*="province"]','[data-label*="municip"]','[data-label*="city"]','[data-label*="barangay"]','[data-label*="brgy"]','[data-label*="lgu"]','option'].join(','));elements.forEach((element)=>{if(!looksLocationScoped(element))return;element.style.textTransform='none';Array.from(element.childNodes).forEach((node)=>{if(node.nodeType!==Node.TEXT_NODE)return;const original=node.textContent??'';const normalized=titleCaseMixedLocationText(original);if(normalized!==original)node.textContent=normalized})})}
function findHeroByLabel(label: string){const labelUpper=label.toUpperCase();const candidates=Array.from(document.querySelectorAll<HTMLElement>('section, div, article'));return candidates.filter((element)=>{const text=cleanText(element.textContent).toUpperCase();return text.includes(labelUpper)&&!!element.querySelector('h1')}).sort((a,b)=>cleanText(a.textContent).length-cleanText(b.textContent).length)[0]??null}
function markHeroes(){const updateHero=findHeroByLabel('PROJECT UPDATE FORM');if(updateHero)updateHero.classList.add('pms10-runtime-hero','pms10-runtime-update-hero');const detailsHero=findHeroByLabel('DETAILS');if(detailsHero)detailsHero.classList.add('pms10-runtime-hero','pms10-runtime-details-hero');document.querySelectorAll<HTMLElement>('.pms10-runtime-hero').forEach((hero)=>{const title=hero.querySelector<HTMLElement>('h1');if(title)title.classList.add('pms10-runtime-hero-title')})}
function getChipTone(text: string, heroCompleted: boolean): Tone{const normalized=cleanText(text).toLowerCase();if(!normalized)return 'neutral';if(normalized==='none')return 'neutral';if(normalized.includes('completed')||normalized.includes('complete'))return 'success';if(heroCompleted&&['high','medium','low','critical'].includes(normalized))return 'neutral';if(normalized==='high'||normalized==='critical'||normalized.includes('high risk'))return 'danger';if(normalized==='medium'||normalized==='low')return 'warning';const numeric=Number(normalized.replace(/[+,%]/g,''));if(Number.isFinite(numeric)&&normalized.includes('%')){if(numeric>0)return 'success';if(numeric<0)return 'danger';return 'info'}return 'neutral'}
function normalizeCompletedRiskInElement(root: HTMLElement){const text=cleanText(root.textContent).toLowerCase();const isCompleted=text.includes('completed')||/\\b100(?:\\.00)?%\\b/.test(text);if(!isCompleted)return false;Array.from(root.querySelectorAll<HTMLElement>('*')).forEach((node)=>{const t=cleanText(node.textContent).toLowerCase();if(['high','medium','low','critical','high risk','medium risk','low risk'].includes(t)){node.textContent='None';node.classList.remove('pms10-tone-danger','pms10-tone-warning');node.classList.add('pms10-tone-neutral')}});return true}
function markHeroChips(){document.querySelectorAll<HTMLElement>('.pms10-runtime-hero').forEach((hero)=>{const heroCompleted=normalizeCompletedRiskInElement(hero);const candidates=Array.from(hero.querySelectorAll<HTMLElement>('span, small, strong, b, em, div, p'));candidates.forEach((element)=>{if(element.querySelector('h1')||element.closest('h1'))return;const text=cleanText(element.textContent);if(!text||text.length>48)return;if(['PROJECT UPDATE FORM','DETAILS'].includes(text.toUpperCase()))return;if(element.children.length>3)return;const lower=text.toLowerCase();const isLikelyChip=element.className.toString().match(/chip|pill|badge|status|risk|progress|province|municip|barangay|brgy|lgu|location|subay/i)||['completed','ongoing','not started','not yet started','under procurement','high','medium','low','none'].includes(lower)||/^[+-]?\\d+(?:\\.\\d+)?%$/.test(text)||/bukidnon|camiguin|misamis|lanao|cabanglasan|dalacutan/i.test(text);if(!isLikelyChip)return;element.classList.add('pms10-runtime-hero-chip');element.classList.remove('pms10-tone-success','pms10-tone-danger','pms10-tone-warning','pms10-tone-info','pms10-tone-neutral');element.classList.add(\\`pms10-tone-\\${getChipTone(text,heroCompleted)}\\`)})})}
function fitOneTitle(title: HTMLElement){const hero=title.closest('.pms10-runtime-hero') as HTMLElement|null;if(!hero)return;const text=cleanText(title.textContent);if(!text)return;title.style.removeProperty('--pms10-title-size');title.style.setProperty('--pms10-title-line','1.035');const width=Math.max(title.clientWidth,1);const isDetails=hero.classList.contains('pms10-runtime-details-hero');const targetHeroHeight=isDetails?(window.innerWidth<=420?620:760):(window.innerWidth<=420?330:370);const targetTitleHeight=isDetails?(window.innerWidth<=420?370:470):(window.innerWidth<=420?142:165);let size=isDetails?Math.min(width*.095,54):Math.min(width*.07,32);if(text.length>160)size=Math.min(size,isDetails?32:20);else if(text.length>125)size=Math.min(size,isDetails?36:22);else if(text.length>95)size=Math.min(size,isDetails?42:25);else if(text.length>70)size=Math.min(size,isDetails?48:28);const minSize=isDetails?20:13;for(let i=0;i<48;i+=1){title.style.setProperty('--pms10-title-size',\\`\\${size}px\\`);if(title.scrollHeight<=targetTitleHeight&&hero.scrollHeight<=targetHeroHeight)return;size-=1;if(size<=minSize){title.style.setProperty('--pms10-title-size',\\`\\${minSize}px\\`);return}}}
function fitHeroTitles(){document.querySelectorAll<HTMLElement>('.pms10-runtime-hero-title').forEach(fitOneTitle)}
function toneTextValue(element: HTMLElement, tone: Tone){element.classList.remove('pms10-value-success','pms10-value-danger','pms10-value-warning','pms10-value-info','pms10-value-neutral');element.classList.add('pms10-runtime-value',\\`pms10-value-\\${tone}\\`)}
function normalizeCardsAndEditPages(){Array.from(document.querySelectorAll<HTMLElement>('article, section, div')).forEach(normalizeCompletedRiskInElement);Array.from(document.querySelectorAll<HTMLElement>('*')).forEach((element)=>{const text=cleanText(element.textContent);const lower=text.toLowerCase();if(!text||text.length>28||element.children.length>0)return;if(['high','medium','low','critical','none'].includes(lower)){if(lower==='none')toneTextValue(element,'neutral');else if(lower==='high'||lower==='critical')toneTextValue(element,'danger');else toneTextValue(element,'warning')}if(/^[+-]?\\d+(?:\\.\\d+)?%$/.test(text)){const numeric=Number(text.replace(/[+,%]/g,''));if(Number.isFinite(numeric)){if(numeric>0)toneTextValue(element,'success');else if(numeric<0)toneTextValue(element,'danger');else toneTextValue(element,'info')}}})}
function runPms10RuntimeFixes(){markHeroes();normalizeLocationDisplay();markHeroChips();normalizeCardsAndEditPages();fitHeroTitles()}
if(typeof window!=='undefined'){let queued=false;const queueRun=()=>{if(queued)return;queued=true;window.requestAnimationFrame(()=>{queued=false;runPms10RuntimeFixes()})};queueRun();window.addEventListener('load',queueRun);window.addEventListener('resize',queueRun);window.addEventListener('orientationchange',queueRun);window.addEventListener('popstate',queueRun);const observer=new MutationObserver(queueRun);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true})}
export {}
`

fs.writeFileSync(runtime, runtimeSource)

let mainTsx = fs.readFileSync(main, 'utf8')
mainTsx = mainTsx.replace("import './utils/fitProjectUpdateHeroTitle'\n", '')
mainTsx = mainTsx.replace("import './utils/fitHeroTitles'\n", '')
if (!mainTsx.includes('./utils/pms10RuntimeHeroLogicFix')) {
  const importLine = "import './utils/pms10RuntimeHeroLogicFix'\n"
  const firstNonImport = mainTsx.search(/^(?!import\s)/m)
  mainTsx = firstNonImport > 0
    ? `${mainTsx.slice(0, firstNonImport)}${importLine}${mainTsx.slice(firstNonImport)}`
    : `${importLine}${mainTsx}`
  fs.writeFileSync(main, mainTsx)
}

console.log('Applied PMS10 runtime hero logic final patch.')
console.log('Run: npm run build')
