import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type PublicRouteProps = {
  children: ReactNode
}

export default function PublicRoute({ children }: PublicRouteProps) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return <div style={{ padding: '1rem' }}>Loading...</div>
  }

  if (session && profile?.approved === true && profile?.is_active !== false) {
    return <Navigate to="/dashboard" replace />
  }

  if (session && profile?.approved === false) {
    return <Navigate to="/pending-approval" replace />
  }

  if (session && profile?.is_active === false) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
