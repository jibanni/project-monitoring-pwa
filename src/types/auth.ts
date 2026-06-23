export type UserRole =
  | 'Admin'
  | 'RO Engineer'
  | 'PO Engineer'
  | 'RD'
  | 'ARD'
  | 'PDMU Chief'
  | 'PD'
  | 'CD'
  | 'CLGOO'
  | 'MLGOO'
  | 'PEO'
  | 'Viewer'
  | 'Engineer'
  | string

export type UserProfile = {
  id: string
  full_name: string | null
  email: string | null
  role: UserRole | null
  approved: boolean | null
  created_at?: string | null
  aor_level?: string | null
  province?: string | null
  huc?: string | null
  city?: string | null
  municipality?: string | null
  is_active?: boolean | null
}
