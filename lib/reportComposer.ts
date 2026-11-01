// The vet report composer: its payload, its states and its words (Vet report v2 PR-16, CUL-2296;
// spec §10.1, §10.7; round 5 frames b1 to b4).
//
// Pure: no I/O and no React. The server (`generate-report`'s composer mode) computes every number
// off the report's own snapshot; this module only parses what came back, decides which state the
// screen is in, and words it. Nothing here counts.
//
// THE LIVE-FLAG CARD reads one 56-day set, fetched once when the composer opens. A window change
// never re-reads it and never moves it (GAP-14): a flag the owner's dates leave out still sits on
// top of the screen. The report built today does NOT print the 56-day set whatever the dates (that
// is the v2 document, VR2-10), so the card speaks about the record, and a line under the counts
// says when the chosen dates' report may not show a live flag (`droppedFlagsLine`).
//
// ABSENCE IS NOT WELLNESS (Principle 3, `clinical-guardrails`). A record with no live flag gets no
// card at all, never an "all clear"; a read that came back short gets a line saying it could not
// check, never silence; and a window with no symptom entry says the report will state it plainly
// and that a quiet record cannot rule anything out.

import { symptomWord } from './signalCopy';
import type { SignalSymptomType } from './signal';

/** The span the live flags are read over, mirrored from `composer.ts` LIVE_FLAG_DAYS (same question:
 *  the days the card's flags come from), so the card can say it. */
export const LIVE_FLAG_DAYS = 56;
/** Below this many days the report's week-on-week checks cannot run: `v2Predicates.ts`
 *  THIN_RECORD_DAYS, mirrored for the same question (does the record hold weeks to compare?). */
export const THIN_RECORD_DAYS = 14;

export type ComposerWindowKind = 'since_visit' | 'diet_trial' | 'last_90' | 'last_30' | 'since_first' | 'custom';

export interface ComposerWindow {
  kind: ComposerWindowKind;
  startDate: string;
  endDate: string;
  days: number;
  /** The report's own default window (the server's §6 cascade): previewed with NO override, so
   *  the report keeps its own label and floors. Every other window is sent as dates. */
  isDefault: boolean;
}

export type LeadReason = 'flag' | 'trial_sign' | 'rising' | 'most_days';

export interface ComposerCounts {
  startDate: string;
  endDate: string;
  windowDays: number;
  loggedDays: number;
  symptomEntries: number;
  weighIns: number;
  latestWeighIn: { lbs: number; date: string } | null;
  lead: { sign: string; reason: LeadReason } | null;
  loggedDayKeys: string[] | null;
  incomplete: boolean;
  /** The flags the report for THIS window prints; null when the server did not say (an older
   *  deploy), which the screen reads as "can't confirm", never as "all of them". */
  flags: ComposerFlag[] | null;
}

export interface ComposerAfter {
  startDate: string;
  endDate: string;
  symptomEntries: number;
  byType: Array<{ type: string; count: number }>;
  mealsRefused: number;
  incomplete: boolean;
}

export interface ComposerFlag {
  kind: string;
  sign: string | null;
  trigger: string | null;
}

export interface ComposerLive {
  state: 'flags' | 'none' | 'incomplete';
  startDate: string;
  endDate: string;
  flags: ComposerFlag[];
}

export interface ComposerOpen {
  today: string;
  petName: string;
  live: ComposerLive;
  windows: ComposerWindow[];
  counts: ComposerCounts;
  after: ComposerAfter | null;
}

export interface ComposerWindowCounts {
  counts: ComposerCounts;
  after: ComposerAfter | null;
}

// ── Parsing (the payload is the server's; never trust its shape) ────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const WINDOW_KINDS: readonly ComposerWindowKind[] = ['since_visit', 'diet_trial', 'last_90', 'last_30', 'since_first'];
const LEAD_REASONS: readonly LeadReason[] = ['flag', 'trial_sign', 'rising', 'most_days'];

export class ComposerPayloadError extends Error {}

function parseFlags(raw: unknown): ComposerFlag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => obj(f))
    .filter((f): f is Record<string, unknown> => f !== null && typeof f.kind === 'string')
    .map((f) => ({
      kind: f.kind as string,
      sign: typeof f.sign === 'string' ? f.sign : null,
      trigger: typeof f.trigger === 'string' ? f.trigger : null,
    }));
}

function parseCounts(raw: unknown): ComposerCounts {
  const c = obj(raw);
  if (
    !c || !isDay(c.startDate) || !isDay(c.endDate) || !isNum(c.windowDays) || !isNum(c.loggedDays) ||
    !isNum(c.symptomEntries) || !isNum(c.weighIns)
  ) {
    throw new ComposerPayloadError('counts');
  }
  const w = obj(c.latestWeighIn);
  const lead = obj(c.lead);
  return {
    startDate: c.startDate,
    endDate: c.endDate,
    windowDays: c.windowDays,
    loggedDays: c.loggedDays,
    symptomEntries: c.symptomEntries,
    weighIns: c.weighIns,
    latestWeighIn: w && isNum(w.lbs) && isDay(w.date) ? { lbs: w.lbs, date: w.date } : null,
    lead:
      lead && typeof lead.sign === 'string' && LEAD_REASONS.includes(lead.reason as LeadReason)
        ? { sign: lead.sign, reason: lead.reason as LeadReason }
        : null,
    loggedDayKeys: Array.isArray(c.loggedDayKeys) && c.loggedDayKeys.every(isDay) ? c.loggedDayKeys : null,
    // Absent reads as short: a count the server did not vouch for is never presented as whole.
    incomplete: c.incomplete !== false,
    flags: Array.isArray(c.flags) ? parseFlags(c.flags) : null,
  };
}

function parseAfter(raw: unknown): ComposerAfter | null {
  if (raw === null || raw === undefined) return null;
  const a = obj(raw);
  if (!a || !isDay(a.startDate) || !isDay(a.endDate) || !Array.isArray(a.byType)) throw new ComposerPayloadError('after');
  const byType = a.byType
    .map((t) => obj(t))
    .filter((t): t is Record<string, unknown> => t !== null && typeof t.type === 'string' && isNum(t.count))
    .map((t) => ({ type: t.type as string, count: t.count as number }));
  // The total is the breakdown's sum, here as on the server, so the line can never disagree with itself.
  return {
    startDate: a.startDate,
    endDate: a.endDate,
    byType,
    symptomEntries: byType.reduce((n, t) => n + t.count, 0),
    mealsRefused: isNum(a.mealsRefused) ? a.mealsRefused : 0,
    incomplete: a.incomplete !== false,
  };
}

function parseLive(raw: unknown): ComposerLive {
  const l = obj(raw);
  if (!l || !isDay(l.startDate) || !isDay(l.endDate) || !Array.isArray(l.flags)) throw new ComposerPayloadError('live');
  const flags = parseFlags(l.flags);
  // Any flag wins over whatever state was claimed; an unknown state with none reads as unchecked,
  // never as "none": the louder reading is the safe one.
  const state: ComposerLive['state'] = flags.length > 0 ? 'flags' : l.state === 'none' ? 'none' : 'incomplete';
  return { state, startDate: l.startDate, endDate: l.endDate, flags };
}

export function parseComposerOpen(data: unknown): ComposerOpen {
  const c = obj(obj(data)?.composer);
  if (!c || !isDay(c.today) || !Array.isArray(c.windows)) throw new ComposerPayloadError('open');
  const windows = c.windows
    .map((w) => obj(w))
    .filter(
      (w): w is Record<string, unknown> =>
        w !== null && WINDOW_KINDS.includes(w.kind as ComposerWindowKind) && isDay(w.startDate) && isDay(w.endDate) && isNum(w.days),
    )
    .map((w) => ({
      kind: w.kind as ComposerWindowKind,
      startDate: w.startDate as string,
      endDate: w.endDate as string,
      days: w.days as number,
      // Only an explicit true is the default: a guess here would send no override for a window
      // the report would not resolve.
      isDefault: w.isDefault === true,
    }));
  if (windows.length === 0) throw new ComposerPayloadError('windows');
  return {
    today: c.today,
    petName: typeof c.petName === 'string' ? c.petName : '',
    live: parseLive(c.live),
    windows,
    counts: parseCounts(c.counts),
    after: parseAfter(c.after),
  };
}

export function parseComposerWindow(data: unknown): ComposerWindowCounts {
  const c = obj(obj(data)?.composer);
  if (!c) throw new ComposerPayloadError('window');
  return { counts: parseCounts(c.counts), after: parseAfter(c.after) };
}

// ── Newest request wins (GAP-14) ─────────────────────────────────────────────

/**
 * A window change asks for counts; an earlier answer arriving after a later ask must never land.
 * `next()` stamps an ask; `isCurrent(stamp)` says whether its answer may still land.
 */
export function createRequestLatch(): { next: () => number; isCurrent: (stamp: number) => boolean } {
  let latest = 0;
  return {
    next: () => {
      latest += 1;
      return latest;
    },
    isCurrent: (stamp) => stamp === latest,
  };
}

// ── The state table (spec §10.7) ─────────────────────────────────────────────

/**
 * `loading`: the first read is in flight; nothing paints until the live flags and the first counts
 * are both in, so the card is in the first frame or never (GAP-13).
 * `failed`: the first read failed; nothing was checked, and the screen says so.
 * `ready`: the composer paints. Its counts are `counting` while a window change is in flight,
 * `failed` when that read failed, else `ready`.
 */
export type ComposerScreenState = 'loading' | 'failed' | 'ready';
export type ComposerCountsState = 'counting' | 'failed' | 'ready';

/** Which of the designed notes sits under the counts. Exactly one, or none. */
export type ComposerNote = 'empty' | 'thin' | null;

export function composerNoteOf(counts: ComposerCounts): ComposerNote {
  if (counts.symptomEntries === 0) return 'empty';
  if (counts.windowDays < THIN_RECORD_DAYS) return 'thin';
  return null;
}

// ── Words (nyx-voice) ────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "Sep 16", with the year when it is not `today`'s year. A local day key, read as written. */
export function composerDate(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const short = `${MONTHS[m - 1]} ${d}`;
  return day.slice(0, 4) === today.slice(0, 4) ? short : `${short}, ${y}`;
}

/** "Sep 16 to Oct 31". */
export function composerRange(start: string, end: string, today: string): string {
  return start === end ? composerDate(start, today) : `${composerDate(start, today)} to ${composerDate(end, today)}`;
}

export function monthTitle(year: number, monthIndex: number): string {
  return `${MONTHS_LONG[monthIndex]} ${year}`;
}

export const WINDOW_LABEL: Record<ComposerWindowKind, string> = {
  since_visit: 'Since the last visit',
  diet_trial: 'The diet trial',
  last_90: 'Last 90 days',
  last_30: 'Last 30 days',
  since_first: 'Since the first entry',
  custom: 'Your dates',
};

/** "Sep 16 to Oct 31 · 46 days". */
export function windowDatesLine(w: Pick<ComposerWindow, 'startDate' | 'endDate' | 'days'>, today: string): string {
  return `${composerRange(w.startDate, w.endDate, today)} · ${plural(w.days, 'day', 'days')}`;
}

export function symptomEntriesWords(n: number): string {
  return plural(n, 'symptom entry', 'symptom entries');
}

export function loggedDaysWords(n: number): string {
  return `${plural(n, 'day', 'days')} logged`;
}

/** "45 of 46 days logged." The coverage strip's twin, in the row's own words ("45 days logged"). */
export function coverageLine(c: ComposerCounts): string {
  if (c.loggedDays === c.windowDays) {
    return c.windowDays === 1 ? 'The one day is logged.' : `All ${c.windowDays} days logged.`;
  }
  return `${c.loggedDays} of ${plural(c.windowDays, 'day', 'days')} logged.`;
}

/** The coverage strip read aloud: which days hold no entry, never a list of the days that do. */
export function coverageA11yLabel(c: ComposerCounts, today: string): string {
  return `${coverageLine(c)} ${composerRange(c.startDate, c.endDate, today)}.`;
}

const LEAD_WHY: Record<LeadReason, string> = {
  flag: 'because it’s flagged',
  trial_sign: 'the sign the trial is watching',
  rising: 'logged more this week than the week before',
  most_days: 'logged on the most days',
};

/** The sign's owner word: the Signal's own (`symptomWord`); intake reads as eating. */
function signWord(sign: string): string {
  if (sign === 'intake') return 'eating';
  return symptomWord(sign as SignalSymptomType);
}

/** "Leads the report: vomiting, the first flag's sign." Null when no sign can lead. */
export function leadLine(c: ComposerCounts): string | null {
  if (c.lead === null) return null;
  return `Leads the report: ${signWord(c.lead.sign)}, ${LEAD_WHY[c.lead.reason]}.`;
}

/** Ruling W: app screens read lb, no percentage. "3 weigh-ins · 70.1 lb on Oct 27". */
export function weightLine(c: ComposerCounts, today: string): string {
  if (c.weighIns === 0 || c.latestWeighIn === null) return 'No weigh-ins in these days.';
  return `${plural(c.weighIns, 'weigh-in', 'weigh-ins')} · ${c.latestWeighIn.lbs.toFixed(1)} lb on ${composerDate(c.latestWeighIn.date, today)}`;
}

/** A short read: the counts may be low, and the screen says so beside them. */
export const COUNTS_INCOMPLETE_LINE =
  'Part of the record didn’t load, so these counts may be low. The report will say the same.';

export function emptyNote(): string {
  return 'Nothing logged as a symptom in these days. The report will say so plainly, and that a quiet record can’t rule anything out.';
}

/** A short window: "record" only when the window is the whole record (since the first entry). */
export function thinNote(kind: ComposerWindowKind): string {
  return kind === 'since_first'
    ? 'A short record. The report will say which checks need more weeks than this.'
    : 'A short window. The report will say which checks need more weeks than this.';
}

/** b4: what the dates leave out after their end. Symptoms by type, and refused meals (a refusal
 *  is not a symptom entry, and intake is not preference), then everything else. */
export function afterDisclosure(after: ComposerAfter, windowEnd: string, today: string): string {
  const end = composerDate(windowEnd, today);
  const parts: string[] = [];
  if (after.symptomEntries > 0) {
    parts.push(
      `${symptomEntriesWords(after.symptomEntries)} (${after.byType.map((t) => `${t.count} ${signWord(t.type)}`).join(', ')})`,
    );
  }
  if (after.mealsRefused > 0) parts.push(plural(after.mealsRefused, 'refused meal', 'refused meals'));
  const named = parts.length === 0 ? '' : `${parts.join(', ')} after ${end}, and `;
  const tail = parts.length === 0 ? `everything logged after ${end}, up to today.` : 'everything else logged after it, up to today.';
  const lead = `Left out by these dates: ${named}${tail}`;
  return after.incomplete ? `${lead} Part of those days didn’t load, so there may be more.` : lead;
}

/** A flag's identity across two snapshots. An intake flag's trigger is part of it: a September
 *  "eating less" is not today's "refusing food, then vomiting" (adversarial pass 2, B2). */
const flagKey = (f: ComposerFlag): string => `${f.kind}:${f.sign ?? ''}:${f.kind === 'intake_decline' ? f.trigger ?? '' : ''}`;

/** The one flag the report computes as of TODAY whatever the window (the weight lane runs on the
 *  whole weight history at the report date), so a past window's copy of it is today's. */
const AS_OF_TODAY_KINDS: ReadonlySet<string> = new Set(['weight_loss']);

export type DroppedReason = 'unconfirmed' | 'ended' | 'dropped';

/**
 * The live flags the report for this window may NOT print, and why. Until the v2 report prints the
 * 56-day band whatever the window (VR2-10), the composer says so out loud, and every doubt reads as
 * a flag that may be missing, never as one that is there:
 *   - `unconfirmed`: the server did not say which flags the window prints (`counts.flags` null), or
 *     the window's read failed. Every live flag.
 *   - `ended`: the window ends before today. Its report runs detection as of its own end, so a flag
 *     of the same kind there can be an older, different finding (adversarial pass 2, B2): every live
 *     flag but the as-of-today kinds the window also holds.
 *   - `dropped`: the window runs to today and its report lacks a live flag (pass 1, F1/F2).
 */
export function missingFlagsOf(
  live: ComposerLive,
  counts: ComposerCounts,
  today: string,
): { missing: ComposerFlag[]; reason: DroppedReason } {
  if (live.state !== 'flags') return { missing: [], reason: 'dropped' };
  if (counts.flags === null) return { missing: live.flags, reason: 'unconfirmed' };
  const printed = new Set(counts.flags.map(flagKey));
  if (counts.endDate < today) {
    return { missing: live.flags.filter((f) => !(AS_OF_TODAY_KINDS.has(f.kind) && printed.has(flagKey(f)))), reason: 'ended' };
  }
  return { missing: live.flags.filter((f) => !printed.has(flagKey(f))), reason: 'dropped' };
}

/** The warning under the counts when the chosen dates' report may not show a live flag. */
export function droppedFlagsLine(m: { missing: ComposerFlag[]; reason: DroppedReason }): string | null {
  if (m.missing.length === 0) return null;
  if (m.reason === 'unconfirmed') {
    return 'Couldn’t confirm the report for these dates shows the flags above. Tell your vet about them.';
  }
  const words = joinWords([...new Set(m.missing.map(flagWords))]);
  if (m.reason === 'ended') {
    return `These dates end before today, so the report may not show ${words} as it stands now. Tell your vet, or choose dates that run to today.`;
  }
  return `The report for these dates won’t show ${m.missing.length === 1 ? 'the flag' : 'the flags'} for ${words}. Tell your vet, or choose dates that cover more of the last ${LIVE_FLAG_DAYS} days.`;
}

// The live-flag card. Each flag is named in a few plain words, never a number: the number is the
// report's, and it reads it off the same set. The card asks for a call because a flag is in the
// set, never because of how many there are.
function flagWords(f: ComposerFlag): string {
  const word = f.sign === null ? null : signWord(f.sign);
  switch (f.kind) {
    case 'present_blood':
      return f.sign === 'vomit' ? 'blood in vomit' : 'blood in stool';
    case 'present_foreign':
      return 'possible foreign material in vomit';
    case 'intake_decline':
      // Worded by what happened: a refusal reads as one, never as "less" (intake is not preference).
      if (f.trigger === 'refused_then_vomited') return 'refusing food, then vomiting';
      if (f.trigger === 'refused_normal_food') return 'refusing a usual food';
      return 'eating less than usual';
    case 'trial_diet_refusal':
      return 'the trial diet not finished';
    case 'chronicity':
      return word === null ? 'a sign that has gone on for weeks' : `${word} that has gone on for weeks`;
    case 'symptom_burden':
      return word === null ? 'a lot of one sign this week' : `a lot of ${word} this week`;
    case 'symptom_worsening':
      return word === null ? 'a sign getting more frequent' : `${word} getting more frequent`;
    case 'weight_loss':
      return 'weight down';
    case 'weight_unchecked':
      return 'weight that couldn’t be checked';
    case 'protein_mismatch':
      return 'a trial food whose label names a different protein';
    default:
      // An engine finding the report names but does not detail, or a kind this build has never
      // heard of: still a flag, still on the card.
      return 'another finding';
  }
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export interface LiveCardCopy {
  title: string;
  body: string;
}

/** The card, or null when the 56-day set held no flag (no card is the designed absence). */
export function liveCardCopy(live: ComposerLive, petName: string): LiveCardCopy | null {
  const name = petName.trim() || 'your pet';
  const possessive = petName.trim() ? `${name}’s` : 'Your pet’s';
  if (live.state === 'incomplete') {
    return {
      title: `Couldn’t check ${name}’s record for flags`,
      body: `Part of the last ${LIVE_FLAG_DAYS} days didn’t load, so this can’t say whether anything is worth a call to your vet. If you’re worried about ${name}, your vet is the best call.`,
    };
  }
  if (live.state !== 'flags' || live.flags.length === 0) return null;
  const names = [...new Set(live.flags.map(flagWords))];
  const sentence = joinWords(names);
  return {
    // About the RECORD, not the report: whether a given window's report prints each flag is said
    // under the counts (`droppedFlagsLine`), so the card never promises what a window drops.
    title: `${possessive} record has ${live.flags.length === 1 ? 'a flag' : 'flags'} worth a call to your vet`,
    body: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`,
  };
}

/** The whole-screen failure (the first read): nothing was checked, and the screen says so. */
export function openFailedCopy(petName: string): { title: string; body: string } {
  const name = petName.trim() || 'your pet';
  return {
    title: 'Couldn’t set up the report',
    body: `${name.charAt(0).toUpperCase()}${name.slice(1)}’s record didn’t load, so nothing was checked for flags yet. Your entries are safe on this phone. Try again in a moment.`,
  };
}

export const COUNTS_FAILED_LINE = 'Couldn’t count these days. Try again in a moment.';

/** VoiceOver, on a window change landing (§14). */
export function countsUpdatedAnnouncement(c: ComposerCounts, today: string): string {
  return `Counts updated for ${composerRange(c.startDate, c.endDate, today)}.`;
}

/** b3's footer: "Oct 1 to Oct 20 · 20 days". */
export function rangeFooter(start: string, end: string, today: string): string {
  const days =
    Math.round((Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) -
      Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10))) / 86_400_000) + 1;
  return `${composerRange(start, end, today)} · ${plural(days, 'day', 'days')}`;
}

// ── The range calendar (b3) ─────────────────────────────────────────────────

/** A month's weeks, Sunday first: each cell a local day key, or null outside the month. */
export function monthGrid(year: number, monthIndex: number): Array<Array<string | null>> {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface DayRange {
  start: string | null;
  end: string | null;
}

/**
 * Two taps make a range: the first sets the start, the second the end (either order), a third
 * starts again. A day after `today` is never taken: a report never covers the future.
 */
export function nextRange(range: DayRange, tapped: string, today: string): DayRange {
  if (tapped > today) return range;
  if (range.start === null || range.end !== null) return { start: tapped, end: null };
  return tapped < range.start ? { start: tapped, end: range.start } : { start: range.start, end: tapped };
}

/** "Monday, October 6, has entries" for a day cell; VoiceOver's "has entries" (§14). */
export function dayCellA11yLabel(day: string, hasEntries: boolean | null): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  const base = `${weekday}, ${MONTHS_LONG[m - 1]} ${d}`;
  return hasEntries === true ? `${base}, has entries` : base;
}
