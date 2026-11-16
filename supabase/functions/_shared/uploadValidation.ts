export const MAX_PHOTO_BYTES = 700 * 1024
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MiB = 1024 * 1024

export class UploadValidationError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export async function readUploadForm(request: Request, maxFileBytes: number) {
  if (!/^Bearer\s+\S+$/i.test(request.headers.get('Authorization') || '')) {
    throw new Error('PMS10_AUTH_REQUIRED')
  }
  const type = request.headers.get('Content-Type') || ''
  if (!/^multipart\/form-data\s*;/i.test(type)) {
    throw new UploadValidationError('Send a multipart file upload.', 415)
  }
  const maxBody = maxFileBytes + MiB
  const advertised = Number(request.headers.get('Content-Length') || 0)
  if (advertised > maxBody) throw new UploadValidationError('Upload is too large.', 413)
  if (!request.body) throw new UploadValidationError('No file was received.')
  const reader = request.body.getReader()
  const chunks: BlobPart[] = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBody) {
        void reader.cancel().catch(() => {})
        throw new UploadValidationError('Upload is too large.', 413)
      }
      chunks.push(value.slice())
    }
    return await new Response(new Blob(chunks), { headers: { 'Content-Type': type } }).formData()
  } catch (error) {
    if (error instanceof UploadValidationError) throw error
    throw new UploadValidationError('The upload form is incomplete or invalid.')
  } finally {
    reader.releaseLock()
  }
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  return bytes.length >= prefix.length && prefix.every((n, i) => bytes[i] === n)
}

function ascii(bytes: Uint8Array, start: number, len: number) {
  return new TextDecoder().decode(bytes.subarray(start, start + len))
}

export async function validatePhoto(file: File) {
  if (!file.size || file.size > MAX_PHOTO_BYTES) {
    throw new UploadValidationError('Inspection photos must be 700 KB or less and cannot be empty.', file.size ? 413 : 400)
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const mime = file.type.toLowerCase()
  // Online capture produces JPEG. Accept PNG and WebP for legacy offline photos.
  if ((mime === 'image/jpeg' && hasPrefix(header, [255, 216, 255])) ||
      (mime === 'image/png' && hasPrefix(header, [137, 80, 78, 71, 13, 10, 26, 10])) ||
      (mime === 'image/webp' && ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 8).match(/^WEBPVP8[ LX]$/))) return
  throw new UploadValidationError('Use a valid JPEG, PNG, or WebP inspection photo.', 415)
}

const generatedXmlParts = new Set([
  '[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml',
  'word/settings.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels',
  'docProps/core.xml', 'docProps/app.xml',
])

// PMS10 generates a small uncompressed DOCX package. Accept that format only,
// without macro, embedded-object, external-link or extra archive entries.
// This is structural validation, not a general-purpose malware scanner.
function isGeneratedDocx(bytes: Uint8Array) {
  const end = bytes.length - 22
  if (end < 30) return false
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const word = (p: number) => d.getUint16(p, true)
  const long = (p: number) => d.getUint32(p, true)
  if (long(end) !== 0x06054b50 || word(end + 4) || word(end + 6) || word(end + 20)) return false
  const count = word(end + 10)
  const start = long(end + 16)
  if (!count || count > 64 || word(end + 8) !== count || start >= end || start + long(end + 12) !== end) return false
  let central = start
  let local = 0
  const seen = new Set<string>()
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (central + 46 > end || long(central) !== 0x02014b50 || word(central + 10) ||
        (word(central + 8) & ~0x800) || word(central + 30) || word(central + 32) || word(central + 34)) return false
    const size = long(central + 20)
    const nameLen = word(central + 28)
    const next = central + 46 + nameLen
    if (!nameLen || nameLen > 120 || next > end || size !== long(central + 24) ||
        long(central + 42) !== local || local + 30 + nameLen + size > start ||
        long(local) !== 0x04034b50 || word(local + 6) !== word(central + 8) ||
        word(local + 8) || word(local + 26) !== nameLen || word(local + 28) ||
        long(local + 18) !== size || long(local + 22) !== size) return false
    const name = ascii(bytes, central + 46, nameLen)
    const imageEntry = /^word\/media\/[a-z0-9_-]+\.(?:jpe?g|png)$/i.test(name)
    if (name !== ascii(bytes, local + 30, nameLen) || seen.has(name) ||
        (!generatedXmlParts.has(name) && !imageEntry)) return false
    const data = bytes.subarray(local + 30 + nameLen, local + 30 + nameLen + size)
    if (imageEntry) {
      if (/\.png$/i.test(name) ? !hasPrefix(data, [137, 80, 78, 71, 13, 10, 26, 10])
        : !hasPrefix(data, [255, 216, 255])) return false
    } else {
      const xml = decoder.decode(data)
      if (!/^\s*<\?xml\s/i.test(xml) || /<!doctype|<!entity|targetmode\s*=\s*['"]external|vbaproject|macroenabled/i.test(xml)) return false
    }
    seen.add(name)
    local += 30 + nameLen + size
    central = next
  }
  return local === start && central === end && seen.has('[Content_Types].xml') &&
    seen.has('_rels/.rels') && seen.has('word/document.xml')
}

export async function validateAideMemoire(file: File, format: string) {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) {
    throw new UploadValidationError('Aide Memoire files must be 20 MB or less and cannot be empty.', file.size ? 413 : 400)
  }
  const mime = file.type.toLowerCase()
  if (format === 'pdf' && mime === 'application/pdf' && /\.pdf$/i.test(file.name)) {
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    const tail = new TextDecoder().decode(await file.slice(-1024).arrayBuffer())
    if (/^%PDF-\d\.\d$/.test(ascii(header, 0, 8)) && /%%EOF\s*$/.test(tail)) return
  }
  if (format === 'docx' && mime === DOCX_MIME && /\.docx$/i.test(file.name) &&
      isGeneratedDocx(new Uint8Array(await file.arrayBuffer()))) return
  throw new UploadValidationError('Use a PDF or DOCX generated by PMS10 that matches the selected format.', 415)
}
