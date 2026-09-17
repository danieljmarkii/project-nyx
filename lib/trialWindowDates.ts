// The diet trial's two pure window-date helpers.
//
// ── WHY THEY LIVE HERE AND NOT IN `dietTrialSetup.ts` (C-26) ──────────────────
//
// They were written in `dietTrialSetup.ts` beside the write paths that use them,
// and that file imports `./sync` → `./supabase`, which FAILS FAST at module load
// when the Expo env is unset. So importing either helper drags the Supabase client
// in behind it, and any pure module that wanted one inherited a runtime edge to a
// throwing side-effect.
//
// That is not hypothetical: `lib/dietTrialCard.ts` takes only `import type` from
// `dietTrialSetup` — deliberately, so the resolver the guards drive directly stays
// free of the client — and CUL-1040 needs the end date ON that resolver, for
// §4.3's line. A shared module's boundary is what IMPORTS it, not what its name
// suggests, so the pure half moved out rather than the consumer taking the edge.
//
// `dietTrialSetup.ts` RE-EXPORTS both, so every existing caller and its tests are
// untouched and there is exactly one implementation.

import { toLocalDayKey, dayKeyToLocalDate } from './utils';

/**
 * A trial's own local day key, whether `started_at` arrived as a DATE or an ISO
 * instant — the local mirror stores TEXT and both shapes exist in the wild.
 *
 * LIFTED HERE BECAUSE A NAIVE SLICE IS OFF BY A DAY, AND ON THE SAME CARD (CUL-1040,
 * found by `code-reviewer`). `startDayKeyOf` in `lib/dietTrialCard.ts` did
 * `startedAt.slice(0, 10)` under a comment claiming it mirrored
 * `dietTrialFacts.startKeyOf`, which it did not: that one BRANCHES. On an ISO instant
 * the slice yields the UTC day, while `localDayIndexOf` — which the card's own
 * persistent `Ends <date>` line goes through — yields the LOCAL one. For
 * `2026-09-18T03:00:00.000Z` read at UTC-4 those are 18 Sep and 17 Sep, so one card
 * printed two different end dates for one window, on the sentence §4.2 calls the
 * thing the owner plans around.
 *
 * `lib/dietTrialFacts.ts`'s `startKeyOf` now delegates here, so there is ONE branch
 * rather than the three a second inline copy would have made.
 */
export function trialStartDayKey(startedAt: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(startedAt)
    ? startedAt
    : toLocalDayKey(new Date(startedAt));
}

/** The window's LAST day, inclusive: start + target − 1. An off-by-one here is an
 *  off-by-one on the milestone that decides whether an owner stops a diet. */
export function trialEndDayKey(startDayKey: string, targetDays: number): string | null {
  const start = dayKeyToLocalDate(startDayKey);
  if (!start || !Number.isFinite(targetDays) || targetDays < 1) return null;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(targetDays) - 1);
  return toLocalDayKey(end);
}

// "27 August" — and "27 August 2027" when the trial runs past new year, because a
// bare "27 August" on a 12-week trial started in November is genuinely ambiguous.
export function formatTrialEndDate(dayKey: string, now: Date = new Date()): string | null {
  const d = dayKeyToLocalDate(dayKey);
  if (!d) return null;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
