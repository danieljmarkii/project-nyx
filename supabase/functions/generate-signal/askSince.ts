// CUL-2834 (PM ruling A, 2026-11-20): when each safety card's CURRENT ask began.
//
// Home may set one awareness line under a live safety card: "You called the vet on Fri, Nov 13."
// (lib/vetContactLine.ts). It names a contact made after the card's problem began. A card whose
// ask rises while it stays one card (eating less becomes a call today, a soon becomes a today)
// would keep that line under the louder ask, though the vet never heard about the louder part,
// and the line can read as "already handled". So the engine stamps `askSinceIso`: the instant the
// card's ask took its current level. The phone takes the later of that and the card's own start.
//
// THE RULE. A finding of a type in ASK_STAMPED carries the prior row's stamp only when that row
// held the same card (`findingIdentity`) at the same ask (`askKeyOf`) and the stamp is a real
// instant no later than now. Anything else stamps this run's instant: a new card, ANY change in
// the fields that set the ask (a drop as well as a rise), a failed or absent prior read, a row
// cached before the field existed. Every unknown stamps LATER, so the line errs toward silence:
// the stamp can only ever remove a contact line, never add one, and it touches nothing the card's
// sentence, count, ask or rank is computed from.
//
// incident_red_flag is not here: PR-07 (CUL-2769) bounds it by the newest event the card asks
// about, which the record itself carries.
//
// Pure: findings, the prior row's findings and a clock in; the findings out, each a new object.

import { findingIdentity } from '../../../lib/findingIdentity.ts'
import type { Finding } from './detection.ts'

export const ASK_STAMPED: ReadonlySet<string> = new Set([
  'intake_decline',
  'symptom_chronicity',
  'symptom_worsening',
  'symptom_burden',
])

/** The fields that set a card's ask, as one string; null for a type that is not stamped. Wider
 *  than the client's `safetyAskLevel` on purpose (lib/signalCopy.ts): any field that ladder reads
 *  is here, so a change the ladder sees always restamps, and a change it does not see restamps
 *  too (later, so quieter, never louder). */
export function askKeyOf(f: unknown): string | null {
  if (!f || typeof f !== 'object') return null
  const x = f as Record<string, unknown>
  if (typeof x.type !== 'string' || !ASK_STAMPED.has(x.type) || x.priorityClass !== 'safety') return null
  if (x.type === 'intake_decline') {
    return JSON.stringify([x.trigger ?? null, x.species ?? null, x.allRefused ?? null, x.noGoodMeal24h ?? null, x.sustainedRefusal !== undefined, x.refusedThenVomited !== undefined])
  }
  return JSON.stringify([x.tier ?? null])
}

interface PriorStamp {
  key: string
  ms: number
}

/** The prior row's stamps by identity: the first entry for each, and only one carrying a stamp
 *  that parses. A malformed row yields nothing (every card then stamps now). */
function priorStamps(prior: unknown): Map<string, PriorStamp> {
  try {
    return readStamps(prior)
  } catch {
    // A prior row that throws on read is no prior row: every card stamps now (the stand-down's
    // own read reports the error; this costs only the carried stamps, never a finding).
    return new Map()
  }
}

function readStamps(prior: unknown): Map<string, PriorStamp> {
  const out = new Map<string, PriorStamp>()
  if (!Array.isArray(prior)) return out
  for (const e of prior) {
    const finding = e && typeof e === 'object' ? (e as { finding?: unknown }).finding : undefined
    const key = askKeyOf(finding)
    if (key === null) continue
    let id: string
    try {
      id = findingIdentity(finding as Parameters<typeof findingIdentity>[0])
    } catch {
      continue
    }
    if (out.has(id)) continue
    const iso = (finding as { askSinceIso?: unknown }).askSinceIso
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN
    out.set(id, { key, ms })
  }
  return out
}

/**
 * Stamp `askSinceIso` on each finding of an ASK_STAMPED type. `prior` is the prior row's cached
 * findings (`[{ rank, text, finding }]`), or null when there is none or its read failed.
 */
export function stampAskSince<T extends { finding: Finding }>(rows: readonly T[], prior: unknown, nowMs: number): T[] {
  const stamps = priorStamps(prior)
  const nowIso = new Date(nowMs).toISOString()
  return rows.map((r) => {
    const key = askKeyOf(r.finding)
    if (key === null) return r
    const held = stamps.get(findingIdentity(r.finding as Parameters<typeof findingIdentity>[0]))
    const carried = held !== undefined && held.key === key && Number.isFinite(held.ms) && held.ms <= nowMs
    const askSinceIso = carried ? new Date(held.ms).toISOString() : nowIso
    return { ...r, finding: { ...r.finding, askSinceIso } as unknown as Finding }
  })
}
