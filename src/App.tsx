import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { RealmsPage } from './pages/RealmsPage'
import { CreateRealmPage } from './pages/CreateRealmPage'
import { RealmDetailPage } from './pages/RealmDetailPage'
import { RealmEditPage } from './pages/RealmEditPage'
import { RealmLogPage } from './pages/RealmLogPage'

// `basename` must match `base` in vite.config.ts and the nginx `location`
// path. With this set, <Link to="/realms"> resolves to /empire/realms in
// the URL bar, and React Router strips /empire when matching routes.
export default function App() {
  return (
    <BrowserRouter basename="/empire">
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/realms"
            element={
              <ProtectedRoute>
                <RealmsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/realms/new"
            element={
              <ProtectedRoute>
                <CreateRealmPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/realms/:id"
            element={
              <ProtectedRoute>
                <RealmDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/realms/:id/edit"
            element={
              <ProtectedRoute>
                <RealmEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/realms/:id/log"
            element={
              <ProtectedRoute>
                <RealmLogPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
