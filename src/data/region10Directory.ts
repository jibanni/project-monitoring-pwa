export type Region10Province = {
  province: string
  lgus: string[]
}

export const REGION10_PROVINCES: Region10Province[] = [
  {
    province: 'Bukidnon',
    lgus: [
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

export const REGION10_HUCS = ['Cagayan de Oro City', 'Iligan City']

export type Region10ComponentCity = {
  province: string
  city: string
}

export const REGION10_COMPONENT_CITY_RECORDS: Region10ComponentCity[] =
  REGION10_PROVINCES.flatMap((province) =>
    province.lgus
      .filter((lgu) => lgu.toLowerCase().includes('city'))
      .filter((city) => !REGION10_HUCS.includes(city))
      .map((city) => ({
        province: province.province,
        city,
      })),
  )

export const REGION10_COMPONENT_CITIES = REGION10_COMPONENT_CITY_RECORDS.map(
  (item) => item.city,
)

export const REGION10_PROVINCE_NAMES = REGION10_PROVINCES.map((item) => item.province)

export function normalizeLocationText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function getRegion10LgusByProvince(province: string) {
  const normalizedProvince = normalizeLocationText(province).toLowerCase()
  const match = REGION10_PROVINCES.find(
    (item) => item.province.toLowerCase() === normalizedProvince,
  )

  return match?.lgus || []
}

export function getRegion10ComponentCitiesByProvince(province: string) {
  const normalizedProvince = normalizeLocationText(province).toLowerCase()

  return REGION10_COMPONENT_CITY_RECORDS.filter(
    (item) => item.province.toLowerCase() === normalizedProvince,
  ).map((item) => item.city)
}

export function getAllRegion10Lgus() {
  return REGION10_PROVINCES.flatMap((item) => item.lgus)
}
