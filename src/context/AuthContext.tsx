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

type PoEngineerLguAssignment = {
  id: string
  user_id: string
  province: string
  municipality: string
  is_active: boolean | null
}

type RoEngineerProvinceAssignment = {
  id: string
  user_id: string
  province: string
  is_active: boolean | null
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isApproved: boolean
  isAdmin: boolean
  isROEngineer: boolean
  isPOEngineer: boolean
  isEngineer: boolean
  isRD: boolean
  isARD: boolean
  isPDMUChief: boolean
  isPD: boolean
  isCD: boolean
  isCLGOO: boolean
  isMLGOO: boolean
  isPEO: boolean
  isViewer: boolean
  poEngineerLguAssignments: PoEngineerLguAssignment[]
  roEngineerProvinceAssignments: RoEngineerProvinceAssignment[]
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

function normalizeRole(role: string | null | undefined) {
  return String(role || '').trim().toLowerCase()
}

function getCanonicalRole(role: string | null | undefined) {
  const value = normalizeRole(role)

  if (value === 'admin') return 'Admin'
  if (value === 'ro engineer' || value === 'ro engineers') return 'RO Engineer'
  if (value === 'engineer' || value === 'po engineer' || value === 'po engineers') return 'PO Engineer'
  if (value === 'rd' || value === 'regional director') return 'RD'
  if (value === 'ard' || value === 'assistant regional director') return 'ARD'
  if (value === 'pdmu chief' || value === 'pdmu chief/head' || value === 'pdmu head') {
    return 'PDMU Chief'
  }
  if (value === 'pd' || value === 'provincial director') return 'PD'
  if (value === 'cd' || value === 'city director') return 'CD'
  if (value === 'clgoo') return 'CLGOO'
  if (value === 'mlgoo') return 'MLGOO'
  if (value === 'peo' || value === 'project evaluation officer') return 'PEO'
  if (value === 'viewer') return 'Viewer'

  return role || null
}

function hasRole(profile: UserProfile | null, roles: string[]) {
  const currentRole = normalizeRole(profile?.role)
  return roles.some((role) => currentRole === normalizeRole(role))
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [poEngineerLguAssignments, setPoEngineerLguAssignments] = useState<PoEngineerLguAssignment[]>([])
  const [roEngineerProvinceAssignments, setRoEngineerProvinceAssignments] = useState<RoEngineerProvinceAssignment[]>([])
  const [loading, setLoading] = useState(true)

  async function loadCachedProfile(userId: string) {
    const cachedProfile = await offlineDb.user_profiles.get(userId)

    if (!cachedProfile) {
      setProfile(null)
      setPoEngineerLguAssignments([])
      setRoEngineerProvinceAssignments([])
      return null
    }

    const { cached_at, ...profileWithoutCacheDate } = cachedProfile

    const offlineProfile = profileWithoutCacheDate as UserProfile
    setProfile(offlineProfile)
    setPoEngineerLguAssignments([])
    setRoEngineerProvinceAssignments([])

    return offlineProfile
  }

  const fetchAssignments = useCallback(async (userId: string) => {
    if (!navigator.onLine) {
      setPoEngineerLguAssignments([])
      setRoEngineerProvinceAssignments([])
      return
    }

    const [poResult, roResult] = await Promise.all([
      supabase
        .from('po_engineer_lgu_assignments')
        .select('id, user_id, province, municipality, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('province', { ascending: true })
        .order('municipality', { ascending: true }),
      supabase
        .from('ro_engineer_province_assignments')
        .select('id, user_id, province, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('province', { ascending: true }),
    ])

    if (poResult.error) {
      console.error('PO Engineer LGU assignment load error:', poResult.error.message)
      setPoEngineerLguAssignments([])
    } else {
      setPoEngineerLguAssignments((poResult.data || []) as PoEngineerLguAssignment[])
    }

    if (roResult.error) {
      console.error('RO Engineer province assignment load error:', roResult.error.message)
      setRoEngineerProvinceAssignments([])
    } else {
      setRoEngineerProvinceAssignments((roResult.data || []) as RoEngineerProvinceAssignment[])
    }
  }, [])

  const fetchProfile = useCallback(
    async (userId: string) => {
      if (!navigator.onLine) {
        await loadCachedProfile(userId)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, email, role, approved, aor_level, province, huc, city, municipality, is_active',
        )
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Profile load error:', error.message)
        await loadCachedProfile(userId)
        return
      }

      const onlineProfile = {
        ...(data as UserProfile),
        role: getCanonicalRole((data as UserProfile).role),
      }

      setProfile(onlineProfile)

      await offlineDb.user_profiles.put({
        ...onlineProfile,
        cached_at: new Date().toISOString(),
      })

      await fetchAssignments(userId)
    },
    [fetchAssignments],
  )

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
      setPoEngineerLguAssignments([])
      setRoEngineerProvinceAssignments([])
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
        setPoEngineerLguAssignments([])
        setRoEngineerProvinceAssignments([])
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
        setPoEngineerLguAssignments([])
        setRoEngineerProvinceAssignments([])
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
    setPoEngineerLguAssignments([])
    setRoEngineerProvinceAssignments([])
  }

  const value = useMemo<AuthContextValue>(() => {
    const isApproved = profile?.approved === true && profile?.is_active !== false
    const isAdmin = isApproved && hasRole(profile, ['Admin'])
    const isROEngineer = isApproved && hasRole(profile, ['RO Engineer', 'RO Engineers'])
    const isPOEngineer = isApproved && hasRole(profile, ['PO Engineer', 'PO Engineers', 'Engineer'])

    return {
      session,
      user,
      profile,
      loading,
      isApproved,
      isAdmin,
      isROEngineer,
      isPOEngineer,
      isEngineer: isPOEngineer,
      isRD: isApproved && hasRole(profile, ['RD', 'Regional Director']),
      isARD: isApproved && hasRole(profile, ['ARD', 'Assistant Regional Director']),
      isPDMUChief: isApproved && hasRole(profile, ['PDMU Chief', 'PDMU Chief/Head', 'PDMU Head']),
      isPD: isApproved && hasRole(profile, ['PD', 'Provincial Director']),
      isCD: isApproved && hasRole(profile, ['CD', 'City Director']),
      isCLGOO: isApproved && hasRole(profile, ['CLGOO']),
      isMLGOO: isApproved && hasRole(profile, ['MLGOO']),
      isPEO: isApproved && hasRole(profile, ['PEO', 'Project Evaluation Officer']),
      isViewer:
        isApproved &&
        hasRole(profile, [
          'Viewer',
          'RD',
          'Regional Director',
          'ARD',
          'Assistant Regional Director',
          'PDMU Chief',
          'PDMU Chief/Head',
          'PDMU Head',
          'PD',
          'Provincial Director',
          'CD',
          'City Director',
          'CLGOO',
          'MLGOO',
          'PEO',
          'Project Evaluation Officer',
        ]),
      poEngineerLguAssignments,
      roEngineerProvinceAssignments,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }
  }, [
    session,
    user,
    profile,
    loading,
    poEngineerLguAssignments,
    roEngineerProvinceAssignments,
    refreshProfile,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
