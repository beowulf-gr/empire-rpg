import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'

/**
 * Wraps a route's element. If the user isn't signed in, redirects to /login
 * (preserving the originally-requested path so we can return to it after sign-in).
 *
 * Use:
 *   <Route element={<ProtectedRoute><RealmsPage /></ProtectedRoute>} ... />
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-stone-500">Loading…</span>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
