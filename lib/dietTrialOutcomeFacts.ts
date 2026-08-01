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
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';
import type { TrialOutcomeFacts, TrialSymptomDelta } from './dietTrialCompletion';

const SYMPTOM_SET: ReadonlySet<string> = new Set(SYMPTOM_EVENT_TYPES);

// The epoch-day inverse (`dayKeyFromIndex`) and its `MS_PER_DAY` constant used to
// live here. B-417 PR 6's first cut inverted `localDayIndexOf` with the LOCAL
// getters instead of a UTC read, and the damage was asymmetric — both errors
// pushed the before/during windows toward "it improved", on the one screen where
// an owner decides whether to stop a medical intervention. Worst case, a trial
// started today rendered every during-count as a hard 0. It was caught by review,
// not by the day-math guard, because this file was never on the guard's list and
// its `index * MS_PER_DAY` evaded a regex that matched division only (B-517). The
// helper now lives once in `lib/utils` (guarded there against a private copy
// reappearing) and this module delegates the boundary in BOTH directions.

function shiftDayKey(dayKey: string, deltaDays: number): string | null {
  const index = localDayIndexOf(dayKey);
  if (index === null) return null;
  return dayKeyFromIndex(index + deltaDays);
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
    const duringEndKey = dayKeyFromIndex(Math.max(todayIndex, startIndex));
    const beforeStartKey = shiftDayKey(startKey, -beforeDays);
    if (!beforeStartKey) return null;

    // PAD BOTH ENDS. The comment here used to say "a day either side" while only
    // the END was padded, and the code was wrong in the direction the comment
    // denied: `${key}T00:00:00Z` is UTC midnight, so at a POSITIVE offset local
    // midnight of that date is EARLIER in UTC — 12 hours earlier in Auckland — and
    // the query silently dropped the first half of the before-stretch's first
    // local day. A single 06:00 pre-trial log then vanished, and the sheet
    // rendered "Nothing was logged in the 4 weeks before the trial started",
    // which is FALSE and is exactly the fabricated negative claim §5.2's S3 rule
    // forbids. Two-sided (it can delete an improvement or a worsening), and it
    // landed on the thin-record population `beforeLoggedDays` exists to protect.
    //
    // The bounds are deliberately WIDER than the stretches; the local-day-key
    // filter below is what decides membership, so over-fetching costs a few rows
    // and under-fetching costs a true statement. Found by `adversarial-reviewer`
    // on the fix commit — and its tests could not have caught it, because a mock
    // that returns the whole fixture regardless of the bounds exercises the SQL
    // window at zero offsets. `assertsSqlWindow` in the test file now does.
    const paddedStart = shiftDayKey(beforeStartKey, -1) ?? beforeStartKey;
    const fromISO = new Date(`${paddedStart}T00:00:00Z`).toISOString();
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
    // Days with ANY logged event, so the before-stretch's OBSERVABILITY is a count
    // rather than a yes/no. See `beforeLoggedDays` on TrialOutcomeFacts.
    const beforeAnyDays = new Set<string>();
    const duringAnyDays = new Set<string>();

    for (const r of rows) {
      const ms = Date.parse(r.occurred_at);
      if (!Number.isFinite(ms)) continue;
      const key = toLocalDayKey(new Date(ms));
      const inDuring = key >= startKey && key <= duringEndKey;
      const inBefore = !inDuring && key >= beforeStartKey && key < startKey;
      if (!inDuring && !inBefore) continue;

      (inDuring ? duringAnyDays : beforeAnyDays).add(key);

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
      beforeTracked: beforeAnyDays.size > 0,
      beforeLoggedDays: beforeAnyDays.size,
      duringLoggedDays: duringAnyDays.size,
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
