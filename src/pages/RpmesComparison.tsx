import { Navigate } from 'react-router-dom'
import RpmesStatusComparison from '../components/RpmesStatusComparison'
import { useAuth } from '../context/AuthContext'
import { useDesktopViewport } from '../hooks/useDesktopViewport'
import { useSharedProjects, type SharedProjectRow } from '../lib/projectDataCache'
import { filterProjectsByAor, type AorProjectLike } from '../utils/aorAccess'

export default function RpmesComparison() {
  const desktop = useDesktopViewport()
  const auth = useAuth()
  if (!desktop) return <Navigate to="/dashboard" replace />
  if (!auth.isApproved) return null
  return <DesktopComparison key={auth.user?.id} />
}

function DesktopComparison() {
  const auth = useAuth()
  const { projects, source, refreshProjects } = useSharedProjects<SharedProjectRow & AorProjectLike>()
  return <RpmesStatusComparison projects={filterProjectsByAor(projects, auth)}
    projectSource={source} refreshProjects={refreshProjects} />
}
