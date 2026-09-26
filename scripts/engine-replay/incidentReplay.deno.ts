// Replays the per-incident vomit escalation floor over a pet's record (CUL-1117).
//
//   deno run --allow-read --allow-net scripts/engine-replay/incidentReplay.deno.ts \
//     --record <scratch>/record.json --meals <scratch>/meals.json
//
// (--allow-net only because analyze-vomit's module graph imports supabase-js from esm.sh;
// nothing here makes a request.)
//
// Three columns per analysed vomit:
//   stored    — the contextual flags the live read wrote.
//   shipped   — the SHIPPED computeContextualFlags, fed the way analyze-vomit's
//               assembleContext feeds it: every window anchored at the moment the analysis
//               ran, over the rows that existed then. Must equal `stored`; a mismatch means
//               the replay is not faithful and nothing below it should be trusted.
//   sketch    — the recalibration proposed in docs/research/2026-09-engines-step-change.md
//               §7, AS AMENDED by that session's adversarial pass. A research sketch, not a
//               spec: its thresholds are placeholders for a Dr. Chen ruling, and it never
//               drives a shipped surface.
//
// The photo half cannot be replayed without re-running the vision model; visual flags are
// reported as stored, beside whether the owner later edited the fields they rest on.
import { computeContextualFlags } from '../../supabase/functions/analyze-vomit/index.ts'
import { argValue, loadRecord, visibleAt, type PetRecord, type RecordEvent } from './record.deno.ts'
import { emptyReplayProblem } from './subject.ts'

const H = 3_600_000
const SETTLE = 5 * 60_000 // see record.deno.ts visibleAt
const t = (s: string) => Date.parse(s)

// analyze-vomit/index.ts assembleContext, restated as a query over the as-of record. The
// windows (24h vomits, 24h lethargy, 7d intake baseline, 24h positive intake) are read from
// that file; if it changes, the `shipped` column stops matching `stored` and says so.
function shippedInput(rec: PetRecord, ev: RecordEvent, T: number) {
  const vis = (e: RecordEvent) => visibleAt(e, T, Infinity, SETTLE)
  const recentVomitTimes = rec.events.filter((e) => e.ty === 'vomit' && vis(e) && t(e.at) >= T - 24 * H).map((e) => e.at)
  if (!recentVomitTimes.includes(ev.at)) recentVomitTimes.push(ev.at)
  const hasRecentLethargy = rec.events.some((e) => e.ty === 'lethargy' && vis(e) && t(e.at) >= T - 24 * H)
  const meals = rec.meals.filter((m) => visibleAt({ cr: m.cr, del: m.del, at: m.at }, T, Infinity, SETTLE) && t(m.at) >= T - 7 * 24 * H)
  const tracksIntake = meals.some((m) => m.rating !== null)
  const hasRecentPositiveIntake = meals.some((m) => t(m.at) >= T - 24 * H && (m.rating === 'most' || m.rating === 'all'))
  return { species: rec.pet.species, recentVomitTimes, thisEventOccurredAt: ev.at, hasRecentPositiveIntake, tracksIntake, hasRecentLethargy }
}

// ── The sketch (brief §7, amended) ────────────────────────────────────────────────────
// Episodes: only WITNESSED logs merge, and only within 30 min of an episode's onset (no
// chaining — the shared lib/symptomEpisodes.ts collapse chains, which would fold a dog
// retching every 10 minutes into one episode). A found pile is its own episode: two piles
// found together may be hours apart. Windows run in both directions from the vomit, up to
// the moment the read runs, so a late-logged found vomit is counted by its neighbours.
const MERGE_MIN = 30
function episodes(evs: RecordEvent[]): number[] {
  const sorted = [...evs].sort((a, b) => t(a.at) - t(b.at))
  const onsets: number[] = []
  let openOnset: number | null = null
  for (const e of sorted) {
    const at = t(e.at)
    if (e.cf === 'witnessed' && openOnset !== null && at - openOnset <= MERGE_MIN * 60_000) continue
    onsets.push(at)
    openOnset = e.cf === 'witnessed' ? at : null
  }
  return onsets
}

type Tier = 'call_now' | 'call_today'
function sketch(rec: PetRecord, ev: RecordEvent, T: number): { tier: Tier; why: string }[] {
  const out: { tier: Tier; why: string }[] = []
  const at = t(ev.at)
  const vomits = rec.events.filter((e) => e.ty === 'vomit' && visibleAt(e, T, Infinity, SETTLE) && t(e.at) >= at - 24 * H && t(e.at) <= Math.max(T, at + 24 * H))
  const logs30 = vomits.filter((e) => Math.abs(t(e.at) - at) <= 30 * 60_000).length
  const eps = episodes(vomits)
  const within = (h: number) => eps.filter((o) => Math.abs(o - at) <= h * H).length
  if (logs30 >= 3) out.push({ tier: 'call_now', why: `${logs30} vomits logged within 30 min` })
  else if (within(4) >= 3) out.push({ tier: 'call_now', why: '3+ episodes within 4h' })
  else if (within(24) >= 3) out.push({ tier: 'call_today', why: '3+ episodes within 24h' })

  if (rec.pet.species === 'cat') {
    // Unrated = unknown. Only recorded refusals fire, and unknowns never cancel them.
    const w = rec.meals.filter((m) => visibleAt({ cr: m.cr, del: m.del, at: m.at }, T, Infinity, SETTLE) && t(m.at) >= at - 24 * H)
    const pos = w.filter((m) => m.rating === 'most' || m.rating === 'all').length
    const neg = w.filter((m) => m.rating === 'refused' || m.rating === 'picked').length
    if (pos === 0 && neg >= 2) out.push({ tier: 'call_today', why: `${neg} refusals, nothing eaten well` })
  }
  if (rec.events.some((e) => e.ty === 'lethargy' && visibleAt(e, T, Infinity, SETTLE) && t(e.at) >= at - 24 * H)) {
    out.push({ tier: 'call_now', why: 'lethargy logged' })
  }
  return out
}

if (import.meta.main) {
  const rec = loadRecord(argValue('record'), argValue('meals'))
  const byEvent = new Map(rec.events.map((e) => [e.id, e]))
  const fmt = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: rec.tz, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
  let reads = 0, storedCalls = 0, mismatches = 0
  const tierCount = new Map<string, number>()
  console.log('vomit        stored rec     stored ctx              shipped ok  visual (edited?)                 sketch')
  for (const a of [...rec.analyses].sort((x, y) => t(byEvent.get(x.event_id)?.at ?? x.created_at) - t(byEvent.get(y.event_id)?.at ?? y.created_at))) {
    const ev = byEvent.get(a.event_id)
    if (!ev || ev.del || a.incident_type !== 'vomit' || a.recommendation == null) continue
    reads++
    // The stored flags come from the LAST analysis run. An owner edit also moves updated_at
    // but never recomputes the flags (clinical-guardrails Pattern 7), so an edited row falls
    // back to its first run.
    const T = t(a.edited_at == null && a.updated_at ? a.updated_at : a.created_at)
    const shipped = computeContextualFlags(shippedInput(rec, ev, T) as Parameters<typeof computeContextualFlags>[0])
    const stored = a.contextual_flags ?? []
    const ok = shipped.length === stored.length && shipped.every((f) => stored.includes(f))
    if (!ok) mismatches++
    if (a.recommendation === 'worth_a_call') storedCalls++
    const sk = sketch(rec, ev, T)
    const top = sk.find((s) => s.tier === 'call_now') ?? sk[0]
    const visual = (a.visual_flags ?? []).join(',')
    if (a.recommendation === 'worth_a_call' || sk.length > 0 || !ok) {
      tierCount.set(top?.tier ?? 'logged', (tierCount.get(top?.tier ?? 'logged') ?? 0) + (stored.length > 0 || sk.length > 0 ? 1 : 0))
      console.log(`${fmt(t(ev.at))}  ${a.recommendation.padEnd(13)}  ${JSON.stringify(stored).padEnd(22)}  ${String(ok).padEnd(10)}  ${(visual ? `${visual} (${a.edited_at ? 'edited' : 'not edited'})` : '').padEnd(32)} ${sk.map((s) => `${s.tier}: ${s.why}`).join('; ') || '(logged)'}`)
    }
  }
  console.log(`\n${reads} live vomit reads · ${storedCalls} stored worth_a_call · shipped-rule mismatches: ${mismatches}`)
  // A mismatch count over zero reads is not a fidelity pass (CUL-1276).
  const empty = emptyReplayProblem('live vomit reads', reads)
  if (empty) {
    console.error(`FAIL: ${empty}`)
    Deno.exit(1)
  }
}
