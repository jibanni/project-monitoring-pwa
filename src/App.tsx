import { lazy, Suspense } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './context/AuthContext'
import { routeLoaders } from './lib/routePreload'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'

import Login from './pages/Login'
import Register from './pages/Register'
import PendingApproval from './pages/PendingApproval'
import Unauthorized from './pages/Unauthorized'
import OfflineSync from './pages/OfflineSync'

const Dashboard = lazy(routeLoaders.dashboard)
const Projects = lazy(routeLoaders.projects)
const ProjectDetails = lazy(routeLoaders.projectDetails)
const ProjectUpdates = lazy(routeLoaders.projectUpdates)
const AideMemoirePdfViewer = lazy(routeLoaders.aideMemoirePdfViewer)
const CreateProject = lazy(routeLoaders.createProject)
const EditProject = lazy(routeLoaders.editProject)
const ProjectMap = lazy(routeLoaders.projectMap)
const Reports = lazy(routeLoaders.reports)
const UserManagement = lazy(routeLoaders.userManagement)
const UserAccess = lazy(routeLoaders.userAccess)
const SubayImport = lazy(routeLoaders.subayImport)

type ProtectedRouteProps = ComponentProps<typeof ProtectedRoute>

type RoleProtectedPageProps = {
  children: ReactNode
  allowedRoles: ProtectedRouteProps['allowedRoles']
}

function PageLoader() {
  return (
    <div className="app-page-loader" role="status" aria-live="polite">
      <div className="app-page-loader-spinner" />
      <p>Loading page...</p>
    </div>
  )
}

function PublicPage({ children }: { children: ReactNode }) {
  return <div className="public-page-transition">{children}</div>
}

/**
 * This shell is mounted once for every authenticated route. The previous route
 * structure recreated Layout on each navbar click, repeating header effects,
 * measurements, listeners, and protected-route work.
 */
function ProtectedAppShell() {
  return (
    <ProtectedRoute>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </Layout>
    </ProtectedRoute>
  )
}

function RoleProtectedPage({ children, allowedRoles }: RoleProtectedPageProps) {
  return <ProtectedRoute allowedRoles={allowedRoles}>{children}</ProtectedRoute>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <PublicPage>
                  <Login />
                </PublicPage>
              </PublicRoute>
            }
          />

          <Route
            path="/register"
            element={
              <PublicRoute>
                <PublicPage>
                  <Register />
                </PublicPage>
              </PublicRoute>
            }
          />

          <Route
            path="/pending-approval"
            element={
              <ProtectedRoute requireApproval={false}>
                <PublicPage>
                  <PendingApproval />
                </PublicPage>
              </ProtectedRoute>
            }
          />

          <Route
            path="/unauthorized"
            element={
              <ProtectedRoute requireApproval={false}>
                <PublicPage>
                  <Unauthorized />
                </PublicPage>
              </ProtectedRoute>
            }
          />

          <Route element={<ProtectedAppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="reports" element={<Reports />} />
            <Route path="map" element={<ProjectMap />} />

            <Route
              path="offline-sync"
              element={
                <RoleProtectedPage
                  allowedRoles={['Admin', 'RO Engineer', 'PO Engineer', 'PEO', 'Engineer']}
                >
                  <OfflineSync />
                </RoleProtectedPage>
              }
            />


            <Route
              path="projects/import-subaybayan"
              element={
                <RoleProtectedPage allowedRoles={['Admin']}>
                  <SubayImport />
                </RoleProtectedPage>
              }
            />

            <Route
              path="projects/create"
              element={
                <RoleProtectedPage allowedRoles={['Admin', 'RO Engineer']}>
                  <CreateProject />
                </RoleProtectedPage>
              }
            />

            <Route path="projects/:id" element={<ProjectDetails />} />

            <Route
              path="projects/:id/edit"
              element={
                <RoleProtectedPage allowedRoles={['Admin', 'RO Engineer']}>
                  <EditProject />
                </RoleProtectedPage>
              }
            />

            <Route
              path="projects/:id/updates"
              element={
                <RoleProtectedPage
                  allowedRoles={['Admin', 'RO Engineer', 'PO Engineer', 'PEO', 'Engineer']}
                >
                  <ProjectUpdates />
                </RoleProtectedPage>
              }
            />

            <Route
              path="projects/:id/aide-memoire/pdf"
              element={<AideMemoirePdfViewer />}
            />

            <Route
              path="users"
              element={
                <RoleProtectedPage allowedRoles={['Admin']}>
                  <UserManagement />
                </RoleProtectedPage>
              }
            />

            <Route
              path="users/:userId/access"
              element={
                <RoleProtectedPage allowedRoles={['Admin']}>
                  <UserAccess />
                </RoleProtectedPage>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
