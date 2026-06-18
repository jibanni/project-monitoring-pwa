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
  financial_accomplishment: number
  risk_level: string
  project_type?: string
  funding_source?: string
  implementing_office?: string
  last_inspection_date?: string
  cached_at: string
}

export type CachedUserProfile = UserProfile & {
  cached_at: string
}

export type OfflineProjectUpdate = {
  id?: number
  project_id: string
  inspection_date: string
  status: string
  physical_accomplishment: number
  financial_accomplishment: number
  risk_level: string
  issues: string
  recommendations: string
  remarks: string
  inspection_latitude: number | null
  inspection_longitude: number | null
  created_at: string
  synced: boolean
}

export type OfflineProjectPhoto = {
  id?: number
  offline_update_id: number
  project_id: string
  file_name: string
  file_type: string
  file_blob: Blob
  caption: string
  created_at: string
  synced: boolean
}

class OfflineDatabase extends Dexie {
  projects!: Table<OfflineProject, string>
  user_profiles!: Table<CachedUserProfile, string>
  project_updates!: Table<OfflineProjectUpdate, number>
  project_photos!: Table<OfflineProjectPhoto, number>

  constructor() {
    super('project_monitoring_offline_db')

    this.version(4).stores({
      projects: 'id,status,municipality,risk_level',
      user_profiles: 'id,email,role,approved',

      project_updates:
        '++id, project_id, inspection_date, status, risk_level, synced',

      project_photos:
        '++id, offline_update_id, project_id, synced',
    })
  }
}

export const offlineDb = new OfflineDatabase()