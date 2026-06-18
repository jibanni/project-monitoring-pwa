import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function validatePassword(password: string) {
  if (password.length < 8) return 'Password must have at least 8 characters.'
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.'
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least one symbol.'

  return ''
}

serve(async (req: Request) => {
  console.log('admin-change-password function started')

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      message: 'Method not allowed.',
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Missing Supabase environment variables')

      return jsonResponse(500, {
        ok: false,
        message: 'Missing Supabase Edge Function environment variables.',
      })
    }

    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      console.error('Missing authorization header')

      return jsonResponse(401, {
        ok: false,
        message: 'Missing authorization header. Please log in again.',
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    console.log('Checking requester session')

    const {
      data: requesterData,
      error: requesterError,
    } = await userClient.auth.getUser()

    if (requesterError || !requesterData?.user) {
      console.error('Invalid requester session', requesterError)

      return jsonResponse(401, {
        ok: false,
        message: 'Invalid or expired login session. Please log in again.',
      })
    }

    const requesterId = requesterData.user.id

    console.log('Checking requester profile role', requesterId)

    const {
      data: requesterProfile,
      error: requesterProfileError,
    } = await adminClient
      .from('profiles')
      .select('id, role, approved')
      .eq('id', requesterId)
      .maybeSingle()

    if (requesterProfileError) {
      console.error('Requester profile query error', requesterProfileError)

      return jsonResponse(500, {
        ok: false,
        message: requesterProfileError.message || 'Unable to verify admin profile.',
      })
    }

    const requesterRole = String(requesterProfile?.role || '').trim().toLowerCase()

    if (requesterRole !== 'admin') {
      console.error('Requester is not admin', {
        requesterId,
        requesterRole,
      })

      return jsonResponse(403, {
        ok: false,
        message: 'Only admin accounts can change user passwords.',
      })
    }

    const body = await req.json().catch(() => ({}))

    const action = String(body?.action || '').trim()
    const userId = String(body?.userId || '').trim()
    const newPassword = String(body?.newPassword || '')

    if (action !== 'change-password') {
      return jsonResponse(400, {
        ok: false,
        message: 'Invalid action.',
      })
    }

    if (!userId) {
      return jsonResponse(400, {
        ok: false,
        message: 'Missing user ID.',
      })
    }

    const passwordError = validatePassword(newPassword)

    if (passwordError) {
      return jsonResponse(400, {
        ok: false,
        message: passwordError,
      })
    }

    console.log('Changing password for user', userId)

    const {
      data: updatedUser,
      error: updateError,
    } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (updateError) {
      console.error('Password update error', updateError)

      return jsonResponse(500, {
        ok: false,
        message: updateError.message || 'Unable to update user password.',
      })
    }

    console.log('Password changed successfully', updatedUser?.user?.id || userId)

    return jsonResponse(200, {
      ok: true,
      message: 'Password changed successfully.',
      userId: updatedUser?.user?.id || userId,
    })
  } catch (error) {
    console.error('Unexpected function error', error)

    return jsonResponse(500, {
      ok: false,
      message: error instanceof Error ? error.message : 'Unexpected server error.',
    })
  }
})