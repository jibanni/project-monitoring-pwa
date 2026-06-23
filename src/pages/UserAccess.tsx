import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  REGION10_HUCS,
  REGION10_PROVINCE_NAMES,
  getRegion10ComponentCitiesByProvince,
  getRegion10LgusByProvince,
  normalizeLocationText,
} from '../data/region10Directory'
import '../styles/userManagement.css'
import '../styles/pageHero.css'

type UserRole =
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

type AorLevel =
  | 'Regional'
  | 'Province'
  | 'HUC'
  | 'City'
  | 'Municipality'
  | 'Assigned LGU'
  | 'Assigned AOR'

type ManagedUser = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  approved: boolean | null
  aor_level?: string | null
  province?: string | null
  huc?: string | null
  city?: string | null
  municipality?: string | null
  is_active?: boolean | null
}

type ProjectLocation = {
  province: string
  municipality: string
}

type PoEngineerLguAssignment = {
  id: string
  user_id: string
  province: string
  municipality: string
  is_active: boolean | null
}

type RoEngineerProvinceAssignment = {
  id: string
  user_id: string
  province: string
  is_active: boolean | null
}

type AccessForm = {
  role: UserRole
  aor_level: AorLevel
  province: string
  huc: string
  city: string
  municipality: string
  is_active: boolean
  poAssignedLgus: string[]
  roAssignedProvinces: string[]
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'Admin', label: 'Admin' },
  { value: 'RO Engineer', label: 'RO Engineer' },
  { value: 'PO Engineer', label: 'PO Engineer' },
  { value: 'RD', label: 'RD' },
  { value: 'ARD', label: 'ARD' },
  { value: 'PDMU Chief', label: 'PDMU Chief' },
  { value: 'PD', label: 'PD' },
  { value: 'CD', label: 'CD' },
  { value: 'CLGOO', label: 'CLGOO' },
  { value: 'MLGOO', label: 'MLGOO' },
  { value: 'PEO', label: 'PEO' },
  { value: 'Viewer', label: 'Viewer' },
]

const AOR_OPTIONS: { value: AorLevel; label: string }[] = [
  { value: 'Regional', label: 'Regional' },
  { value: 'Province', label: 'Province' },
  { value: 'HUC', label: 'HUC' },
  { value: 'City', label: 'City' },
  { value: 'Municipality', label: 'Municipality / LGU' },
  { value: 'Assigned LGU', label: 'Assigned LGU/s' },
  { value: 'Assigned AOR', label: 'Assigned AOR' },
]

function normalizeRole(role: string | null | undefined): UserRole {
  const value = String(role || '').trim().toLowerCase()

  if (value === 'admin') return 'Admin'
  if (value === 'ro engineer' || value === 'ro engineers') return 'RO Engineer'
  if (value === 'engineer' || value === 'po engineer' || value === 'po engineers') {
    return 'PO Engineer'
  }
  if (value === 'rd' || value === 'regional director') return 'RD'
  if (value === 'ard' || value === 'assistant regional director') return 'ARD'
  if (value === 'pdmu chief' || value === 'pdmu chief/head' || value === 'pdmu head') {
    return 'PDMU Chief'
  }
  if (value === 'pd' || value === 'provincial director') return 'PD'
  if (value === 'cd' || value === 'city director') return 'CD'
  if (value === 'clgoo') return 'CLGOO'
  if (value === 'mlgoo') return 'MLGOO'
  if (value === 'peo' || value === 'project evaluation officer') return 'PEO'
  return 'Viewer'
}

function getDefaultAorLevel(role: UserRole): AorLevel {
  if (role === 'Admin' || role === 'RD' || role === 'ARD' || role === 'PDMU Chief') {
    return 'Regional'
  }
  if (role === 'RO Engineer' || role === 'PD' || role === 'PEO') return 'Province'
  if (role === 'CD') return 'HUC'
  if (role === 'CLGOO') return 'City'
  if (role === 'MLGOO') return 'Municipality'
  if (role === 'PO Engineer') return 'Assigned LGU'
  return 'Assigned AOR'
}

function normalizeAorLevel(value: string | null | undefined, role: UserRole): AorLevel {
  const current = String(value || '').trim().toLowerCase()
  const option = AOR_OPTIONS.find((item) => item.value.toLowerCase() === current)
  return option?.value || getDefaultAorLevel(role)
}

function getAorLevelLabel(value: AorLevel) {
  return AOR_OPTIONS.find((item) => item.value === value)?.label || value
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || 'User').trim()
  const words = source.replace(/@.*/, '').split(/\s+/).filter(Boolean)

  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map(normalizeLocationText).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  )
}

function mergeLgus(directoryLgus: string[], projectLocations: ProjectLocation[], province: string) {
  return uniqueSorted([
    ...directoryLgus,
    ...projectLocations
      .filter((item) => normalizeLocationText(item.province) === normalizeLocationText(province))
      .map((item) => item.municipality),
  ])
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}

export default function UserAccess() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin, refreshProfile } = useAuth()

  const [targetUser, setTargetUser] = useState<ManagedUser | null>(null)
  const [projectLocations, setProjectLocations] = useState<ProjectLocation[]>([])
  const [form, setForm] = useState<AccessForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isAccessScrolled, setIsAccessScrolled] = useState(false)

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      window.requestAnimationFrame(() => {
        const nextScrolled = window.scrollY > 52
        setIsAccessScrolled((current) =>
          current === nextScrolled ? current : nextScrolled,
        )
        ticking = false
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    loadAccessData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function loadAccessData() {
    if (!userId) return

    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const [userResult, locationsResult, poResult, roResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, full_name, email, role, approved, aor_level, province, huc, city, municipality, is_active',
          )
          .eq('id', userId)
          .single(),
        supabase
          .from('projects')
          .select('province, municipality')
          .not('province', 'is', null)
          .not('municipality', 'is', null),
        supabase
          .from('po_engineer_lgu_assignments')
          .select('id, user_id, province, municipality, is_active')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('ro_engineer_province_assignments')
          .select('id, user_id, province, is_active')
          .eq('user_id', userId)
          .eq('is_active', true),
      ])

      if (userResult.error) throw userResult.error
      if (locationsResult.error) throw locationsResult.error
      if (poResult.error) throw poResult.error
      if (roResult.error) throw roResult.error

      const userRecord = userResult.data as ManagedUser
      const role = normalizeRole(userRecord.role)
      const aorLevel = normalizeAorLevel(userRecord.aor_level, role)
      const poAssignments = (poResult.data || []) as PoEngineerLguAssignment[]
      const roAssignments = (roResult.data || []) as RoEngineerProvinceAssignment[]

      const uniqueLocations = new Map<string, ProjectLocation>()
      for (const row of locationsResult.data || []) {
        const province = normalizeLocationText(row.province)
        const municipality = normalizeLocationText(row.municipality)
        if (!province || !municipality) continue
        uniqueLocations.set(`${province}|||${municipality}`, { province, municipality })
      }

      setTargetUser(userRecord)
      setProjectLocations(Array.from(uniqueLocations.values()))
      setForm({
        role,
        aor_level: aorLevel,
        province: normalizeLocationText(userRecord.province),
        huc: normalizeLocationText(userRecord.huc),
        city: normalizeLocationText(userRecord.city),
        municipality: normalizeLocationText(userRecord.municipality),
        is_active: userRecord.is_active !== false,
        poAssignedLgus: poAssignments.map((assignment) => assignment.municipality).sort(),
        roAssignedProvinces: roAssignments.map((assignment) => assignment.province).sort(),
      })
    } catch (err: any) {
      setError(err?.message || 'Unable to load user access settings.')
    } finally {
      setLoading(false)
    }
  }

  function updateForm<K extends keyof AccessForm>(key: K, value: AccessForm[K]) {
    setForm((current) => {
      if (!current) return current

      const next = { ...current, [key]: value }

      if (key === 'role') {
        const nextRole = value as UserRole
        next.aor_level = getDefaultAorLevel(nextRole)
        next.huc = ''
        next.city = ''
        next.municipality = ''

        if (nextRole === 'Admin' || nextRole === 'RD' || nextRole === 'ARD' || nextRole === 'PDMU Chief') {
          next.province = ''
        }

        if (nextRole !== 'RO Engineer') next.roAssignedProvinces = []
        if (nextRole !== 'PO Engineer') next.poAssignedLgus = []
      }

      if (key === 'province') {
        next.city = ''
        next.municipality = ''
        next.poAssignedLgus = []
      }

      return next
    })
  }

  function togglePoLgu(lgu: string) {
    setForm((current) => {
      if (!current) return current
      const exists = current.poAssignedLgus.includes(lgu)
      return {
        ...current,
        poAssignedLgus: exists
          ? current.poAssignedLgus.filter((item) => item !== lgu)
          : [...current.poAssignedLgus, lgu].sort(),
      }
    })
  }

  function toggleRoProvince(province: string) {
    setForm((current) => {
      if (!current) return current
      const exists = current.roAssignedProvinces.includes(province)
      return {
        ...current,
        roAssignedProvinces: exists
          ? current.roAssignedProvinces.filter((item) => item !== province)
          : [...current.roAssignedProvinces, province].sort(),
      }
    })
  }

  async function saveAccessSettings() {
    setError('')
    setSuccess('')

    if (!targetUser || !form || !userId) return

    if (!isAdmin) {
      setError('Only admin accounts can update access settings.')
      return
    }

    if (targetUser.id === user?.id) {
      if (form.role !== 'Admin' || form.is_active !== true) {
        setError('You cannot remove your own Admin access or deactivate your own account.')
        return
      }
    }

    if ((form.role === 'PD' || form.role === 'PEO') && !form.province) {
      setError('Please select a province.')
      return
    }

    if (form.role === 'CD' && !form.huc) {
      setError('Please select an HUC.')
      return
    }

    if (form.role === 'CLGOO' && (!form.province || !form.city)) {
      setError('Please select both province and component city.')
      return
    }

    if (form.role === 'MLGOO' && (!form.province || !form.municipality)) {
      setError('Please select both province and LGU for the MLGOO.')
      return
    }

    if (form.role === 'PO Engineer' && (!form.province || form.poAssignedLgus.length === 0)) {
      setError('Please select province and at least one assigned LGU for the PO Engineer.')
      return
    }

    if (form.role === 'RO Engineer' && form.roAssignedProvinces.length === 0) {
      setError('Please select at least one assigned province for the RO Engineer.')
      return
    }

    try {
      setSaving(true)

      const profileUpdate = {
        role: form.role,
        aor_level: form.aor_level,
        province: form.province || null,
        huc: form.huc || null,
        city: form.city || null,
        municipality: form.municipality || null,
        is_active: form.is_active,
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)

      if (profileError) throw profileError

      const { error: deletePoError } = await supabase
        .from('po_engineer_lgu_assignments')
        .delete()
        .eq('user_id', userId)

      if (deletePoError) throw deletePoError

      const { error: deleteRoError } = await supabase
        .from('ro_engineer_province_assignments')
        .delete()
        .eq('user_id', userId)

      if (deleteRoError) throw deleteRoError

      if (form.role === 'PO Engineer' && form.province) {
        const records = form.poAssignedLgus.map((municipality) => ({
          user_id: userId,
          province: form.province,
          municipality,
          assigned_by: user?.id || null,
          is_active: true,
        }))

        if (records.length > 0) {
          const { error: insertPoError } = await supabase
            .from('po_engineer_lgu_assignments')
            .insert(records)

          if (insertPoError) throw insertPoError
        }
      }

      if (form.role === 'RO Engineer') {
        const records = form.roAssignedProvinces.map((province) => ({
          user_id: userId,
          province,
          assigned_by: user?.id || null,
          is_active: true,
        }))

        if (records.length > 0) {
          const { error: insertRoError } = await supabase
            .from('ro_engineer_province_assignments')
            .insert(records)

          if (insertRoError) throw insertRoError
        }
      }

      setSuccess('Access settings saved successfully.')
      await refreshProfile()
      window.setTimeout(() => navigate('/users'), 650)
    } catch (err: any) {
      setError(err?.message || 'Unable to save access settings.')
    } finally {
      setSaving(false)
    }
  }

  const provinceOptions = useMemo(() => {
    return uniqueSorted([
      ...REGION10_PROVINCE_NAMES,
      ...projectLocations.map((item) => item.province),
    ])
  }, [projectLocations])

  const lguOptions = useMemo(() => {
    if (!form?.province) return []
    return mergeLgus(getRegion10LgusByProvince(form.province), projectLocations, form.province)
  }, [form?.province, projectLocations])

  const componentCityOptions = useMemo(() => {
    if (!form?.province) return []
    return uniqueSorted(getRegion10ComponentCitiesByProvince(form.province))
  }, [form?.province])

  if (loading) {
    return (
      <main className="user-access-page">
        <section className="user-access-card">
          <h1>Loading Access Settings</h1>
          <p>Please wait while the user access record is being prepared.</p>
        </section>
      </main>
    )
  }

  if (!targetUser || !form) {
    return (
      <main className="user-access-page">
        <section className="user-access-card">
          <h1>User not found</h1>
          <p>The selected user account is not available.</p>
          <button type="button" className="user-management-button secondary" onClick={() => navigate('/users')}>
            Back to Users
          </button>
        </section>
      </main>
    )
  }

  const compactHeroTitle = targetUser.full_name || targetUser.email || 'User Access'

  return (
    <main className={`user-access-page ${isAccessScrolled ? 'is-access-scrolled' : ''}`}>
      <button
        type="button"
        className="user-access-back-fab"
        onClick={() => navigate('/users')}
        aria-label="Back to users"
        title="Back to Users"
      >
        <BackIcon />
      </button>

      <section className="user-access-hero">
        <div>
          <p>Access / AOR</p>
          <h1>{isAccessScrolled ? compactHeroTitle : 'Manage User Access'}</h1>
          <span>Assign role, province, HUC, city, municipality, or LGU-based monitoring access.</span>
        </div>
      </section>

      {error && <div className="user-management-alert error">{error}</div>}
      {success && <div className="user-management-alert success">{success}</div>}

      <section className="user-access-card user-access-user-card">
        <div className="user-management-avatar">
          {getInitials(targetUser.full_name, targetUser.email)}
        </div>
        <div>
          <strong>{targetUser.full_name || 'Unnamed User'}</strong>
          <span>{targetUser.email || 'No email address'}</span>
        </div>
      </section>

      <section className="user-access-card">
        <h2>Role and AOR</h2>

        <div className="user-access-grid">
          <label>
            <span>Role</span>
            <select
              value={form.role}
              disabled={targetUser.id === user?.id}
              onChange={(event) => updateForm('role', event.target.value as UserRole)}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <div className="user-access-readonly-field">
            <span>AOR Level</span>
            <strong>{getAorLevelLabel(form.aor_level)}</strong>
            <small>Automatic based on selected role</small>
          </div>

          <label>
            <span>Account Active</span>
            <select
              value={form.is_active ? 'active' : 'inactive'}
              disabled={targetUser.id === user?.id}
              onChange={(event) => updateForm('is_active', event.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
      </section>

      {form.role === 'RO Engineer' && (
        <section className="user-access-card">
          <h2>RO Engineer Province Assignment</h2>
          <p>Select one or more provinces. RO Engineer access will later be filtered to these province/s.</p>

          <div className="user-access-checkbox-grid">
            {provinceOptions.map((province) => (
              <label key={province} className="user-access-check-card">
                <input
                  type="checkbox"
                  checked={form.roAssignedProvinces.includes(province)}
                  onChange={() => toggleRoProvince(province)}
                />
                <span>{province}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {form.role === 'PO Engineer' && (
        <section className="user-access-card">
          <h2>PO Engineer LGU Assignment</h2>
          <p>Assign PO Engineer by LGU, not by project. All projects under selected LGU/s will be covered later.</p>

          <label className="user-access-field">
            <span>Province</span>
            <select value={form.province} onChange={(event) => updateForm('province', event.target.value)}>
              <option value="">Select Province</option>
              {provinceOptions.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </label>

          {form.province ? (
            <div className="user-access-checkbox-grid">
              {lguOptions.map((lgu) => (
                <label key={lgu} className="user-access-check-card">
                  <input
                    type="checkbox"
                    checked={form.poAssignedLgus.includes(lgu)}
                    onChange={() => togglePoLgu(lgu)}
                  />
                  <span>{lgu}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="user-management-state small">Select a province first to show LGU options.</div>
          )}
        </section>
      )}

      {(form.role === 'PD' || form.role === 'PEO') && (
        <section className="user-access-card">
          <h2>Province Assignment</h2>
          <label className="user-access-field">
            <span>Province</span>
            <select value={form.province} onChange={(event) => updateForm('province', event.target.value)}>
              <option value="">Select Province</option>
              {provinceOptions.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {form.role === 'CD' && (
        <section className="user-access-card">
          <h2>HUC Assignment</h2>
          <label className="user-access-field">
            <span>Highly Urbanized City</span>
            <select value={form.huc} onChange={(event) => updateForm('huc', event.target.value)}>
              <option value="">Select HUC</option>
              {REGION10_HUCS.map((huc) => (
                <option key={huc} value={huc}>
                  {huc}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {form.role === 'CLGOO' && (
        <section className="user-access-card">
          <h2>Component City Assignment</h2>
          <p>Select a province first. The city list will show component cities only, not HUCs.</p>

          <div className="user-access-grid user-access-grid-two">
            <label>
              <span>Province</span>
              <select value={form.province} onChange={(event) => updateForm('province', event.target.value)}>
                <option value="">Select Province</option>
                {provinceOptions.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Component City</span>
              <select
                value={form.city}
                onChange={(event) => updateForm('city', event.target.value)}
                disabled={!form.province}
              >
                <option value="">Select Component City</option>
                {componentCityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {form.province && componentCityOptions.length === 0 && (
            <div className="user-management-state small">
              No component city is listed under this province. Choose another province or use MLGOO for municipal/LGU assignment.
            </div>
          )}
        </section>
      )}

      {form.role === 'MLGOO' && (
        <section className="user-access-card">
          <h2>Municipality / LGU Assignment</h2>
          <div className="user-access-grid">
            <label>
              <span>Province</span>
              <select value={form.province} onChange={(event) => updateForm('province', event.target.value)}>
                <option value="">Select Province</option>
                {provinceOptions.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Municipality / LGU</span>
              <select
                value={form.municipality}
                onChange={(event) => updateForm('municipality', event.target.value)}
                disabled={!form.province}
              >
                <option value="">Select LGU</option>
                {lguOptions.map((lgu) => (
                  <option key={lgu} value={lgu}>
                    {lgu}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {(form.role === 'Viewer' || form.role === 'Admin' || form.role === 'RD' || form.role === 'ARD' || form.role === 'PDMU Chief') && (
        <section className="user-access-card">
          <h2>General AOR</h2>
          <p>
            {form.role === 'Admin' || form.role === 'RD' || form.role === 'ARD' || form.role === 'PDMU Chief'
              ? 'This role uses regional access by default.'
              : 'Viewer access can be refined later through the AOR level and location fields.'}
          </p>
        </section>
      )}

      <section className="user-access-actions">
        <button type="button" className="user-management-button secondary" onClick={() => navigate('/users')}>
          Cancel
        </button>
        <button
          type="button"
          className="user-management-button primary"
          onClick={saveAccessSettings}
          disabled={saving}
        >
          {saving ? 'Saving Access...' : 'Save Access'}
        </button>
      </section>
    </main>
  )
}
