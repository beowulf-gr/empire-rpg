import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { session, signIn, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/realms'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (session) return <Navigate to={from} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError(signInError)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="parchment-card w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-[var(--gold)] mb-2">⚜</div>
          <h1 className="empire-heading-center text-3xl font-serif font-bold inline-block">Sign in</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--paper-edge)] bg-transparent px-3 py-2 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--paper-edge)] bg-transparent px-3 py-2 focus:outline-none"
            />
          </label>
          {error && (
            <p className="text-sm text-[var(--rust)]" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="empire-button w-full px-4 py-2.5 rounded-md font-medium"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-sm text-[var(--ink-soft)] text-center">
          No account?{' '}
          <Link to="/signup" className="text-[var(--wine)] hover:underline font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
