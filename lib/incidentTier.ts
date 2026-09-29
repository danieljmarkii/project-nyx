// The per-incident read's TIER: how soon to act on it (EN-3, CUL-1133; Engines v3 PR-26).
// One order, one list, imported by the phone and the server alike, beside the quiet list
// in `lib/incidentVerdict.ts` (docs/nyx-incident-tiers-requirements.md §1).
//
// THE COLUMNS. `event_ai_analysis.tier` (migration 079) sits BESIDE `recommendation`, which
// keeps its three values forever so installed builds keep today's words (GAP-3, CUL-1277).
// Every write under the Engines v3 key that sets one sets the other, by the map below.
// A reader shows the LOUDER of the two (`effectiveTierRank`), so a missed dual-write can
// never render calmer than the legacy column, and a rolled-back build that writes only
// `recommendation` can never lower a tier already on the row.
//
// THE ORDER. call_now > call_today > {logged, not_enough_to_say}. The two quiet tiers share
// a rank on purpose: moving between them is free in both directions, so a partial or
// unreadable re-read can still collapse an earlier calm read (B-203, CUL-812). Never-lower
// binds the CALL tiers only.
//
// A VALUE THIS BUILD DOES NOT KNOW ranks as call_now, in either column: the CUL-1277 rule
// (an unknown verdict is an escalation until someone decides it is quiet), taken to the top
// of the order, because a guard that protects a stored call must not step down from a value
// a later rule wrote. A legacy `worth_a_call` with no tier beside it ranks as call_today:
// nobody knows which call it would have been, and call today is what it has always meant.
//
// WHAT THIS FILE IS NOT. It holds no owner-facing words (those are the tier-word map, PR-27),
// and it never decides which tier a finding earns (that is the floor's job: today every
// escalation the engine makes is call today; the louder rows arrive with their own rules).
// It imports nothing, so the Edge Functions can import it (`../../../lib/incidentTier.ts`)
// without pulling client copy into their shipping closure (C-26).

import { isQuietVerdict } from './incidentVerdict.ts';

/** The four stored tiers (079's CHECK). "Part of a pattern" is drawn at render and is never
 *  stored (K2, PM 2026-09-28), so it is not a value here. */
export const INCIDENT_TIERS = ['call_now', 'call_today', 'logged', 'not_enough_to_say'] as const;

export type IncidentTier = (typeof INCIDENT_TIERS)[number];

const TIERS: readonly string[] = INCIDENT_TIERS;

export function isIncidentTier(value: unknown): value is IncidentTier {
  return typeof value === 'string' && TIERS.includes(value);
}

/** The ranks. Quiet tiers share one; the two calls are strictly ordered above it. */
export const TIER_RANK = { quiet: 0, call_today: 1, call_now: 2 } as const;

export type TierRank = (typeof TIER_RANK)[keyof typeof TIER_RANK];

/** A stored tier's rank. `null` / `undefined` is "no tier written" and ranks as quiet,
 *  which is safe only because readers take the louder of this and the verdict's rank. */
export function tierRank(tier: string | null | undefined): TierRank {
  if (tier === null || tier === undefined) return TIER_RANK.quiet;
  if (tier === 'logged' || tier === 'not_enough_to_say') return TIER_RANK.quiet;
  if (tier === 'call_today') return TIER_RANK.call_today;
  return TIER_RANK.call_now; // call_now, and any value this build does not know
}

/** The legacy verdict's rank: quiet values are quiet, `worth_a_call` is call today, and a
 *  value this build does not know is call now. `null` is no verdict, quiet. */
export function verdictRank(recommendation: string | null | undefined): TierRank {
  if (recommendation === null || recommendation === undefined) return TIER_RANK.quiet;
  if (isQuietVerdict(recommendation)) return TIER_RANK.quiet;
  if (recommendation === 'worth_a_call') return TIER_RANK.call_today;
  return TIER_RANK.call_now;
}

/** What a row says, read as the louder of its two columns. */
export function effectiveTierRank(row: {
  tier?: string | null;
  recommendation?: string | null;
}): TierRank {
  return Math.max(tierRank(row.tier), verdictRank(row.recommendation)) as TierRank;
}

/** The writer's map from today's verdict to the tier written beside it (spec §1). A verdict
 *  outside the three is refused rather than guessed: the writers only ever hold the three. */
export function tierForVerdict(recommendation: 'worth_a_call' | 'monitor' | 'not_enough_to_say'): IncidentTier {
  if (recommendation === 'worth_a_call') return 'call_today';
  if (recommendation === 'monitor') return 'logged';
  return 'not_enough_to_say';
}

/** The legacy value each tier writes beside itself (the inverse of the map above, and the
 *  contract installed builds read). */
export function verdictForTier(tier: IncidentTier): 'worth_a_call' | 'monitor' | 'not_enough_to_say' {
  if (tier === 'call_now' || tier === 'call_today') return 'worth_a_call';
  if (tier === 'logged') return 'monitor';
  return 'not_enough_to_say';
}
