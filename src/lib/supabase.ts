import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.DEV && import.meta.env.VITE_SUPABASE_DEV_PROXY
  ? `${window.location.origin}/sb`   // see server.proxy in vite.config.ts
  : import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local')

export const supabase = createClient(url, key)

/** Unwrap a Supabase response, throwing its error so callers can catch one thing. */
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}
