import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import '../styles/userManagement.css'

type UserRole = 'admin' | 'engineer' | 'viewer'

type ManagedUser = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  approved: boolean | null
  created_at?: string | null
}

type StatusFilter = 'all' | 'approved' | 'pending'
type RoleFilter = 'all' | UserRole

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'viewer', label: 'Viewer' },
]

function normalizeRole(role: string | null | undefined): UserRole {
  const value = String(role || '').trim().toLowerCase()

  if (value === 'admin') return 'admin'
  if (value === 'engineer') return 'engineer'
  if (value === 'viewer') return 'viewer'

  return 'viewer'
}

function roleLabel(role: string | null | undefined) {
  const normalized = normalizeRole(role)
  return ROLE_OPTIONS.find((item) => item.value === normalized)?.label || 'Viewer'
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || 'User').trim()

  const words = source
    .replace(/@.*/, '')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }

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

export default function UserManagement() {
  const { user, isAdmin } = useAuth()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const { data, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, approved, created_at')
        .order('created_at', { ascending: false })

      if (usersError) {
        throw usersError
      }

      setUsers(data || [])
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

    try {
      setActionLoading(actionKey)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: nextRole })
        .eq('id', targetUser.id)

      if (updateError) {
        throw updateError
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === targetUser.id ? { ...item, role: nextRole } : item,
        ),
      )

      setSuccess(
        `${targetUser.full_name || targetUser.email || 'User'} is now assigned as ${roleLabel(
          nextRole,
        )}.`,
      )
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

      if (updateError) {
        throw updateError
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === targetUser.id ? { ...item, approved } : item,
        ),
      )

      setSuccess(
        `${targetUser.full_name || targetUser.email || 'User'} has been ${
          approved ? 'approved' : 'revoked'
        }.`,
      )
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

      const { error: functionError } = await supabase.functions.invoke(
        'admin-change-password',
        {
          body: {
            action: 'change-password',
            userId: passwordUser.id,
            newPassword,
          },
        },
      )

      if (functionError) {
        throw functionError
      }

      setSuccess(
        `Password changed for ${passwordUser.full_name || passwordUser.email || 'user'}.`,
      )

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

      const matchesSearch =
        !keyword ||
        String(item.full_name || '').toLowerCase().includes(keyword) ||
        String(item.email || '').toLowerCase().includes(keyword) ||
        roleLabel(role).toLowerCase().includes(keyword)

      const matchesRole = roleFilter === 'all' || role === roleFilter

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'approved' && approved) ||
        (statusFilter === 'pending' && !approved)

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  const summary = useMemo(() => {
    return {
      total: users.length,
      approved: users.filter((item) => item.approved === true).length,
      pending: users.filter((item) => item.approved !== true).length,
      admins: users.filter((item) => normalizeRole(item.role) === 'admin').length,
      engineers: users.filter((item) => normalizeRole(item.role) === 'engineer')
        .length,
      viewers: users.filter((item) => normalizeRole(item.role) === 'viewer')
        .length,
    }
  }, [users])

  if (!isAdmin) {
    return (
      <div className="user-management-page">
        <section className="user-management-hero">
          <div>
            <p className="user-management-eyebrow">Administration</p>
            <h1>User Management</h1>
            <p>
              You do not have permission to manage users. Please login using an
              administrator account.
            </p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="user-management-page">
      <section className="user-management-hero">
        <div>
          <p className="user-management-eyebrow">Administration</p>
          <h1>User Management</h1>
          <p>
            Approve user accounts, assign system roles, and manage access to the
            DILG-PDMU Project Monitoring System.
          </p>
        </div>

        <button
          type="button"
          className="user-management-hero-button"
          onClick={loadUsers}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh Users'}
        </button>
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
          <span>Admins</span>
          <strong>{summary.admins}</strong>
        </article>

        <article className="user-management-summary-card">
          <span>Engineers</span>
          <strong>{summary.engineers}</strong>
        </article>

        <article className="user-management-summary-card">
          <span>Viewers</span>
          <strong>{summary.viewers}</strong>
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
            placeholder="Search name, email, or role"
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
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="all">All Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </section>

      <section className="user-management-list-card">
        <div className="user-management-list-header">
          <div>
            <h2>User Accounts</h2>
            <p>
              Showing {filteredUsers.length} of {users.length} registered user
              accounts.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="user-management-state">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="user-management-state">
            No users matched your current filters.
          </div>
        ) : (
          <>
            <div className="user-management-table-wrap">
              <table className="user-management-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map((item) => {
                    const isCurrentUser = item.id === user?.id
                    const approved = item.approved === true
                    const role = normalizeRole(item.role)

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
                            disabled={
                              isCurrentUser ||
                              actionLoading === `role-${item.id}`
                            }
                            onChange={(event) =>
                              updateUserRole(item, event.target.value as UserRole)
                            }
                          >
                            {ROLE_OPTIONS.map((roleOption) => (
                              <option
                                key={roleOption.value}
                                value={roleOption.value}
                              >
                                {roleOption.label}
                              </option>
                            ))}
                          </select>

                          {isCurrentUser && (
                            <small className="user-management-note">
                              Own role locked
                            </small>
                          )}
                        </td>

                        <td>
                          <span
                            className={`user-management-status ${
                              approved ? 'approved' : 'pending'
                            }`}
                          >
                            {approved ? 'Approved' : 'Pending'}
                          </span>
                        </td>

                        <td>{formatDate(item.created_at)}</td>

                        <td>
                          <div className="user-management-actions">
                            {approved ? (
                              <button
                                type="button"
                                className="user-management-button danger"
                                disabled={
                                  isCurrentUser ||
                                  actionLoading === `revoke-${item.id}`
                                }
                                onClick={() => updateApproval(item, false)}
                              >
                                {actionLoading === `revoke-${item.id}`
                                  ? 'Revoking...'
                                  : 'Revoke'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="user-management-button success"
                                disabled={actionLoading === `approve-${item.id}`}
                                onClick={() => updateApproval(item, true)}
                              >
                                {actionLoading === `approve-${item.id}`
                                  ? 'Approving...'
                                  : 'Approve'}
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
                const role = normalizeRole(item.role)

                return (
                  <article className="user-management-mobile-card" key={item.id}>
                    <div className="user-management-mobile-top">
                      <div className="user-management-person">
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
                          approved ? 'approved' : 'pending'
                        }`}
                      >
                        {approved ? 'Approved' : 'Pending'}
                      </span>
                    </div>

                    <div className="user-management-mobile-grid">
                      <div>
                        <span>Role</span>
                        <select
                          className="user-management-role-select"
                          value={role}
                          disabled={
                            isCurrentUser || actionLoading === `role-${item.id}`
                          }
                          onChange={(event) =>
                            updateUserRole(item, event.target.value as UserRole)
                          }
                        >
                          {ROLE_OPTIONS.map((roleOption) => (
                            <option
                              key={roleOption.value}
                              value={roleOption.value}
                            >
                              {roleOption.label}
                            </option>
                          ))}
                        </select>
                        {isCurrentUser && (
                          <small className="user-management-note">
                            Own role locked
                          </small>
                        )}
                      </div>

                      <div>
                        <span>Created</span>
                        <strong>{formatDate(item.created_at)}</strong>
                      </div>
                    </div>

                    <div className="user-management-mobile-actions">
                      {approved ? (
                        <button
                          type="button"
                          className="user-management-button danger"
                          disabled={
                            isCurrentUser || actionLoading === `revoke-${item.id}`
                          }
                          onClick={() => updateApproval(item, false)}
                        >
                          {actionLoading === `revoke-${item.id}`
                            ? 'Revoking...'
                            : 'Revoke'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="user-management-button success"
                          disabled={actionLoading === `approve-${item.id}`}
                          onClick={() => updateApproval(item, true)}
                        >
                          {actionLoading === `approve-${item.id}`
                            ? 'Approving...'
                            : 'Approve'}
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

      {passwordUser && (
        <div
          className="user-management-modal-backdrop"
          role="presentation"
          onClick={closePasswordModal}
        >
          <div
            className="user-management-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="user-management-modal-header">
              <div>
                <p>Admin Password Reset</p>
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
              <div>
                <label htmlFor="new-password">New Password</label>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Enter new password"
                />
              </div>

              <div>
                <label htmlFor="confirm-password">Confirm Password</label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <label className="user-management-check">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              <span>Show password</span>
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
                disabled={!newPassword}
                onClick={handleCopyPassword}
              >
                {copied ? 'Copied' : 'Copy Password'}
              </button>
            </div>

            <div className="user-management-password-rules">
              Password must have at least 8 characters, uppercase, lowercase,
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
                disabled={actionLoading === `password-${passwordUser.id}`}
                onClick={handleChangePassword}
              >
                {actionLoading === `password-${passwordUser.id}`
                  ? 'Changing...'
                  : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}