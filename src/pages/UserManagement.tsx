import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import '../styles/userManagement.css'

type ManagedUser = {
  id: string
  email: string
  name: string
  role: string
  status: string
  created_at: string | null
}

type Notice = {
  type: 'success' | 'error' | 'info'
  message: string
} | null

function formatDate(value: string | null) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function normalizeRole(role: string) {
  const cleanRole = String(role || 'viewer').trim().toLowerCase()

  if (cleanRole === 'admin') return 'Admin'
  if (cleanRole === 'engineer') return 'Engineer'
  if (cleanRole === 'viewer') return 'Viewer'

  return cleanRole
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getRoleClass(role: string) {
  const cleanRole = String(role || '').trim().toLowerCase()

  if (cleanRole === 'admin') return 'um-role-admin'
  if (cleanRole === 'engineer') return 'um-role-engineer'
  if (cleanRole === 'viewer') return 'um-role-viewer'

  return 'um-role-default'
}

function getInitials(user: ManagedUser) {
  const source = user.name || user.email || 'User'

  const parts = source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)

  if (parts.length === 0) return 'U'

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function generateStrongPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const numbers = '23456789'
  const symbols = '!@#$%&*?'
  const all = upper + lower + numbers + symbols

  const pick = (characters: string) => {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return characters[values[0] % characters.length]
  }

  const password = [pick(upper), pick(lower), pick(numbers), pick(symbols)]

  while (password.length < 14) {
    password.push(pick(all))
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)

    const swapIndex = values[0] % (index + 1)
    const temp = password[index]
    password[index] = password[swapIndex]
    password[swapIndex] = temp
  }

  return password.join('')
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('Request timed out. Please check the Edge Function logs.'))
      }, milliseconds)
    }),
  ])
}

export default function UserManagement() {
  const auth = useAuth() as any
  const navigate = useNavigate()

  const isAdmin =
    typeof auth?.isAdmin === 'function' ? Boolean(auth.isAdmin()) : Boolean(auth?.isAdmin)

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const selectedUser = useMemo(() => {
    return users.find((user) => user.id === selectedUserId) || null
  }, [users, selectedUserId])

  const filteredUsers = useMemo(() => {
    const cleanSearch = searchTerm.trim().toLowerCase()
    const cleanRoleFilter = roleFilter.trim().toLowerCase()

    return users.filter((user) => {
      const role = String(user.role || '').trim().toLowerCase()

      const matchesRole = cleanRoleFilter === 'all' || role === cleanRoleFilter

      const matchesSearch =
        cleanSearch.length === 0 ||
        user.name.toLowerCase().includes(cleanSearch) ||
        user.email.toLowerCase().includes(cleanSearch) ||
        normalizeRole(user.role).toLowerCase().includes(cleanSearch)

      return matchesRole && matchesSearch
    })
  }, [users, searchTerm, roleFilter])

  const passwordChecks = useMemo(() => {
    return [
      {
        label: 'At least 8 characters',
        passed: newPassword.length >= 8,
      },
      {
        label: 'Has uppercase letter',
        passed: /[A-Z]/.test(newPassword),
      },
      {
        label: 'Has lowercase letter',
        passed: /[a-z]/.test(newPassword),
      },
      {
        label: 'Has number',
        passed: /[0-9]/.test(newPassword),
      },
      {
        label: 'Has symbol',
        passed: /[^A-Za-z0-9]/.test(newPassword),
      },
      {
        label: 'Passwords match',
        passed: newPassword.length > 0 && newPassword === confirmPassword,
      },
    ]
  }, [newPassword, confirmPassword])

  const passwordStrength = useMemo(() => {
    return passwordChecks.filter((check) => check.passed).length
  }, [passwordChecks])

  const passwordIsValid = passwordChecks.every((check) => check.passed)

  const roleCounts = useMemo(() => {
    return users.reduce(
      (counts, user) => {
        const role = String(user.role || 'viewer').trim().toLowerCase()

        if (role === 'admin') counts.admin += 1
        else if (role === 'engineer') counts.engineer += 1
        else if (role === 'viewer') counts.viewer += 1
        else counts.other += 1

        return counts
      },
      {
        admin: 0,
        engineer: 0,
        viewer: 0,
        other: 0,
      },
    )
  }, [users])

  useEffect(() => {
    if (!isAdmin) {
      navigate('/unauthorized', { replace: true })
      return
    }

    loadUsers()
  }, [isAdmin, navigate])

  async function loadUsers() {
    try {
      setLoading(true)
      setNotice(null)

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, approved, created_at')
        .order('full_name', { ascending: true })

      if (error) {
        throw new Error(error.message || 'Unable to load user profiles.')
      }

      const loadedUsers: ManagedUser[] = Array.isArray(data)
        ? data.map((profile: any) => ({
            id: String(profile.id || ''),
            email: String(profile.email || 'No email'),
            name: String(profile.full_name || profile.email || 'Unnamed User'),
            role: String(profile.role || 'viewer').toLowerCase(),
            status: profile.approved === false ? 'Not Approved' : 'Active',
            created_at: profile.created_at || null,
          }))
        : []

      const sortedUsers = loadedUsers
        .filter((user) => user.id)
        .sort((first, second) => {
          const firstName = first.name || first.email
          const secondName = second.name || second.email
          return firstName.localeCompare(secondName)
        })

      setUsers(sortedUsers)

      if (selectedUserId && !sortedUsers.some((user) => user.id === selectedUserId)) {
        setSelectedUserId('')
      }
    } catch (error: any) {
      setNotice({
        type: 'error',
        message:
          error?.message ||
          'Unable to load user accounts. Please check the profiles table policy.',
      })
    } finally {
      setLoading(false)
    }
  }

  function handleSelectUser(userId: string) {
    setSelectedUserId(userId)
    setNewPassword('')
    setConfirmPassword('')
    setNotice(null)
  }

  function handleGeneratePassword() {
    const password = generateStrongPassword()

    setNewPassword(password)
    setConfirmPassword(password)
    setShowPassword(true)
    setNotice({
      type: 'info',
      message: 'A strong password was generated. Copy it before saving.',
    })
  }

  async function handleCopyPassword() {
    if (!newPassword) {
      setNotice({
        type: 'error',
        message: 'There is no password to copy.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(newPassword)

      setNotice({
        type: 'success',
        message: 'Password copied to clipboard.',
      })
    } catch {
      setNotice({
        type: 'error',
        message: 'Unable to copy password. Please copy it manually.',
      })
    }
  }

  function handleClearPassword() {
    setNewPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setNotice(null)
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedUser) {
      setNotice({
        type: 'error',
        message: 'Please select a user account first.',
      })
      return
    }

    if (!passwordIsValid) {
      setNotice({
        type: 'error',
        message: 'Please complete all password requirements before saving.',
      })
      return
    }

    try {
      setSaving(true)
      setNotice(null)

      const { data, error } = await withTimeout(
        supabase.functions.invoke('admin-change-password', {
          body: {
            action: 'change-password',
            userId: selectedUser.id,
            newPassword,
          },
        }),
        20000,
      )

      if (error) {
        throw new Error(error.message || 'Unable to change password.')
      }

      if (!data?.ok) {
        throw new Error(data?.message || 'Unable to change password.')
      }

      setNotice({
        type: 'success',
        message: `Password changed successfully for ${selectedUser.name || selectedUser.email}.`,
      })

      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    } catch (error: any) {
      setNotice({
        type: 'error',
        message:
          error?.message ||
          'Unable to change password. Please check the Edge Function logs.',
      })
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return null
  }

  return (
    <main className="um-page">
      <section className="um-hero">
        <div>
          <p className="um-kicker">Admin Console</p>
          <h1>User Management</h1>
          <p>
            Manage user account access by changing passwords only. Names, roles, emails,
            and other account details are locked on this page.
          </p>
        </div>

        <div className="um-hero-actions">
          <button type="button" className="um-secondary-button" onClick={loadUsers}>
            Refresh Users
          </button>

          <Link to="/dashboard" className="um-primary-link">
            Back to Dashboard
          </Link>
        </div>
      </section>

      {notice && (
        <section className={`um-notice um-notice-${notice.type}`}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
            ×
          </button>
        </section>
      )}

      <section className="um-summary-grid">
        <article className="um-summary-card">
          <span>Total Users</span>
          <strong>{users.length}</strong>
          <small>All profile accounts</small>
        </article>

        <article className="um-summary-card">
          <span>Admins</span>
          <strong>{roleCounts.admin}</strong>
          <small>Full access</small>
        </article>

        <article className="um-summary-card">
          <span>Engineers</span>
          <strong>{roleCounts.engineer}</strong>
          <small>Field access</small>
        </article>

        <article className="um-summary-card">
          <span>Viewers</span>
          <strong>{roleCounts.viewer}</strong>
          <small>Read-only access</small>
        </article>
      </section>

      <section className="um-workspace">
        <article className="um-card um-users-card">
          <div className="um-card-header">
            <div>
              <h2>User Accounts</h2>
              <p>Select one account to update its login password.</p>
            </div>
          </div>

          <div className="um-filter-grid">
            <label>
              <span>Search</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, email, or role"
              />
            </label>

            <label>
              <span>Role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">All roles</option>
                <option value="admin">Admin</option>
                <option value="engineer">Engineer</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="um-loading-state">
              <div className="um-loader" />
              <p>Loading user accounts...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="um-empty-state">
              <strong>No users found</strong>
              <p>Try clearing the search or check the profiles table.</p>
            </div>
          ) : (
            <div className="um-user-list">
              {filteredUsers.map((user) => {
                const selected = user.id === selectedUserId

                return (
                  <button
                    type="button"
                    key={user.id}
                    className={`um-user-row ${selected ? 'um-user-row-active' : ''}`}
                    onClick={() => handleSelectUser(user.id)}
                  >
                    <span className="um-avatar">{getInitials(user)}</span>

                    <span className="um-user-main">
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </span>

                    <span className={`um-role-pill ${getRoleClass(user.role)}`}>
                      {normalizeRole(user.role)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </article>

        <article className="um-card um-password-card">
          <div className="um-card-header">
            <div>
              <h2>Change Password</h2>
              <p>Only the selected user’s password will be updated.</p>
            </div>
          </div>

          {selectedUser ? (
            <>
              <div className="um-selected-user">
                <div className="um-avatar um-avatar-large">{getInitials(selectedUser)}</div>

                <div>
                  <strong>{selectedUser.name}</strong>
                  <span>{selectedUser.email}</span>

                  <div className="um-selected-meta">
                    <span className={`um-role-pill ${getRoleClass(selectedUser.role)}`}>
                      {normalizeRole(selectedUser.role)}
                    </span>
                    <small>{selectedUser.status}</small>
                  </div>
                </div>
              </div>

              <div className="um-account-details">
                <div>
                  <span>Created</span>
                  <strong>{formatDate(selectedUser.created_at)}</strong>
                </div>

                <div>
                  <span>Password Action</span>
                  <strong>Admin reset only</strong>
                </div>
              </div>

              <form className="um-password-form" onSubmit={handleChangePassword}>
                <label>
                  <span>New Password</span>

                  <div className="um-password-input">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="um-text-button"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label>
                  <span>Confirm Password</span>

                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                </label>

                <div className="um-password-tools">
                  <button type="button" className="um-secondary-button" onClick={handleGeneratePassword}>
                    Generate Strong Password
                  </button>

                  <button type="button" className="um-secondary-button" onClick={handleCopyPassword}>
                    Copy Password
                  </button>

                  <button type="button" className="um-light-button" onClick={handleClearPassword}>
                    Clear
                  </button>
                </div>

                <div className="um-password-strength">
                  <div className="um-strength-bar">
                    <span style={{ width: `${(passwordStrength / passwordChecks.length) * 100}%` }} />
                  </div>

                  <ul>
                    {passwordChecks.map((check) => (
                      <li key={check.label} className={check.passed ? 'um-check-passed' : ''}>
                        <span>{check.passed ? '✓' : '•'}</span>
                        {check.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="um-form-actions">
                  <button
                    type="submit"
                    className="um-danger-button"
                    disabled={saving || !passwordIsValid}
                  >
                    {saving ? 'Changing Password...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="um-empty-state um-select-empty">
              <strong>Select a user account</strong>
              <p>Choose a user from the list to enable password update.</p>
            </div>
          )}
        </article>
      </section>
    </main>
  )
}