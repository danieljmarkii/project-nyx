// Supabase Edge Function — report-visit-link, the I/O shell (Vet report v2 PR-22, CUL-2302).
//
// The rules live in ./handler.ts (unit-tested in handler.test.ts). This file verifies the caller,
// hands the service-role I/O (./io.ts, each call paired with the verified uid, C-27) to it, and
// returns the handler's answer. No body value is ever trusted as an identity: the uid comes from
// `auth.getUser(jwt)` alone.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { linkReport, parseLinkRequest } from './handler.ts'
import { buildIO } from './io.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NO_STORE = { ...CORS_HEADERS, 'Cache-Control': 'private, no-store' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: NO_STORE })
  }
  const authHeader = req.headers.get('Authorization')
  const jwt = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !service) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500, headers: NO_STORE })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE })
  }

  try {
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader! } } })
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt)
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })

    const admin = createClient(url, service)
    const out = await linkReport(buildIO(admin, user.id), parseLinkRequest(body))
    return Response.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (err) {
    console.error('[report-visit-link] failed:', err instanceof Error ? err.message : String(err))
    return Response.json({ error: 'Link could not be saved' }, { status: 500, headers: NO_STORE })
  }
})
