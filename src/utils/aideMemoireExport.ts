import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'


const textEncoder = new TextEncoder()

function encodeText(value: string) {
  return textEncoder.encode(value)
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function createZip(files: Record<string, Uint8Array>) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encodeText(name)
    const checksum = crc32(content)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    writeUint32(localHeader, 0, 0x04034b50)
    writeUint16(localHeader, 4, 20)
    writeUint16(localHeader, 6, 0x0800)
    writeUint16(localHeader, 8, 0)
    writeUint16(localHeader, 10, 0)
    writeUint16(localHeader, 12, 0)
    writeUint32(localHeader, 14, checksum)
    writeUint32(localHeader, 18, content.length)
    writeUint32(localHeader, 22, content.length)
    writeUint16(localHeader, 26, nameBytes.length)
    writeUint16(localHeader, 28, 0)
    localHeader.set(nameBytes, 30)
    localParts.push(localHeader, content)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    writeUint32(centralHeader, 0, 0x02014b50)
    writeUint16(centralHeader, 4, 20)
    writeUint16(centralHeader, 6, 20)
    writeUint16(centralHeader, 8, 0x0800)
    writeUint16(centralHeader, 10, 0)
    writeUint16(centralHeader, 12, 0)
    writeUint16(centralHeader, 14, 0)
    writeUint32(centralHeader, 16, checksum)
    writeUint32(centralHeader, 20, content.length)
    writeUint32(centralHeader, 24, content.length)
    writeUint16(centralHeader, 28, nameBytes.length)
    writeUint16(centralHeader, 30, 0)
    writeUint16(centralHeader, 32, 0)
    writeUint16(centralHeader, 34, 0)
    writeUint16(centralHeader, 36, 0)
    writeUint32(centralHeader, 38, 0)
    writeUint32(centralHeader, 42, localOffset)
    centralHeader.set(nameBytes, 46)
    centralParts.push(centralHeader)

    localOffset += localHeader.length + content.length
  }

  const centralDirectory = concatBytes(centralParts)
  const endRecord = new Uint8Array(22)
  writeUint32(endRecord, 0, 0x06054b50)
  writeUint16(endRecord, 4, 0)
  writeUint16(endRecord, 6, 0)
  writeUint16(endRecord, 8, centralParts.length)
  writeUint16(endRecord, 10, centralParts.length)
  writeUint32(endRecord, 12, centralDirectory.length)
  writeUint32(endRecord, 16, localOffset)
  writeUint16(endRecord, 20, 0)

  return concatBytes([...localParts, centralDirectory, endRecord])
}

export type AideMemoireExportFinding = {
  finding?: string
  recommendation?: string
  timeline?: string
  remarks?: string
}

export type AideMemoireExportAttendee = {
  name?: string
  designationAgency?: string
}

export type AideMemoireExportPhoto = {
  caption?: string
  fileName?: string
  fileType?: string
  blob?: Blob
  url?: string
  latitude?: number | null
  longitude?: number | null
  capturedAt?: string
  findingId?: string
  photoKind?: 'finding' | 'additional'
}

export type AideMemoireExportData = {
  provinceHuc?: string
  officeName?: string
  officeAddress?: string
  inspectionDate?: string
  projectTitle?: string
  program?: string
  projectCode?: string
  fundingYear?: string
  nationalSubsidy?: string | number
  lguEquity?: string | number
  projectType?: string
  exactLocation?: string
  implementingUnit?: string
  modeOfImplementation?: string
  contractorName?: string
  contractAmount?: string | number
  contractDuration?: string | number
  revisedContractDuration?: string | number
  originalExpirationDate?: string
  revisedExpirationDate?: string
  targetToDate?: string | number
  actualToDate?: string | number
  physicalVariance?: string | number
  balance?: string | number
  totalDisbursement?: string | number
  financialAccomplishment?: string | number
  generalObservations?: string
  findings?: AideMemoireExportFinding[]
  attendance?: AideMemoireExportAttendee[]
  photos?: AideMemoireExportPhoto[]
}

export type AideMemoireExportFormat = 'docx' | 'pdf' | 'both'

const DILG_LOGO_URL = '/aide-memoire-dilg-logo.png'
const BAGONG_PILIPINAS_LOGO_URL = '/aide-memoire-bagong-pilipinas.png'
const WEBSITE = 'www.region10.dilg.gov.ph'
const A4_CONTENT_WIDTH_TWIPS = 10_500

function isRegionalOffice(data: AideMemoireExportData) {
  const identity = `${cleanText(data.officeName)} ${cleanText(data.provinceHuc)}`.toUpperCase()
  return (
    identity.includes('REGIONAL OFFICE') ||
    identity.includes('REGIONAL OFFICE 10') ||
    identity.includes('REGIONAL OFFICE X') ||
    identity.includes('REGION X - NORTHERN MINDANAO') ||
    identity.includes('REGION 10 - NORTHERN MINDANAO')
  )
}

function exportOfficeName(data: AideMemoireExportData) {
  if (isRegionalOffice(data)) return 'REGIONAL OFFICE X'
  return cleanText(data.officeName, 'DILG REGION X').toUpperCase()
}

function cleanText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function xmlEscape(value: unknown) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/[₱Php,\s]/gi, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function formatMoney(value: unknown) {
  const parsed = numberValue(value)
  if (parsed === null) return '—'
  return `Php ${parsed.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(value: unknown, signed = false) {
  const parsed = numberValue(value)
  if (parsed === null) return '—'
  const sign = signed && parsed > 0 ? '+' : ''
  return `${sign}${parsed.toFixed(2)}%`
}

function formatDate(value: unknown) {
  const text = cleanText(value)
  if (!text) return '—'
  const date = new Date(`${text.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function fileSafe(value: unknown) {
  return cleanText(value, 'Project')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70)
}

function buildFileStem(data: AideMemoireExportData) {
  const identity = data.projectCode || data.projectTitle || 'Project'
  const date = cleanText(data.inspectionDate, new Date().toISOString().slice(0, 10))
  return `Aide_Memoire_${fileSafe(identity)}_${date}`
}

function runXml(text: unknown, options: { bold?: boolean; size?: number; color?: string; italic?: boolean } = {}) {
  const properties = [
    options.bold ? '<w:b/>' : '',
    options.italic ? '<w:i/>' : '',
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
  ].join('')

  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
}

function paragraphXml(
  text: unknown,
  options: {
    bold?: boolean
    size?: number
    align?: 'left' | 'center' | 'right'
    spacingBefore?: number
    spacingAfter?: number
    color?: string
    italic?: boolean
    keepNext?: boolean
  } = {},
) {
  const paragraphProperties = [
    options.align ? `<w:jc w:val="${options.align}"/>` : '',
    options.spacingBefore !== undefined || options.spacingAfter !== undefined
      ? `<w:spacing w:before="${options.spacingBefore ?? 0}" w:after="${options.spacingAfter ?? 0}"/>`
      : '',
    options.keepNext ? '<w:keepNext/>' : '',
  ].join('')

  return `<w:p>${paragraphProperties ? `<w:pPr>${paragraphProperties}</w:pPr>` : ''}${runXml(text, options)}</w:p>`
}

function blankParagraphXml() {
  return '<w:p><w:r><w:t></w:t></w:r></w:p>'
}

function cellXml(
  content: string,
  options: {
    width?: number
    fill?: string
    align?: 'left' | 'center' | 'right'
    vertical?: 'top' | 'center' | 'bottom'
    bold?: boolean
    size?: number
    colspan?: number
  } = {},
) {
  const width = options.width ?? Math.floor(A4_CONTENT_WIDTH_TWIPS / 2)
  const cellProperties = [
    `<w:tcW w:w="${width}" w:type="dxa"/>`,
    options.colspan && options.colspan > 1 ? `<w:gridSpan w:val="${options.colspan}"/>` : '',
    options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : '',
    options.vertical ? `<w:vAlign w:val="${options.vertical}"/>` : '',
    '<w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>',
  ].join('')

  const paragraph = content.startsWith('<w:p')
    ? content
    : paragraphXml(content, {
        bold: options.bold,
        size: options.size ?? 20,
        align: options.align ?? 'left',
        spacingAfter: 0,
      })

  return `<w:tc><w:tcPr>${cellProperties}</w:tcPr>${paragraph}</w:tc>`
}

function rowXml(cells: string[], cantSplit = true) {
  return `<w:tr>${cantSplit ? '<w:trPr><w:cantSplit/></w:trPr>' : ''}${cells.join('')}</w:tr>`
}

function photoRowXml(cells: string[], minimumHeightTwips = 4_250) {
  return `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${minimumHeightTwips}" w:hRule="atLeast"/></w:trPr>${cells.join('')}</w:tr>`
}

function tableXml(rows: string[], widths: number[]) {
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${A4_CONTENT_WIDTH_TWIPS}" w:type="dxa"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="8" w:space="0" w:color="222222"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="222222"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="222222"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="222222"/>
        <w:insideH w:val="single" w:sz="6" w:space="0" w:color="555555"/>
        <w:insideV w:val="single" w:sz="6" w:space="0" w:color="555555"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="70" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>
        <w:bottom w:w="70" w:type="dxa"/><w:right w:w="90" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>
    ${rows.join('')}
  </w:tbl>`
}

function borderlessTableXml(rows: string[], widths: number[]) {
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${A4_CONTENT_WIDTH_TWIPS}" w:type="dxa"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblBorders>
        <w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>
        <w:insideH w:val="nil"/><w:insideV w:val="nil"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>
    ${rows.join('')}
  </w:tbl>`
}

function sectionTitleRow(title: string, columnCount = 2) {
  return rowXml([
    cellXml(title.toUpperCase(), {
      width: A4_CONTENT_WIDTH_TWIPS,
      fill: 'D9D9D9',
      align: 'center',
      bold: true,
      size: 22,
      colspan: columnCount,
      vertical: 'center',
    }),
  ])
}

function twoColumnTable(title: string, rows: Array<[string, string]>) {
  const widths = [3_200, 7_300]
  return tableXml(
    [
      sectionTitleRow(title),
      ...rows.map(([label, value]) =>
        rowXml([
          cellXml(label, { width: widths[0], bold: false, size: 20 }),
          cellXml(value || '—', { width: widths[1], size: 20 }),
        ]),
      ),
    ],
    widths,
  )
}

function imageDrawingXml(
  relationshipId: string,
  imageId: number,
  widthPx: number,
  heightPx: number,
  name: string,
  align: 'left' | 'center' | 'right' = 'center',
) {
  const cx = Math.round(widthPx * 9_525)
  const cy = Math.round(heightPx * 9_525)
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <wp:extent cx="${cx}" cy="${cy}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="${imageId}" name="${xmlEscape(name)}"/>
      <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr><pic:cNvPr id="${imageId}" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="${relationshipId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>`
}

async function fetchBlob(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load image asset (${response.status}).`)
  return response.blob()
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to read image.'))
    reader.readAsDataURL(blob)
  })
}

async function getImageDimensions(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unable to read image dimensions.'))
      image.src = url
    })
    return { width: image.naturalWidth || 1, height: image.naturalHeight || 1 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function fitImageWithin(
  dimensions: { width: number; height: number },
  maxWidth: number,
  maxHeight: number,
) {
  const naturalWidth = Math.max(1, dimensions.width)
  const naturalHeight = Math.max(1, dimensions.height)
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight)

  return {
    width: Math.max(1, naturalWidth * scale),
    height: Math.max(1, naturalHeight * scale),
  }
}

async function trimTransparentMargins(blob: Blob, padding = 4) {
  if (blob.type !== 'image/png') return blob

  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unable to prepare logo image.'))
      image.src = url
    })

    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = Math.max(1, image.naturalWidth)
    sourceCanvas.height = Math.max(1, image.naturalHeight)
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!sourceContext) return blob

    sourceContext.drawImage(image, 0, 0)
    const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
    let minX = sourceCanvas.width
    let minY = sourceCanvas.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < sourceCanvas.height; y += 1) {
      for (let x = 0; x < sourceCanvas.width; x += 1) {
        const alpha = pixels.data[(y * sourceCanvas.width + x) * 4 + 3]
        if (alpha <= 8) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }

    if (maxX < minX || maxY < minY) return blob

    const cropX = Math.max(0, minX - padding)
    const cropY = Math.max(0, minY - padding)
    const cropRight = Math.min(sourceCanvas.width, maxX + padding + 1)
    const cropBottom = Math.min(sourceCanvas.height, maxY + padding + 1)
    const cropWidth = Math.max(1, cropRight - cropX)
    const cropHeight = Math.max(1, cropBottom - cropY)

    if (
      cropX === 0 &&
      cropY === 0 &&
      cropWidth === sourceCanvas.width &&
      cropHeight === sourceCanvas.height
    ) {
      return blob
    }

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = cropWidth
    outputCanvas.height = cropHeight
    const outputContext = outputCanvas.getContext('2d')
    if (!outputContext) return blob

    outputContext.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    )

    return await new Promise<Blob>((resolve) => {
      outputCanvas.toBlob((output) => resolve(output || blob), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function normalizePhotoBlob(blob: Blob) {
  if (blob.type === 'image/png' || blob.type === 'image/jpeg') return blob

  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unsupported photo format.'))
      image.src = url
    })

    const maxWidth = 1_600
    const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare photo for the document.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => output ? resolve(output) : reject(new Error('Unable to convert photo.')), 'image/jpeg', 0.86)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function addCoordinateWatermark(blob: Blob, photo: AideMemoireExportPhoto) {
  const latitude = Number(photo.latitude)
  const longitude = Number(photo.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return blob

  const image = new Image()
  const url = URL.createObjectURL(blob)

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unable to prepare the coordinate watermark.'))
      image.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, image.naturalWidth)
    canvas.height = Math.max(1, image.naturalHeight)
    const context = canvas.getContext('2d')
    if (!context) return blob

    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const fontSize = Math.max(18, Math.round(canvas.width * 0.022))
    const padding = Math.max(10, Math.round(fontSize * 0.55))
    const lineHeight = Math.round(fontSize * 1.28)
    const lines = [
      `LAT: ${latitude.toFixed(7)}`,
      `LON: ${longitude.toFixed(7)}`,
    ]
    if (photo.capturedAt) {
      const capturedDate = new Date(photo.capturedAt)
      if (!Number.isNaN(capturedDate.getTime())) {
        lines.push(capturedDate.toLocaleString('en-PH', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }))
      }
    }

    context.font = `700 ${fontSize}px Arial, sans-serif`
    const textWidth = Math.max(...lines.map((line) => context.measureText(line).width))
    const boxWidth = Math.ceil(textWidth + padding * 2)
    const boxHeight = Math.ceil(lines.length * lineHeight + padding * 1.4)
    const x = Math.max(8, canvas.width - boxWidth - Math.max(12, padding))
    const y = Math.max(8, Math.max(12, padding))
    const radius = Math.max(8, Math.round(fontSize * 0.4))

    context.fillStyle = 'rgba(4, 24, 54, 0.72)'
    context.beginPath()
    context.roundRect(x, y, boxWidth, boxHeight, radius)
    context.fill()

    context.fillStyle = '#ffffff'
    context.textBaseline = 'top'
    lines.forEach((line, index) => {
      context.fillText(line, x + padding, y + padding * 0.7 + index * lineHeight)
    })

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((output) => resolve(output || blob), 'image/jpeg', 0.9)
    })
  } catch {
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function resolvePhotoBlob(photo: AideMemoireExportPhoto) {
  let normalized: Blob | undefined
  if (photo.blob) normalized = await normalizePhotoBlob(photo.blob)
  else if (photo.url) {
    try {
      normalized = await normalizePhotoBlob(await fetchBlob(photo.url))
    } catch {
      normalized = undefined
    }
  }

  if (!normalized) return undefined
  return addCoordinateWatermark(normalized, photo)
}

function photoExtension(blob: Blob) {
  return blob.type === 'image/png' ? 'png' : 'jpg'
}

async function buildDocxBlob(data: AideMemoireExportData) {
  const files: Record<string, Uint8Array> = {}
  const relationships: string[] = []
  const mediaDefaults = new Set<string>(['png', 'jpg', 'jpeg'])
  let relationshipCounter = 1
  let imageCounter = 1

  async function addImage(
    blob: Blob,
    fileName: string,
    widthPx: number,
    heightPx: number,
    align: 'left' | 'center' | 'right' = 'center',
  ) {
    const normalized = await normalizePhotoBlob(blob)
    const extension = photoExtension(normalized)
    mediaDefaults.add(extension)
    const relationshipId = `rId${relationshipCounter++}`
    const mediaName = `${fileName}.${extension}`
    relationships.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/>`)
    files[`word/media/${mediaName}`] = new Uint8Array(await normalized.arrayBuffer())
    return imageDrawingXml(relationshipId, imageCounter++, widthPx, heightPx, mediaName, align)
  }

  const [rawDilgLogo, rawBagongLogo] = await Promise.all([
    fetchBlob(DILG_LOGO_URL),
    fetchBlob(BAGONG_PILIPINAS_LOGO_URL),
  ])
  const [dilgLogo, bagongLogo] = await Promise.all([
    trimTransparentMargins(rawDilgLogo),
    trimTransparentMargins(rawBagongLogo),
  ])
  const [dilgDimensions, bagongDimensions] = await Promise.all([
    getImageDimensions(dilgLogo),
    getImageDimensions(bagongLogo),
  ])
  const docxLogoHeight = 86
  const dilgLogoSize = fitImageWithin(dilgDimensions, 96, docxLogoHeight)
  const bagongLogoSize = fitImageWithin(bagongDimensions, 180, docxLogoHeight)
  const dilgDrawing = await addImage(
    dilgLogo,
    'dilg-logo',
    dilgLogoSize.width,
    dilgLogoSize.height,
    'center',
  )
  const bagongDrawing = await addImage(
    bagongLogo,
    'bagong-pilipinas',
    bagongLogoSize.width,
    bagongLogoSize.height,
    'center',
  )

  const body: string[] = []
  const logoSpacerWidth = 3_000
  const dilgLogoCellWidth = 1_700
  const bagongLogoCellWidth = 2_800
  body.push(
    borderlessTableXml([
      rowXml([
        cellXml('', { width: logoSpacerWidth, vertical: 'center' }),
        cellXml(dilgDrawing, { width: dilgLogoCellWidth, vertical: 'center' }),
        cellXml(bagongDrawing, { width: bagongLogoCellWidth, vertical: 'center' }),
        cellXml('', { width: logoSpacerWidth, vertical: 'center' }),
      ]),
    ], [logoSpacerWidth, dilgLogoCellWidth, bagongLogoCellWidth, logoSpacerWidth]),
  )
  body.push(paragraphXml('Republic of the Philippines', { align: 'center', size: 20, spacingBefore: 40, spacingAfter: 0 }))
  body.push(paragraphXml('DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', { align: 'center', bold: true, size: 24, spacingAfter: 0 }))
  if (!isRegionalOffice(data)) {
    body.push(paragraphXml('REGION X - NORTHERN MINDANAO', { align: 'center', bold: true, size: 23, spacingAfter: 0 }))
  }
  body.push(paragraphXml(exportOfficeName(data), { align: 'center', bold: true, size: 22, spacingAfter: 0 }))
  body.push(paragraphXml(cleanText(data.officeAddress, '—'), { align: 'center', italic: true, size: 19, spacingAfter: 0 }))
  body.push(paragraphXml(WEBSITE, { align: 'center', color: '0563C1', size: 19, spacingAfter: 160 }))

  body.push(twoColumnTable('Aide Memoire', [
    ['Date of Inspection', formatDate(data.inspectionDate)],
  ]))
  body.push(blankParagraphXml())

  body.push(twoColumnTable('Project Profile', [
    ['Project Title', cleanText(data.projectTitle, '—')],
    ['Program', cleanText(data.program, '—')],
    ['Project Code', cleanText(data.projectCode, '—')],
    ['Funding Year', cleanText(data.fundingYear, '—')],
    ['National Subsidy', formatMoney(data.nationalSubsidy)],
    ['LGU Equity', formatMoney(data.lguEquity)],
    ['Type of Project', cleanText(data.projectType, '—')],
    ['Exact Location', cleanText(data.exactLocation, '—')],
    ['Implementing Unit', cleanText(data.implementingUnit, '—')],
    ['Mode of Implementation', cleanText(data.modeOfImplementation, 'BY CONTRACT')],
  ]))
  body.push(blankParagraphXml())

  body.push(twoColumnTable('Contract Details', [
    ['Name of Contractor', cleanText(data.contractorName, '—')],
    ['Contract Amount', formatMoney(data.contractAmount)],
    ['Contract Duration', data.contractDuration ? `${cleanText(data.contractDuration)} calendar days` : '—'],
    ['Revised Contract Duration', data.revisedContractDuration ? `${cleanText(data.revisedContractDuration)} calendar days` : '—'],
    ['Original Date of Expiration of Contract', formatDate(data.originalExpirationDate)],
    ['Revised Date of Expiration of Contract', formatDate(data.revisedExpirationDate)],
  ]))
  body.push(blankParagraphXml())

  body.push(twoColumnTable(`DILG Validation as of ${formatDate(data.inspectionDate)} - Physical Accomplishment`, [
    ['Target to Date', formatPercent(data.targetToDate)],
    ['Actual to Date', formatPercent(data.actualToDate)],
    ['% Variance', formatPercent(data.physicalVariance, true)],
  ]))
  body.push(twoColumnTable(`DILG Validation as of ${formatDate(data.inspectionDate)} - Financial Accomplishment`, [
    ['Balance', formatMoney(data.balance)],
    ['Total Disbursement', formatMoney(data.totalDisbursement)],
    ['% Accomplishment', formatPercent(data.financialAccomplishment)],
  ]))
  body.push(blankParagraphXml())

  const findingWidths = [3_900, 3_000, 1_650, 1_950]
  const findingRows = [
    sectionTitleRow('Findings and Recommendations', 4),
    rowXml([
      cellXml('Findings', { width: findingWidths[0], fill: 'D9D9D9', align: 'center', bold: true, size: 20 }),
      cellXml('Recommendations', { width: findingWidths[1], fill: 'D9D9D9', align: 'center', bold: true, size: 20 }),
      cellXml('Timelines', { width: findingWidths[2], fill: 'D9D9D9', align: 'center', bold: true, size: 20 }),
      cellXml('Remarks', { width: findingWidths[3], fill: 'D9D9D9', align: 'center', bold: true, size: 20 }),
    ]),
  ]
  const completedFindings = (data.findings || []).filter((row) => cleanText(row.finding) || cleanText(row.recommendation) || cleanText(row.timeline) || cleanText(row.remarks))
  if (completedFindings.length === 0) {
    findingRows.push(rowXml([
      cellXml('No findings observed during this inspection.', { width: findingWidths[0] }),
      cellXml('—', { width: findingWidths[1] }),
      cellXml('—', { width: findingWidths[2], align: 'center' }),
      cellXml('—', { width: findingWidths[3] }),
    ]))
  } else {
    completedFindings.forEach((finding) => {
      findingRows.push(rowXml([
        cellXml(cleanText(finding.finding, '—'), { width: findingWidths[0] }),
        cellXml(cleanText(finding.recommendation, '—'), { width: findingWidths[1] }),
        cellXml(formatDate(finding.timeline), { width: findingWidths[2], align: 'center' }),
        cellXml(cleanText(finding.remarks, '—'), { width: findingWidths[3] }),
      ]))
    })
  }
  body.push(tableXml(findingRows, findingWidths))
  body.push(blankParagraphXml())

  body.push(tableXml([
    sectionTitleRow('General Observations', 1),
    rowXml([cellXml(paragraphXml(cleanText(data.generalObservations, '—'), { size: 20, spacingAfter: 0 }), { width: A4_CONTENT_WIDTH_TWIPS })]),
  ], [A4_CONTENT_WIDTH_TWIPS]))
  body.push(blankParagraphXml())

  const attendanceWidths = [4_100, 3_850, 2_550]
  const attendanceRows = [
    sectionTitleRow('Attendance', 3),
    rowXml([
      cellXml('Name', { width: attendanceWidths[0], fill: 'D9D9D9', align: 'center', bold: true }),
      cellXml('Designation-Agency', { width: attendanceWidths[1], fill: 'D9D9D9', align: 'center', bold: true }),
      cellXml('Signature', { width: attendanceWidths[2], fill: 'D9D9D9', align: 'center', bold: true }),
    ]),
  ]
  const attendees = (data.attendance || []).filter((row) => cleanText(row.name) || cleanText(row.designationAgency))
  if (attendees.length === 0) {
    attendanceRows.push(rowXml([
      cellXml('—', { width: attendanceWidths[0] }),
      cellXml('—', { width: attendanceWidths[1] }),
      cellXml('', { width: attendanceWidths[2] }),
    ]))
  } else {
    attendees.forEach((attendee) => attendanceRows.push(rowXml([
      cellXml(cleanText(attendee.name, '—'), { width: attendanceWidths[0] }),
      cellXml(cleanText(attendee.designationAgency, '—'), { width: attendanceWidths[1] }),
      cellXml('', { width: attendanceWidths[2] }),
    ])))
  }
  body.push(tableXml(attendanceRows, attendanceWidths))

  const resolvedDocxPhotos: Array<{ photo: AideMemoireExportPhoto; blob: Blob; dimensions: { width: number; height: number } }> = []
  for (const photo of data.photos || []) {
    const blob = await resolvePhotoBlob(photo)
    if (!blob) continue
    resolvedDocxPhotos.push({ photo, blob, dimensions: await getImageDimensions(blob) })
  }

  if (resolvedDocxPhotos.length > 0) {
    const photosPerPage = 6
    const columnWidths = [5_250, 5_250]

    for (let pageStart = 0; pageStart < resolvedDocxPhotos.length; pageStart += photosPerPage) {
      const pageItems = resolvedDocxPhotos.slice(pageStart, pageStart + photosPerPage)
      const pageNumber = Math.floor(pageStart / photosPerPage) + 1
      const pageCount = Math.ceil(resolvedDocxPhotos.length / photosPerPage)

      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
      body.push(paragraphXml(
        pageCount > 1 ? `PROJECT PHOTOS — PAGE ${pageNumber} OF ${pageCount}` : 'PROJECT PHOTOS',
        { align: 'center', bold: true, size: 24, spacingAfter: 80 },
      ))

      const photoRows: string[] = []
      for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
        const cells: string[] = []

        for (let columnIndex = 0; columnIndex < 2; columnIndex += 1) {
          const localIndex = rowIndex * 2 + columnIndex
          const item = pageItems[localIndex]

          if (!item) {
            cells.push(cellXml('', { width: columnWidths[columnIndex], vertical: 'center' }))
            continue
          }

          const globalIndex = pageStart + localIndex
          const maxPhotoWidth = 315
          const maxPhotoHeight = 232
          const scale = Math.min(
            maxPhotoWidth / item.dimensions.width,
            maxPhotoHeight / item.dimensions.height,
            1,
          )
          const width = Math.max(1, Math.round(item.dimensions.width * scale))
          const height = Math.max(1, Math.round(item.dimensions.height * scale))
          const imageXml = await addImage(item.blob, `project-photo-${globalIndex + 1}`, width, height)
          const content = [
            paragraphXml(`PHOTO NUMBER ${globalIndex + 1}`, {
              align: 'center',
              bold: true,
              size: 18,
              spacingAfter: 24,
            }),
            imageXml,
            paragraphXml(cleanText(item.photo.caption, `Project photo ${globalIndex + 1}`), {
              align: 'center',
              italic: true,
              size: 15,
              spacingBefore: 22,
              spacingAfter: 10,
            }),
          ].join('')

          cells.push(cellXml(content, { width: columnWidths[columnIndex], vertical: 'center' }))
        }

        photoRows.push(photoRowXml(cells))
      }

      body.push(tableXml(photoRows, columnWidths))
    }
  }

  body.push(`<w:sectPr>
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="650" w:right="700" w:bottom="650" w:left="700" w:header="360" w:footer="360" w:gutter="0"/>
  </w:sectPr>`)

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14 wp14" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"><w:body>${body.join('')}</w:body></w:document>`

  const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
    ${relationships.join('')}
  </Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    ${Array.from(mediaDefaults).map((extension) => `<Default Extension="${extension}" ContentType="${extension === 'png' ? 'image/png' : 'image/jpeg'}"/>`).join('')}
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  </Types>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:style>
  </w:styles>`

  const now = new Date().toISOString()
  files['[Content_Types].xml'] = encodeText(contentTypes)
  files['_rels/.rels'] = encodeText(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
  files['word/document.xml'] = encodeText(documentXml)
  files['word/_rels/document.xml.rels'] = encodeText(documentRelationships)
  files['word/styles.xml'] = encodeText(stylesXml)
  files['word/settings.xml'] = encodeText(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`)
  files['docProps/core.xml'] = encodeText(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Aide Memoire</dc:title><dc:subject>${xmlEscape(data.projectTitle)}</dc:subject><dc:creator>DILG Region X PMS10</dc:creator><cp:lastModifiedBy>DILG Region X PMS10</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)
  files['docProps/app.xml'] = encodeText(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PMS10</Application><AppVersion>1.0</AppVersion></Properties>`)

  return new Blob([createZip(files)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function pdfSectionTitle(doc: any, title: string, y: number) {
  doc.setFillColor(210, 210, 210)
  doc.setDrawColor(60, 60, 60)
  doc.rect(12, y, 186, 8, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text(title.toUpperCase(), 105, y + 5.4, { align: 'center' })
  return y + 8
}

function pdfTable(doc: any, title: string, rows: Array<[string, string]>, startY: number) {
  const titleBottom = pdfSectionTitle(doc, title, startY)
  autoTable(doc, {
    startY: titleBottom,
    margin: { left: 12, right: 12 },
    theme: 'grid',
    tableWidth: 186,
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      textColor: [25, 25, 25],
      lineColor: [60, 60, 60],
      lineWidth: 0.2,
      cellPadding: 1.6,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 53 },
      1: { cellWidth: 133 },
    },
    body: rows,
  })
  return Number(doc.lastAutoTable?.finalY || titleBottom)
}

function ensurePdfSpace(doc: any, y: number, requiredHeight: number) {
  if (y + requiredHeight <= 282) return y
  doc.addPage()
  return 14
}

async function buildPdfBlob(data: AideMemoireExportData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const [rawDilgLogo, rawBagongLogo] = await Promise.all([fetchBlob(DILG_LOGO_URL), fetchBlob(BAGONG_PILIPINAS_LOGO_URL)])
  const [dilgLogo, bagongLogo] = await Promise.all([
    trimTransparentMargins(rawDilgLogo),
    trimTransparentMargins(rawBagongLogo),
  ])
  const [dilgDataUrl, bagongDataUrl, dilgDimensions, bagongDimensions] = await Promise.all([
    blobToDataUrl(dilgLogo),
    blobToDataUrl(bagongLogo),
    getImageDimensions(dilgLogo),
    getImageDimensions(bagongLogo),
  ])

  const logoTop = 5
  const logoMaxHeight = 28
  const logoGap = 4
  const dilgLogoSize = fitImageWithin(dilgDimensions, 30, logoMaxHeight)
  const bagongLogoSize = fitImageWithin(bagongDimensions, 60, logoMaxHeight)
  const logoGroupWidth = dilgLogoSize.width + logoGap + bagongLogoSize.width
  const logoStartX = (210 - logoGroupWidth) / 2

  doc.addImage(
    dilgDataUrl,
    'PNG',
    logoStartX,
    logoTop + (logoMaxHeight - dilgLogoSize.height) / 2,
    dilgLogoSize.width,
    dilgLogoSize.height,
  )
  doc.addImage(
    bagongDataUrl,
    'PNG',
    logoStartX + dilgLogoSize.width + logoGap,
    logoTop + (logoMaxHeight - bagongLogoSize.height) / 2,
    bagongLogoSize.width,
    bagongLogoSize.height,
  )

  const logosBottom = logoTop + logoMaxHeight
  const republicY = logosBottom + 5
  const departmentY = republicY + 6

  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Republic of the Philippines', 105, republicY, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.text('DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', 105, departmentY, { align: 'center' })
  let officeNameY = departmentY + 5
  if (!isRegionalOffice(data)) {
    doc.text('REGION X - NORTHERN MINDANAO', 105, officeNameY, { align: 'center' })
    officeNameY += 5
  }
  doc.text(exportOfficeName(data), 105, officeNameY, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const addressLines = doc.splitTextToSize(cleanText(data.officeAddress, '—'), 165)
  const addressY = officeNameY + 5
  doc.text(addressLines, 105, addressY, { align: 'center' })
  const websiteY = addressY + Math.max(1, addressLines.length) * 4
  doc.setTextColor(0, 86, 180)
  doc.text(WEBSITE, 105, websiteY, { align: 'center' })
  doc.setTextColor(20, 20, 20)

  let y = websiteY + 7
  y = pdfTable(doc, 'Aide Memoire', [['Date of Inspection', formatDate(data.inspectionDate)]], y)
  y += 6
  y = pdfTable(doc, 'Project Profile', [
    ['Project Title', cleanText(data.projectTitle, '—')],
    ['Program', cleanText(data.program, '—')],
    ['Project Code', cleanText(data.projectCode, '—')],
    ['Funding Year', cleanText(data.fundingYear, '—')],
    ['National Subsidy', formatMoney(data.nationalSubsidy)],
    ['LGU Equity', formatMoney(data.lguEquity)],
    ['Type of Project', cleanText(data.projectType, '—')],
    ['Exact Location', cleanText(data.exactLocation, '—')],
    ['Implementing Unit', cleanText(data.implementingUnit, '—')],
    ['Mode of Implementation', cleanText(data.modeOfImplementation, 'BY CONTRACT')],
  ], y)

  y = ensurePdfSpace(doc, y + 6, 52)
  y = pdfTable(doc, 'Contract Details', [
    ['Name of Contractor', cleanText(data.contractorName, '—')],
    ['Contract Amount', formatMoney(data.contractAmount)],
    ['Contract Duration', data.contractDuration ? `${cleanText(data.contractDuration)} calendar days` : '—'],
    ['Revised Contract Duration', data.revisedContractDuration ? `${cleanText(data.revisedContractDuration)} calendar days` : '—'],
    ['Original Date of Expiration of Contract', formatDate(data.originalExpirationDate)],
    ['Revised Date of Expiration of Contract', formatDate(data.revisedExpirationDate)],
  ], y)

  y = ensurePdfSpace(doc, y + 6, 50)
  y = pdfTable(doc, `DILG Validation as of ${formatDate(data.inspectionDate)} - Physical Accomplishment`, [
    ['Target to Date', formatPercent(data.targetToDate)],
    ['Actual to Date', formatPercent(data.actualToDate)],
    ['% Variance', formatPercent(data.physicalVariance, true)],
  ], y)
  y = pdfTable(doc, `DILG Validation as of ${formatDate(data.inspectionDate)} - Financial Accomplishment`, [
    ['Balance', formatMoney(data.balance)],
    ['Total Disbursement', formatMoney(data.totalDisbursement)],
    ['% Accomplishment', formatPercent(data.financialAccomplishment)],
  ], y)

  y = ensurePdfSpace(doc, y + 8, 70)
  y = pdfSectionTitle(doc, 'Findings and Recommendations', y)
  const findings = (data.findings || []).filter((row) => cleanText(row.finding) || cleanText(row.recommendation) || cleanText(row.timeline) || cleanText(row.remarks))
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    theme: 'grid',
    tableWidth: 186,
    head: [['Findings', 'Recommendations', 'Timelines', 'Remarks']],
    body: findings.length > 0
      ? findings.map((finding) => [
          cleanText(finding.finding, '—'),
          cleanText(finding.recommendation, '—'),
          formatDate(finding.timeline),
          cleanText(finding.remarks, '—'),
        ])
      : [['No findings observed during this inspection.', '—', '—', '—']],
    styles: {
      font: 'helvetica',
      fontSize: 8.4,
      textColor: [20, 20, 20],
      lineColor: [55, 55, 55],
      lineWidth: 0.2,
      cellPadding: 1.5,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: { fillColor: [205, 205, 205], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 50 },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 50 },
    },
  })
  const findingsTableState = doc as jsPDF & { lastAutoTable?: { finalY?: number } }
  y = Number(findingsTableState.lastAutoTable?.finalY || y + 30)

  y = ensurePdfSpace(doc, y + 7, 34)
  y = pdfSectionTitle(doc, 'General Observations', y)
  doc.setDrawColor(60, 60, 60)
  doc.rect(12, y, 186, 24)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(doc.splitTextToSize(cleanText(data.generalObservations, '—'), 180), 15, y + 5)
  y += 30

  y = ensurePdfSpace(doc, y, 45)
  y = pdfSectionTitle(doc, 'Attendance', y)
  const pdfAttendees = (data.attendance || []).filter((row) => cleanText(row.name) || cleanText(row.designationAgency))
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    theme: 'grid',
    head: [['Name', 'Designation-Agency', 'Signature']],
    body: pdfAttendees.length > 0
      ? pdfAttendees.map((row) => [
          cleanText(row.name, '—'),
          cleanText(row.designationAgency, '—'),
          '',
        ])
      : [['—', '—', '']],
    styles: { font: 'helvetica', fontSize: 9, lineColor: [55, 55, 55], lineWidth: 0.2, cellPadding: 1.7, minCellHeight: 9 },
    headStyles: { fillColor: [205, 205, 205], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 66 }, 2: { cellWidth: 50 } },
  })

  const resolvedPdfPhotos: Array<{ photo: AideMemoireExportPhoto; blob: Blob; dataUrl: string; dimensions: { width: number; height: number } }> = []
  for (const photo of data.photos || []) {
    const blob = await resolvePhotoBlob(photo)
    if (!blob) continue
    resolvedPdfPhotos.push({
      photo,
      blob,
      dataUrl: await blobToDataUrl(blob),
      dimensions: await getImageDimensions(blob),
    })
  }

  if (resolvedPdfPhotos.length > 0) {
    const photosPerPage = 6
    const pageCount = Math.ceil(resolvedPdfPhotos.length / photosPerPage)
    const marginX = 12
    const gapX = 5
    const columnWidth = (186 - gapX) / 2
    const gridTop = 24
    const rowHeight = 86

    for (let pageStart = 0; pageStart < resolvedPdfPhotos.length; pageStart += photosPerPage) {
      const pageItems = resolvedPdfPhotos.slice(pageStart, pageStart + photosPerPage)
      const pageNumber = Math.floor(pageStart / photosPerPage) + 1

      doc.addPage()
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(
        pageCount > 1 ? `PROJECT PHOTOS — PAGE ${pageNumber} OF ${pageCount}` : 'PROJECT PHOTOS',
        105,
        14,
        { align: 'center' },
      )

      for (const [localIndex, item] of pageItems.entries()) {
        const globalIndex = pageStart + localIndex
        const row = Math.floor(localIndex / 2)
        const column = localIndex % 2
        const slotX = marginX + column * (columnWidth + gapX)
        const slotY = gridTop + row * rowHeight
        const imageAreaTop = slotY + 9
        const imageAreaHeight = 58
        const imageAreaWidth = columnWidth - 8

        doc.setDrawColor(130, 140, 150)
        doc.setLineWidth(0.25)
        doc.roundedRect(slotX, slotY, columnWidth, rowHeight - 3, 1.5, 1.5)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text(`PHOTO NUMBER ${globalIndex + 1}`, slotX + columnWidth / 2, slotY + 5.5, { align: 'center' })

        const scale = Math.min(
          imageAreaWidth / item.dimensions.width,
          imageAreaHeight / item.dimensions.height,
        )
        const width = item.dimensions.width * scale
        const height = item.dimensions.height * scale
        const imageX = slotX + (columnWidth - width) / 2
        const imageY = imageAreaTop + (imageAreaHeight - height) / 2
        const imageType = item.blob.type === 'image/png' ? 'PNG' : 'JPEG'
        doc.addImage(item.dataUrl, imageType, imageX, imageY, width, height)

        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7.6)
        const caption = doc
          .splitTextToSize(cleanText(item.photo.caption, `Project photo ${globalIndex + 1}`), columnWidth - 8)
          .slice(0, 2)
        doc.text(caption, slotX + columnWidth / 2, slotY + rowHeight - 10, { align: 'center' })
      }
    }
  }

  return doc.output('blob') as Blob
}

export type AideMemoireGeneratedFiles = {
  generated: string[]
  pdfBlob?: Blob
  pdfFileName?: string
  docxBlob?: Blob
  docxFileName?: string
}

export async function generateAideMemoireFiles(
  data: AideMemoireExportData,
  format: AideMemoireExportFormat,
): Promise<AideMemoireGeneratedFiles> {
  const fileStem = buildFileStem(data)
  const generated: string[] = []
  let pdfBlob: Blob | undefined
  let pdfFileName: string | undefined
  let docxBlob: Blob | undefined
  let docxFileName: string | undefined

  if (format === 'docx' || format === 'both') {
    docxBlob = await buildDocxBlob(data)
    docxFileName = `${fileStem}.docx`
    saveAs(docxBlob, docxFileName)
    generated.push('DOCX')
  }

  if (format === 'pdf' || format === 'both') {
    pdfBlob = await buildPdfBlob(data)
    pdfFileName = `${fileStem}.pdf`
    saveAs(pdfBlob, pdfFileName)
    generated.push('PDF')
  }

  return { generated, pdfBlob, pdfFileName, docxBlob, docxFileName }
}
