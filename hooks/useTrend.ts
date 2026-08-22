import { useEffect, useState } from 'react';
import { getDb } from '../lib/db';
import { collapseToEpisodeOnsets } from '../lib/symptomEpisodes';
import { supabase } from '../lib/supabase';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

// B-417 PR 4 — the 'compliance' mode is GONE, and with it this hook's second,
// unlisted "% compliance" (§1.1: v0.9 of the spec listed six readers of
// `diet_trials` and missed this one). Two separate defects lived in that branch:
//
//   1. `TrendZone.tsx:35` tested compliance mode BEFORE symptom mode, so starting
//      a trial REPLACED the Home symptom chart with a compliance bar. The symptom
//      is WHY the trial exists, and Principle 3 says concern leads — so §8's
//      ruling is additive, not replacement: the symptom chart stays and gains a
//      trial-start marker.
//   2. The number itself counted a meal of ANY food against days elapsed and
//      called the result "food compliance" (B-418). An owner feeding chicken
//      every day through a novel-protein trial read 100%.
//
// The trial's own surface is now the Home strip (`components/home/TrialStrip`)
// and the Pet-tab card, both rendered from `lib/dietTrialCard`. This hook is back
// to being about the pet's SYMPTOMS and FOOD, which is what a trend is.
export type TrendMode = 'symptom' | 'feeding';

export interface DayBucket {
  date: string; // YYYY-MM-DD UTC
  symptomCount: number;
  mealCount: number;
}

export interface TrendData {
  mode: TrendMode;
  buckets: DayBucket[]; // 14 days, oldest first
  /** UTC day key of the active trial's start, when it falls inside the 14-day
   *  window — the chart's marker, and the ONLY thing a trial contributes here.
   *  Same key space as `buckets[].date` so the marker lands on the right column. */
  trialStartDayKey: string | null;
  hasEnoughData: boolean; // true when >= 3 days have any events
  // Week-over-week EPISODE counts for symptom mode (B-067/CUL-372 — episodes, not
  // raw rows; collapsed through `lib/symptomEpisodes`, the predicate the Signal
  // engine uses).
  //
  // `lastWeekSymptomCount` is retained as DATA — CUL-383's Trend redesign needs the
  // prior window — but the Trend card must not render it as a comparison. A
  // week-over-week verdict is a gated claim that belongs to the Signal's reflection
  // layer, which alone carries the worsening / chronicity / density gates; this card
  // rendering one is the bypass B-067 recorded. See the comment in `SymptomChart`.
  dominantSymptomType: string | null;
  thisWeekSymptomCount: number;
  lastWeekSymptomCount: number;
  // Direction data for feeding mode
  thisWeekMealDays: number;
  lastWeekMealDays: number;
}

const SYMPTOM_TYPES = new Set(['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'lethargy']);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function useTrend(): { data: TrendData | null; isLoading: boolean } {
  const { activePet } = usePetStore();
  // B-054 §6 — recompute the trend after a sync cycle hydrates new events.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [data, setData] = useState<TrendData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activePet) return;
    let cancelled = false;
    setIsLoading(true);

    async function load() {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);

        // Read last 14 days of events from local SQLite (fast, works offline)
        const db = getDb();
        const rawEvents = db.getAllSync<{ event_type: string; occurred_at: string }>(
          `SELECT event_type, occurred_at FROM events
           WHERE pet_id = ? AND occurred_at >= ? AND deleted_at IS NULL
           ORDER BY occurred_at ASC`,
          [activePet!.id, cutoff.toISOString()],
        );

        // Week-over-week counts, in EPISODES (B-067/CUL-372).
        //
        // These used to be raw row counts, which put this card in direct contradiction
        // with the Signal's reflection card one row above: a cat that vomited four times
        // inside an hour read as "4 this week" here and "1 episode this week" there, and
        // the two cards could even disagree on the DIRECTION. Both surfaces now collapse
        // through the same `lib/symptomEpisodes` predicate, so the numbers agree by
        // construction rather than by coincidence.
        //
        // Windows are unchanged and already matched the engine: a rolling [now-7d, now)
        // against [now-14d, now-7d). Collapse happens BEFORE the window filter so a run
        // straddling the boundary is counted once, on the side it began.
        const nowMs = Date.now();
        const sevenDaysAgoMs = nowMs - 7 * MS_PER_DAY;
        const fourteenDaysAgoMs = nowMs - 14 * MS_PER_DAY;

        const onsetsByType = new Map<string, number[]>();
        for (const e of rawEvents) {
          if (!SYMPTOM_TYPES.has(e.event_type)) continue;
          const ms = Date.parse(e.occurred_at);
          if (!Number.isFinite(ms)) continue;
          const list = onsetsByType.get(e.event_type);
          if (list) list.push(ms);
          else onsetsByType.set(e.event_type, [ms]);
        }
        for (const [type, msList] of onsetsByType) {
          onsetsByType.set(type, collapseToEpisodeOnsets(msList));
        }

        // The BARS plot episodes too, bucketed by the day each episode BEGAN — otherwise
        // the chart and its own head disagree (head "2 this week" over five bars). Each
        // symptom type is collapsed separately before the types are merged: a vomit and
        // an itch an hour apart are two symptoms, never one episode.
        const symptomOnsetMs = [...onsetsByType.values()].flat();
        const buckets = buildBuckets(rawEvents, symptomOnsetMs);

        const inWindow = (onsets: number[], startMs: number, endMs: number) =>
          onsets.filter(ms => ms >= startMs && ms < endMs).length;

        // Subject selection mirrors the engine's reflection layer: the symptom most
        // present RIGHT NOW (highest current-window episode count), tie broken by the
        // larger fall. It used to be the highest raw total over the whole 14 days, which
        // was incoherent on the card's own terms — the head says "this week" but the
        // subject was picked from a fortnight — and was a second way the two cards could
        // end up naming different symptoms.
        //
        // NOTE: this set intentionally stays WIDER than the engine's
        // `CORRELATION_SYMPTOM_TYPES`; it keeps `lethargy`, which the engine excludes
        // because that list scopes food->symptom CORRELATION, not what is chartable.
        // Dropping a real symptom from a symptom chart to make two lists match would
        // lose more than it fixes. The consequence, taken knowingly: when lethargy is
        // the dominant symptom the two cards name different symptoms — two true facts,
        // no longer a contradiction now that neither card renders a comparative verdict.
        let dominantSymptomType: string | null = null;
        let thisWeekSymptomCount = 0;
        let lastWeekSymptomCount = 0;
        for (const [type, onsets] of [...onsetsByType].sort((a, b) => a[0].localeCompare(b[0]))) {
          const current = inWindow(onsets, sevenDaysAgoMs, nowMs);
          const prior = inWindow(onsets, fourteenDaysAgoMs, sevenDaysAgoMs);
          if (current === 0 && prior === 0) continue;
          const better =
            dominantSymptomType === null ||
            current > thisWeekSymptomCount ||
            (current === thisWeekSymptomCount &&
              prior - current > lastWeekSymptomCount - thisWeekSymptomCount);
          if (better) {
            dominantSymptomType = type;
            thisWeekSymptomCount = current;
            lastWeekSymptomCount = prior;
          }
        }

        // Meal-day density is a LOGGING measure, not a symptom count, so it stays on
        // raw events and distinct days — there is no episode to collapse here.
        const sevenDaysAgoISO = new Date(sevenDaysAgoMs).toISOString();
        const thisWeekMealDays = new Set(
          rawEvents
            .filter(e => e.event_type === 'meal' && e.occurred_at >= sevenDaysAgoISO)
            .map(e => e.occurred_at.split('T')[0]),
        ).size;
        const lastWeekMealDays = new Set(
          rawEvents
            .filter(e => e.event_type === 'meal' && e.occurred_at < sevenDaysAgoISO)
            .map(e => e.occurred_at.split('T')[0]),
        ).size;

        // An active trial contributes exactly ONE thing to this chart: a marker on
        // the day it started. No ratio, no numerator, no denominator — those live
        // on the trial's own surfaces now. Best-effort; falls back silently if
        // offline, and a missing marker degrades the chart by nothing.
        let trialStartDayKey: string | null = null;
        let hasTrial = false;

        try {
          const { data: trial } = await supabase
            .from('diet_trials')
            .select('started_at')
            .eq('pet_id', activePet!.id)
            .eq('status', 'active')
            .maybeSingle();

          if (trial) {
            hasTrial = true;
            const raw = trial.started_at as string;
            // Buckets are UTC day keys, so the marker must be one too or it lands
            // on the wrong column. A DATE column is already 'YYYY-MM-DD'.
            const key = /^\d{4}-\d{2}-\d{2}$/.test(raw)
              ? raw
              : new Date(raw).toISOString().split('T')[0];
            trialStartDayKey = buckets.some(b => b.date === key) ? key : null;
          }
        } catch {
          // offline — no trial context available, the chart renders without a marker
        }

        // Determine chart mode. During a trial the bar is lowered from 3 symptom
        // events to 1: a trial exists BECAUSE of a symptom, so even one or two
        // events are the thing this owner is watching, and Principle 3 says
        // concern leads. With nothing at all to plot the feeding chart is still
        // the more useful picture, so the floor is 1 rather than 0.
        //
        // Deliberately still RAW EVENTS, not episodes (B-067/CUL-372). The episode
        // collapse governs what the card COUNTS; this floor governs whether the card
        // appears at all, and those are different questions. Collapsing here would flip
        // an acute multi-bout day (five vomits in two hours -> one episode) below the
        // floor of 3 and hide the symptom chart on exactly the day it matters most.
        const totalSymptoms = rawEvents.filter(e => SYMPTOM_TYPES.has(e.event_type)).length;
        const symptomFloor = hasTrial ? 1 : 3;
        const mode: TrendMode = totalSymptoms >= symptomFloor ? 'symptom' : 'feeding';

        const daysWithAnyEvent = buckets.filter(
          b => b.symptomCount > 0 || b.mealCount > 0,
        ).length;

        if (!cancelled) {
          setData({
            mode,
            buckets,
            trialStartDayKey,
            hasEnoughData: daysWithAnyEvent >= 3,
            dominantSymptomType,
            thisWeekSymptomCount,
            lastWeekSymptomCount,
            thisWeekMealDays,
            lastWeekMealDays,
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activePet?.id, hydrationTick]);

  return { data, isLoading };
}

function buildBuckets(
  events: Array<{ event_type: string; occurred_at: string }>,
  // Episode ONSETS (epoch ms), already collapsed per symptom type and merged.
  // Passed in rather than derived here so the bars and the head count the same
  // thing — one predicate, one collapse, one number (B-067/CUL-372).
  symptomOnsetMs: number[],
): DayBucket[] {
  const buckets: DayBucket[] = [];

  // Build 14 buckets: oldest first
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.toISOString().split('T')[0], symptomCount: 0, mealCount: 0 });
  }

  const byDate = new Map(buckets.map(b => [b.date, b]));

  for (const ms of symptomOnsetMs) {
    const bucket = byDate.get(new Date(ms).toISOString().split('T')[0]);
    if (bucket) bucket.symptomCount++;
  }

  for (const event of events) {
    if (event.event_type !== 'meal') continue;
    const bucket = byDate.get(event.occurred_at.split('T')[0]);
    if (bucket) bucket.mealCount++;
  }

  return buckets;
}
