import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, useAuth } from './auth'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'

const AuthPage = lazy(() => import('./pages/Auth'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Workouts = lazy(() => import('./pages/Workouts'))
const WorkoutEdit = lazy(() => import('./pages/WorkoutEdit'))
const Library = lazy(() => import('./pages/Library'))
const MuscleGroupPage = lazy(() => import('./pages/MuscleGroup'))
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'))
const Planner = lazy(() => import('./pages/Planner'))
const SessionPage = lazy(() => import('./pages/Session'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Coach = lazy(() => import('./pages/Coach'))
const Cardio = lazy(() => import('./pages/Cardio'))
const ProfilePage = lazy(() => import('./pages/Profile'))
const SettingsPage = lazy(() => import('./pages/Settings'))

function Protected({ children, allowUnonboarded }: { children: ReactNode; allowUnonboarded?: boolean }) {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading || (session && !profile)) return <Spinner />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!profile!.onboarded && !allowUnonboarded) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  return session ? <Navigate to="/" replace /> : <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><AuthPage mode="register" /></PublicOnly>} />
            <Route path="/onboarding" element={<Protected allowUnonboarded><Onboarding /></Protected>} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="workouts" element={<Workouts />} />
              <Route path="workouts/new" element={<WorkoutEdit />} />
              <Route path="workouts/:id" element={<WorkoutEdit />} />
              <Route path="library" element={<Library />} />
              <Route path="library/:group" element={<MuscleGroupPage />} />
              <Route path="exercise/:slug" element={<ExerciseDetail />} />
              <Route path="planner" element={<Planner />} />
              <Route path="session/:id" element={<SessionPage />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="coach" element={<Coach />} />
              <Route path="cardio" element={<Cardio />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
