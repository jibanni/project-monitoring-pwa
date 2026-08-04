import Dexie, { type Table } from 'dexie'
import type { UserProfile } from '../types/auth'

export type OfflineProject = {
  id: string
  project_name: string
  status: string
  municipality: string
  province: string
  barangay: string
  physical_accomplishment: number
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  financial_accomplishment: number
  risk_level: string
  project_type?: string
  funding_source?: string
  funding_year?: number | string | null
  implementing_office?: string
  contractor?: string
  budget?: number | string
  start_date?: string
  target_completion_date?: string
  contract_expiration_date?: string | null
  has_contract_modification?: boolean | string | null
  contract_modification_type?: string | null
  revised_project_cost?: number | string | null
  revised_contract_expiration_date?: string | null
  not_yet_started_reason?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  last_inspection_date?: string
  updated_at?: string
  cached_at: string
}

export type CachedUserProfile = UserProfile & {
  cached_at: string
}

export type OfflineProjectUpdate = {
  id?: number | string
  local_id?: string
  online_update_id?: string

  project_id: string
  project_name?: string
  funding_source?: string | null
  funding_year?: number | string | null
  funding_program?: string | null
  fiscal_year?: number | string | null
  year?: number | string | null
  program?: string | null
  program_name?: string | null
  engineer_id?: string | null

  inspection_date: string
  status: string
  contract_expiration_date?: string | null
  has_contract_modification?: boolean | string | null
  contract_modification_type?: string | null
  revised_project_cost?: number | string | null
  revised_contract_expiration_date?: string | null
  not_yet_started_reason?: string | null
  physical_accomplishment: number
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  financial_accomplishment: number
  risk_level: string
  issues: string | null
  recommendations: string | null
  remarks: string | null
  inspection_latitude: number | null
  inspection_longitude: number | null

  created_at: string
  updated_at?: string

  synced?: boolean
  sync_status?: 'pending' | 'syncing' | 'uploading_photos' | 'synced' | 'failed' | string
  is_offline?: boolean
  error?: string
}

export type OfflineProjectPhoto = {
  id?: number | string
  offline_update_id?: number | string
  local_update_id?: string
  project_update_id?: string

  project_id: string
  project_name?: string
  funding_source?: string | null
  funding_year?: number | string | null
  funding_program?: string | null
  fiscal_year?: number | string | null
  year?: number | string | null
  program?: string | null
  program_name?: string | null

  file_name: string
  file_type: string
  file_size?: number

  /* Current expected field */
  file_blob?: Blob

  /* Legacy ProjectUpdates.tsx field. Kept so old pending photos can still sync. */
  file?: Blob | File

  caption: string
  created_at?: string
  uploaded_at?: string

  synced?: boolean
  sync_status?: 'pending' | 'syncing' | 'synced' | 'failed' | string
  is_offline?: boolean
  error?: string
}


export type AideMemoireFinding = {
  id: string
  finding: string
  recommendation: string
  timeline: string
  remarks: string
  photo_refs?: string[]
}

export type AideMemoireAttendance = {
  id: string
  name: string
  designation_agency: string
}

export type AideMemoirePhoto = {
  id: string
  photo_ref: string
  photo_number: number
  caption: string
  file_name: string
  file_type: string
  file_blob?: Blob
  photo_url?: string
  latitude?: number | null
  longitude?: number | null
  captured_at?: string
  finding_id?: string
  photo_kind?: 'finding' | 'additional'
}

export type OfflineAideMemoire = {
  id: string
  project_id: string
  update_ref: string
  update_source: 'online' | 'offline'
  created_by?: string | null

  province_huc: string
  office_name: string
  office_address: string
  inspection_date: string

  project_title: string
  program: string
  project_code: string
  funding_year: string
  national_subsidy: string
  lgu_equity: string
  project_type: string
  exact_location: string
  implementing_unit: string
  mode_of_implementation: string

  contractor_name: string
  contractor_office_address: string
  contract_perfection_date: string
  ntp_receipt_date: string
  contract_amount: string
  contract_duration: string
  revised_contract_duration: string
  original_expiration_date: string
  revised_expiration_date: string

  target_to_date: string
  actual_to_date: string
  physical_variance: string
  balance: string
  total_disbursement: string
  financial_accomplishment: string

  findings: AideMemoireFinding[]
  general_observations: string
  attendance: AideMemoireAttendance[]
  photos: AideMemoirePhoto[]

  project_snapshot: Record<string, unknown>
  update_snapshot: Record<string, unknown>

  status: 'draft' | 'final'
  sync_status: 'local' | 'pending' | 'synced' | 'failed' | string
  synced: boolean

  /* Latest generated PDF retained locally for quick viewing on this device. */
  latest_pdf_blob?: Blob
  latest_pdf_file_name?: string
  latest_pdf_generated_at?: string
  latest_docx_blob?: Blob
  latest_docx_file_name?: string
  latest_docx_generated_at?: string

  created_at: string
  updated_at: string
}



export type OfflineAideMemoirePhotoAsset = {
  id: string
  aide_memoire_id: string
  project_id: string
  update_ref: string
  photo_ref: string
  photo_number: number
  file_name: string
  mime_type: string
  data: ArrayBuffer
  created_at: string
}

function stripLegacyBinaryFields(record: OfflineAideMemoire): OfflineAideMemoire {
  const sanitizedPhotos = (record.photos || []).map((photo) => {
    const { file_blob: _fileBlob, ...metadata } = photo
    return metadata
  })

  const {
    latest_pdf_blob: _latestPdfBlob,
    latest_docx_blob: _latestDocxBlob,
    ...metadata
  } = record

  return { ...metadata, photos: sanitizedPhotos }
}

export async function saveAideMemoireRecord(record: OfflineAideMemoire) {
  const createdAt = new Date().toISOString()
  const existingAssets = await offlineDb.aide_memoire_photo_assets
    .where('aide_memoire_id')
    .equals(record.id)
    .toArray()
  const existingAssetMap = new Map(existingAssets.map((asset) => [asset.photo_ref, asset]))
  const assetsToWrite: OfflineAideMemoirePhotoAsset[] = []

  for (const photo of record.photos || []) {
    if (!photo.file_blob) continue

    const existing = existingAssetMap.get(photo.photo_ref)
    const fileName = photo.file_name || `photo-${assetsToWrite.length + 1}.jpg`
    const mimeType = photo.file_type || photo.file_blob.type || 'image/jpeg'

    const binaryIsAlreadyStored = Boolean(
      existing &&
      existing.file_name === fileName &&
      existing.mime_type === mimeType &&
      existing.data.byteLength === photo.file_blob.size,
    )

    if (binaryIsAlreadyStored) continue

    assetsToWrite.push({
      id: `${record.id}:${photo.photo_ref}`,
      aide_memoire_id: record.id,
      project_id: record.project_id,
      update_ref: record.update_ref,
      photo_ref: photo.photo_ref,
      photo_number: Number(photo.photo_number || assetsToWrite.length + 1),
      file_name: fileName,
      mime_type: mimeType,
      data: await photo.file_blob.arrayBuffer(),
      created_at: existing?.created_at || createdAt,
    })
  }

  const expectedPhotoRefs = new Set((record.photos || []).map((photo) => photo.photo_ref))
  const staleAssetIds = existingAssets
    .filter((asset) => !expectedPhotoRefs.has(asset.photo_ref))
    .map((asset) => asset.id)

  if (staleAssetIds.length > 0) {
    await offlineDb.aide_memoire_photo_assets.bulkDelete(staleAssetIds)
  }
  if (assetsToWrite.length > 0) {
    await offlineDb.aide_memoire_photo_assets.bulkPut(assetsToWrite)
  }

  const sanitized = stripLegacyBinaryFields(record)
  await offlineDb.aide_memoires.put(sanitized)
  return sanitized
}

export async function getAideMemoirePhotoAssets(aideMemoireId: string) {
  return offlineDb.aide_memoire_photo_assets
    .where('aide_memoire_id')
    .equals(aideMemoireId)
    .sortBy('photo_number')
}

export function aideMemoirePhotoAssetToBlob(asset: OfflineAideMemoirePhotoAsset) {
  return new Blob([asset.data], { type: asset.mime_type || 'image/jpeg' })
}

export async function deleteAideMemoireLocalAssets(aideMemoireId: string) {
  const [photoAssets, documents] = await Promise.all([
    offlineDb.aide_memoire_photo_assets.where('aide_memoire_id').equals(aideMemoireId).toArray(),
    offlineDb.aide_memoire_documents.where('aide_memoire_id').equals(aideMemoireId).toArray(),
  ])

  await offlineDb.transaction('rw', offlineDb.aide_memoire_photo_assets, offlineDb.aide_memoire_documents, async () => {
    if (photoAssets.length > 0) {
      await offlineDb.aide_memoire_photo_assets.bulkDelete(photoAssets.map((item) => item.id))
    }
    if (documents.length > 0) {
      await offlineDb.aide_memoire_documents.bulkDelete(documents.map((item) => item.id))
    }
  })
}

export type AideMemoireDocumentFormat = 'pdf' | 'docx'

export type OfflineAideMemoireDocument = {
  id: string
  aide_memoire_id: string
  project_id: string
  update_ref: string
  format: AideMemoireDocumentFormat
  file_name: string
  mime_type: string
  data: ArrayBuffer
  generated_at: string
}

export async function saveAideMemoireDocument(params: {
  aideMemoireId: string
  projectId: string
  updateRef: string
  format: AideMemoireDocumentFormat
  fileName: string
  blob: Blob
  generatedAt?: string
}) {
  const generatedAt = params.generatedAt || new Date().toISOString()
  const record: OfflineAideMemoireDocument = {
    id: `${params.aideMemoireId}:${params.format}`,
    aide_memoire_id: params.aideMemoireId,
    project_id: params.projectId,
    update_ref: params.updateRef,
    format: params.format,
    file_name: params.fileName,
    mime_type: params.blob.type || (params.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    data: await params.blob.arrayBuffer(),
    generated_at: generatedAt,
  }

  await offlineDb.aide_memoire_documents.put(record)
  return record
}

export function aideMemoireDocumentToBlob(document: OfflineAideMemoireDocument) {
  return new Blob([document.data], { type: document.mime_type })
}

export async function getAideMemoireDocument(
  aideMemoireId: string,
  format: AideMemoireDocumentFormat,
) {
  return (await offlineDb.aide_memoire_documents.get(`${aideMemoireId}:${format}`)) || null
}

export async function getLatestAideMemoireDocument(
  projectId: string,
  format: AideMemoireDocumentFormat = 'pdf',
) {
  const records = await offlineDb.aide_memoire_documents
    .where('[project_id+format]')
    .equals([projectId, format])
    .toArray()

  return records.sort((first, second) =>
    String(second.generated_at || '').localeCompare(String(first.generated_at || '')),
  )[0] || null
}

class OfflineDatabase extends Dexie {
  projects!: Table<OfflineProject, string>
  user_profiles!: Table<CachedUserProfile, string>
  project_updates!: Table<OfflineProjectUpdate, number | string>
  project_photos!: Table<OfflineProjectPhoto, number | string>
  aide_memoires!: Table<OfflineAideMemoire, string>
  aide_memoire_documents!: Table<OfflineAideMemoireDocument, string>
  aide_memoire_photo_assets!: Table<OfflineAideMemoirePhotoAsset, string>

  constructor() {
    super('project_monitoring_offline_db')

    this.version(4).stores({
      projects: 'id,status,municipality,risk_level',
      user_profiles: 'id,email,role,approved',
      project_updates: '++id, project_id, inspection_date, status, risk_level, synced',
      project_photos: '++id, offline_update_id, project_id, synced',
    })

    /* Version 5 keeps existing data and adds indexes used by the fixed sync flow. */
    this.version(5).stores({
      projects: 'id,status,municipality,risk_level',
      user_profiles: 'id,email,role,approved',
      project_updates:
        '++id, local_id, online_update_id, project_id, inspection_date, status, risk_level, synced, sync_status',
      project_photos:
        '++id, offline_update_id, local_update_id, project_update_id, project_id, synced, sync_status',
    })

    /* Version 6 adds offline-first Aide Memoire drafts without changing existing records. */
    this.version(6).stores({
      projects: 'id,status,municipality,risk_level',
      user_profiles: 'id,email,role,approved',
      project_updates:
        '++id, local_id, online_update_id, project_id, inspection_date, status, risk_level, synced, sync_status',
      project_photos:
        '++id, offline_update_id, local_update_id, project_update_id, project_id, synced, sync_status',
      aide_memoires:
        'id, project_id, update_ref, [project_id+update_ref], inspection_date, updated_at, status, synced, sync_status',
    })

    /* Version 7 stores generated documents separately as ArrayBuffer data.
       This avoids WebKit/Safari failures when large PDF/DOCX Blobs are written
       into the same object that already contains inspection photo Blobs. */
    this.version(7).stores({
      projects: 'id,status,municipality,risk_level',
      user_profiles: 'id,email,role,approved',
      project_updates:
        '++id, local_id, online_update_id, project_id, inspection_date, status, risk_level, synced, sync_status',
      project_photos:
        '++id, offline_update_id, local_update_id, project_update_id, project_id, synced, sync_status',
      aide_memoires:
        'id, project_id, update_ref, [project_id+update_ref], inspection_date, updated_at, status, synced, sync_status',
      aide_memoire_documents:
        'id, aide_memoire_id, project_id, update_ref, format, generated_at, [project_id+format], [aide_memoire_id+format]',
    })


    /* Version 8 stores each Aide Memoire photo separately as ArrayBuffer data.
       This prevents Safari/WebKit object-store errors caused by rewriting one
       large Aide Memoire object containing multiple Blob/File values. */
    this.version(8).stores({
      projects: 'id,status,municipality,risk_level',
      user_profiles: 'id,email,role,approved',
      project_updates:
        '++id, local_id, online_update_id, project_id, inspection_date, status, risk_level, synced, sync_status',
      project_photos:
        '++id, offline_update_id, local_update_id, project_update_id, project_id, synced, sync_status',
      aide_memoires:
        'id, project_id, update_ref, [project_id+update_ref], inspection_date, updated_at, status, synced, sync_status',
      aide_memoire_documents:
        'id, aide_memoire_id, project_id, update_ref, format, generated_at, [project_id+format], [aide_memoire_id+format]',
      aide_memoire_photo_assets:
        'id, aide_memoire_id, project_id, update_ref, photo_ref, photo_number, [aide_memoire_id+photo_ref]',
    })
  }
}

export const offlineDb = new OfflineDatabase()
