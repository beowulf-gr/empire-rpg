import { QueryClient } from '@tanstack/react-query'

/**
 * Shared TanStack Query client. Use this in <QueryClientProvider> at the root.
 *
 * Defaults:
 *  - staleTime 30s: data is considered fresh for 30 seconds (no refetch on
 *    re-renders within that window). Empire is turn-based, not real-time, so
 *    we don't need aggressive refetching.
 *  - refetchOnWindowFocus off: don't ping the server every time the user
 *    tabs back. Realm state only changes when the user takes an action.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
