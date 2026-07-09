import { supabase } from '../lib/supabase'
import {
  offlineDb,
  type OfflineProjectPhoto,
  type OfflineProjectUpdate,
} from '../lib/offlineDb'
import { getComputedRiskLevel } from '../utils/projectVariance'
import { getDrivePhotoUrl, uploadProjectPhotoToDrive } from './googleDrivePhotoUploadService'

type SyncResult = {
  success: boolean
  syncedCount: number
  syncedPhotoCount: number
  failedCount: number
  message: string
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())

  return Number.isFinite(parsed) ? parsed : 0
}

function nullableText(value: unknown) {
  const text = textValue(value)
  return text || null
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}


type DriveProjectMeta = {
  id?: string
  project_name?: string | null
  funding_source?: string | null
  funding_year?: number | string | null
  funding_program?: string | null
  fiscal_year?: number | string | null
  year?: number | string | null
  program?: string | null
  program_name?: string | null
  project_type?: string | null
}

const driveProjectMetaCache = new Map<string, DriveProjectMeta | null>()

async function getDriveProjectMetaForOfflineUpdate(
  update: OfflineProjectUpdate,
): Promise<DriveProjectMeta | null> {
  const projectId = textValue(update.project_id)

  if (!projectId) return null

  if (driveProjectMetaCache.has(projectId)) {
    return driveProjectMetaCache.get(projectId) || null
  }

  let cachedProject: DriveProjectMeta | null = null

  try {
    cachedProject = ((await offlineDb.projects.get(projectId)) || null) as
      | DriveProjectMeta
      | null
  } catch (error) {
    console.warn('Unable to read cached project metadata for Drive folders:', error)
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (error) {
      console.warn('Unable to read online project metadata for Drive folders:', error)
      driveProjectMetaCache.set(projectId, cachedProject)
      return cachedProject
    }

    const onlineProject = (data || null) as DriveProjectMeta | null
    driveProjectMetaCache.set(projectId, onlineProject || cachedProject)

    return onlineProject || cachedProject
  } catch (error) {
    console.warn('Unable to resolve project metadata for Drive folders:', error)
    driveProjectMetaCache.set(projectId, cachedProject)

    return cachedProject
  }
}

function getOfflineDriveFundingYear(
  update: OfflineProjectUpdate,
  projectMeta?: DriveProjectMeta | null,
) {
  const rawValue =
    update.funding_year ||
    update.fiscal_year ||
    update.year ||
    projectMeta?.funding_year ||
    projectMeta?.fiscal_year ||
    projectMeta?.year ||
    ''

  const match = String(rawValue).match(/\b(20\d{2}|19\d{2})\b/)

  if (match?.[1]) return match[1]

  const inspectionDate = String(update.inspection_date || '')

  return inspectionDate.match(/^(\d{4})-/)?.[1] || ''
}

function getOfflineDriveFundingSource(
  update: OfflineProjectUpdate,
  projectMeta?: DriveProjectMeta | null,
) {
  return String(
    update.funding_source ||
      update.funding_program ||
      update.program ||
      update.program_name ||
      projectMeta?.funding_source ||
      projectMeta?.funding_program ||
      projectMeta?.program ||
      projectMeta?.program_name ||
      projectMeta?.project_type ||
      '',
  ).trim()
}

function getOfflineDriveProjectTitle(
  update: OfflineProjectUpdate,
  projectMeta?: DriveProjectMeta | null,
) {
  return (
    textValue(update.project_name) ||
    textValue(projectMeta?.project_name) ||
    `Project ${update.project_id}`
  )
}

function getAutoRiskForUpdate(update: OfflineProjectUpdate) {
  return getComputedRiskLevel({
    physical_accomplishment: update.physical_accomplishment,
    target_physical_accomplishment: update.target_physical_accomplishment,
    target_physical_as_of: update.inspection_date,
    target_physical_source: update.target_physical_source || 'manual',
    last_inspection_date: update.inspection_date,
    contract_expiration_date: update.contract_expiration_date,
    has_contract_modification: update.has_contract_modification,
    contract_modification_type: update.contract_modification_type,
    revised_project_cost: update.revised_project_cost,
    revised_contract_expiration_date: update.revised_contract_expiration_date,
  })
}

function isPendingRecord(record: { synced?: boolean; sync_status?: string; is_offline?: boolean }) {
  const status = textValue(record.sync_status).toLowerCase()

  return (
    record.synced === false ||
    record.is_offline === true ||
    status === '' ||
    status === 'pending' ||
    status === 'failed' ||
    status === 'syncing' ||
    status === 'uploading_photos'
  )
}

function hasKey(value: unknown) {
  return value !== null && value !== undefined && textValue(value) !== ''
}

function keysMatch(a: unknown, b: unknown) {
  if (!hasKey(a) || !hasKey(b)) return false
  return String(a) === String(b)
}

function getProjectTitle(projectId: string, fallback?: string) {
  return offlineDb.projects
    .get(projectId)
    .then((project) => project?.project_name || fallback || `Project ${projectId}`)
    .catch(() => fallback || `Project ${projectId}`)
}

function buildOnlineUpdatePayload(update: OfflineProjectUpdate) {
  return {
    project_id: update.project_id,
    engineer_id: update.engineer_id || null,
    inspection_date: update.inspection_date,
    physical_accomplishment: toNumber(update.physical_accomplishment),
    target_physical_accomplishment: toNumber(update.target_physical_accomplishment),
    target_physical_source: textValue(update.target_physical_source) || 'manual',
    financial_accomplishment: toNumber(update.financial_accomplishment),
    risk_level: getAutoRiskForUpdate(update),
    issues: nullableText(update.issues),
    recommendations: nullableText(update.recommendations),
    remarks: nullableText(update.remarks),
    inspection_latitude: nullableNumber(update.inspection_latitude),
    inspection_longitude: nullableNumber(update.inspection_longitude),
    created_at: update.created_at || new Date().toISOString(),
  }
}

function buildProjectPatch(update: OfflineProjectUpdate) {
  const latitude = nullableNumber(update.inspection_latitude)
  const longitude = nullableNumber(update.inspection_longitude)

  return {
    status: textValue(update.status) || 'Ongoing',
    physical_accomplishment: toNumber(update.physical_accomplishment),
    target_physical_accomplishment: toNumber(update.target_physical_accomplishment),
    target_physical_as_of: update.inspection_date,
    target_physical_source: textValue(update.target_physical_source) || 'manual',
    financial_accomplishment: toNumber(update.financial_accomplishment),
    risk_level: getAutoRiskForUpdate(update),
    has_contract_modification:
      update.has_contract_modification === true ||
      textValue(update.has_contract_modification).toLowerCase() === 'true' ||
      textValue(update.has_contract_modification).toLowerCase() === 'yes',
    contract_modification_type: nullableText(update.contract_modification_type),
    revised_project_cost: nullableNumber(update.revised_project_cost),
    revised_contract_expiration_date: nullableText(update.revised_contract_expiration_date),
    not_yet_started_reason: nullableText(update.not_yet_started_reason),
    last_inspection_date: update.inspection_date,
    ...(latitude !== null && longitude !== null
      ? {
          latitude,
          longitude,
        }
      : {}),
    updated_at: new Date().toISOString(),
  }
}

function getPhotoBlob(photo: OfflineProjectPhoto) {
  return photo.file_blob || photo.file || null
}

function getSafeFileName(name: string) {
  const cleanName = textValue(name)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase()

  return cleanName || 'offline-photo.jpg'
}

function getUpdateLocalId(update: OfflineProjectUpdate) {
  return textValue(update.local_id) || textValue(update.id)
}

async function markUpdateStatus(
  update: OfflineProjectUpdate,
  patch: Partial<OfflineProjectUpdate>,
) {
  if (!hasKey(update.id)) return

  await offlineDb.project_updates.update(update.id as number | string, {
    ...patch,
    updated_at: new Date().toISOString(),
  } as Partial<OfflineProjectUpdate>)
}

async function markPhotoStatus(
  photo: OfflineProjectPhoto,
  patch: Partial<OfflineProjectPhoto>,
) {
  if (!hasKey(photo.id)) return

  await offlineDb.project_photos.update(photo.id as number | string, patch)
}

export async function saveOfflineProjectUpdate(update: OfflineProjectUpdate) {
  return offlineDb.project_updates.add({
    ...update,
    synced: false,
    sync_status: update.sync_status || 'pending',
    is_offline: true,
    created_at: update.created_at || new Date().toISOString(),
  })
}

export async function saveOfflineProjectPhotos(
  offlineUpdateId: number | string,
  projectId: string,
  files: File[],
) {
  const projectName = await getProjectTitle(projectId)

  for (const file of files) {
    await offlineDb.project_photos.add({
      offline_update_id: offlineUpdateId,
      project_id: projectId,
      project_name: projectName,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      file_blob: file,
      caption: file.name,
      created_at: new Date().toISOString(),
      uploaded_at: new Date().toISOString(),
      synced: false,
      sync_status: 'pending',
      is_offline: true,
    })
  }
}

export async function getPendingOfflineUpdates() {
  const allUpdates = await offlineDb.project_updates.toArray()

  return allUpdates.filter((update) => isPendingRecord(update))
}

export async function getPendingOfflinePhotos() {
  const allPhotos = await offlineDb.project_photos.toArray()

  return allPhotos.filter((photo) => isPendingRecord(photo))
}

export async function countPendingOfflineUpdates() {
  const pendingUpdates = await getPendingOfflineUpdates()
  return pendingUpdates.length
}

export async function countPendingOfflinePhotos() {
  const pendingPhotos = await getPendingOfflinePhotos()
  return pendingPhotos.length
}

async function getPhotosForUpdate(update: OfflineProjectUpdate) {
  const allPendingPhotos = await getPendingOfflinePhotos()
  const updateId = update.id
  const localId = getUpdateLocalId(update)
  const embeddedPhotos = Array.isArray((update as any).offline_photos)
    ? ((update as any).offline_photos as OfflineProjectPhoto[])
    : []

  const linkedPhotos = allPendingPhotos.filter((photo) => {
    return (
      keysMatch(photo.offline_update_id, updateId) ||
      keysMatch(photo.offline_update_id, localId) ||
      keysMatch(photo.local_update_id, localId) ||
      keysMatch(photo.project_update_id, localId) ||
      keysMatch(photo.project_update_id, update.online_update_id)
    )
  })

  const seen = new Set<string>()
  const combined: OfflineProjectPhoto[] = []

  for (const photo of [...linkedPhotos, ...embeddedPhotos]) {
    const key = textValue(photo.id) || `${photo.file_name}-${photo.created_at || photo.uploaded_at}`

    if (seen.has(key)) continue

    seen.add(key)
    combined.push(photo)
  }

  return combined
}

async function syncPhotosForOfflineUpdate(
  update: OfflineProjectUpdate,
  onlineProjectUpdateId: string,
) {
  const photos = await getPhotosForUpdate(update)
  const projectMeta = await getDriveProjectMetaForOfflineUpdate(update)
  const driveProjectTitle = getOfflineDriveProjectTitle(update, projectMeta)
  const driveFundingYear = getOfflineDriveFundingYear(update, projectMeta)
  const driveFundingSource = getOfflineDriveFundingSource(update, projectMeta)
  let uploadedPhotoCount = 0

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index]
    const blob = getPhotoBlob(photo)

    if (!blob) {
      throw new Error(
        `Missing offline photo file for ${photo.file_name || 'one pending photo'}. Please remove and recapture this photo.`,
      )
    }

    await markPhotoStatus(photo, {
      sync_status: 'syncing',
      error: '',
    })

    const safeFileName = getSafeFileName(photo.file_name || `photo-${index + 1}.jpg`)
    const fileType = photo.file_type || blob.type || 'image/jpeg'
    const file =
      blob instanceof File
        ? blob
        : new File([blob], safeFileName, {
            type: fileType,
            lastModified: Date.now(),
          })

    try {
      const uploadedFile = await uploadProjectPhotoToDrive({
        file,
        projectId: update.project_id,
        updateId: onlineProjectUpdateId,
        projectTitle: driveProjectTitle,
        inspectionDate: update.inspection_date || '',
        fundingYear: driveFundingYear,
        fundingSource: driveFundingSource,
        fundingProgram: driveFundingSource,
        uploadedBy: update.engineer_id || 'Offline PMS10 User',
      })

      const insertPhotoResult = await supabase.from('project_photos').insert([
        {
          project_id: update.project_id,
          project_update_id: onlineProjectUpdateId,
          photo_url: getDrivePhotoUrl(uploadedFile),
          caption: textValue(photo.caption) || `Project update photo ${index + 1}`,
          uploaded_at: new Date().toISOString(),
        },
      ])

      if (insertPhotoResult.error) {
        await markPhotoStatus(photo, {
          sync_status: 'failed',
          error: insertPhotoResult.error.message,
        })

        throw insertPhotoResult.error
      }
    } catch (error: any) {
      await markPhotoStatus(photo, {
        sync_status: 'failed',
        error: error?.message || 'Unable to upload offline photo to Google Drive.',
      })

      throw error
    }

    if (hasKey(photo.id)) {
      await offlineDb.project_photos.delete(photo.id as number | string)
    }

    uploadedPhotoCount += 1
  }

  return uploadedPhotoCount
}

async function createOrReuseOnlineUpdate(update: OfflineProjectUpdate) {
  if (textValue(update.online_update_id)) {
    return textValue(update.online_update_id)
  }

  const insertResult = await supabase
    .from('project_updates')
    .insert([buildOnlineUpdatePayload(update)])
    .select('id')
    .single()

  if (insertResult.error) {
    await markUpdateStatus(update, {
      sync_status: 'failed',
      error: insertResult.error.message,
    })

    throw insertResult.error
  }

  const onlineProjectUpdateId = textValue(insertResult.data?.id)

  if (!onlineProjectUpdateId) {
    throw new Error('Project update synced, but Supabase did not return an update ID.')
  }

  await markUpdateStatus(update, {
    online_update_id: onlineProjectUpdateId,
    sync_status: 'uploading_photos',
    error: '',
  })

  return onlineProjectUpdateId
}

export async function syncOfflineUpdates(): Promise<SyncResult> {
  const pendingUpdates = await getPendingOfflineUpdates()

  if (pendingUpdates.length === 0) {
    return {
      success: true,
      syncedCount: 0,
      syncedPhotoCount: 0,
      failedCount: 0,
      message: 'No pending offline updates.',
    }
  }

  let syncedCount = 0
  let syncedPhotoCount = 0
  let failedCount = 0

  for (const update of pendingUpdates) {
    try {
      if (!update.project_id) {
        throw new Error('Pending update has no project ID.')
      }

      await markUpdateStatus(update, {
        sync_status: 'syncing',
        error: '',
      })

      const onlineProjectUpdateId = await createOrReuseOnlineUpdate(update)

      const projectResult = await supabase
        .from('projects')
        .update(buildProjectPatch(update))
        .eq('id', update.project_id)

      if (projectResult.error) {
        await markUpdateStatus(update, {
          sync_status: 'failed',
          error: projectResult.error.message,
        })

        throw projectResult.error
      }

      const uploadedPhotoCount = await syncPhotosForOfflineUpdate(
        {
          ...update,
          online_update_id: onlineProjectUpdateId,
        },
        onlineProjectUpdateId,
      )

      syncedPhotoCount += uploadedPhotoCount

      if (hasKey(update.id)) {
        await offlineDb.project_updates.delete(update.id as number | string)
      } else {
        await markUpdateStatus(update, {
          synced: true,
          sync_status: 'synced',
          is_offline: false,
          error: '',
        })
      }

      syncedCount += 1
    } catch (error: any) {
      failedCount += 1
      console.error('Unable to sync offline update:', error)

      await markUpdateStatus(update, {
        sync_status: 'failed',
        error: error?.message || 'Sync failed. Please try again.',
      })
    }
  }

  if (failedCount > 0) {
    throw new Error(
      `${syncedCount} update(s) synced, but ${failedCount} update(s) failed. Please review failed records and try again.`,
    )
  }

  return {
    success: true,
    syncedCount,
    syncedPhotoCount,
    failedCount,
    message: `${syncedCount} offline update(s) and ${syncedPhotoCount} offline photo(s) synced successfully.`,
  }
}

export async function syncPendingUpdates() {
  return syncOfflineUpdates()
}

export async function syncAllOfflineData() {
  return syncOfflineUpdates()
}

export async function syncOfflineData() {
  return syncOfflineUpdates()
}

export async function syncPendingOfflineData() {
  return syncOfflineUpdates()
}

export async function syncPendingData() {
  return syncOfflineUpdates()
}

export async function syncAll() {
  return syncOfflineUpdates()
}
