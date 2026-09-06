import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSafeReturnPath } from '../lib/navigation'
import StartupSplash from './StartupSplash'

type PublicRouteProps = {
  children: ReactNode
}

export default function PublicRoute({ children }: PublicRouteProps) {
  const location = useLocation()
  const { session, profile, loading } = useAuth()

  if (loading) return <StartupSplash />

  if (session && profile?.approved === true && profile?.is_active !== false) {
    return <Navigate to={getSafeReturnPath(location.state)} replace />
  }

  if (session && profile?.approved === false) {
    return <Navigate to="/pending-approval" replace />
  }

  if (session && profile?.is_active === false) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
