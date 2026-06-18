import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import '../styles/auth.css'

type LoginState = 'idle' | 'loading' | 'success'

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  approved: boolean | null
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase()
}

function getFriendlyLoginError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'Invalid email or password. Please check your login details and try again.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Your email is not yet confirmed. Please check your email inbox before logging in.'
  }

  if (normalized.includes('network')) {
    return 'Network error. Please check your internet connection and try again.'
  }

  return message || 'Login failed. Please try again.'
}

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loginState, setLoginState] = useState<LoginState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const isLoading = loginState === 'loading'

  const canSubmit = useMemo(() => {
    return cleanEmail(email).length > 0 && password.length > 0 && !isLoading
  }, [email, password, isLoading])

  useEffect(() => {
    const savedEmail = localStorage.getItem('pdmu_login_email')

    if (savedEmail) {
      setEmail(savedEmail)
      setRememberEmail(true)
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmail = cleanEmail(email)

    if (!normalizedEmail || !password) {
      setErrorMessage('Please enter your email and password.')
      return
    }

    try {
      setLoginState('loading')
      setErrorMessage('')

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (authError) {
        throw authError
      }

      const userId = authData.user?.id

      if (!userId) {
        throw new Error('Unable to confirm your user account. Please try again.')
      }

      if (rememberEmail) {
        localStorage.setItem('pdmu_login_email', normalizedEmail)
      } else {
        localStorage.removeItem('pdmu_login_email')
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, approved')
        .eq('id', userId)
        .single()

      if (profileError) {
        console.error(profileError)
        navigate('/pending-approval', { replace: true })
        return
      }

      const profile = profileData as ProfileRow | null

      if (!profile || profile.approved !== true) {
        navigate('/pending-approval', { replace: true })
        return
      }

      const role = String(profile.role || '').toLowerCase()

      if (!['admin', 'engineer', 'viewer'].includes(role)) {
        navigate('/unauthorized', { replace: true })
        return
      }

      setLoginState('success')
      navigate('/', { replace: true })
    } catch (error) {
      console.error(error)

      const message =
        error instanceof Error
          ? getFriendlyLoginError(error.message)
          : 'Login failed. Please try again.'

      setErrorMessage(message)
      setLoginState('idle')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-brand-panel">
          <div className="auth-brand-main">
            <div className="auth-brand-copy">
              <div className="auth-logo-row auth-logo-row-large">
                <img src="/dilg-logo.png" alt="DILG Logo" />
                <img src="/bagong-pilipinas-logo.png" alt="Bagong Pilipinas Logo" />
              </div>

              <p className="auth-eyebrow">DILG Region X</p>

              <h1>PDMU Project Monitoring System</h1>

              <p>
                Secure access portal for project monitoring, field inspection updates,
                GIS mapping, reports, and offline synchronization.
              </p>
            </div>

            <div className="auth-feature-list">
              <div>
                <strong>Field Updates</strong>
                <span>Capture progress, findings, photos, and GPS data.</span>
              </div>

              <div>
                <strong>GIS Monitoring</strong>
                <span>View project locations using validated coordinates.</span>
              </div>

              <div>
                <strong>Offline Ready</strong>
                <span>Save updates during inspections and sync later.</span>
              </div>
            </div>
          </div>

          <p className="auth-brand-credit">
            Creator and Developer: Engr. Jay Vanny Orabao and ChatGPT
          </p>
        </div>

        <div className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-mobile-brand">
              <div className="auth-logo-row compact">
                <img src="/dilg-logo.png" alt="DILG Logo" />
                <img src="/bagong-pilipinas-logo.png" alt="Bagong Pilipinas Logo" />
              </div>

              <p>DILG - PDMU PROJECT MONITORING SYSTEM</p>
            </div>

            <div className="auth-form-header">
              <p className="auth-eyebrow">Account Access</p>
              <h2>Login</h2>
              <p>Sign in using your approved DILG-PDMU project monitoring account.</p>
            </div>

            {errorMessage && (
              <div className="auth-alert error" role="alert">
                {errorMessage}
              </div>
            )}

            {loginState === 'success' && (
              <div className="auth-alert success" role="status">
                Login successful. Redirecting to dashboard...
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label>
                Email Address
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email address"
                  autoComplete="email"
                  disabled={isLoading}
                />
              </label>

              <label>
                Password
                <div className="auth-password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isLoading}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={isLoading}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <div className="auth-options-row">
                <label className="auth-check">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(event) => setRememberEmail(event.target.checked)}
                    disabled={isLoading}
                  />
                  Remember email
                </label>
              </div>

              <button type="submit" className="auth-submit-btn" disabled={!canSubmit}>
                {isLoading ? 'Signing in...' : 'Login'}
              </button>
            </form>

            <div className="auth-divider">
              <span />
              <p>Need access?</p>
              <span />
            </div>

            <div className="auth-footer">
              <p>
                No account yet? <Link to="/register">Register for approval</Link>
              </p>
              <small>Accounts must be approved before accessing the monitoring system.</small>
            </div>

            <p className="auth-mobile-credit">
              Creator and Developer: Engr. Jay Vanny Orabao and ChatGPT
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}