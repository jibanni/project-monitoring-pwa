export type Region10Province = {
  province: string
  lgus: string[]
}

function uniqueList(values: string[]) {
  const seen = new Set<string>()

  return values.filter((value) => {
    const cleanValue = String(value || '').trim()
    const key = cleanValue.toLowerCase()

    if (!cleanValue || seen.has(key)) return false

    seen.add(key)
    return true
  })
}

const RAW_REGION10_PROVINCES: Region10Province[] = [
  {
    province: 'Bukidnon',
    lgus: [
      'PLGU Bukidnon',
      'Baungon',
      'Cabanglasan',
      'Damulog',
      'Dangcagan',
      'Don Carlos',
      'Impasug-ong',
      'Kadingilan',
      'Kalilangan',
      'Kibawe',
      'Kitaotao',
      'Lantapan',
      'Libona',
      'Malaybalay City',
      'Malitbog',
      'Manolo Fortich',
      'Maramag',
      'Pangantucan',
      'Quezon',
      'San Fernando',
      'Sumilao',
      'Talakag',
      'Valencia City',
    ],
  },
  {
    province: 'Camiguin',
    lgus: [
      'PLGU Camiguin',
      'Catarman',
      'Guinsiliban',
      'Mahinog',
      'Mambajao',
      'Sagay',
    ],
  },
  {
    province: 'Lanao del Norte',
    lgus: [
      'PLGU Lanao del Norte',
      'Bacolod',
      'Baloi',
      'Baroy',
      'Kapatagan',
      'Kauswagan',
      'Kolambugan',
      'Lala',
      'Linamon',
      'Magsaysay',
      'Maigo',
      'Matungao',
      'Munai',
      'Nunungan',
      'Pantar',
      'Pantao Ragat',
      'Poona Piagapo',
      'Salvador',
      'Sapad',
      'Sultan Naga Dimaporo',
      'Tagoloan',
      'Tangcal',
      'Tubod',
    ],
  },
  {
    province: 'Misamis Occidental',
    lgus: [
      'PLGU Misamis Occidental',
      'Aloran',
      'Baliangao',
      'Bonifacio',
      'Calamba',
      'Clarin',
      'Concepcion',
      'Don Victoriano Chiongbian',
      'Jimenez',
      'Lopez Jaena',
      'Oroquieta City',
      'Ozamiz City',
      'Panaon',
      'Plaridel',
      'Sapang Dalaga',
      'Sinacaban',
      'Tangub City',
      'Tudela',
    ],
  },
  {
    province: 'Misamis Oriental',
    lgus: [
      'PLGU Misamis Oriental',
      'Alubijid',
      'Balingasag',
      'Balingoan',
      'Binuangan',
      'Claveria',
      'El Salvador City',
      'Gingoog City',
      'Gitagum',
      'Initao',
      'Jasaan',
      'Kinoguitan',
      'Lagonglong',
      'Laguindingan',
      'Libertad',
      'Lugait',
      'Magsaysay',
      'Manticao',
      'Medina',
      'Naawan',
      'Opol',
      'Salay',
      'Sugbongcogon',
      'Tagoloan',
      'Talisayan',
      'Villanueva',
    ],
  },
]

export const REGION10_PROVINCES: Region10Province[] = RAW_REGION10_PROVINCES.map(
  (province) => ({
    ...province,
    lgus: uniqueList(province.lgus),
  }),
)

export const REGION10_HUCS = ['Cagayan de Oro City', 'Iligan City'] as const

export type Region10ComponentCity = {
  province: string
  city: string
}

export const REGION10_COMPONENT_CITY_RECORDS: Region10ComponentCity[] =
  REGION10_PROVINCES.flatMap((province) =>
    province.lgus
      .filter((lgu) => lgu.toLowerCase().includes('city'))
      .filter((city) => !REGION10_HUCS.includes(city as (typeof REGION10_HUCS)[number]))
      .map((city) => ({
        province: province.province,
        city,
      })),
  )

export const REGION10_COMPONENT_CITIES = uniqueList(
  REGION10_COMPONENT_CITY_RECORDS.map((item) => item.city),
)

export const REGION10_PROVINCE_NAMES = REGION10_PROVINCES.map((item) => item.province)
export const REGION10_PROVINCE_OR_HUC_NAMES = [
  ...REGION10_PROVINCE_NAMES,
  ...REGION10_HUCS,
]

export function normalizeLocationText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function normalizeLocationKey(value: unknown) {
  return normalizeLocationText(value)
    .toLocaleLowerCase('en-PH')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bprovince\s+of\b/g, ' ')
    .replace(/^city\s+of\s+/g, '')
    .replace(/\s+city$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PROVINCE_OR_HUC_ALIAS_MAP = new Map<string, string>()

REGION10_PROVINCE_NAMES.forEach((province) => {
  PROVINCE_OR_HUC_ALIAS_MAP.set(normalizeLocationKey(province), province)
})

REGION10_HUCS.forEach((huc) => {
  PROVINCE_OR_HUC_ALIAS_MAP.set(normalizeLocationKey(huc), huc)
})

;[
  'Cagayan de Oro',
  'City of Cagayan de Oro',
  'City of Cagayan de Oro (Capital)',
  'Cagayan de Oro City (Capital)',
  'CDO',
].forEach((alias) => {
  PROVINCE_OR_HUC_ALIAS_MAP.set(normalizeLocationKey(alias), 'Cagayan de Oro City')
})

;['Iligan', 'City of Iligan', 'Iligan City'].forEach((alias) => {
  PROVINCE_OR_HUC_ALIAS_MAP.set(normalizeLocationKey(alias), 'Iligan City')
})

export function canonicalizeRegion10ProvinceOrHuc(value: unknown) {
  const cleanValue = normalizeLocationText(value)
  if (!cleanValue) return ''

  return PROVINCE_OR_HUC_ALIAS_MAP.get(normalizeLocationKey(cleanValue)) || cleanValue
}

export function isRegion10Huc(value: unknown) {
  const canonicalValue = canonicalizeRegion10ProvinceOrHuc(value)
  return REGION10_HUCS.some((huc) => huc === canonicalValue)
}

export function getCanonicalProjectProvinceOrHuc(
  province: unknown,
  municipalityOrLgu?: unknown,
) {
  const municipalityHuc = canonicalizeRegion10ProvinceOrHuc(municipalityOrLgu)

  if (isRegion10Huc(municipalityHuc)) return municipalityHuc

  return canonicalizeRegion10ProvinceOrHuc(province)
}

export function getRegion10LgusByProvince(province: string) {
  const canonicalProvince = canonicalizeRegion10ProvinceOrHuc(province)
  const match = REGION10_PROVINCES.find(
    (item) => item.province.toLowerCase() === canonicalProvince.toLowerCase(),
  )

  return match?.lgus || []
}

export function getRegion10LgusByProvinceOrHuc(provinceOrHuc: string) {
  const canonicalProvinceOrHuc = canonicalizeRegion10ProvinceOrHuc(provinceOrHuc)

  if (isRegion10Huc(canonicalProvinceOrHuc)) return [canonicalProvinceOrHuc]

  return getRegion10LgusByProvince(canonicalProvinceOrHuc)
}

export function canonicalizeRegion10Lgu(
  value: unknown,
  provinceOrHuc?: unknown,
) {
  const cleanValue = normalizeLocationText(value)
  const canonicalProvinceOrHuc = canonicalizeRegion10ProvinceOrHuc(provinceOrHuc)

  if (isRegion10Huc(canonicalProvinceOrHuc)) return canonicalProvinceOrHuc
  if (!cleanValue) return ''

  const directHuc = canonicalizeRegion10ProvinceOrHuc(cleanValue)
  if (isRegion10Huc(directHuc)) return directHuc

  const candidates = canonicalProvinceOrHuc
    ? getRegion10LgusByProvinceOrHuc(canonicalProvinceOrHuc)
    : [...getAllRegion10Lgus(), ...REGION10_HUCS]
  const valueKey = normalizeLocationKey(cleanValue)
  const match = candidates.find((candidate) => normalizeLocationKey(candidate) === valueKey)

  return match || cleanValue
}

export function getCanonicalProjectLgu(
  province: unknown,
  municipalityOrLgu: unknown,
) {
  const canonicalProvinceOrHuc = getCanonicalProjectProvinceOrHuc(
    province,
    municipalityOrLgu,
  )

  return canonicalizeRegion10Lgu(municipalityOrLgu, canonicalProvinceOrHuc)
}

export function getRegion10ComponentCitiesByProvince(province: string) {
  const normalizedProvince = canonicalizeRegion10ProvinceOrHuc(province).toLowerCase()

  return REGION10_COMPONENT_CITY_RECORDS.filter(
    (item) => item.province.toLowerCase() === normalizedProvince,
  ).map((item) => item.city)
}

export function getAllRegion10Lgus() {
  return uniqueList(REGION10_PROVINCES.flatMap((item) => item.lgus))
}
