import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function HomePage() {
  const { session } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-2xl text-center">
        <div className="text-[var(--gold)] text-2xl mb-4 tracking-widest">⚜ · ⚜ · ⚜</div>
        <h1 className="empire-heading-center text-6xl font-serif font-bold tracking-tight mb-6">
          Empire
        </h1>
        <p className="text-[var(--ink-soft)] text-lg mb-2 italic font-serif">
          To sit in darkness here, hatching vain Empires.
        </p>
        <p className="text-[var(--ink-soft)] text-xs mb-8 tracking-wider">— John Milton</p>

        <p className="text-[var(--ink)] text-base mb-10 max-w-prose mx-auto leading-relaxed">
          A digital adaptation of AEG's <em>Empire</em> realm-management rules
          for D&amp;D 3rd edition. Build your barony, command your ministers,
          balance loyalty against ambition — and rule through the seasons.
        </p>

        {session ? (
          <Link
            to="/realms"
            className="empire-button inline-block px-7 py-3 rounded-md font-medium text-base"
          >
            Enter your realms →
          </Link>
        ) : (
          <div className="flex gap-3 justify-center">
            <Link
              to="/signup"
              className="empire-button px-6 py-3 rounded-md font-medium"
            >
              Take the crown
            </Link>
            <Link
              to="/login"
              className="empire-button-ghost px-6 py-3 rounded-md font-medium"
            >
              Sign in
            </Link>
          </div>
        )}

        <div className="empire-divider mt-12">⚜</div>
      </div>
    </div>
  )
}
