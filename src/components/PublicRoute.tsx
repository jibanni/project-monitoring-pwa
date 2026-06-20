import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type PublicRouteProps = {
  children: ReactNode
}

type LocationState = {
  from?: {
    pathname?: string
    search?: string
    hash?: string
  }
}

export default function PublicRoute({ children }: PublicRouteProps) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div style={{ padding: '1rem' }}>Loading...</div>
  }

  const state = location.state as LocationState | null

  const fromPath =
    state?.from?.pathname &&
    state.from.pathname !== '/login' &&
    state.from.pathname !== '/register'
      ? `${state.from.pathname}${state.from.search || ''}${state.from.hash || ''}`
      : '/dashboard'

  if (session && profile?.approved === true) {
    return <Navigate to={fromPath} replace />
  }

  if (session && profile?.approved === false) {
    return <Navigate to="/pending-approval" replace />
  }

  return <>{children}</>
}