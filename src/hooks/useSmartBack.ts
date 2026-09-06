import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  getPreviousProtectedRoute,
  getRouteFromLocation,
} from '../lib/navigationMemory'

export function useSmartBack(fallbackPath: string) {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    const historyIndex = Number(window.history.state?.idx)

    if (Number.isFinite(historyIndex) && historyIndex > 0) {
      navigate(-1)
      return
    }

    const currentRoute = getRouteFromLocation(location)
    const previousRoute = getPreviousProtectedRoute(currentRoute, fallbackPath)

    navigate(previousRoute, { replace: true })
  }, [fallbackPath, location, navigate])
}
