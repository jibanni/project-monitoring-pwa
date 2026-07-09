import { lazy, Suspense } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { AuthProvider } from './context/AuthContext'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'

import Login from './pages/Login'
import Register from './pages/Register'
import PendingApproval from './pages/PendingApproval'
import Unauthorized from './pages/Unauthorized'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetails = lazy(() => import('./pages/ProjectDetails'))
const ProjectUpdates = lazy(() => import('./pages/ProjectUpdates'))
const CreateProject = lazy(() => import('./pages/CreateProject'))
const EditProject = lazy(() => import('./pages/EditProject'))
const ProjectMap = lazy(() => import('./pages/ProjectMap'))
const OfflineSync = lazy(() => import('./pages/OfflineSync'))
const Reports = lazy(() => import('./pages/Reports'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const UserAccess = lazy(() => import('./pages/UserAccess'))
const SubayImport = lazy(() => import('./pages/SubayImport'))

type ProtectedRouteProps = ComponentProps<typeof ProtectedRoute>

type ProtectedLayoutProps = {
  children: ReactNode
  allowedRoles?: ProtectedRouteProps['allowedRoles']
  requireApproval?: ProtectedRouteProps['requireApproval']
}

function PageLoader() {
  return (
    <div className="app-page-loader">
      <div className="app-page-loader-spinner" />
      <p>Loading page...</p>
    </div>
  )
}

function PublicPage({ children }: { children: ReactNode }) {
  return <div className="public-page-transition">{children}</div>
}

function ProtectedLayout({
  children,
  allowedRoles,
  requireApproval,
}: ProtectedLayoutProps) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles} requireApproval={requireApproval}>
      <Layout>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </Layout>
    </ProtectedRoute>
  )
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

          <Route
            path="/"
            element={
              <ProtectedLayout>
                <Dashboard />
              </ProtectedLayout>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedLayout>
                <Dashboard />
              </ProtectedLayout>
            }
          />

          <Route
            path="/projects"
            element={
              <ProtectedLayout>
                <Projects />
              </ProtectedLayout>
            }
          />

          <Route
            path="/reports"
            element={
              <ProtectedLayout>
                <Reports />
              </ProtectedLayout>
            }
          />

          <Route
            path="/map"
            element={
              <ProtectedLayout>
                <ProjectMap />
              </ProtectedLayout>
            }
          />

          <Route
            path="/offline-sync"
            element={
              <ProtectedLayout allowedRoles={['Admin', 'RO Engineer', 'PO Engineer', 'Engineer']}>
                <OfflineSync />
              </ProtectedLayout>
            }
          />


          <Route
            path="/projects/import-subaybayan"
            element={
              <ProtectedLayout allowedRoles={['Admin']}>
                <SubayImport />
              </ProtectedLayout>
            }
          />

          <Route
            path="/projects/create"
            element={
              <ProtectedLayout allowedRoles={['Admin', 'RO Engineer']}>
                <CreateProject />
              </ProtectedLayout>
            }
          />

          <Route
            path="/projects/:id"
            element={
              <ProtectedLayout>
                <ProjectDetails />
              </ProtectedLayout>
            }
          />

          <Route
            path="/projects/:id/edit"
            element={
              <ProtectedLayout allowedRoles={['Admin', 'RO Engineer']}>
                <EditProject />
              </ProtectedLayout>
            }
          />

          <Route
            path="/projects/:id/updates"
            element={
              <ProtectedLayout allowedRoles={['Admin', 'RO Engineer', 'PO Engineer', 'Engineer']}>
                <ProjectUpdates />
              </ProtectedLayout>
            }
          />

          <Route
            path="/users"
            element={
              <ProtectedLayout allowedRoles={['Admin']}>
                <UserManagement />
              </ProtectedLayout>
            }
          />

          <Route
            path="/users/:userId/access"
            element={
              <ProtectedLayout allowedRoles={['Admin']}>
                <UserAccess />
              </ProtectedLayout>
            }
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
