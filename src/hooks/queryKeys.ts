/**
 * Query keys for TanStack Query.
 *
 * Centralized so mutation hooks (Phase 2c/2d) can invalidate the right caches
 * without hunting for the literal strings.
 *
 * Convention: keys are nested arrays so that calling
 *   queryClient.invalidateQueries({ queryKey: ['realms'] })
 * invalidates BOTH the list and any individual realm queries. Useful after
 * mutations that affect both (e.g. creating a realm bumps the list).
 */

export const queryKeys = {
  realms: {
    all: ['realms'] as const,
    list: (userId: string | undefined) => ['realms', 'list', userId] as const,
    detail: (realmId: string | undefined) => ['realms', 'detail', realmId] as const,
  },
  turnHistory: {
    forRealm: (realmId: string | undefined) => ['turn_history', realmId] as const,
  },
} as const
