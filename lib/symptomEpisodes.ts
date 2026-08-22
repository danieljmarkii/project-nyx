/**
 * The ONE symptom-episode predicate (B-067 / CUL-372).
 *
 * A pet that vomits four times inside an hour has had ONE episode, not four.
 * Every surface that states "N this week" about a symptom must agree on that,
 * because two surfaces counting the same events in different units contradict
 * each other in front of the owner — which is exactly what B-067 found on Home:
 * the Signal card said "2 episodes this week, down from 5 last week" while the
 * Trend card, one row below, said "5 this week · Same as last week (5)".
 *
 * So the collapse lives here, once, and is imported by BOTH consumers:
 *   • `supabase/functions/generate-signal/detection.ts` (the engine — detectors
 *     ③/④/⑤/⑦ and the correlation lanes)
 *   • `hooks/useTrend.ts` (the Home Trend chart)
 *
 * `lib/symptomEpisodes.guard.test.ts` fails the build if either re-spells it.
 * This is the diet-trial §5.3 lesson ("there is ONE off-diet predicate") applied
 * to episode counting, and it is a re-based extraction rather than a new rule:
 * the body below is the engine's shipped `toEpisodeOnsets`, moved verbatim, so
 * the deployed function's behaviour is unchanged and no redeploy is required for
 * correctness.
 */

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Gap that separates two episodes of the SAME symptom, in hours.
 *
 * 3h is the shipped engine default (`DEFAULT_CONFIG.symptomEpisodeGapHours`),
 * which continues to own the value for the engine's own per-call config; this
 * constant is what a consumer with no config (the client) reads, so the two
 * cannot drift apart silently.
 */
export const SYMPTOM_EPISODE_GAP_HOURS = 3;

/**
 * Collapse a list of symptom-event instants (epoch ms, one SYMPTOM TYPE only)
 * into episode ONSETS — the first instant of each run of events separated by no
 * more than `gapHours`.
 *
 * Two properties this deliberately has, both load-bearing and both pinned by
 * tests:
 *
 *  1. **The gap chains.** `prev` advances to every event, not just to the onset,
 *     so a continuous drip of events each <= `gapHours` apart stays ONE episode
 *     however long it runs. A pet retching every two hours through the night is
 *     one bad night, not twelve incidents. (Changing this to measure from the
 *     onset would silently inflate every count in the engine.)
 *  2. **It is a pure function of the multiset of instants.** Input order does
 *     not matter (it sorts), and re-collapsing an already-collapsed list is a
 *     no-op — `f(f(x)) === f(x)` — so a consumer that collapses twice by mistake
 *     cannot change a count. The convergence property is enforced by test, the
 *     same discipline `lib/protein.ts` carries for canonical keys.
 *
 * Non-finite instants are dropped rather than propagated: an unparseable
 * timestamp must not become a `NaN` comparison that silently splits or merges
 * episodes. Callers may pre-filter (the engine does); doing it here too is
 * idempotent and makes the client path safe by construction.
 *
 * ONE type at a time — a vomit and an itch an hour apart are two different
 * symptoms, never one episode. Callers group by type before calling.
 */
export function collapseToEpisodeOnsets(
  symptomMsList: readonly number[],
  gapHours: number = SYMPTOM_EPISODE_GAP_HOURS,
): number[] {
  const finite = symptomMsList.filter((ms) => Number.isFinite(ms));
  if (finite.length === 0) return [];
  const gapMs = gapHours * MS_PER_HOUR;
  const sorted = [...finite].sort((a, b) => a - b);
  const onsets: number[] = [sorted[0]];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - prev > gapMs) onsets.push(sorted[i]);
    prev = sorted[i];
  }
  return onsets;
}

/**
 * Episode COUNT over a half-open instant window `[startMs, endMs)`.
 *
 * The window is applied to episode ONSETS, never to raw events — an episode
 * belongs to the window its onset falls in, so a run that straddles a boundary
 * is counted once, on the side it began. Collapsing first and filtering second
 * is the order that makes that true; filtering first would split a straddling
 * run into two episodes, one on each side.
 */
export function countEpisodesInWindow(
  symptomMsList: readonly number[],
  startMs: number,
  endMs: number,
  gapHours: number = SYMPTOM_EPISODE_GAP_HOURS,
): number {
  return collapseToEpisodeOnsets(symptomMsList, gapHours).filter(
    (ms) => ms >= startMs && ms < endMs,
  ).length;
}
