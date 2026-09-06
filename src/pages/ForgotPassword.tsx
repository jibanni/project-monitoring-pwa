import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import '../styles/auth.css'

type RequestState = 'idle' | 'sending' | 'sent'

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export default function ForgotPassword() {
  const [email, setEmail] = useState(() => localStorage.getItem('pdmu_login_email') || '')
  const [requestState, setRequestState] = useState<RequestState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const canSubmit = useMemo(
    () => normalizeEmail(email).length > 0 && requestState !== 'sending',
    [email, requestState],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      setErrorMessage('Please enter your email address.')
      return
    }

    setRequestState('sending')
    setErrorMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setErrorMessage(error.message || 'Unable to send the password reset email. Please try again.')
      setRequestState('idle')
      return
    }

    localStorage.setItem('pdmu_login_email', normalizedEmail)
    setRequestState('sent')
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
            <h1>Recover Your PMS10 Account</h1>
            <p>Request a secure email link and set a new password for your approved account.</p>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-form-header">
              <h2>Forgot Password</h2>
              <p>Enter the email address registered with PMS10.</p>
            </div>

            {errorMessage && <div className="auth-alert error" role="alert">{errorMessage}</div>}

            {requestState === 'sent' ? (
              <>
                <div className="auth-alert success" role="status">
                  If the email belongs to an account, a password reset link has been sent. Check the inbox and spam folder.
                </div>
                <Link to="/login" className="auth-link-button">Return to Login</Link>
              </>
            ) : (
              <form className="auth-form" onSubmit={handleSubmit}>
                <label>
                  <span>Email Address</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email address"
                    autoComplete="email"
                    disabled={requestState === 'sending'}
                    required
                  />
                </label>

                <button type="submit" className="auth-submit-btn" disabled={!canSubmit}>
                  {requestState === 'sending' ? 'Sending Reset Link...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <div className="auth-register-box">
              <p><Link to="/login">Back to Login</Link></p>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
