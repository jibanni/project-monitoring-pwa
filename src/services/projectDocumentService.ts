import { supabase } from '../lib/supabase'
import { AIDE_MEMOIRE_FILE_LIMIT } from '../lib/offlineDb'
import type {
  AideMemoireDocumentFormat,
  OfflineAideMemoireDocument,
} from '../lib/offlineDb'

export type CloudAideMemoireDocument = {
  id: string
  project_id: string
  project_update_id?: string | null
  aide_memoire_id?: string | null
  document_type?: string | null
  document_format?: AideMemoireDocumentFormat | string | null
  file_name?: string | null
  mime_type?: string | null
  file_url?: string | null
  drive_file_id?: string | null
  drive_folder_id?: string | null
  storage_path?: string | null
  province?: string | null
  lgu?: string | null
  funding_year?: string | null
  program?: string | null
  generated_by_name?: string | null
  uploaded_by?: string | null
  uploaded_at?: string | null
  generated_at?: string | null
  synced_at?: string | null
  sync_status?: string | null
}

export type UploadedAideMemoireResult = {
  file: {
    id: string
    name: string
    mimeType: string
    webViewLink?: string
    webContentLink?: string
    directViewLink?: string
    downloadUrl?: string
    folderId?: string
    folderName?: string
    storagePath?: string
    [key: string]: unknown
  }
  document?: CloudAideMemoireDocument
  retentionPending?: boolean
}

type EdgeUploadResponse = {
  ok: boolean
  message: string
  file?: UploadedAideMemoireResult['file']
  document?: CloudAideMemoireDocument
  retentionPending?: boolean
  error?: string
}

async function getFunctionErrorMessage(error: any) {
  const fallback = error?.message || 'Unable to upload Aide Memoire to Google Drive.'
  const response = error?.context

  if (!response || typeof response.clone !== 'function') return fallback

  try {
    const payload = await response.clone().json()
    const message = payload?.error || payload?.message || payload?.details
    if (message) return String(message)
  } catch {
    // Keep trying plain text below.
  }

  try {
    const text = await response.clone().text()
    if (text?.trim()) return text.trim()
  } catch {
    // Use fallback.
  }

  return fallback
}

function makeFile(
  document: OfflineAideMemoireDocument,
) {
  const blob = new Blob([document.data], { type: document.mime_type })
  return new File([blob], document.file_name, {
    type: document.mime_type,
    lastModified: new Date(document.generated_at || Date.now()).getTime(),
  })
}

export async function uploadAideMemoireDocumentToDrive(params: {
  document: OfflineAideMemoireDocument
  updateId?: string
}) {
  const { document } = params
  const updateId = String(params.updateId || document.update_ref || '').trim()

  if (!document.project_id || !updateId) {
    throw new Error('Aide Memoire is missing its project or inspection reference.')
  }

  const formData = new FormData()
  formData.append('file', makeFile(document))
  formData.append('fileKind', 'aide-memoire')
  formData.append('assetId', document.id)
  formData.append('projectId', document.project_id)
  formData.append('updateId', updateId)
  formData.append('aideMemoireId', document.aide_memoire_id)
  formData.append('documentFormat', document.format)
  formData.append('generatedAt', document.generated_at || new Date().toISOString())

  const { data, error } = await supabase.functions.invoke<EdgeUploadResponse>(
    'upload-project-file-to-drive',
    { body: formData },
  )

  if (error) {
    throw new Error(await getFunctionErrorMessage(error))
  }

  if (!data?.ok || !data.file) {
    throw new Error(
      data?.error ||
        data?.message ||
        'Unable to upload Aide Memoire to Google Drive.',
    )
  }

  return {
    file: data.file,
    document: data.document,
    retentionPending: data.retentionPending,
  } satisfies UploadedAideMemoireResult
}

export async function getProjectAideMemoireDocuments(projectId: string) {
  const result = await supabase
    .from('documents')
    .select(
      [
        'id',
        'project_id',
        'project_update_id',
        'aide_memoire_id',
        'document_type',
        'document_format',
        'file_name',
        'mime_type',
        'file_url',
        'drive_file_id',
        'drive_folder_id',
        'storage_path',
        'province',
        'lgu',
        'funding_year',
        'program',
        'generated_by_name',
        'uploaded_by',
        'uploaded_at',
        'generated_at',
        'synced_at',
        'sync_status',
      ].join(','),
    )
    .eq('project_id', projectId)
    .eq('document_type', 'Aide Memoire')
    .not('file_url', 'is', null)
    .order('generated_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(AIDE_MEMOIRE_FILE_LIMIT)

  if (result.error) throw result.error
  return (result.data || []) as unknown as CloudAideMemoireDocument[]
}

export function isLocalAideMemoireNewer(
  local: OfflineAideMemoireDocument | null,
  cloud: CloudAideMemoireDocument | null,
) {
  if (!local) return false
  if (!cloud?.file_url) return true

  const localTime = Date.parse(local.generated_at || '')
  const cloudTime = Date.parse(cloud.generated_at || cloud.uploaded_at || '')
  return Number.isFinite(localTime) && (!Number.isFinite(cloudTime) || localTime > cloudTime)
}

export async function getLatestProjectAideMemoireDocument(
  projectId: string,
  format: AideMemoireDocumentFormat = 'pdf',
) {
  const documents = await getProjectAideMemoireDocuments(projectId)
  return documents.find((document) => document.document_format === format) || null
}
