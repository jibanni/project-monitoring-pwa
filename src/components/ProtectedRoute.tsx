import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export type ProtectedRouteProps = {
  children: ReactNode
  allowedRoles?: string[]
  requireApproval?: boolean
}

function normalizeRole(role: string | null | undefined) {
  const value = String(role || '').trim().toLowerCase()

  if (value === 'admin') return 'Admin'
  if (value === 'engineer' || value === 'po engineer' || value === 'po engineers') {
    return 'PO Engineer'
  }
  if (value === 'ro engineer' || value === 'ro engineers') return 'RO Engineer'
  if (value === 'regional director' || value === 'rd') return 'RD'
  if (value === 'assistant regional director' || value === 'ard') return 'ARD'
  if (value === 'pdmu chief' || value === 'pdmu chief/head' || value === 'pdmu head') {
    return 'PDMU Chief'
  }
  if (value === 'provincial director' || value === 'pd') return 'PD'
  if (value === 'city director' || value === 'cd') return 'CD'
  if (value === 'clgoo') return 'CLGOO'
  if (value === 'mlgoo') return 'MLGOO'
  if (value === 'project evaluation officer' || value === 'peo') return 'PEO'
  if (value === 'viewer') return 'Viewer'

  return ''
}

function roleIsAllowed(userRole: string | null | undefined, allowedRoles?: string[]) {
  if (!allowedRoles || allowedRoles.length === 0) return true

  const normalizedUserRole = normalizeRole(userRole)
  const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role))

  return normalizedAllowedRoles.includes(normalizedUserRole)
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requireApproval = true,
}: ProtectedRouteProps) {
  const location = useLocation()
  const { session, user, profile, loading, isApproved } = useAuth()

  if (loading) {
    return (
      <div className="protected-route-loading">
        <h2>Loading...</h2>
        <p>Please wait while your account access is being verified.</p>
      </div>
    )
  }

  if (!session || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!profile) {
    if (requireApproval) return <Navigate to="/pending-approval" replace />
    return <>{children}</>
  }

  if (requireApproval && !isApproved) {
    return <Navigate to="/pending-approval" replace />
  }

  if (!roleIsAllowed(profile.role, allowedRoles)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
