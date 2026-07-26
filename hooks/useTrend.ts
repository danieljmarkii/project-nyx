import { useEffect, useState } from 'react';
import { getDb } from '../lib/db';
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
  // Direction data for symptom mode
  dominantSymptomType: string | null;
  thisWeekSymptomCount: number;
  lastWeekSymptomCount: number;
  // Direction data for feeding mode
  thisWeekMealDays: number;
  lastWeekMealDays: number;
}

const SYMPTOM_TYPES = new Set(['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'lethargy']);

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

        const buckets = buildBuckets(rawEvents);

        // Week-over-week direction data
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoISO = sevenDaysAgo.toISOString();

        const symptomTotals: Record<string, number> = {};
        for (const e of rawEvents) {
          if (SYMPTOM_TYPES.has(e.event_type)) {
            symptomTotals[e.event_type] = (symptomTotals[e.event_type] ?? 0) + 1;
          }
        }
        const dominantSymptomType = Object.keys(symptomTotals).length > 0
          ? Object.entries(symptomTotals).sort((a, b) => b[1] - a[1])[0][0]
          : null;

        const thisWeekSymptomCount = rawEvents.filter(
          e => e.event_type === dominantSymptomType && e.occurred_at >= sevenDaysAgoISO,
        ).length;
        const lastWeekSymptomCount = rawEvents.filter(
          e => e.event_type === dominantSymptomType && e.occurred_at < sevenDaysAgoISO,
        ).length;

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
): DayBucket[] {
  const buckets: DayBucket[] = [];

  // Build 14 buckets: oldest first
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.toISOString().split('T')[0], symptomCount: 0, mealCount: 0 });
  }

  for (const event of events) {
    const dateStr = event.occurred_at.split('T')[0];
    const bucket = buckets.find(b => b.date === dateStr);
    if (!bucket) continue;
    if (SYMPTOM_TYPES.has(event.event_type)) bucket.symptomCount++;
    if (event.event_type === 'meal') bucket.mealCount++;
  }

  return buckets;
}
