import { Navigate, useOutletContext } from 'react-router-dom'
import RpmesStatusComparison from '../components/RpmesStatusComparison'
import { useAuth } from '../context/AuthContext'
import { useDesktopViewport } from '../hooks/useDesktopViewport'
import { useSubaybayanOfficialProjects } from '../hooks/useSubaybayanOfficialProjects'
import type { RpmesViewSession } from '../lib/rpmesViewSession'
import type { SharedProjectRow } from '../lib/projectDataCache'
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
  const viewSession = useOutletContext<RpmesViewSession>()
  const { officialProjects, source, refreshProjects } = useSubaybayanOfficialProjects<SharedProjectRow & AorProjectLike>()
  return <RpmesStatusComparison officialProjects={filterProjectsByAor(officialProjects, auth)}
    projectSource={source} refreshProjects={refreshProjects} viewSession={viewSession} />
}
