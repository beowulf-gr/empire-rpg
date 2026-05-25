import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { useRealm } from '../hooks/useRealm'
import { useTurnHistory } from '../hooks/useTurnHistory'
import { describeEvent } from '../components/actions/describeEvent'

const SEASON_LABEL: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
}

/**
 * Read-only chronicle of everything that happened in a realm — one section
 * per season-end transition. Opens in a new tab from RealmDetailPage so the
 * main dashboard stays uncluttered.
 *
 * Each season row is sourced from the turn_history table; each event is
 * rendered through describeEvent so the wording matches the season-transition
 * pop-up the user sees during play.
 */
export function RealmLogPage() {
  const { id } = useParams<{ id: string }>()
  const realmQuery = useRealm(id)
  const logQuery = useTurnHistory(id)

  const realm = realmQuery.data
  const rows = logQuery.data

  if (realmQuery.isLoading || logQuery.isLoading) {
    return (
      <AppShell topBar={null}>
        <p className="text-[var(--ink-soft)] italic">Opening the chronicle...</p>
      </AppShell>
    )
  }

  if (realmQuery.error || !realm) {
    return (
      <AppShell topBar={null}>
        <p className="text-[var(--rust)]" role="alert">
          Couldn't load this realm.
        </p>
      </AppShell>
    )
  }

  if (logQuery.error) {
    return (
      <AppShell topBar={null}>
        <p className="text-[var(--rust)]" role="alert">
          Couldn't load the game log: {logQuery.error.message}
        </p>
      </AppShell>
    )
  }

  return (
    <AppShell
      topBar={
        <Link
          to={`/realms/${id}`}
          className="hover:text-[var(--wine)] transition-colors"
        >
          ← Back to {realm.name}
        </Link>
      }
    >
      <header className="mb-6">
        <h1 className="empire-heading text-4xl font-serif font-bold">
          Chronicle of {realm.name}
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Every season-end since the realm was founded, in the order it happened.
        </p>
      </header>

      {(!rows || rows.length === 0) ? (
        <p className="italic text-[var(--ink-soft)]">
          No seasons have ended yet — the chronicle is empty.
        </p>
      ) : (
        <div className="space-y-6">
          {rows.map((row) => (
            <section
              key={row.id}
              className="rounded-lg border border-[var(--paper-edge)] bg-[var(--paper)] p-5"
            >
              <h2 className="font-serif text-xl font-semibold mb-3 text-[var(--ink)]">
                Year {row.year} — {SEASON_LABEL[row.season] ?? row.season}
              </h2>
              {row.events.length === 0 ? (
                <p className="italic text-[var(--ink-soft)] text-sm">
                  Nothing of note.
                </p>
              ) : (
                <ul className="space-y-2 text-sm leading-relaxed">
                  {row.events.map((ev, idx) => (
                    <li
                      key={`${row.id}-${idx}`}
                      className="text-[var(--ink)]"
                    >
                      {describeEvent(ev, realm)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </AppShell>
  )
}
