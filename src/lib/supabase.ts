import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill them in.',
  )
}

/**
 * Shared Supabase client. Use this instead of creating new instances per call —
 * a single client manages auth state, realtime subscriptions, and request batching.
 */
export const supabase = createClient<Database>(url, publishableKey)
