import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
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

type ManagedUser = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  approved: boolean | null
  created_at?: string | null
  aor_level?: string | null
  province?: string | null
  huc?: string | null
  city?: string | null
  municipality?: string | null
  is_active?: boolean | null
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

type StatusFilter = 'all' | 'approved' | 'pending' | 'inactive'
type RoleFilter = 'all' | UserRole

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

function getDefaultAorLevel(role: UserRole) {
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
  if (value === 'viewer') return 'Viewer'

  return 'Viewer'
}

function roleLabel(role: string | null | undefined) {
  const normalized = normalizeRole(role)
  return ROLE_OPTIONS.find((item) => item.value === normalized)?.label || normalized
}

function textValue(value: unknown) {
  return String(value ?? '').trim()
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || 'User').trim()
  const words = source.replace(/@.*/, '').split(/\s+/).filter(Boolean)

  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function generateStrongPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const numbers = '23456789'
  const symbols = '!@#$%&*?'
  const all = upper + lower + numbers + symbols

  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ]

  const remaining = Array.from({ length: 8 }, () => {
    return all[Math.floor(Math.random() * all.length)]
  })

  return [...required, ...remaining]
    .sort(() => Math.random() - 0.5)
    .join('')
}

function validatePassword(password: string, confirmPassword: string) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.'
  if (!/[0-9]/.test(password)) return 'Password must include a number.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a symbol.'
  if (password !== confirmPassword) return 'Password confirmation does not match.'
  return ''
}

function getAorSummary(
  user: ManagedUser,
  poAssignments: PoEngineerLguAssignment[],
  roAssignments: RoEngineerProvinceAssignment[],
) {
  const role = normalizeRole(user.role)
  const province = textValue(user.province)
  const huc = textValue(user.huc)
  const city = textValue(user.city)
  const municipality = textValue(user.municipality)

  if (role === 'Admin' || role === 'RD' || role === 'ARD' || role === 'PDMU Chief') {
    return 'Regional'
  }

  if (role === 'RO Engineer') {
    const assigned = roAssignments
      .filter((assignment) => assignment.user_id === user.id && assignment.is_active !== false)
      .map((assignment) => assignment.province)
      .filter(Boolean)

    return assigned.length ? `Province/s: ${assigned.join(', ')}` : 'No province assigned'
  }

  if (role === 'PO Engineer') {
    const assigned = poAssignments
      .filter((assignment) => assignment.user_id === user.id && assignment.is_active !== false)
      .map((assignment) => assignment.municipality)
      .filter(Boolean)

    return assigned.length ? `LGU/s: ${assigned.join(', ')}` : 'No LGU assigned'
  }

  if (huc) return `HUC: ${huc}`
  if (city) return `City: ${city}`
  if (municipality) return `LGU: ${municipality}`
  if (province) return `Province: ${province}`
  return user.aor_level || getDefaultAorLevel(role)
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 4v6h-6" />
    </svg>
  )
}

export default function UserManagement() {
  const { user, isAdmin } = useAuth()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [poAssignments, setPoAssignments] = useState<PoEngineerLguAssignment[]>([])
  const [roAssignments, setRoAssignments] = useState<RoEngineerProvinceAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  const [isUserScrolled, setIsUserScrolled] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return
      ticking = true

      window.requestAnimationFrame(() => {
        const nextScrolled = window.scrollY > 44
        setIsUserScrolled((current) => (current === nextScrolled ? current : nextScrolled))
        ticking = false
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const [usersResult, poResult, roResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, full_name, email, role, approved, created_at, aor_level, province, huc, city, municipality, is_active',
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('po_engineer_lgu_assignments')
          .select('id, user_id, province, municipality, is_active')
          .eq('is_active', true),
        supabase
          .from('ro_engineer_province_assignments')
          .select('id, user_id, province, is_active')
          .eq('is_active', true),
      ])

      if (usersResult.error) throw usersResult.error
      if (poResult.error) throw poResult.error
      if (roResult.error) throw roResult.error

      setUsers((usersResult.data || []) as ManagedUser[])
      setPoAssignments((poResult.data || []) as PoEngineerLguAssignment[])
      setRoAssignments((roResult.data || []) as RoEngineerProvinceAssignment[])
    } catch (err: any) {
      setError(err?.message || 'Unable to load users.')
    } finally {
      setLoading(false)
    }
  }

  function clearNotices() {
    setError('')
    setSuccess('')
  }

  async function updateUserRole(targetUser: ManagedUser, nextRole: UserRole) {
    clearNotices()

    if (!isAdmin) {
      setError('Only admin accounts can change user roles.')
      return
    }

    if (targetUser.id === user?.id) {
      setError('You cannot change your own role while logged in.')
      return
    }

    const previousRole = normalizeRole(targetUser.role)
    if (previousRole === nextRole) return

    const actionKey = `role-${targetUser.id}`
    const nextAorLevel = getDefaultAorLevel(nextRole)

    try {
      setActionLoading(actionKey)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: nextRole, aor_level: nextAorLevel })
        .eq('id', targetUser.id)

      if (updateError) throw updateError

      setUsers((current) =>
        current.map((item) =>
          item.id === targetUser.id ? { ...item, role: nextRole, aor_level: nextAorLevel } : item,
        ),
      )

      setSuccess(`${targetUser.full_name || targetUser.email || 'User'} is now ${nextRole}.`)
    } catch (err: any) {
      setError(err?.message || 'Unable to update user role.')
    } finally {
      setActionLoading(null)
    }
  }

  async function updateApproval(targetUser: ManagedUser, approved: boolean) {
    clearNotices()

    if (!isAdmin) {
      setError('Only admin accounts can update account approval.')
      return
    }

    if (!approved && targetUser.id === user?.id) {
      setError('You cannot revoke your own account.')
      return
    }

    const actionKey = `${approved ? 'approve' : 'revoke'}-${targetUser.id}`

    try {
      setActionLoading(actionKey)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ approved })
        .eq('id', targetUser.id)

      if (updateError) throw updateError

      setUsers((current) =>
        current.map((item) => (item.id === targetUser.id ? { ...item, approved } : item)),
      )

      setSuccess(`${targetUser.full_name || targetUser.email || 'User'} has been ${approved ? 'approved' : 'revoked'}.`)
    } catch (err: any) {
      setError(err?.message || 'Unable to update account status.')
    } finally {
      setActionLoading(null)
    }
  }

  function openPasswordModal(targetUser: ManagedUser) {
    clearNotices()
    setPasswordUser(targetUser)
    setNewPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setCopied(false)
  }

  function closePasswordModal() {
    setPasswordUser(null)
    setNewPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setCopied(false)
  }

  function handleGeneratePassword() {
    const password = generateStrongPassword()
    setNewPassword(password)
    setConfirmPassword(password)
    setCopied(false)
  }

  async function handleCopyPassword() {
    if (!newPassword) return

    try {
      await navigator.clipboard.writeText(newPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
      setError('Unable to copy password. Please copy it manually.')
    }
  }

  async function handleChangePassword() {
    clearNotices()
    if (!passwordUser) return

    const passwordError = validatePassword(newPassword, confirmPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    const actionKey = `password-${passwordUser.id}`

    try {
      setActionLoading(actionKey)

      const { error: functionError } = await supabase.functions.invoke('admin-change-password', {
        body: {
          action: 'change-password',
          userId: passwordUser.id,
          newPassword,
        },
      })

      if (functionError) throw functionError

      setSuccess(`Password changed for ${passwordUser.full_name || passwordUser.email || 'user'}.`)
      closePasswordModal()
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to change password. Please check if the admin-change-password Edge Function is deployed.',
      )
    } finally {
      setActionLoading(null)
    }
  }

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return users.filter((item) => {
      const role = normalizeRole(item.role)
      const approved = item.approved === true
      const active = item.is_active !== false
      const aorText = getAorSummary(item, poAssignments, roAssignments)

      const matchesSearch =
        !keyword ||
        String(item.full_name || '').toLowerCase().includes(keyword) ||
        String(item.email || '').toLowerCase().includes(keyword) ||
        roleLabel(role).toLowerCase().includes(keyword) ||
        aorText.toLowerCase().includes(keyword)

      const matchesRole = roleFilter === 'all' || role === roleFilter

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'approved' && approved && active) ||
        (statusFilter === 'pending' && !approved) ||
        (statusFilter === 'inactive' && !active)

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter, poAssignments, roAssignments])

  const summary = useMemo(() => {
    return {
      total: users.length,
      approved: users.filter((item) => item.approved === true && item.is_active !== false).length,
      pending: users.filter((item) => item.approved !== true).length,
      inactive: users.filter((item) => item.is_active === false).length,
      roEngineers: users.filter((item) => normalizeRole(item.role) === 'RO Engineer').length,
      poEngineers: users.filter((item) => normalizeRole(item.role) === 'PO Engineer').length,
    }
  }, [users])

  const refreshFab = (
    <button
      type="button"
      className="user-management-refresh-fab"
      onClick={loadUsers}
      disabled={loading}
      aria-label="Refresh users"
      title="Refresh users"
    >
      <RefreshIcon />
    </button>
  )

  if (!isAdmin) {
    return (
      <div className={`user-management-page ${isUserScrolled ? 'is-user-scrolled' : ''}`}>
        <section className="user-management-hero">
          <div>
            <p className="user-management-eyebrow">Administration</p>
            <h1>User Management</h1>
            <p>Please login using an administrator account to manage users.</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <>
      <div className={`user-management-page ${isUserScrolled ? 'is-user-scrolled' : ''}`}>
        <section className="user-management-hero">
          <div>
            <p className="user-management-eyebrow">Administration</p>
            <h1>User Management</h1>
            <p>
              Approve accounts, assign roles, and open the Access / AOR page to tag
              users by province, HUC, city, municipality, or LGU.
            </p>
          </div>
        </section>

        <section className="user-management-summary-grid">
          <article className="user-management-summary-card">
            <span>Total Users</span>
            <strong>{summary.total}</strong>
          </article>
          <article className="user-management-summary-card">
            <span>Approved</span>
            <strong>{summary.approved}</strong>
          </article>
          <article className="user-management-summary-card">
            <span>Pending</span>
            <strong>{summary.pending}</strong>
          </article>
          <article className="user-management-summary-card">
            <span>Inactive</span>
            <strong>{summary.inactive}</strong>
          </article>
          <article className="user-management-summary-card">
            <span>RO Engineer</span>
            <strong>{summary.roEngineers}</strong>
          </article>
          <article className="user-management-summary-card">
            <span>PO Engineer</span>
            <strong>{summary.poEngineers}</strong>
          </article>
        </section>

        {error && <div className="user-management-alert error">{error}</div>}
        {success && <div className="user-management-alert success">{success}</div>}

        <section className="user-management-filter-card">
          <div>
            <label htmlFor="user-search">Search Users</label>
            <input
              id="user-search"
              type="search"
              placeholder="Search name, email, role, or AOR"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="role-filter">Role</label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
            >
              <option value="all">All Roles</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="status-filter">Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All Status</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </section>

        <section className="user-management-list-card">
          <div className="user-management-list-header">
            <div>
              <h2>User Accounts</h2>
              <p>Showing {filteredUsers.length} of {users.length} registered user accounts.</p>
            </div>
          </div>

          {loading ? (
            <div className="user-management-state">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="user-management-state">No users matched your current filters.</div>
          ) : (
            <>
              <div className="user-management-table-wrap">
                <table className="user-management-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>AOR</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.map((item) => {
                      const isCurrentUser = item.id === user?.id
                      const approved = item.approved === true
                      const active = item.is_active !== false
                      const role = normalizeRole(item.role)
                      const aorSummary = getAorSummary(item, poAssignments, roAssignments)

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="user-management-person">
                              <div className="user-management-avatar">
                                {getInitials(item.full_name, item.email)}
                              </div>
                              <div>
                                <strong>{item.full_name || 'Unnamed User'}</strong>
                                {isCurrentUser && <span>Current admin account</span>}
                              </div>
                            </div>
                          </td>
                          <td>{item.email || 'No email'}</td>
                          <td>
                            <select
                              className="user-management-role-select"
                              value={role}
                              disabled={isCurrentUser || actionLoading === `role-${item.id}`}
                              onChange={(event) =>
                                updateUserRole(item, event.target.value as UserRole)
                              }
                            >
                              {ROLE_OPTIONS.map((roleOption) => (
                                <option key={roleOption.value} value={roleOption.value}>
                                  {roleOption.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>{aorSummary}</td>
                          <td>
                            <span
                              className={`user-management-status ${
                                approved && active ? 'approved' : 'pending'
                              }`}
                            >
                              {approved && active ? 'Approved' : active ? 'Pending' : 'Inactive'}
                            </span>
                          </td>
                          <td>{formatDate(item.created_at)}</td>
                          <td>
                            <div className="user-management-actions">
                              <Link
                                className="user-management-button secondary user-management-access-open-btn user-management-button-link"
                                to={`/users/${item.id}/access`}
                              >
                                Access / AOR
                              </Link>

                              {approved ? (
                                <button
                                  type="button"
                                  className="user-management-button danger"
                                  disabled={isCurrentUser || actionLoading === `revoke-${item.id}`}
                                  onClick={() => updateApproval(item, false)}
                                >
                                  Revoke
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="user-management-button success"
                                  disabled={actionLoading === `approve-${item.id}`}
                                  onClick={() => updateApproval(item, true)}
                                >
                                  Approve
                                </button>
                              )}

                              <button
                                type="button"
                                className="user-management-button primary"
                                onClick={() => openPasswordModal(item)}
                              >
                                Change Password
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="user-management-mobile-list">
                {filteredUsers.map((item) => {
                  const isCurrentUser = item.id === user?.id
                  const approved = item.approved === true
                  const active = item.is_active !== false
                  const role = normalizeRole(item.role)
                  const aorSummary = getAorSummary(item, poAssignments, roAssignments)

                  return (
                    <article key={item.id} className="user-management-mobile-card">
                      <div className="user-management-mobile-topline">
                        <div className="user-management-avatar">
                          {getInitials(item.full_name, item.email)}
                        </div>
                        <div>
                          <strong>{item.full_name || 'Unnamed User'}</strong>
                          <span>{item.email || 'No email'}</span>
                        </div>
                      </div>

                      <span
                        className={`user-management-status ${
                          approved && active ? 'approved' : 'pending'
                        }`}
                      >
                        {approved && active ? 'Approved' : active ? 'Pending' : 'Inactive'}
                      </span>

                      <label>
                        <span>Role</span>
                        <select
                          className="user-management-role-select"
                          value={role}
                          disabled={isCurrentUser || actionLoading === `role-${item.id}`}
                          onChange={(event) => updateUserRole(item, event.target.value as UserRole)}
                        >
                          {ROLE_OPTIONS.map((roleOption) => (
                            <option key={roleOption.value} value={roleOption.value}>
                              {roleOption.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="user-management-mobile-meta">
                        <span>AOR</span>
                        <strong>{aorSummary}</strong>
                      </div>

                      <div className="user-management-mobile-meta">
                        <span>Created</span>
                        <strong>{formatDate(item.created_at)}</strong>
                      </div>

                      <div className="user-management-mobile-actions">
                        <Link
                          className="user-management-button secondary user-management-access-open-btn user-management-button-link"
                          to={`/users/${item.id}/access`}
                        >
                          Access / AOR
                        </Link>

                        {approved ? (
                          <button
                            type="button"
                            className="user-management-button danger"
                            disabled={isCurrentUser || actionLoading === `revoke-${item.id}`}
                            onClick={() => updateApproval(item, false)}
                          >
                            Revoke
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="user-management-button success"
                            disabled={actionLoading === `approve-${item.id}`}
                            onClick={() => updateApproval(item, true)}
                          >
                            Approve
                          </button>
                        )}

                        <button
                          type="button"
                          className="user-management-button primary"
                          onClick={() => openPasswordModal(item)}
                        >
                          Change Password
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {portalReady ? createPortal(refreshFab, document.body) : refreshFab}

      {passwordUser &&
        createPortal(
          <div className="user-management-modal-backdrop" role="presentation">
            <div
              className="user-management-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="password-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="user-management-modal-header">
                <div>
                  <p>Admin Password Tool</p>
                  <h2 id="password-modal-title">Change Password</h2>
                </div>
                <button
                  type="button"
                  className="user-management-modal-close"
                  onClick={closePasswordModal}
                  aria-label="Close password modal"
                >
                  ×
                </button>
              </div>

              <div className="user-management-password-user">
                <div className="user-management-avatar">
                  {getInitials(passwordUser.full_name, passwordUser.email)}
                </div>
                <div>
                  <strong>{passwordUser.full_name || 'Unnamed User'}</strong>
                  <span>{passwordUser.email || 'No email'}</span>
                </div>
              </div>

              <div className="user-management-password-grid">
                <label>
                  <span>New Password</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter new password"
                  />
                </label>

                <label>
                  <span>Confirm Password</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm password"
                  />
                </label>
              </div>

              <label className="user-management-check">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => setShowPassword(event.target.checked)}
                />
                Show password
              </label>

              <div className="user-management-password-tools">
                <button
                  type="button"
                  className="user-management-button secondary"
                  onClick={handleGeneratePassword}
                >
                  Generate Strong Password
                </button>
                <button
                  type="button"
                  className="user-management-button secondary"
                  onClick={handleCopyPassword}
                  disabled={!newPassword}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="user-management-password-rules">
                Password must contain at least 8 characters, uppercase, lowercase,
                number, and symbol.
              </div>

              <div className="user-management-modal-actions">
                <button
                  type="button"
                  className="user-management-button secondary"
                  onClick={closePasswordModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="user-management-button primary"
                  onClick={handleChangePassword}
                  disabled={actionLoading === `password-${passwordUser.id}`}
                >
                  Save Password
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
