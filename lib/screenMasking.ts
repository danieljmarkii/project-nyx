import { careClaimReason } from './careClaimScreens';
import { getDb } from './db';
import {
  maskingSpansFor,
  spansTouching,
  windowTouchesSpan,
  type MaskCourse,
  type MaskSign,
  type MaskSpan,
} from './maskingSpans';
import { trialResponseLineCompares, trialResponseSoFarLine } from './dietTrialCard';
import type { TrialResponseCounts } from './trialResponseCounts';
import { readVisitDaysBefore } from './visitWindow';
import type { CachedFinding } from './signal';
import { dayKeyFromIndex, formatCalendarDate, localDayIndexOf } from './utils';

// No zero beside a masking drug or a recent visit, on the screens around EN-10's lines
// (Engines v3, CUL-1440; docs/nyx-care-state-requirements.md §5.1 and the 2026-09-29 ruling).
//
// EN-10's context lines already withhold a zero while a drug that can hide the sign is on
// board, inside its 42-day tail, or within 42 days of a visit. The Signal screen and Get ready
// draw charts and sentences beside those lines, and this module tells each of them where a
// zero may not appear. The drug table and the span rule are the server's own
// (`lib/maskingSpans.ts`), so the two can never disagree about which windows are masked.
//
// THE RULES (PM rulings on CUL-1440, mock round 5):
//   • D1 · a chart keeps every mark inside a masked window and drops only a zero's NUMERAL; the
//     window is hatched and named underneath. A count that comes through the drug keeps its
//     number: it is the escalation-direction fact.
//   • D2 · a SENTENCE that compares two windows goes quiet on any fall beside a span (it cannot
//     carry the hatch), and on a zero in a touched window. A rise always shows.
//   • A window that touches no span is never changed.
//
// THE GATE. Only a Signal cache row written with `engines_v3_en10` on is read this way (the
// row's `engine_flags` stamp, the way EN-3's reads gate). Every other row gets `null`, and
// every caller renders exactly what it rendered before CUL-1440.
//
// FAILS CLOSED. A read that fails is not an empty record (C-12): the courses or the visit are
// unknown, and an unknown course may be a steroid. So a failed read masks every window and
// the caption says the app could not check.

/** The engine key this module's gate reads off the Signal cache row. */
export const EN10_ENGINE_KEY = 'engines_v3_en10';

/** Whether a Signal cache row was written with EN-10 on (its `engine_flags` stamp). */
export function signalRowHasEn10(engineFlags: unknown): boolean {
  return Array.isArray(engineFlags) && engineFlags.includes(EN10_ENGINE_KEY);
}

/** The masking spans for one sign on one screen. */
export interface ScreenMasking {
  sign: MaskSign;
  /** The owner-facing word for the sign ("coughing"), for the captions. */
  signWord: string;
  spans: MaskSpan[];
  /** The record could not be read: every window is treated as masked. */
  unreadable: boolean;
}

function indexOfKey(key: string): number {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(`screenMasking: not a day key: ${key}`);
  return i;
}

/** The masking for one sign from the record's courses and last visit. Pure. */
export function screenMaskingOf(input: {
  sign: MaskSign;
  signWord: string;
  courses: readonly MaskCourse[];
  /** Every visit strictly before today (each is a 42-day span, not only the last). */
  visitsOn: readonly string[];
  /** The device's local day key for today. */
  today: string;
}): ScreenMasking {
  return {
    sign: input.sign,
    signWord: input.signWord,
    spans: maskingSpansFor(input.sign, {
      courses: input.courses,
      visitsOn: input.visitsOn,
      todayIndex: indexOfKey(input.today),
      timeZone: undefined,
    }),
    unreadable: false,
  };
}

/** The masking when the record could not be read: every window masked. */
export function unreadableMasking(sign: MaskSign, signWord: string): ScreenMasking {
  return { sign, signWord, spans: [], unreadable: true };
}

/** Whether the window [fromKey, toKey] (inclusive day keys) touches a span. */
export function touches(m: ScreenMasking | null, fromKey: string, toKey: string): boolean {
  if (!m) return false;
  if (m.unreadable) return true;
  return windowTouchesSpan(m.spans, indexOfKey(fromKey), indexOfKey(toKey));
}

function dateWordOfIndex(index: number): string {
  const key = dayKeyFromIndex(index);
  return formatCalendarDate(key) ?? key;
}

function dateWordOfKey(key: string): string {
  return formatCalendarDate(key) ?? key;
}

/** The course's printable name: the owner's label, unless it makes a care claim ("Cerenia
 *  (helped last time)"), in which case the library's name or a plain noun stands in. The
 *  server's EN-10 lines apply the same screen (CUL-1271), so the caption and the line name the
 *  course alike. */
export function courseLabel(c: MaskCourse): string {
  if (careClaimReason(c.drugLabel) === null) return c.drugLabel;
  const n = c.names[0];
  return n ? n[0].toUpperCase() + n.slice(1) : 'A medication';
}

function hideVerb(span: MaskSpan): string {
  return span.kind === 'course' && span.unresolved ? 'may hide' : 'can hide';
}

/**
 * The words under a chart whose drawn window is [fromKey, toKey]: each span the window
 * touches, named with its start, then what it can do to the sign. Null when the window touches
 * none (the chart is unchanged). `zeroWithheld` adds the reason a numeral is missing.
 *
 *   "Prednisone from Sep 21 can hide coughing. Anything given at the Sep 10 visit isn't in the
 *    record, so a quiet week there isn't a sign it has settled."
 */
export function maskCaption(
  m: ScreenMasking | null,
  fromKey: string,
  toKey: string,
  opts: { zeroWithheld: boolean; unit: 'week' | 'window' | 'lane' },
): string | null {
  if (!m) return null;
  if (m.unreadable) {
    return `The medication record couldn't be checked just now, so no zero is shown here. Try again in a moment.`;
  }
  const touched = spansTouching(m.spans, indexOfKey(fromKey), indexOfKey(toKey));
  if (touched.length === 0) return null;
  const parts = touched.map((s) =>
    s.kind === 'course'
      ? `${courseLabel(s.course.course)} from ${dateWordOfIndex(s.fromDay)} ${hideVerb(s)} ${m.signWord}.`
      : `Anything given at the ${dateWordOfKey(s.visitOn)} visit isn't in the record.`,
  );
  if (opts.zeroWithheld) {
    const where = opts.unit === 'week' ? 'a quiet week there' : opts.unit === 'lane' ? 'a quiet stretch there' : 'a low count there';
    // Joined to the last sentence, never a bare "So …" fragment (the voice pass).
    parts[parts.length - 1] = withClause(parts[parts.length - 1], `so ${where} isn't a sign it has settled`);
  }
  return parts.join(' ');
}

/** "X can hide coughing." + "so …" → "X can hide coughing, so …." */
export function withClause(sentence: string, clause: string): string {
  return `${sentence.replace(/\.$/, '')}, ${clause}.`;
}

/** One phone-script row naming a masking span on board now (D3): "On board" for a course,
 *  "Last visit" for a visit inside its 42 days. */
export interface MaskScriptRow {
  label: string;
  value: string;
}

/** The phone script's rows for every span that covers today (`todayKey`). */
export function maskScriptRows(m: ScreenMasking | null, todayKey: string): MaskScriptRow[] {
  if (!m || m.unreadable) return [];
  const today = indexOfKey(todayKey);
  const rows: MaskScriptRow[] = [];
  for (const s of m.spans) {
    if (s.fromDay > today || s.toDay < today) continue;
    if (s.kind === 'course') {
      const c = s.course;
      const start = dateWordOfIndex(s.fromDay);
      const when = c.onBoard
        ? ` since ${start}`
        : c.endKnown && c.end !== null && c.end > s.fromDay
          ? `, ${start} to ${dateWordOfIndex(c.end)}`
          : ` since ${start}, stopped`;
      // "On board" only while it is: an ended course inside its tail still masks, and says so
      // under its own label (the adversarial pass: "On board · stopped" was untrue).
      rows.push({ label: c.onBoard ? 'On board' : 'Recently on', value: `${courseLabel(c.course)}${when}. It ${hideVerb(s)} ${m.signWord}.` });
    } else {
      rows.push({ label: 'Last visit', value: `${dateWordOfKey(s.visitOn)}. Anything given there isn't in the record.` });
    }
  }
  return rows;
}

// ── The read ──────────────────────────────────────────────────────────────────

/** The narrow database surface the course read needs (`getDb()` satisfies it; a `node:sqlite`
 *  adapter does in the tests, the `VisitDaysDb` precedent). */
export interface MaskingDb {
  getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]>;
}

/** The pet's regimens with the library item's names, as the server's EN-10 read selects them
 *  (`generate-signal/index.ts`): no `deleted_at` (a regimen is ended, not soft-deleted), no
 *  lookback (an old steroid's tail is still a span). */
const COURSES_SQL = `SELECT m.drug_name AS drug_name, m.started_at AS started_at, m.ended_at AS ended_at,
    m.status AS status, i.generic_name AS generic_name, i.brand_name AS brand_name
  FROM medications m
  LEFT JOIN medication_items_cache i ON i.id = m.medication_item_id
  WHERE m.pet_id = ?`;

interface CourseRow {
  drug_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string | null;
  generic_name: string | null;
  brand_name: string | null;
}

/** The pet's courses, read from the phone's copy of the record. THROWS on a failed read. */
export async function readMaskCourses(db: MaskingDb, petId: string): Promise<MaskCourse[]> {
  const rows = await db.getAllAsync<CourseRow>(COURSES_SQL, [petId]);
  return rows
    .filter((r) => typeof r.drug_name === 'string' && r.drug_name.trim().length > 0)
    .map((r) => ({
      drugLabel: (r.drug_name as string).trim(),
      names: [r.generic_name, r.brand_name].filter((n): n is string => typeof n === 'string' && n.trim().length > 0),
      startedOn: r.started_at ? r.started_at.slice(0, 10) : null,
      endedOn: r.ended_at ? r.ended_at.slice(0, 10) : null,
      status: r.status,
    }));
}

/** What the masking is built from: the pet's courses and its visit days, read once per screen
 *  and turned into spans per sign. `'unreadable'` when the read failed (every window masked). */
export type MaskingRecord = { courses: MaskCourse[]; visitsOn: string[] } | 'unreadable';

/**
 * The pet's masking record, or null when the Signal row was not written with EN-10 on (every
 * caller then renders as before, and nothing is read). A failed read is `'unreadable'`.
 */
export async function loadMaskingRecord(input: {
  petId: string;
  today: string;
  engineFlags: unknown;
  db?: MaskingDb;
}): Promise<MaskingRecord | null> {
  if (!signalRowHasEn10(input.engineFlags)) return null;
  const db = input.db ?? getDb();
  try {
    const [courses, visitsOn] = await Promise.all([
      readMaskCourses(db, input.petId),
      readVisitDaysBefore(db, input.petId, input.today),
    ]);
    return { courses, visitsOn };
  } catch (e) {
    console.warn('[screenMasking] the record could not be read; every window is masked:', e);
    return 'unreadable';
  }
}

/** One sign's masking from the record. */
export function maskingFor(record: MaskingRecord | null, sign: MaskSign, signWord: string, today: string): ScreenMasking | null {
  if (record === null) return null;
  if (record === 'unreadable') return unreadableMasking(sign, signWord);
  return screenMaskingOf({ sign, signWord, courses: record.courses, visitsOn: record.visitsOn, today });
}

/**
 * The masking for one sign of one pet, or null when the Signal row was not written with
 * EN-10 on (every caller then renders as before). A failed read masks everything (the header).
 */
export async function loadScreenMasking(input: {
  petId: string;
  sign: MaskSign;
  signWord: string;
  today: string;
  engineFlags: unknown;
  db?: MaskingDb;
}): Promise<ScreenMasking | null> {
  const record = await loadMaskingRecord(input);
  return maskingFor(record, input.sign, input.signWord, input.today);
}

// ── The trial's vomiting sentence (D2) ────────────────────────────────────────

/**
 * The trial's vomiting sentence as it may print beside a masking span (CUL-1440 counterexample
 * 3, D2), or null where it must stay quiet. `line` is the strip's own sentence
 * (`trialResponseStandingLine`), which this never rewrites except to its own trial-so-far form.
 * A sentence cannot carry the hatch, so it goes quiet where a chart would shade:
 *   • a zero in the trial's days while a span touches them → nothing (the strip's own silence);
 *   • the COMPARING form on a fall (the trial's daily rate below the baseline's) while a span
 *     touches the trial's days → nothing: "fewer on the diet" beside a steroid is the "it
 *     worked" reading, with or without the zero;
 *   • the comparing form with a zero BASELINE a span touches → the trial-so-far form ("Vomiting:
 *     3 in the trial's 30 days."), because the trial's count is the escalation-direction fact
 *     and must not go quiet with its baseline.
 * A rise always shows. Rates, not raw counts, decide the fall: the baseline is 49 days and the
 * trial may be 12, so 5 · 7 is a rise, and a raw-count test would hide it.
 */
export function maskedTrialSentence(
  m: ScreenMasking | null,
  counts: TrialResponseCounts,
  line: string | null,
  todayKey: string,
): string | null {
  if (!m || line == null) return line;
  const today = indexOfKey(todayKey);
  const start = today - Math.max(1, Math.floor(counts.trialDayNumber)) + 1;
  const trialTouched = touches(m, dayKeyFromIndex(start), todayKey);
  const baseTouched = touches(m, dayKeyFromIndex(start - counts.baselineWindowDays), dayKeyFromIndex(start - 1));
  if (trialTouched && counts.trialCount === 0) return null;
  if (!trialResponseLineCompares(counts)) return line;
  if (trialTouched) {
    const trialRate = counts.trialCount / Math.max(1, counts.trialDayNumber);
    const baseRate = counts.baselineCount / Math.max(1, counts.baselineWindowDays);
    if (trialRate < baseRate) return null;
  }
  if (baseTouched && counts.baselineCount === 0) return trialResponseSoFarLine(counts);
  return line;
}

// ── The phone script (D3, counterexamples 4 and 5) ────────────────────────────

/** What the safety phone script needs from the masking: the rows naming the drug or visit
 *  beside the dates, and whether its comparing row must stay quiet. */
export interface PhoneScriptMasking {
  rows: MaskScriptRow[];
  /** Drop the script's comparing row (the chronicity halves, the worsening week before), and
   *  the counted-halves box beside it. */
  withholdCompare: boolean;
  /** Keep only the recent window's count in that row (a rise over a masked zero). */
  recentOnly: boolean;
}

/**
 * The two-window rule for a compare the ENGINE counted (CUL-1440 counterexample 5): the
 * chronicity halves, or the worsening finding's two weeks. `recent` and `prior` are the two
 * windows' day spans, already placed on the calendar by the caller. Quiet when a span touches
 * the recent window and it fell or is zero, or touches the prior window and it is zero.
 */
/**
 * What a script may print of an engine-counted compare (counterexample 5, and the adversarial
 * pass's rise case): `'withhold'` on a fall or a zero in the recent window a span touches;
 * `'recent_only'` when only the PRIOR window is a touched zero and the recent one rose, so the
 * escalation-direction count still reaches the vet without the zero beside it; else `'show'`.
 */
export type EngineCompareMode = 'show' | 'recent_only' | 'withhold';

export function engineCompareMode(
  m: ScreenMasking | null,
  recent: { fromKey: string; toKey: string; count: number },
  prior: { fromKey: string; toKey: string; count: number },
): EngineCompareMode {
  if (!m) return 'show';
  const recentTouched = touches(m, recent.fromKey, recent.toKey);
  const priorTouched = touches(m, prior.fromKey, prior.toKey);
  if (recentTouched && (recent.count === 0 || recent.count < prior.count)) return 'withhold';
  if (priorTouched && prior.count === 0) return recent.count > 0 ? 'recent_only' : 'withhold';
  return 'show';
}

export function engineCompareWithheld(
  m: ScreenMasking | null,
  recent: { fromKey: string; toKey: string; count: number },
  prior: { fromKey: string; toKey: string; count: number },
): boolean {
  if (!m) return false;
  const recentTouched = touches(m, recent.fromKey, recent.toKey);
  const priorTouched = touches(m, prior.fromKey, prior.toKey);
  if (recentTouched && (recent.count === 0 || recent.count < prior.count)) return true;
  return priorTouched && prior.count === 0;
}

/** Day key `days` before `key`. */
export function keyMinus(key: string, days: number): string {
  return dayKeyFromIndex(indexOfKey(key) - days);
}

// ── Findings whose own sentence compares (the adversarial pass, findings 1 and 2) ─

/**
 * Whether a cached finding's OWN sentence must not be shown beside a masking span: the Signal
 * screen sets it aside and Get ready drops its row. Three sentences count a window themselves:
 *   • `trial_response` ("0 in the trial's 30 days, compared with 12 in the 49 days before"): a
 *     zero or a fall in the trial's days, or a zero in the baseline, a span touches;
 *   • a falling `reflection` ("1 this week, down from 5"): the engine's two weeks, by the same
 *     two-window rule as the phone script's compare;
 *   • the `stood_down` marker ("No vomiting logged in 14 days"): its quiet window touches a span.
 * `m` is the masking for the finding's own sign. Everything else carries no compare of its own.
 */
export function findingWithheldByMask(
  finding: CachedFinding['finding'],
  m: ScreenMasking | null,
  todayKey: string,
  generatedOn: string | null,
): boolean {
  if (!m) return false;
  const anchor = generatedOn ?? todayKey;
  const slack = generatedOn ? 0 : 1;
  if (finding.type === 'trial_response') {
    const today = indexOfKey(todayKey);
    const start = today - Math.max(1, Math.floor(finding.trialDayNumber)) + 1;
    const trialTouched = touches(m, dayKeyFromIndex(start), todayKey);
    const baseTouched = touches(m, dayKeyFromIndex(start - finding.baselineWindowDays), dayKeyFromIndex(start - 1));
    if (trialTouched) {
      if (finding.pooledTrialCount === 0) return true;
      const trialRate = finding.pooledTrialCount / Math.max(1, finding.trialDayNumber);
      const baseRate = finding.pooledBaselineCount / Math.max(1, finding.baselineWindowDays);
      if (trialRate < baseRate) return true;
    }
    return baseTouched && finding.pooledBaselineCount === 0;
  }
  if (finding.type === 'reflection') {
    const w = Math.max(1, Math.floor(finding.windowDays));
    return (
      engineCompareMode(
        m,
        { fromKey: keyMinus(anchor, w + 1), toKey: todayKey, count: finding.currentCount },
        { fromKey: keyMinus(anchor, 2 * w + 1 + slack), toKey: keyMinus(anchor, w - 1), count: finding.priorCount },
      ) !== 'show'
    );
  }
  if (finding.type === 'stood_down') {
    const from = keyMinus(anchor, Math.max(1, Math.floor(finding.recencyDays)) + slack);
    return touches(m, from, todayKey);
  }
  return false;
}
