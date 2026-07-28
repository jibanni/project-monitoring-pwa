const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const servicePath = path.join(projectRoot, 'src/services/subayImportService.ts')
const readmeNote = 'SGLGIF minimal-needed-fields import fix applied.'

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(servicePath)) {
  fail('Missing file: src/services/subayImportService.ts')
}

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function replaceBlockByConst(source, constName, replacement) {
  const start = source.indexOf(`const ${constName}`)
  if (start < 0) {
    fail(`Could not find const ${constName}`)
  }

  const nextConst = source.indexOf('\nconst ', start + 1)
  if (nextConst < 0) {
    fail(`Could not find end of const ${constName}`)
  }

  return `${source.slice(0, start)}${replacement}\n${source.slice(nextConst + 1)}`
}

function replaceFunction(source, functionName, replacement) {
  const marker = `function ${functionName}`
  const start = source.indexOf(marker)
  if (start < 0) {
    fail(`Could not find function ${functionName}`)
  }

  const braceStart = source.indexOf('{', start)
  if (braceStart < 0) {
    fail(`Could not find opening brace for ${functionName}`)
  }

  let depth = 0
  let quote = null

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index]
    const previous = source[index - 1]

    if (quote) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '{') depth += 1
    if (char === '}') depth -= 1

    if (depth === 0) {
      let end = index + 1
      while (end < source.length && /\s/.test(source[end])) end += 1
      return `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`
    }
  }

  fail(`Could not find closing brace for ${functionName}`)
}

backup(servicePath, 'sglgif-minimal-needed-fields')

let source = fs.readFileSync(servicePath, 'utf8')

/*
  Make sure projectTitle can be used by SGLGIF.
  Some older patches forgot to map Title to projectTitle.
*/
const correctedSglgifProfile = `const SGLGIF_PORTAL_PROFILE: SubayFormatProfile = {
  id: 'sglgif_portal',
  label: 'SGLGIF Portal Projects Extraction',
  expectedHeaderRowNumber: 2,
  dataStartOffset: 1,

  /*
    Only the columns needed by PMS10 are required and imported.

    Ignored SGLGIF portal columns:
    - Beneficiaries
    - Level
    - Subsidy
    - Action

    PMS10 uses:
    - LGU Reference Code only to build a stable import key and avoid duplicates
    - Year, Region, Province, LGU, Title, Amount, Type, Category, Status
  */
  requiredSignature: [
    'YEAR',
    'REGION',
    'PROVINCE',
    'LGU',
    'TITLE',
    'AMOUNT',
    'TYPE',
    'CATEGORY',
    'STATUS',
  ],
  strongSignature: ['LGU REFERENCE CODE'],
  columns: {
    projectCode: 0, // A LGU Reference Code, used only for stable import/update matching
    fundingYear: 2, // C Year
    region: 3, // D Region
    province: 4, // E Province
    municipality: 5, // F LGU
    projectTitle: 8, // I Title
    budget: 9, // J Amount
    projectType: 10, // K Type
    description: 11, // L Category
    status: 12, // M Status
  },
}`

if (source.includes('const SGLGIF_PORTAL_PROFILE')) {
  source = replaceBlockByConst(source, 'SGLGIF_PORTAL_PROFILE', correctedSglgifProfile)
} else {
  fail('SGLGIF_PORTAL_PROFILE not found. Apply the SGLGIF Portal import patch first, then this fix.')
}

/*
  Stable SGLGIF key. Uses only Reference Code + Year + LGU + Title.
  Does not import or store the full extraction row.
*/
const correctedCodeFunction = `function buildSglgifProjectCode(
  row: unknown[],
  profile: SubayFormatProfile,
  rawTitle: string,
  fundingYear: number | null,
) {
  const referenceCode = normalizeProjectCode(getProfileCell(row, profile, 'projectCode')).replace(/[^A-Z0-9-]/g, '')
  const lguSlug = normalizeComparable(getProfileCell(row, profile, 'municipality')).replace(/\\s+/g, '-').slice(0, 24)
  const titleSlug = normalizeComparable(rawTitle).replace(/\\s+/g, '-').slice(0, 48) || 'PROJECT'

  return ['SGLGIF', fundingYear || 'NOFY', referenceCode || lguSlug || 'LGU', titleSlug]
    .filter(Boolean)
    .join('-')
}`

if (source.includes('function buildSglgifProjectCode')) {
  source = replaceFunction(source, 'buildSglgifProjectCode', correctedCodeFunction)
}

/*
  Ensure SGLGIF accomplishment logic stays exactly as requested:
  - Completed = 100 physical and 100 financial
  - Ongoing = null/blank physical and financial
*/
source = source.replace(
  /const physicalAccomplishment =\n\s*profile\.id === 'sglgif_portal'\n\s*\? isSglgifCompleted\n\s*\? 100\n\s*: null\n\s*: parsePercent\(physicalValue\)/,
  `const physicalAccomplishment =
    profile.id === 'sglgif_portal'
      ? isSglgifCompleted
        ? 100
        : null
      : parsePercent(physicalValue)`,
)

source = source.replace(
  /const financialAccomplishment =\n\s*profile\.id === 'sglgif_portal'\n\s*\? isSglgifCompleted\n\s*\? 100\n\s*: null\n\s*: parsePercent\(getProfileCell\(row, profile, 'financialAccomplishment'\)\)/,
  `const financialAccomplishment =
    profile.id === 'sglgif_portal'
      ? isSglgifCompleted
        ? 100
        : null
      : parsePercent(getProfileCell(row, profile, 'financialAccomplishment'))`,
)

/*
  SGLGIF has no date/accomplishment fields from portal. Do not invent dates.
*/
source = source.replace(
  /revisedContractExpirationDate:\n\s*profile\.id === 'fy2024_below' && status === 'Completed'\n\s*\? firstDate\(getProfileCell\(row, profile, 'revisedContractExpirationDate'\)\)\n\s*: null,/,
  `revisedContractExpirationDate:
      profile.id === 'fy2024_below' && status === 'Completed'
        ? firstDate(getProfileCell(row, profile, 'revisedContractExpirationDate'))
        : null,`,
)

fs.writeFileSync(servicePath, source)

console.log(readmeNote)
console.log('')
console.log('SGLGIF import now ignores Beneficiaries, Level, Subsidy, and Action.')
console.log('It only imports fields needed by PMS10: Year, Region, Province, LGU, Title, Amount, Type, Category, and Status.')
console.log('LGU Reference Code is used only to generate a stable import key and prevent duplicates.')
