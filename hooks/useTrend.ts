import { useEffect, useState } from 'react';
import { getDb } from '../lib/db';
import { supabase } from '../lib/supabase';
import { usePetStore } from '../store/petStore';

export type TrendMode = 'symptom' | 'feeding' | 'compliance';

export interface DayBucket {
  date: string; // YYYY-MM-DD UTC
  symptomCount: number;
  mealCount: number;
}

export interface TrendData {
  mode: TrendMode;
  buckets: DayBucket[]; // 14 days, oldest first
  trialDaysElapsed: number;
  trialTargetDays: number;
  trialCompliantDays: number;
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

        // Check for active diet trial from Supabase (best-effort; falls back if offline)
        let trialDaysElapsed = 0;
        let trialTargetDays = 0;
        let trialCompliantDays = 0;
        let hasTrial = false;

        try {
          const { data: trial } = await supabase
            .from('diet_trials')
            .select('started_at, target_duration_days')
            .eq('pet_id', activePet!.id)
            .eq('status', 'active')
            .maybeSingle();

          if (trial) {
            hasTrial = true;
            const startISO = new Date(trial.started_at as string).toISOString().split('T')[0];
            trialDaysElapsed = Math.max(
              1,
              Math.floor((Date.now() - new Date(trial.started_at as string).getTime()) / 86_400_000),
            );
            trialTargetDays = trial.target_duration_days as number;
            trialCompliantDays = new Set(
              rawEvents
                .filter(e => e.event_type === 'meal' && e.occurred_at >= startISO)
                .map(e => e.occurred_at.split('T')[0]),
            ).size;
          }
        } catch {
          // offline — no trial context available, continue with symptom/feeding mode
        }

        // Determine chart mode
        const totalSymptoms = rawEvents.filter(e => SYMPTOM_TYPES.has(e.event_type)).length;
        let mode: TrendMode = 'feeding';
        if (hasTrial) mode = 'compliance';
        else if (totalSymptoms >= 3) mode = 'symptom';

        const daysWithAnyEvent = buckets.filter(
          b => b.symptomCount > 0 || b.mealCount > 0,
        ).length;

        if (!cancelled) {
          setData({
            mode,
            buckets,
            trialDaysElapsed,
            trialTargetDays,
            trialCompliantDays,
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
  }, [activePet?.id]);

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
