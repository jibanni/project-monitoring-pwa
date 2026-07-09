const LOWERCASE_PROJECT_TITLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

const PRESERVED_PROJECT_ACRONYMS = new Set([
  'ABC',
  'BHS',
  'CAF',
  'CDO',
  'CEO',
  'CMGP',
  'COA',
  'DED',
  'DILG',
  'DPWH',
  'DRRM',
  'FALGU',
  'FMR',
  'FY',
  'GEF',
  'GOP',
  'KALSADA',
  'LDIP',
  'LGSF',
  'LGU',
  'MOOE',
  'PDMU',
  'POW',
  'RAPID',
  'RHU',
  'SAFPB',
  'SALINTUBIG',
  'SBDP',
  'WSS',
])

const ROMAN_NUMERALS = new Set([
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
])

function normalizeSpacing(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function capitalizeWordPart(part: string) {
  if (!part) return part

  const upperPart = part.toUpperCase()
  const lowerPart = part.toLowerCase()

  if (PRESERVED_PROJECT_ACRONYMS.has(upperPart)) return upperPart
  if (ROMAN_NUMERALS.has(upperPart)) return upperPart
  if (/^\d+$/.test(part)) return part
  if (/^\d+[a-zA-Z]+$/.test(part)) return upperPart

  return lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1)
}

function titleCaseWord(word: string, wordIndex: number, totalWords: number) {
  const cleanWord = word.trim()

  if (!cleanWord) return cleanWord

  const normalizedWord = cleanWord.toLowerCase()

  if (
    LOWERCASE_PROJECT_TITLE_WORDS.has(normalizedWord) &&
    wordIndex > 0 &&
    wordIndex < totalWords - 1
  ) {
    return normalizedWord
  }

  return cleanWord
    .split(/([\-/])/)
    .map((part) => {
      if (part === '-' || part === '/') return part

      const lowerPart = part.toLowerCase()

      if (LOWERCASE_PROJECT_TITLE_WORDS.has(lowerPart)) return lowerPart

      return capitalizeWordPart(part)
    })
    .join('')
}

export function toProjectTitleCase(value: unknown) {
  const cleaned = normalizeSpacing(String(value ?? ''))

  if (!cleaned) return ''

  const words = cleaned.split(' ')

  return words
    .map((word, index) => titleCaseWord(word, index, words.length))
    .join(' ')
}
