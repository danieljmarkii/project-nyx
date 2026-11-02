// The draft sweep's request handling (CUL-2437), apart from Deno.serve so it is tested.
//
// WHO CALLS IT. Migration 118's pg_cron job, every 15 minutes, with the project's anon key (public
// by design; verify_jwt still turns away a call with no key). Anyone holding that key can call it
// too, and that is safe on purpose: the request carries no id, no filter and no time, so a call can
// only remove drafts that are already past their 24 h (savedCopy.ts globalDraftReaperIO). It cannot
// reach a kept copy, a fresh draft or a chosen row, and it answers with no count or id.
//
// WHY `{}` IS REFUSED. The deploy's boot check posts `{}` with the anon key and needs a 4xx from the
// function itself (scripts/edge-deploy/verify.ts judgeAnon). So the sweep runs only on the body the
// job sends, `{"sweep": "drafts"}`, and every deploy's check reaps nothing.

import { reapAllStaleDrafts, type DraftReaperIO, type SweepResult } from '../generate-report/savedCopy.ts'

export const SWEEP_BODY = { sweep: 'drafts' } as const

export type SweepDeps = {
  /** Null when the deployment is missing its service role (it is platform-provided). */
  reaperIO: () => DraftReaperIO | null
  sweep?: (io: DraftReaperIO) => Promise<SweepResult>
}

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status })

export async function handleSweep(req: Request, deps: SweepDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const named = body !== null && typeof body === 'object' && !Array.isArray(body) &&
    (body as Record<string, unknown>).sweep === SWEEP_BODY.sweep
  if (!named) return json({ error: 'sweep required' }, 400)

  const io = deps.reaperIO()
  if (io === null) {
    console.error('reap-report-drafts: missing required env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    return json({ error: 'Server misconfigured' }, 500)
  }
  const out = await (deps.sweep ?? reapAllStaleDrafts)(io)
  // The log is the operator's only view (counts, never an id or a path); the caller learns nothing.
  console.log(`reap-report-drafts: reaped ${out.reaped} in ${out.passes} pass(es), ok=${out.ok}, capped=${out.capped}`)
  if (!out.ok) return json({ error: 'Sweep incomplete' }, 500)
  return new Response(null, { status: 204 })
}
