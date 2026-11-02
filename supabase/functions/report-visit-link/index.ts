// Supabase Edge Function — report-visit-link, the I/O shell (Vet report v2 PR-22, CUL-2302).
//
// The rules live in ./handler.ts (unit-tested in handler.test.ts). This file verifies the caller,
// builds the service-role reads and the one write, each paired with the verified uid (C-27), and
// returns the handler's answer. No body value is ever trusted as an identity: the uid comes from
// `auth.getUser(jwt)` alone.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { linkReport, parseLinkRequest, type LinkIO, type LinkTarget } from './handler.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NO_STORE = { ...CORS_HEADERS, 'Cache-Control': 'private, no-store' }

/** The four calls the handler makes, every one scoped to `uid`. */
export function buildIO(admin: SupabaseClient, uid: string): LinkIO {
  return {
    async petIsCallers(petId) {
      const { data, error } = await admin.from('pets').select('id').eq('id', petId).eq('user_id', uid).maybeSingle()
      if (error) return 'error'
      return data !== null
    },
    async readReport(petId, reportId) {
      const { data, error } = await admin
        .from('vet_reports')
        .select('status')
        .eq('id', reportId)
        .eq('pet_id', petId)
        .eq('generated_by', uid)
        .maybeSingle()
      if (error) return 'error'
      return data === null ? null : { status: String((data as { status: unknown }).status) }
    },
    async targetIsPets(petId, target: LinkTarget) {
      // The pet is the caller's (checked first, above), so "same pet" here is also "the caller's".
      if (target.kind === 'visit') {
        const { data, error } = await admin
          .from('vet_visits')
          .select('id')
          .eq('id', target.id)
          .eq('pet_id', petId)
          .is('deleted_at', null)
          .maybeSingle()
        if (error) return 'error'
        return data !== null
      }
      const { data, error } = await admin
        .from('vet_appointments')
        .select('id')
        .eq('id', target.id)
        .eq('pet_id', petId)
        .is('deleted_at', null)
        .is('cancelled_at', null)
        .maybeSingle()
      if (error) return 'error'
      return data !== null
    },
    async writeLinks(petId, reportId, links) {
      const { data, error } = await admin
        .from('vet_reports')
        .update(links)
        .eq('id', reportId)
        .eq('pet_id', petId)
        .eq('generated_by', uid)
        .eq('status', 'kept')
        .select('id')
      if (error) return 'error'
      return Array.isArray(data) ? data.length : 0
    },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS })
  }
  const authHeader = req.headers.get('Authorization')
  const jwt = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !service) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500, headers: CORS_HEADERS })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS })
  }

  try {
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader! } } })
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt)
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })

    const admin = createClient(url, service)
    const out = await linkReport(buildIO(admin, user.id), parseLinkRequest(body))
    return Response.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (err) {
    console.error('[report-visit-link] failed:', err instanceof Error ? err.message : String(err))
    return Response.json({ error: 'Link could not be saved' }, { status: 500, headers: CORS_HEADERS })
  }
})
