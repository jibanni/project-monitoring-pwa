import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

type CachedAssignments = {
  po: PoEngineerLguAssignment[]
  ro: RoEngineerProvinceAssignment[]
  cachedAt: string
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

const ASSIGNMENT_CACHE_PREFIX = 'pms10:auth-assignments:'

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

function getAssignmentCacheKey(userId: string) {
  return `${ASSIGNMENT_CACHE_PREFIX}${userId}`
}

function readCachedAssignments(userId: string): CachedAssignments | null {
  try {
    const raw = window.localStorage.getItem(getAssignmentCacheKey(userId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<CachedAssignments>
    return {
      po: Array.isArray(parsed.po) ? parsed.po : [],
      ro: Array.isArray(parsed.ro) ? parsed.ro : [],
      cachedAt: String(parsed.cachedAt || ''),
    }
  } catch (error) {
    console.warn('Unable to read cached AOR assignments.', error)
    return null
  }
}

function writeCachedAssignments(userId: string, assignments: CachedAssignments) {
  try {
    window.localStorage.setItem(getAssignmentCacheKey(userId), JSON.stringify(assignments))
  } catch (error) {
    console.warn('Unable to cache AOR assignments.', error)
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [poEngineerLguAssignments, setPoEngineerLguAssignments] = useState<PoEngineerLguAssignment[]>([])
  const [roEngineerProvinceAssignments, setRoEngineerProvinceAssignments] = useState<RoEngineerProvinceAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const authRunRef = useRef(0)

  const loadCachedProfile = useCallback(async (userId: string) => {
    try {
      const cachedProfile = await offlineDb.user_profiles.get(userId)

      if (!cachedProfile) return null

      const { cached_at: _cachedAt, ...profileWithoutCacheDate } = cachedProfile
      const offlineProfile = {
        ...(profileWithoutCacheDate as UserProfile),
        role: getCanonicalRole(profileWithoutCacheDate.role),
      }

      setProfile(offlineProfile)
      return offlineProfile
    } catch (error) {
      console.warn('Unable to load the cached user profile.', error)
      return null
    }
  }, [])

  const loadCachedAssignments = useCallback((userId: string) => {
    const cached = readCachedAssignments(userId)

    if (!cached) return false

    setPoEngineerLguAssignments(cached.po)
    setRoEngineerProvinceAssignments(cached.ro)
    return true
  }, [])

  const fetchAssignments = useCallback(
    async (userId: string) => {
      if (!navigator.onLine) {
        loadCachedAssignments(userId)
        return
      }

      try {
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

        if (poResult.error || roResult.error) {
          if (poResult.error) {
            console.error('PO Engineer LGU assignment load error:', poResult.error.message)
          }
          if (roResult.error) {
            console.error('RO Engineer province assignment load error:', roResult.error.message)
          }
          loadCachedAssignments(userId)
          return
        }

        const po = (poResult.data || []) as PoEngineerLguAssignment[]
        const ro = (roResult.data || []) as RoEngineerProvinceAssignment[]

        setPoEngineerLguAssignments(po)
        setRoEngineerProvinceAssignments(ro)
        writeCachedAssignments(userId, {
          po,
          ro,
          cachedAt: new Date().toISOString(),
        })
      } catch (error) {
        console.error('AOR assignment refresh failed.', error)
        loadCachedAssignments(userId)
      }
    },
    [loadCachedAssignments],
  )

  const fetchProfile = useCallback(
    async (userId: string) => {
      if (!navigator.onLine) {
        const cached = await loadCachedProfile(userId)
        loadCachedAssignments(userId)
        return cached
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(
            'id, full_name, email, role, approved, aor_level, province, huc, city, municipality, is_active',
          )
          .eq('id', userId)
          .single()

        if (error) {
          console.error('Profile load error:', error.message)
          const cached = await loadCachedProfile(userId)
          loadCachedAssignments(userId)
          return cached
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
        return onlineProfile
      } catch (error) {
        console.error('Profile refresh failed.', error)
        const cached = await loadCachedProfile(userId)
        loadCachedAssignments(userId)
        return cached
      }
    },
    [fetchAssignments, loadCachedAssignments, loadCachedProfile],
  )

  const hydrateSession = useCallback(
    async (currentSession: Session | null) => {
      const runId = ++authRunRef.current

      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setLoading(true)

      const currentUser = currentSession?.user ?? null

      if (!currentUser?.id) {
        setProfile(null)
        setPoEngineerLguAssignments([])
        setRoEngineerProvinceAssignments([])
        if (runId === authRunRef.current) setLoading(false)
        return
      }

      const cachedProfile = await loadCachedProfile(currentUser.id)
      loadCachedAssignments(currentUser.id)

      if (runId !== authRunRef.current) return

      if (cachedProfile) {
        // Cached approval and AOR data are enough to render the app immediately.
        setLoading(false)

        if (navigator.onLine) {
          void fetchProfile(currentUser.id)
        }
        return
      }

      await fetchProfile(currentUser.id)

      if (runId === authRunRef.current) {
        setLoading(false)
      }
    },
    [fetchProfile, loadCachedAssignments, loadCachedProfile],
  )

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession()

    await hydrateSession(currentSession)
  }, [hydrateSession])

  useEffect(() => {
    let mounted = true

    async function initializeAuth() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (!mounted) return
      await hydrateSession(currentSession)
    }

    void initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      // Run outside the Supabase callback stack to avoid auth callback deadlocks.
      window.setTimeout(() => {
        if (mounted) void hydrateSession(currentSession)
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [hydrateSession])

  useEffect(() => {
    function handleOnline() {
      if (user?.id) void fetchProfile(user.id)
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [fetchProfile, user?.id])

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (result.data.session) {
      await hydrateSession(result.data.session)
    }

    return result
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (result.data.session) {
      await hydrateSession(result.data.session)
    }

    return result
  }

  const signOut = async () => {
    authRunRef.current += 1
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    setPoEngineerLguAssignments([])
    setRoEngineerProvinceAssignments([])
    setLoading(false)
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
