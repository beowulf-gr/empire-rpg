import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRealms } from '../hooks/useRealms'
import { useDeleteRealm } from '../hooks/useDeleteRealm'
import { AppShell } from '../components/AppShell'
import type { RealmRow } from '../lib/realmIo'

export function RealmsPage() {
  const { user, signOut } = useAuth()
  const { data: realms, isLoading, error } = useRealms()
  const deleteRealm = useDeleteRealm()
  const [confirming, setConfirming] = useState<RealmRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleConfirmDelete = () => {
    if (!confirming) return
    setDeleteError(null)
    deleteRealm.mutate(confirming.id, {
      onSuccess: () => {
        setConfirming(null)
      },
      onError: (e) => {
        setDeleteError(e.message)
      },
    })
  }

  const handleCancel = () => {
    setConfirming(null)
    setDeleteError(null)
    deleteRealm.reset()
  }

  return (
    <AppShell
      topBar={
        <div className="flex items-center gap-3">
          <span>{user?.email}</span>
          <button
            onClick={() => void signOut()}
            className="empire-button-ghost px-3 py-1 rounded-md text-sm"
          >
            Sign out
          </button>
        </div>
      }
    >
      <header className="mb-8">
        <h1 className="empire-heading text-4xl font-serif font-bold mb-2">Your realms</h1>
        <p className="text-sm text-[var(--ink-soft)] max-w-prose">
          Lords and ladies of the land — every realm is a chapter of its own.
        </p>
      </header>

      <div className="mb-8">
        <Link
          to="/realms/new"
          className="empire-button inline-block px-5 py-2.5 rounded-md font-medium"
        >
          + Found a new realm
        </Link>
      </div>

      {isLoading && <p className="text-[var(--ink-soft)] italic">Gathering your realms…</p>}

      {error && (
        <p className="text-[var(--rust)]" role="alert">
          Failed to load realms: {error.message}
        </p>
      )}

      {!isLoading && !error && realms && realms.length === 0 && (
        <div className="parchment-card p-12 text-center text-[var(--ink-soft)]">
          <p className="mb-3 italic">No realms yet. The map awaits a name.</p>
          <Link to="/realms/new" className="text-[var(--wine)] hover:underline font-medium">
            Found your first realm →
          </Link>
        </div>
      )}

      {!isLoading && !error && realms && realms.length > 0 && (
        <ul className="space-y-3">
          {realms.map((r) => (
            <li
              key={r.id}
              className="parchment-card hover:shadow-lg transition-shadow flex items-stretch"
            >
              <Link to={`/realms/${r.id}`} className="block p-4 flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-1 gap-3">
                  <h2 className="text-2xl font-serif font-semibold truncate">{r.name}</h2>
                  <span className="text-sm text-[var(--ink-soft)] capitalize shrink-0">
                    {r.scale}
                  </span>
                </div>
                <div className="text-sm text-[var(--ink-soft)] capitalize tabular">
                  Year {r.current_year} · {r.current_season} · {r.climate_template} climate
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setConfirming(r)}
                title={`Delete ${r.name}`}
                aria-label={`Delete realm ${r.name}`}
                className="px-4 flex items-center justify-center text-[var(--ink-soft)] hover:text-[var(--wine)] border-l border-[var(--ink-faint)]/30 transition-colors"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDeleteDialog
          realm={confirming}
          pending={deleteRealm.isPending}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancel}
        />
      )}
    </AppShell>
  )
}

interface ConfirmDeleteProps {
  realm: RealmRow
  pending: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteDialog({ realm, pending, error, onConfirm, onCancel }: ConfirmDeleteProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-realm-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="parchment-card max-w-md w-full p-6">
        <div className="text-center mb-4">
          <div className="text-[var(--rust)] text-xl mb-2">⚠</div>
          <h3
            id="delete-realm-title"
            className="empire-heading-center font-serif font-bold text-2xl inline-block"
          >
            Raze this realm?
          </h3>
        </div>

        <p className="text-sm text-[var(--ink)] mb-3">
          You are about to erase{' '}
          <strong className="font-serif text-base">{realm.name}</strong> from the
          chronicles. This will destroy every area, populace, stronghold, and turn
          of history bound to it.
        </p>
        <p className="text-sm italic text-[var(--ink-soft)] mb-5">
          This deed cannot be undone.
        </p>

        {error && (
          <div className="mb-4 border border-[var(--rust)]/50 bg-[var(--rust)]/10 rounded-md p-3 text-sm text-[var(--rust)]" role="alert">
            Failed to delete: {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="empire-button-ghost px-4 py-2 rounded-md text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="empire-button px-5 py-2 rounded-md font-medium"
          >
            {pending ? 'Razing…' : 'Yes, raze it'}
          </button>
        </div>
      </div>
    </div>
  )
}
