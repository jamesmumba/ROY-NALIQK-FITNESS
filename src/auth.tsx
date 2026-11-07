import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { getProfile, updateProfile } from './lib/data'
import type { Profile } from './lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
  patchProfile: (patch: Partial<Profile>) => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try { setProfile(await getProfile()) } catch { setProfile(null) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await refresh()
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN') setTimeout(refresh, 0)   // avoid calling Supabase inside the callback
      if (event === 'SIGNED_OUT') setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const patchProfile = useCallback(async (patch: Partial<Profile>) => {
    await updateProfile(patch)
    setProfile((p) => (p ? { ...p, ...patch } : p))
  }, [])

  return <Ctx.Provider value={{ session, profile, loading, refresh, patchProfile }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

/** Profile for pages behind the onboarding gate, where it is always loaded. */
export function useProfile() {
  const { profile, patchProfile, refresh } = useAuth()
  if (!profile) throw new Error('Profile not loaded')
  return { profile, patchProfile, refresh }
}
