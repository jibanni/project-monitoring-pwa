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

  if (session && profile?.approved === true) {
    return <Navigate to="/" replace />
  }

  if (session && profile?.approved === false) {
    return <Navigate to="/pending-approval" replace />
  }

  return <>{children}</>
}