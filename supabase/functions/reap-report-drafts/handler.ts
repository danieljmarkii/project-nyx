// The draft sweep's request handling (CUL-2437), apart from Deno.serve so it is tested.
//
// WHO CALLS IT. Migration 118's pg_cron job, every 15 minutes, with the project's anon key (public
// by design; verify_jwt still turns away a call with no key), sending SWEEP_BODY. And once a day the
// overdue check (.github/workflows/report-drafts-check.yml, CUL-2465), sending CHECK_BODY with the
// same key. Anyone holding that key can send either, and that is safe on purpose: neither request
// carries an id, a filter or a time. The sweep can only remove drafts already past their 24 h
// (sweep.ts globalSweepIO), never a kept copy, a fresh draft or a chosen row, and answers with no
// count or id. The check deletes nothing and answers one bit (some draft is overdue, or none is):
// no count, id, path, owner or age.
//
// WHY `{}` IS REFUSED. The deploy's boot check posts `{}` with the anon key and needs a 4xx from the
// function itself (scripts/edge-deploy/verify.ts judgeAnon). So work runs only on a named body, and
// every deploy's check does nothing.

import { anyOverdueDraft, reapAllStaleDrafts, type SweepIO, type SweepResult } from './sweep.ts'

export const SWEEP_BODY = { sweep: 'drafts' } as const
export const CHECK_BODY = { check: 'overdue' } as const

export type SweepDeps = {
  /** Null when the deployment is missing its service role (it is platform-provided). */
  reaperIO: () => SweepIO | null
  sweep?: (io: SweepIO) => Promise<SweepResult>
  check?: (io: SweepIO) => Promise<boolean | null>
}

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status })

function named(body: unknown): 'sweep' | 'check' | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  const keys = Object.keys(b)
  if (keys.length !== 1) return null
  if (b.sweep === SWEEP_BODY.sweep) return 'sweep'
  if (b.check === CHECK_BODY.check) return 'check'
  return null
}

export async function handleSweep(req: Request, deps: SweepDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const what = named(body)
  if (what === null) return json({ error: 'sweep required' }, 400)

  const io = deps.reaperIO()
  if (io === null) {
    console.error('reap-report-drafts: missing required env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    return json({ error: 'Server misconfigured' }, 500)
  }

  if (what === 'check') {
    const overdue = await (deps.check ?? anyOverdueDraft)(io)
    console.log(`reap-report-drafts: overdue check, overdue=${overdue}`)
    if (overdue === null) return json({ error: 'Check failed' }, 500)
    return overdue ? json({ overdue: true }, 200) : new Response(null, { status: 204 })
  }

  const out = await (deps.sweep ?? reapAllStaleDrafts)(io)
  // The log is the operator's only view (counts, never an id or a path); the caller learns nothing.
  console.log(
    `reap-report-drafts: reaped ${out.reaped}, failed ${out.failed} in ${out.passes} pass(es), ok=${out.ok}, capped=${out.capped}`,
  )
  if (!out.ok) return json({ error: 'Sweep incomplete' }, 500)
  return new Response(null, { status: 204 })
}
