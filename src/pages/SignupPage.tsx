import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function SignupPage() {
  const { session, signUp, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  if (loading) return null
  if (session) return <Navigate to="/realms" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: signUpError } = await signUp(email, password, displayName || undefined)
    setSubmitting(false)
    if (signUpError) {
      setError(signUpError)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-16">
        <div className="parchment-card w-full max-w-md p-8 text-center">
          <div className="text-[var(--gold)] mb-2">⚜</div>
          <h1 className="empire-heading-center text-3xl font-serif font-bold inline-block mb-4">Check your inbox</h1>
          <p className="text-[var(--ink-soft)] mt-4 leading-relaxed">
            We sent a confirmation link to <strong className="text-[var(--ink)]">{email}</strong>. Click it to activate your account,
            then come back and{' '}
            <Link to="/login" className="text-[var(--wine)] hover:underline font-medium">
              sign in
            </Link>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="parchment-card w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-[var(--gold)] mb-2">⚜</div>
          <h1 className="empire-heading-center text-3xl font-serif font-bold inline-block">Take the crown</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Display name (optional)</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--paper-edge)] bg-transparent px-3 py-2 focus:outline-none"
            />
          </label>
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--paper-edge)] bg-transparent px-3 py-2 focus:outline-none"
            />
            <span className="text-xs text-[var(--ink-soft)]">At least 6 characters.</span>
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
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="mt-6 text-sm text-[var(--ink-soft)] text-center">
          Already a ruler?{' '}
          <Link to="/login" className="text-[var(--wine)] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
