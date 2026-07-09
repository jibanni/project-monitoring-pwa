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
  is_active?: boolean | null
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

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
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
        .select('id, full_name, email, role, approved, is_active')
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

      if (profile.is_active === false) {
        navigate('/unauthorized', { replace: true })
        return
      }

      setLoginState('success')

      // After successful login, always start from Dashboard.
      // Role/page restrictions are handled by ProtectedRoute and the AOR guards.
      navigate('/dashboard', { replace: true })
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
        <aside className="auth-brand-panel">
          <div className="auth-brand-inner">
            <div className="auth-logo-row">
              <img src="/dilg-logo.png" alt="DILG Logo" />
              <img src="/bagong-pilipinas-logo.png" alt="Bagong Pilipinas Logo" />
            </div>

            <p className="auth-eyebrow">DILG Region X</p>

            <h1>PDMU Project Monitoring System</h1>

            <p>
              Project monitoring, field updates, GIS mapping, reports, and offline
              synchronization in one secure platform.
            </p>
          </div>

          <p className="auth-brand-credit">
            Creator and Developer: Engr. Jay Vanny Orabao and ChatGPT
          </p>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-form-header">
              <h2>Login</h2>
              <p>Use your approved DILG-PDMU account.</p>
            </div>

            {errorMessage && (
              <div className="auth-alert error" role="alert">
                {errorMessage}
              </div>
            )}

            {loginState === 'success' && (
              <div className="auth-alert success" role="status">
                Login successful. Redirecting...
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label>
                <span>Email Address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                  disabled={isLoading}
                />
              </label>

              <label>
                <span>Password</span>
                <div className="auth-password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
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

              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(event) => setRememberEmail(event.target.checked)}
                  disabled={isLoading}
                />
                <span>Remember email</span>
              </label>

              <button type="submit" className="auth-submit-btn" disabled={!canSubmit}>
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="auth-register-box">
              <p>
                No account yet? <Link to="/register">Register for approval</Link>
              </p>
            </div>

            <p className="auth-footnote">
              Accounts must be approved before accessing the system.
            </p>
          </div>
        </section>
      </section>
    </main>
  )
}