import {
  offlineDb,
  type OfflineProjectPhoto,
  type OfflineProjectUpdate,
} from './offlineDb'
import { canUpdateProject, type AorAuthLike, type AorProjectLike } from '../utils/aorAccess'

export type OfflineQueueAccessSnapshot = {
  totalPendingUpdates: number
  totalPendingPhotos: number
  totalPendingCount: number
  allowedPendingUpdates: number
  allowedPendingPhotos: number
  allowedPendingCount: number
  blockedPendingCount: number
  canUseOfflineSync: boolean
  canSyncCurrentQueue: boolean
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function hasKey(value: unknown) {
  return value !== null && value !== undefined && textValue(value) !== ''
}

function keysMatch(left: unknown, right: unknown) {
  if (!hasKey(left) || !hasKey(right)) return false
  return String(left) === String(right)
}

function isPendingRecord(record: {
  synced?: boolean
  sync_status?: string
  is_offline?: boolean
}) {
  const status = textValue(record.sync_status).toLowerCase()

  return (
    record.synced === false ||
    record.is_offline === true ||
    status === '' ||
    status === 'pending' ||
    status === 'failed' ||
    status === 'syncing' ||
    status === 'uploading_photos' ||
    status === 'orphaned'
  )
}

function getUpdateLocalId(record: OfflineProjectUpdate) {
  return textValue(record.local_id) || textValue(record.id)
}

function getLinkedUpdate(
  photo: OfflineProjectPhoto,
  updates: OfflineProjectUpdate[],
) {
  return updates.find((update) => {
    const updateId = update.id
    const localId = getUpdateLocalId(update)

    return (
      keysMatch(photo.offline_update_id, updateId) ||
      keysMatch(photo.offline_update_id, localId) ||
      keysMatch(photo.local_update_id, localId) ||
      keysMatch(photo.project_update_id, localId) ||
      keysMatch(photo.project_update_id, update.online_update_id)
    )
  })
}

function getProjectForRecord(
  record: OfflineProjectUpdate | OfflineProjectPhoto,
  projectMap: Map<string, AorProjectLike>,
  pendingUpdates: OfflineProjectUpdate[],
): AorProjectLike {
  const directProjectId = textValue(record.project_id)

  if (directProjectId && projectMap.has(directProjectId)) {
    return projectMap.get(directProjectId) || {}
  }

  const linkedUpdate = getLinkedUpdate(record as OfflineProjectPhoto, pendingUpdates)
  const linkedProjectId = textValue(linkedUpdate?.project_id)

  if (linkedProjectId && projectMap.has(linkedProjectId)) {
    return projectMap.get(linkedProjectId) || {}
  }

  const recordWithAor = record as OfflineProjectUpdate & {
    province?: unknown
    municipality?: unknown
  }
  const linkedWithAor = linkedUpdate as
    | (OfflineProjectUpdate & { province?: unknown; municipality?: unknown })
    | undefined

  return {
    province: recordWithAor.province || linkedWithAor?.province,
    municipality: recordWithAor.municipality || linkedWithAor?.municipality,
  }
}

export function canUseOfflineSyncForAuth(auth: AorAuthLike | null | undefined) {
  return Boolean(
    auth?.isAdmin ||
      auth?.isROEngineer ||
      auth?.isPOEngineer ||
      auth?.isEngineer ||
      auth?.isPEO,
  )
}

export async function inspectOfflineQueueAccess(
  auth: AorAuthLike | null | undefined,
): Promise<OfflineQueueAccessSnapshot> {
  const [projects, updates, photos] = await Promise.all([
    offlineDb.projects.toArray(),
    offlineDb.project_updates.toArray(),
    offlineDb.project_photos.toArray(),
  ])

  const pendingUpdates = updates.filter(isPendingRecord)
  const pendingPhotos = photos.filter(isPendingRecord)
  const projectMap = new Map<string, AorProjectLike>()

  projects.forEach((project) => {
    const projectId = textValue(project.id)
    if (!projectId) return

    projectMap.set(projectId, {
      province: project.province,
      municipality: project.municipality,
    })
  })

  const allowedUpdates = pendingUpdates.filter((update) =>
    canUpdateProject(
      getProjectForRecord(update, projectMap, pendingUpdates),
      auth,
    ),
  )

  const allowedPhotos = pendingPhotos.filter((photo) =>
    canUpdateProject(
      getProjectForRecord(photo, projectMap, pendingUpdates),
      auth,
    ),
  )

  const totalPendingCount = pendingUpdates.length + pendingPhotos.length
  const allowedPendingCount = allowedUpdates.length + allowedPhotos.length
  const blockedPendingCount = Math.max(0, totalPendingCount - allowedPendingCount)
  const canUseOfflineSync = canUseOfflineSyncForAuth(auth)
  const canSyncCurrentQueue = Boolean(
    canUseOfflineSync &&
      (auth?.isAdmin || blockedPendingCount === 0),
  )

  return {
    totalPendingUpdates: pendingUpdates.length,
    totalPendingPhotos: pendingPhotos.length,
    totalPendingCount,
    allowedPendingUpdates: allowedUpdates.length,
    allowedPendingPhotos: allowedPhotos.length,
    allowedPendingCount,
    blockedPendingCount,
    canUseOfflineSync,
    canSyncCurrentQueue,
  }
}
