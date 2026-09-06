import { Link } from 'react-router-dom'
import { clearProtectedNavigationMemory } from '../lib/navigationMemory'

export default function Unauthorized() {
  const handleReturnToDashboard = () => {
    // A role/access change can leave an admin-only route stored as the last
    // protected page. Clear that stale route before returning to a safe page
    // so the user cannot get trapped in /unauthorized -> / -> unauthorized.
    clearProtectedNavigationMemory()
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Unauthorized</h1>

      <p>You do not have permission to access this page.</p>

      <Link to="/dashboard" replace onClick={handleReturnToDashboard}>
        Return to Dashboard
      </Link>
    </div>
  )
}
