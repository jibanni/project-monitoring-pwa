import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/auth'

type ProtectedRouteProps = {
  children: ReactNode
  allowedRoles?: UserRole[]
  requireApproval?: boolean
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requireApproval = true,
}: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div style={{ padding: '1rem' }}>Loading...</div>
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!profile) {
    return <Navigate to="/pending-approval" replace />
  }

  if (requireApproval && profile.approved !== true) {
    return <Navigate to="/pending-approval" replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}