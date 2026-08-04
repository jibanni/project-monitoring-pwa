export type DilgOfficeDirectoryEntry = {
  location: string
  officeName: string
  address: string
}

const OFFICE_DIRECTORY: Record<string, DilgOfficeDirectoryEntry> = {
  'REGIONAL OFFICE 10': {
    location: 'REGIONAL OFFICE 10',
    officeName: 'DILG REGION X - NORTHERN MINDANAO',
    address:
      'KM3 Fr. W.F. Masterson Avenue, Upper Carmen, Cagayan de Oro City, Misamis Oriental',
  },
  BUKIDNON: {
    location: 'BUKIDNON',
    officeName: 'DILG BUKIDNON PROVINCIAL OFFICE',
    address: 'DILG Building, Capitol Grounds, 8700 Malaybalay City',
  },
  CAMIGUIN: {
    location: 'CAMIGUIN',
    officeName: 'DILG CAMIGUIN PROVINCIAL OFFICE',
    address: 'Old Parola, J.P. Rizal St., Poblacion, Mambajao, Camiguin',
  },
  'LANAO DEL NORTE': {
    location: 'LANAO DEL NORTE',
    officeName: 'DILG LANAO DEL NORTE PROVINCIAL OFFICE',
    address:
      'Gov. A. A. Quibranza Provincial Government Center, Pigcarangan, Tubod, Lanao del Norte',
  },
  'MISAMIS OCCIDENTAL': {
    location: 'MISAMIS OCCIDENTAL',
    officeName: 'DILG MISAMIS OCCIDENTAL PROVINCIAL OFFICE',
    address: 'PEO Compound, Capitol Drive, Lower Lamac, Oroquieta City',
  },
  'MISAMIS ORIENTAL': {
    location: 'MISAMIS ORIENTAL',
    officeName: 'DILG MISAMIS ORIENTAL PROVINCIAL OFFICE',
    address:
      'KM3 Fr. W.F. Masterson Avenue, Upper Carmen, Cagayan de Oro City, Misamis Oriental',
  },
  'CAGAYAN DE ORO CITY': {
    location: 'CAGAYAN DE ORO CITY',
    officeName: 'DILG CAGAYAN DE ORO CITY OFFICE',
    address:
      'Cagayan de Oro City Hall Building, Capistrano Street, Corner Gaerlan Street, Cagayan de Oro City, 9000 Misamis Oriental',
  },
  'ILIGAN CITY': {
    location: 'ILIGAN CITY',
    officeName: 'DILG ILIGAN CITY OFFICE',
    address: 'City Hall Road, Iligan City, Lanao del Norte',
  },
}

function textKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

export function normalizeDilgOfficeLocation(value: unknown) {
  const key = textKey(value)

  if (!key) return ''
  if (key.includes('REGIONAL OFFICE') || key === 'REGION 10' || key === 'REGION X') {
    return 'REGIONAL OFFICE 10'
  }
  if (key.includes('CAGAYAN DE ORO')) return 'CAGAYAN DE ORO CITY'
  if (key.includes('ILIGAN')) return 'ILIGAN CITY'
  if (key.includes('BUKIDNON')) return 'BUKIDNON'
  if (key.includes('CAMIGUIN')) return 'CAMIGUIN'
  if (key.includes('LANAO DEL NORTE')) return 'LANAO DEL NORTE'
  if (key.includes('MISAMIS OCCIDENTAL')) return 'MISAMIS OCCIDENTAL'
  if (key.includes('MISAMIS ORIENTAL')) return 'MISAMIS ORIENTAL'

  return key
}

export function getDilgOfficeDirectoryEntry(value: unknown): DilgOfficeDirectoryEntry {
  const location = normalizeDilgOfficeLocation(value)
  const known = OFFICE_DIRECTORY[location]

  if (known) return known

  return {
    location,
    officeName: location ? `DILG ${location} OFFICE` : '',
    address: '',
  }
}

export const DILG_REGION_10_OFFICES = Object.values(OFFICE_DIRECTORY)
