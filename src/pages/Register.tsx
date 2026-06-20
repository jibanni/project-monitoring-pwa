import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/auth.css'

export default function Register() {
  const navigate = useNavigate()
  const { signUp } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')

    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.')
      setSubmitting(false)
      return
    }

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.')
      setSubmitting(false)
      return
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.')
      setSubmitting(false)
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      setSubmitting(false)
      return
    }

    const { data, error } = await signUp(email.trim(), password, fullName.trim())

    if (error) {
      setErrorMessage(error.message)
      setSubmitting(false)
      return
    }

    if (data.session) {
      navigate('/pending-approval')
      return
    }

    setSuccessMessage('Registration successful. Please wait for admin approval.')
    setSubmitting(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-shell auth-register-shell">
        <aside className="auth-brand-panel">
          <div className="auth-brand-inner">
            <div className="auth-logo-row">
              <img src="/dilg-logo.png" alt="DILG Logo" />
              <img src="/bagong-pilipinas-logo.png" alt="Bagong Pilipinas Logo" />
            </div>

            <p className="auth-eyebrow">Account Request</p>

            <h1>Register for Access</h1>

            <p>
              Create an account request. An administrator must approve your account
              before you can access the monitoring system.
            </p>
          </div>

          <p className="auth-brand-credit">
            DILG Region X - PDMU Project Monitoring System
          </p>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-form-header">
              <h2>Register</h2>
              <p>Submit your details for admin approval.</p>
            </div>

            {errorMessage && (
              <div className="auth-alert error" role="alert">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="auth-alert success" role="status">
                {successMessage}
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label>
                <span>Full Name</span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                  disabled={submitting}
                />
              </label>

              <label>
                <span>Email Address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                  disabled={submitting}
                />
              </label>

              <label>
                <span>Password</span>
                <div className="auth-password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    autoComplete="new-password"
                    disabled={submitting}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={submitting}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <label>
                <span>Confirm Password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  disabled={submitting}
                />
              </label>

              <button type="submit" className="auth-submit-btn" disabled={submitting}>
                {submitting ? 'Creating account...' : 'Register'}
              </button>
            </form>

            <div className="auth-register-box">
              <p>
                Already have an account? <Link to="/login">Login</Link>
              </p>
            </div>

            <p className="auth-footnote">
              Your account will remain pending until approved by an administrator.
            </p>
          </div>
        </section>
      </section>
    </main>
  )
}