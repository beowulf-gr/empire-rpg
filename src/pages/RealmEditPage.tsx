import { Link, useParams } from 'react-router-dom'
import { useRealm } from '../hooks/useRealm'
import { useReplaceRealm } from '../hooks/useReplaceRealm'
import { AppShell } from '../components/AppShell'
import { ResourcesEditor } from '../components/edit/ResourcesEditor'
import { PopulationEditor } from '../components/edit/PopulationEditor'
import { AreasEditor } from '../components/edit/AreasEditor'
import { StrongholdsEditor } from '../components/edit/StrongholdsEditor'

/**
 * DM-tools page — direct, free-form edits to a realm's state.
 *
 * Bypasses the rules engine entirely. Used for:
 *  - Reconciling tabletop session results that the app doesn't model
 *  - Adding/removing land areas from offline conquest/cession events
 *  - "Cheat-mode" tweaks to resources, population, ministers, etc.
 *
 * Each section commits to the database independently via useReplaceRealm.
 * The implementation lands in slices: 3a = Resources, 3b = Population,
 * 3c = Areas, 3d = Strongholds. Future slices may add Military, Ministers,
 * Loyalty.
 */
export function RealmEditPage() {
  const { id } = useParams<{ id: string }>()
  const { data: realm, isLoading, error } = useRealm(id)
  const replaceRealm = useReplaceRealm()

  return (
    <AppShell
      topBar={
        <Link to={`/realms/${id}`} className="hover:text-[var(--wine)] transition-colors">
          ← Back to realm
        </Link>
      }
    >
      <header className="mb-6">
        <h1 className="empire-heading text-3xl font-serif font-bold">
          DM tools{realm ? ` — ${realm.name}` : ''}
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)] italic max-w-prose">
          Free-form edits that bypass the rules engine. Use sparingly — these
          changes commit immediately and aren't reversible without further
          edits. Helpful for offline events, table-top reconciliation, or
          simple cheats.
        </p>
      </header>

      {isLoading && (
        <p className="text-[var(--ink-soft)] italic">Loading the realm…</p>
      )}
      {error && (
        <p className="text-[var(--rust)]" role="alert">
          Failed to load: {error.message}
        </p>
      )}

      {realm && (
        <div className="space-y-6">
          <ResourcesEditor
            realm={realm}
            onSave={(next) => replaceRealm.mutate(next)}
            pending={replaceRealm.isPending}
            error={replaceRealm.error?.message ?? null}
          />

          <PopulationEditor
            realm={realm}
            onSave={(next) => replaceRealm.mutate(next)}
            pending={replaceRealm.isPending}
            error={replaceRealm.error?.message ?? null}
          />

          <AreasEditor
            realm={realm}
            onSave={(next) => replaceRealm.mutate(next)}
            pending={replaceRealm.isPending}
            error={replaceRealm.error?.message ?? null}
          />

          <StrongholdsEditor
            realm={realm}
            onSave={(next) => replaceRealm.mutate(next)}
            pending={replaceRealm.isPending}
            error={replaceRealm.error?.message ?? null}
          />
        </div>
      )}
    </AppShell>
  )
}
