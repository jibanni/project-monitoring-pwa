import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  clearPasswordRecoveryIntent,
  hasPasswordRecoveryIntent,
  markPasswordRecoveryIntent,
  supabase,
} from '../lib/supabase'
import { clearProtectedNavigationMemory } from '../lib/navigationMemory'
import '../styles/auth.css'

type RecoveryState = 'checking' | 'ready' | 'saving' | 'invalid'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking')
  const [errorMessage, setErrorMessage] = useState('')

  const canSubmit = useMemo(
    () =>
      password.length >= 8 &&
      confirmPassword.length >= 8 &&
      recoveryState === 'ready',
    [password, confirmPassword, recoveryState],
  )

  useEffect(() => {
    let mounted = true

    async function initializeRecovery() {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const recoveryType = params.get('type')

      /*
       * Preferred PMS10 recovery flow:
       * the email opens /reset-password directly with token_hash.
       * PMS10 verifies the recovery OTP itself instead of relying on
       * Supabase to redirect through the application's root route.
       */
      if (tokenHash && recoveryType === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })

        if (!mounted) return

        if (error) {
          clearPasswordRecoveryIntent()
          setErrorMessage(
            error.message ||
              'This password reset link is invalid or has expired.',
          )
          setRecoveryState('invalid')
          return
        }

        // Do not leave the one-time token in browser history after verification.
        window.history.replaceState(
          window.history.state,
          document.title,
          '/reset-password',
        )

        setRecoveryState('ready')
        return
      }

      /*
       * Backward compatibility:
       * older Supabase ConfirmationURL emails may still create the
       * recovery session before redirecting to this page.
       */
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (session && hasPasswordRecoveryIntent()) {
        setRecoveryState('ready')
        return
      }

      clearPasswordRecoveryIntent()
      setErrorMessage(
        'This reset link is invalid or has expired. Request a new link to continue.',
      )
      setRecoveryState('invalid')
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryIntent()
        setRecoveryState('ready')
        return
      }

      if (session && hasPasswordRecoveryIntent()) {
        setRecoveryState('ready')
      }
    })

    void initializeRecovery()

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
      setErrorMessage(
        error.message ||
          'Unable to update the password. Request a new reset link and try again.',
      )
      setRecoveryState('ready')
      return
    }

    clearPasswordRecoveryIntent()
    clearProtectedNavigationMemory()

    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) {
      console.warn(
        'Password was changed but the recovery session could not be signed out cleanly.',
        signOutError,
      )
    }

    setPassword('')
    setConfirmPassword('')
    navigate('/login?password-reset=success', { replace: true })
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
            <p>
              Choose a new password that will be used for your approved PMS10
              account.
            </p>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-form-header">
              <h2>New Password</h2>
              <p>Use at least 8 characters.</p>
            </div>

            {errorMessage && recoveryState !== 'invalid' && (
              <div className="auth-alert error" role="alert">
                {errorMessage}
              </div>
            )}

            {recoveryState === 'checking' && (
              <div className="auth-alert success" role="status">
                Verifying your secure PMS10 reset link...
              </div>
            )}

            {recoveryState === 'invalid' && (
              <>
                <div className="auth-alert error" role="alert">
                  {errorMessage ||
                    'This reset link is invalid or has expired. Request a new link to continue.'}
                </div>
                <Link to="/forgot-password" className="auth-link-button">
                  Request Another Link
                </Link>
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
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={recoveryState === 'saving'}
                    >
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

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={!canSubmit}
                >
                  {recoveryState === 'saving'
                    ? 'Updating Password...'
                    : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
