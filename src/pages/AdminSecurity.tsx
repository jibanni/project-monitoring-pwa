import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import '../styles/adminSecurity.css'

type Enrollment = { id: string; qr: string }

export default function AdminSecurity() {
  const [factorId, setFactorId] = useState('')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    const [factors, level] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (factors.error || level.error) {
      setMessage('Unable to check security settings. Reconnect and try again.')
      return
    }
    setFactorId(factors.data.totp[0]?.id ?? '')
    setVerified(level.data.currentLevel === 'aal2')
    setReady(true)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function startEnrollment() {
    setMessage('')
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'PMS10' })
      if (error) throw error
      const qr = data.totp.qr_code
      if (!qr.startsWith('data:image/svg+xml')) throw new Error('Unexpected QR code format.')
      setEnrollment({ id: data.id, qr })
    } catch {
      setMessage('Could not start authenticator setup. Retry when online.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = enrollment?.id || factorId
    if (!id || !/^\d{6}$/.test(code) || busy) return
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code })
      if (error) throw error
      setEnrollment(null)
      setCode('')
      await refresh()
    } catch {
      setMessage('Verification failed. Try the current code from your authenticator.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pms-admin-security">
      <h1>Admin Security</h1>
      {verified ? <p role="status">This session is verified for sensitive admin actions.</p>
        : <p>Use an authenticator app to verify this session before performing sensitive admin actions.</p>}
      {!ready && !message && <p role="status">Checking your enrollment…</p>}
      {ready && !verified && !factorId && !enrollment && (
        <button type="button" onClick={() => void startEnrollment()} disabled={busy}>Set Up Authenticator</button>
      )}
      {enrollment && <div>
        <p>Scan this QR code in your authenticator app. Do not share it.</p>
        <img src={enrollment.qr} alt="Authenticator enrollment QR code" width="200" height="200" />
      </div>}
      {!verified && (factorId || enrollment) && (
        <form onSubmit={verify}>
          <label htmlFor="pms-security-totp">Six-digit authenticator code</label>
          <input id="pms-security-totp" type="text" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} value={code} onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))} />
          <button type="submit" disabled={busy || code.length !== 6}>Verify</button>
        </form>
      )}
      {message && <p role="alert">{message}</p>}
      {!ready && message && <button type="button" onClick={() => void refresh()}>Retry</button>}
      <footer><Link to="/dashboard">Return to Dashboard</Link></footer>
    </section>
  )
}
