// The outcome sheet's data loader — B-417 PR 6 (§4.3).
//
// Every JUDGEMENT about what the sheet says lives in `lib/dietTrialCompletion.ts`;
// every READ lives here. That is the same split `dietTrialCard.ts` /
// `dietTrialFacts.ts` uses, and it is what lets the copy that decides whether an
// owner stops a diet be asserted against literal strings with no database in
// sight.
import { SYMPTOM_EVENT_TYPES } from './analytics';
import { getDb } from './db';
import { symptomLabel } from './metricDetail';
import { localDayIndexOf, toLocalDayKey } from './utils';
import type { TrialOutcomeFacts, TrialSymptomDelta } from './dietTrialCompletion';

const SYMPTOM_SET: ReadonlySet<string> = new Set(SYMPTOM_EVENT_TYPES);

/** Local-day key arithmetic, kept in LOCAL days end to end (B-421). The day
 *  boundary on this feature is local midnight, defined once in §5.1, and the two
 *  stretches this sheet compares are both denominated in it. */
function shiftDayKey(dayKey: string, deltaDays: number): string | null {
  const index = localDayIndexOf(dayKey);
  if (index === null) return null;
  return toLocalDayKey(new Date((index + deltaDays) * 86_400_000));
}

/**
 * Read the two stretches the outcome sheet compares.
 *
 * `during` is the trial AS ACTUALLY RUN — its start day through today — not the
 * target window. An owner completing on day 61 of a 56-day trial is reporting on
 * 61 days, and the counts have to be over the days that happened.
 *
 * Best-effort in the same sense as the card's reads: a failure returns null and
 * the caller renders the sheet without counts, never with guessed ones.
 */
export async function loadTrialOutcomeFacts(args: {
  petId: string;
  /** The trial's `started_at` — a 'YYYY-MM-DD' day key or an ISO instant. */
  startedAt: string;
  nowMs?: number;
}): Promise<TrialOutcomeFacts | null> {
  const nowMs = args.nowMs ?? Date.now();
  try {
    const startKey = /^\d{4}-\d{2}-\d{2}$/.test(args.startedAt)
      ? args.startedAt
      : toLocalDayKey(new Date(args.startedAt));
    const startIndex = localDayIndexOf(startKey);
    const todayIndex = localDayIndexOf(toLocalDayKey(new Date(nowMs)));
    if (startIndex === null || todayIndex === null) return null;

    const duringDays = Math.max(1, todayIndex - startIndex + 1);
    const beforeDays = duringDays;
    const duringEndKey = toLocalDayKey(new Date(Math.max(todayIndex, startIndex) * 86_400_000));
    const beforeStartKey = shiftDayKey(startKey, -beforeDays);
    if (!beforeStartKey) return null;

    // Pad a day either side and let the LOCAL-day-key filter below decide
    // membership, so a timezone offset can never clip a boundary day out of
    // either stretch (the same shape `readCoverage` uses).
    const fromISO = new Date(`${beforeStartKey}T00:00:00Z`).toISOString();
    const paddedEnd = shiftDayKey(duringEndKey, 2) ?? duringEndKey;
    const toISO = new Date(`${paddedEnd}T00:00:00Z`).toISOString();

    const rows = await getDb().getAllAsync<{ event_type: string; occurred_at: string }>(
      `SELECT event_type, occurred_at
         FROM events
        WHERE pet_id = ? AND deleted_at IS NULL
          AND occurred_at >= ? AND occurred_at < ?`,
      [args.petId, fromISO, toISO],
    );

    const before: Record<string, number> = {};
    const during: Record<string, number> = {};
    const beforeMealDays = new Set<string>();
    const duringMealDays = new Set<string>();
    let beforeTracked = false;

    for (const r of rows) {
      const ms = Date.parse(r.occurred_at);
      if (!Number.isFinite(ms)) continue;
      const key = toLocalDayKey(new Date(ms));
      const inDuring = key >= startKey && key <= duringEndKey;
      const inBefore = !inDuring && key >= beforeStartKey && key < startKey;
      if (!inDuring && !inBefore) continue;

      if (inBefore) beforeTracked = true;

      // The density series is MEAL-TYPE days — treats included, because treats are
      // meal events and this series measures whether the owner kept logging at
      // all. It is deliberately NOT the §5.1 coverage numerator, which excludes
      // treats because it answers a different question (how completely was the
      // record kept?). Two metrics, two denominators; do not merge them.
      if (r.event_type === 'meal') {
        (inDuring ? duringMealDays : beforeMealDays).add(key);
      }
      if (SYMPTOM_SET.has(r.event_type)) {
        const bucket = inDuring ? during : before;
        bucket[r.event_type] = (bucket[r.event_type] ?? 0) + 1;
      }
    }

    const types = new Set([...Object.keys(before), ...Object.keys(during)]);
    const symptoms: TrialSymptomDelta[] = [...types]
      .map((t) => ({
        symptomType: t,
        label: symptomLabel(t),
        before: before[t] ?? 0,
        during: during[t] ?? 0,
      }))
      .sort(
        (a, b) =>
          b.during - a.during || b.before - a.before || a.symptomType.localeCompare(b.symptomType),
      );

    return {
      duringDays,
      beforeDays,
      beforeTracked,
      symptoms,
      meals: {
        before: { daysLogged: beforeMealDays.size, days: beforeDays },
        during: { daysLogged: duringMealDays.size, days: duringDays },
      },
    };
  } catch (e) {
    console.error('[DietTrial] outcome facts read failed:', e);
    return null;
  }
}
