import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function PendingApproval() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  useEffect(() => {
    if (profile?.approved === true) {
      navigate('/', { replace: true })
    }
  }, [profile, navigate])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Pending Approval</h1>

      <p>Your account has not yet been approved.</p>

      <p>
        <strong>Name:</strong> {profile?.full_name}
      </p>

      <p>
        <strong>Email:</strong> {profile?.email}
      </p>

      <p>
        <strong>Role:</strong> {String(profile?.role)}
      </p>

      <p>
        <strong>Approved:</strong> {String(profile?.approved)}
      </p>

      <button onClick={handleLogout}>Logout</button>
    </div>
  )
}