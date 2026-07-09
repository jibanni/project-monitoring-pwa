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

class OfflineDatabase extends Dexie {
  projects!: Table<OfflineProject, string>
  user_profiles!: Table<CachedUserProfile, string>
  project_updates!: Table<OfflineProjectUpdate, number | string>
  project_photos!: Table<OfflineProjectPhoto, number | string>

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
  }
}

export const offlineDb = new OfflineDatabase()
