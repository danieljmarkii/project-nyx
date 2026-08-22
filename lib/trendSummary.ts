/**
 * The Home Trend card's symptom arithmetic (B-067 / CUL-372).
 *
 * Extracted out of `hooks/useTrend.ts` because that hook reads SQLite and cannot be
 * unit-tested, and the first cut of this logic shipped two boundary bugs that a test
 * on a pure function would have caught immediately (a DST-dependent fetch window and
 * a tie-break that did not match the engine's). Same move `lib/symptomEpisodes.ts`
 * made for the collapse: if it decides a number an owner reads, it is testable.
 */

import { collapseToEpisodeOnsets, countEpisodesInWindow } from './symptomEpisodes';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const TREND_WINDOW_DAYS = 7;
export const TREND_LOOKBACK_DAYS = 14;

/**
 * Symptom types the Trend chart plots, in the order ties are broken.
 *
 * The first five are `CORRELATION_SYMPTOM_TYPES` from the Signal engine, **in its
 * declared order, not alphabetical** — the engine breaks a residual tie by that array's
 * order (`detection.ts` builds its stats by iterating it), so ordering this list any
 * other way lets the two cards name different symptoms on a genuine tie. Code review
 * caught exactly that: the first cut sorted alphabetically.
 *
 * `lethargy` is appended, and is deliberately NOT in the engine's list:
 * `CORRELATION_SYMPTOM_TYPES` scopes food→symptom CORRELATION, not what belongs on a
 * symptom chart. Dropping a real symptom from a symptom chart to make two lists match
 * would lose more than it fixes. It sorts last so it can never displace a correlation
 * symptom on a tie.
 */
export const TREND_SYMPTOM_TYPES = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
  'lethargy',
] as const;

const TREND_SYMPTOM_SET: ReadonlySet<string> = new Set(TREND_SYMPTOM_TYPES);

export interface TrendSymptomSummary {
  /** The symptom the card names, or null when nothing was logged in the lookback. */
  dominantSymptomType: string | null;
  /** EPISODE count in `[now-7d, now)` — the unit the Signal's reflection layer uses. */
  thisWeekSymptomCount: number;
  /** EPISODE count in `[now-14d, now-7d)`. Data only — never rendered as a comparison. */
  lastWeekSymptomCount: number;
}

/** Instant of the earliest event the card needs. The SQL fetch bound and the window
 *  bounds MUST both come from here.
 *
 *  Code review found the first cut deriving the SQL bound with calendar arithmetic
 *  (`cutoff.setDate(cutoff.getDate() - 14)`) while the window bounds used fixed-offset
 *  epoch arithmetic. Those agree except across a DST transition, where they diverge by
 *  the transition's offset — and because the calendar one was the SQL bound, an event
 *  in that sliver was never fetched at all, so it silently vanished from the prior
 *  window rather than being visibly filtered. One basis, one boundary. */
export function trendLookbackStartMs(nowMs: number): number {
  return nowMs - TREND_LOOKBACK_DAYS * MS_PER_DAY;
}

/** Group symptom instants by type, collapsed to episode onsets. Non-symptom rows and
 *  unparseable timestamps are dropped. */
export function symptomOnsetsByType(
  events: ReadonlyArray<{ event_type: string; occurred_at: string }>,
): Map<string, number[]> {
  const byType = new Map<string, number[]>();
  for (const e of events) {
    if (!TREND_SYMPTOM_SET.has(e.event_type)) continue;
    const ms = Date.parse(e.occurred_at);
    if (!Number.isFinite(ms)) continue;
    const list = byType.get(e.event_type);
    if (list) list.push(ms);
    else byType.set(e.event_type, [ms]);
  }
  for (const [type, msList] of byType) {
    byType.set(type, collapseToEpisodeOnsets(msList));
  }
  return byType;
}

/**
 * Pick the symptom the card names and count its two windows, in EPISODES.
 *
 * Selection mirrors the Signal reflection layer's *intent* — the symptom most present
 * right now, highest current-window episode count, tie broken by the larger fall, then
 * by `TREND_SYMPTOM_TYPES` order — but deliberately NOT its candidate FILTER. The
 * engine only considers symptoms that are flat-or-falling and clear an episode floor,
 * because it is deciding whether to make a comparative CLAIM. This card makes no claim;
 * it draws a chart, and a chart that refused to plot a rising symptom would be worse
 * than useless. So the two surfaces can name different symptoms — two true facts, which
 * stopped being a contradiction when the card stopped rendering a verdict.
 *
 * THE ABSENCE FLOOR IS SHARED, though: a symptom with zero current-window episodes is
 * never selected while any symptom has one. `detectReflections` refuses a zero current
 * count because "no vomiting this week" is reassurance-by-absence, and a card reading
 * "0 episodes this week" is the same claim with the word "improving" removed. When
 * NOTHING was logged this week the card falls back to naming the prior window's
 * dominant symptom and returns a count of 0 — which the card renders as no count line
 * at all, letting the empty right-hand half of the chart be the only statement.
 */
export function summarizeSymptomTrend(
  events: ReadonlyArray<{ event_type: string; occurred_at: string }>,
  nowMs: number,
): TrendSymptomSummary {
  const onsetsByType = symptomOnsetsByType(events);
  const currentStart = nowMs - TREND_WINDOW_DAYS * MS_PER_DAY;
  const priorStart = trendLookbackStartMs(nowMs);

  let best: TrendSymptomSummary = {
    dominantSymptomType: null,
    thisWeekSymptomCount: 0,
    lastWeekSymptomCount: 0,
  };

  for (const type of TREND_SYMPTOM_TYPES) {
    const onsets = onsetsByType.get(type);
    if (!onsets || onsets.length === 0) continue;
    // Already collapsed; re-collapsing is a no-op by the convergence property.
    const current = countEpisodesInWindow(onsets, currentStart, nowMs);
    const prior = countEpisodesInWindow(onsets, priorStart, currentStart);
    if (current === 0 && prior === 0) continue;

    if (best.dominantSymptomType === null) {
      best = { dominantSymptomType: type, thisWeekSymptomCount: current, lastWeekSymptomCount: prior };
      continue;
    }
    // A symptom active THIS week always outranks one that is only in the prior window
    // (the absence floor), then higher current count, then the larger fall. Iteration
    // order supplies the final tie-break, so nothing here needs to express it.
    const bestActive = best.thisWeekSymptomCount > 0;
    const active = current > 0;
    if (active !== bestActive) {
      if (active) {
        best = { dominantSymptomType: type, thisWeekSymptomCount: current, lastWeekSymptomCount: prior };
      }
      continue;
    }
    if (current > best.thisWeekSymptomCount) {
      best = { dominantSymptomType: type, thisWeekSymptomCount: current, lastWeekSymptomCount: prior };
      continue;
    }
    if (
      current === best.thisWeekSymptomCount &&
      prior - current > best.lastWeekSymptomCount - best.thisWeekSymptomCount
    ) {
      best = { dominantSymptomType: type, thisWeekSymptomCount: current, lastWeekSymptomCount: prior };
    }
  }

  return best;
}
