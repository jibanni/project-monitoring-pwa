import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const PASSWORD_RECOVERY_INTENT_KEY = 'pms10:password-recovery-intent'

function urlContainsPasswordRecoveryIntent() {
  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  return (
    searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery'
  )
}

export function markPasswordRecoveryIntent() {
  try {
    window.sessionStorage.setItem(PASSWORD_RECOVERY_INTENT_KEY, '1')
  } catch (error) {
    console.warn('Unable to remember password recovery state.', error)
  }
}

export function clearPasswordRecoveryIntent() {
  try {
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_INTENT_KEY)
  } catch (error) {
    console.warn('Unable to clear password recovery state.', error)
  }
}

export function hasPasswordRecoveryIntent() {
  if (urlContainsPasswordRecoveryIntent()) return true

  try {
    return window.sessionStorage.getItem(PASSWORD_RECOVERY_INTENT_KEY) === '1'
  } catch {
    return false
  }
}

/*
 * Capture recovery intent before Supabase initializes.
 *
 * In the normal implicit recovery flow Supabase can consume the URL fragment
 * while creating the session. PMS10 keeps this short-lived marker so the
 * router can still send the user to /reset-password instead of /login or the
 * last protected page.
 */
if (urlContainsPasswordRecoveryIntent()) {
  markPasswordRecoveryIntent()
}

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  }
)
