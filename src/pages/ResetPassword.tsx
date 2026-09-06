import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import '../styles/auth.css'

type RecoveryState = 'checking' | 'ready' | 'saving' | 'saved' | 'invalid'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking')
  const [errorMessage, setErrorMessage] = useState('')

  const canSubmit = useMemo(
    () => password.length >= 8 && confirmPassword.length >= 8 && recoveryState === 'ready',
    [password, confirmPassword, recoveryState],
  )

  useEffect(() => {
    let mounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) setRecoveryState('ready')
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setRecoveryState(data.session ? 'ready' : 'invalid')
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (password.length < 8) {
      setErrorMessage('Use at least 8 characters for the new password.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setRecoveryState('saving')
    setErrorMessage('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorMessage(error.message || 'Unable to update the password. Request a new reset link and try again.')
      setRecoveryState('ready')
      return
    }

    setPassword('')
    setConfirmPassword('')
    setRecoveryState('saved')
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
            <h1>Set a New PMS10 Password</h1>
            <p>Choose a new password that will be used for your approved PMS10 account.</p>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-form-header">
              <h2>New Password</h2>
              <p>Use at least 8 characters.</p>
            </div>

            {errorMessage && <div className="auth-alert error" role="alert">{errorMessage}</div>}

            {recoveryState === 'checking' && (
              <div className="auth-alert success" role="status">Checking the secure reset link...</div>
            )}

            {recoveryState === 'invalid' && (
              <>
                <div className="auth-alert error" role="alert">
                  This reset link is invalid or has expired. Request a new link to continue.
                </div>
                <Link to="/forgot-password" className="auth-link-button">Request Another Link</Link>
              </>
            )}

            {recoveryState === 'saved' && (
              <>
                <div className="auth-alert success" role="status">Your password has been updated successfully.</div>
                <Link to="/dashboard" className="auth-link-button">Continue to PMS10</Link>
              </>
            )}

            {(recoveryState === 'ready' || recoveryState === 'saving') && (
              <form className="auth-form" onSubmit={handleSubmit}>
                <label>
                  <span>New Password</span>
                  <div className="auth-password-field">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      disabled={recoveryState === 'saving'}
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword((current) => !current)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label>
                  <span>Confirm New Password</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={recoveryState === 'saving'}
                    minLength={8}
                    required
                  />
                </label>

                <button type="submit" className="auth-submit-btn" disabled={!canSubmit}>
                  {recoveryState === 'saving' ? 'Updating Password...' : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
