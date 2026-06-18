import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { offlineDb } from '../lib/offlineDb'
import type { UserProfile } from '../types/auth'

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isApproved: boolean
  isAdmin: boolean
  isEngineer: boolean
  isViewer: boolean
  signIn: (
    email: string,
    password: string
  ) => Promise<{
    data: {
      user: User | null
      session: Session | null
    }
    error: AuthError | null
  }>
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{
    data: {
      user: User | null
      session: Session | null
    }
    error: AuthError | null
  }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadCachedProfile(userId: string) {
    const cachedProfile = await offlineDb.user_profiles.get(userId)

    if (!cachedProfile) {
      setProfile(null)
      return null
    }

    const {
      cached_at,
      ...profileWithoutCacheDate
    } = cachedProfile

    const offlineProfile = profileWithoutCacheDate as UserProfile
    setProfile(offlineProfile)

    return offlineProfile
  }

  const fetchProfile = useCallback(async (userId: string) => {
    if (!navigator.onLine) {
      await loadCachedProfile(userId)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approved')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Profile load error:', error.message)
      await loadCachedProfile(userId)
      return
    }

    const onlineProfile = data as UserProfile

    setProfile(onlineProfile)

    await offlineDb.user_profiles.put({
      ...onlineProfile,
      cached_at: new Date().toISOString(),
    })
  }, [])

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession()

    const currentUser = currentSession?.user ?? null

    setSession(currentSession)
    setUser(currentUser)

    if (currentUser?.id) {
      await fetchProfile(currentUser.id)
    } else {
      setProfile(null)
    }
  }, [fetchProfile])

  useEffect(() => {
    let mounted = true

    async function initializeAuth() {
      setLoading(true)

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setSession(currentSession)
      setUser(currentSession?.user ?? null)

      if (currentSession?.user?.id) {
        await fetchProfile(currentSession.user.id)
      } else {
        setProfile(null)
      }

      if (mounted) {
        setLoading(false)
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)

      if (currentSession?.user?.id) {
        setTimeout(() => {
          void fetchProfile(currentSession.user.id)
        }, 0)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (result.data.session?.user?.id) {
      setSession(result.data.session)
      setUser(result.data.user)
      await fetchProfile(result.data.session.user.id)
    }

    return result
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })
  }

  const signOut = async () => {
    if (user?.id) {
      await offlineDb.user_profiles.delete(user.id)
    }

    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
  }

  const value = useMemo<AuthContextValue>(() => {
    const isApproved = profile?.approved === true
    const isAdmin = isApproved && profile?.role === 'Admin'
    const isEngineer = isApproved && profile?.role === 'Engineer'
    const isViewer = isApproved && profile?.role === 'Viewer'

    return {
      session,
      user,
      profile,
      loading,
      isApproved,
      isAdmin,
      isEngineer,
      isViewer,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }
  }, [session, user, profile, loading, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}