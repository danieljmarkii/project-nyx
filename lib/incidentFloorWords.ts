// The floor's words on the record: the watch-for list, "What to tell them" and call today's
// action line (Engines v3 PR-27b, CUL-1510; docs/nyx-incident-tiers-requirements.md §2 rules
// 1 and 2, §3). PR-27 built the tier-word map and left these three out because each needs
// EN-4's floor (`lib/incidentFloor.ts`), which PR-28 shipped.
//
// CLIENT-ONLY COPY. Nothing under supabase/functions imports this file, so a word edit never
// redeploys analyze-vomit (C-26). It imports the floor's CONSTANTS and its onset predicate,
// never a copy of them, so a threshold moved on the server moves every sentence here with it.
//
// ── THE WATCH-FOR LIST (§3) ──────────────────────────────────────────────────
// Under "Keep an eye out" and "Not enough to say yet". Every clause names ONE floor row and
// says exactly what that row hears, and `lib/incidentFloorWords.test.ts` drives the REAL
// floor with each clause's trigger and asserts the tier its sentence names (BRK-3). So a
// clause exists here only for a row the floor builds:
//   T1/T2 → call now   "you see {Pet} vomit twice more by {t}, with more than half an hour
//                       between each". Half an hour because witnessed logs inside 30 minutes
//                       merge into one onset (§8.9), so two quick ones would not be "twice".
//                       {t} is the anchor's ONSET plus 4 hours, the span T2 counts in.
//                       Absent on a found pile: a found anchor is never an onset, so its own
//                       read is never raised by T1/T2 (its neighbours' reads are).
//   T3    → call now   "{Pet} is low on energy by {anchor + 24 h}".
//   T6/T7 → call today "{Pet} vomits again by {anchor + 24 h}" (a dog; a pet under six
//                       months or with no birthday on file, which the list says).
//   T8    → call today the days a three-day run holding the vomit still lacks, counting
//                       what is logged ("vomits again tomorrow", "on each of the next two
//                       days"); never across a DST change (`persistenceClause`).
// NOT HERE, ON PURPOSE: "you see blood" (T12/T13 are not built; a blood photo is still call
// today, so "call now if you see blood" would name a tier the engine does not give), the
// meal clause (T10c lives in the server's shipped flags, not the floor), and T9 (held).
// The dog's bloat line is static (T11 is held for capture, GAP-14) and never says "GDV".
//
// Every deadline is a named hour, resolved against the clock: a clause whose window has
// closed is dropped, because the floor has already heard whatever happened inside it. A
// list with nothing left draws nothing, rather than a list of windows that have passed.
//
// ── WHAT TO TELL THEM (§2 rule 2) ────────────────────────────────────────────
// Under a new-rule call. Time, the vomits logged around this one (the floor's 24-hour pair
// window), what the photo shows, and the courses on board. ENUM FIELDS ONLY: never
// `foreign_material_note`, `description` or `read_text`, which are model free text (the note
// is filled on "unsure" too, CUL-240; clinical-guardrails Pattern 10). A finding is said
// only when PRESENT: "Blood: none visible" is never repeated here, because a line under a
// call that says what was not seen reads as reassurance (Pattern 1).
//
// ── CALL TODAY'S ACTION LINE (§2 rule 1) ─────────────────────────────────────
// The line gives leave to wait ("first thing tomorrow") only beside its exception ("or an
// emergency clinic tonight if {this pet's call-now signs}"), and only when the call came
// from the RECORD ALONE (`callFromRecordOnly`): the floor ran, every contextual flag is on
// an allow-list that keeps the exception unmet, no visual flag, no red-flag photo field,
// and no call of the model's own.
// PR-27's adversarial pass found that every call written today is call today, a photo of
// digested blood included (T12 is not built), so a leave to wait over a photo finding would
// be calmer than today's "Worth a call". A call carrying a photo finding, or the model's
// own call, keeps call now's after-hours path: "If they're closed, call an emergency clinic."
// The signs are the floor's call-now rows (T1/T2, T3) in plain words.

import {
  FLOOR_LETHARGY_HOURS,
  FLOOR_MERGE_MINUTES,
  FLOOR_PAIR_HOURS,
  FLOOR_SPAN_HOURS,
  FLOOR_YOUNG_MONTHS,
  ageInMonths,
  vomitOnsets,
  type FloorRow,
  type FloorTier,
  type FloorVomit,
} from './incidentFloor';
import { isQuietVerdict } from './incidentVerdict';

/** The key EN-4's floor runs under (`supabase/functions/_shared/engineFlags.ts`). A row
 *  stamped with it was written by a run whose floor re-runs when the record changes
 *  (§8.6), so a clause's promise ("call now if …") is one the app keeps. */
export const EN4_ENGINE_KEY = 'engines_v3_en4';

const HOUR = 3_600_000;
const MIN = 60_000;

function engineKeys(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Whether the row was written with EN-4's floor on, so its list is backed by a floor that
 *  re-runs (flag-off, no list: the read is today's `monitor` card). */
export function floorRanOn(row: { engine_flags?: unknown } | null | undefined): boolean {
  return !!row && engineKeys(row.engine_flags).includes(EN4_ENGINE_KEY);
}

// ── Clock words ────────────────────────────────────────────────────────────────

/** "9 PM", "1:30 AM": the device's own clock, which is what the owner reads against. */
export function clockWords(d: Date): string {
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = d.getMinutes();
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function localDayIndex(d: Date): number {
  // Whole local days since the epoch, from LOCAL components, so a DST day counts as one.
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / (24 * HOUR));
}

/** A deadline after now: "9 PM", "9 PM tomorrow", or the date beyond that. */
export function deadlineWords(atMs: number, nowMs: number): string {
  const at = new Date(atMs);
  const days = localDayIndex(at) - localDayIndex(new Date(nowMs));
  if (days === 0) return clockWords(at);
  if (days === 1) return `${clockWords(at)} tomorrow`;
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${clockWords(at)}`;
}

/** A time at or before now: "1:30 AM", "1:30 AM yesterday", or "Oct 22, 1:30 AM". */
export function pastWords(atMs: number, nowMs: number): string {
  const at = new Date(atMs);
  const days = localDayIndex(new Date(nowMs)) - localDayIndex(at);
  if (days === 0) return clockWords(at);
  if (days === 1) return `${clockWords(at)} yesterday`;
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${clockWords(at)}`;
}

function named(petName: string | null | undefined): string {
  const p = (petName ?? '').trim();
  return p.length > 0 ? p : 'your pet';
}

function capitalised(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "a", "a or b", "a, b, or c". */
function orList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
}

// ── The watch-for list ─────────────────────────────────────────────────────────

export interface WatchForInput {
  petName: string | null | undefined;
  species: string;
  /** `pets.date_of_birth`, or null when none is on file. */
  birthDate: string | null;
  /** The vomit this read is about, as it sits in `vomits`. */
  anchor: FloorVomit;
  /** The pet's live vomit logs around the anchor (`loadIncidentFloorFacts`). */
  vomits: readonly FloorVomit[];
  nowMs: number;
}

export interface WatchClause {
  /** The floor row the clause names; its trigger is driven through the real floor. */
  row: FloorRow;
  tier: FloorTier;
  text: string;
  /** The instant the clause's named deadline stands for, or null (T8 names days). The
   *  clause test places its trigger AT this instant, so the words and the rule cannot drift. */
  byMs: number | null;
}

export interface WatchForList {
  /** The dog's static bloat line, or null. */
  emergency: string | null;
  /** "Call your vet now if …", then "Call your vet today if …"; either may be absent. */
  lines: string[];
  /** The clauses behind `lines`, for the clause test. */
  clauses: WatchClause[];
  /** T7 fired on a missing birthday: the list says so (§8.11). */
  ageNote: string | null;
}

// Not "here's what would change this read": the list holds only the signs the floor hears,
// so it is not every sign that matters (a cat not eating has no clause yet, CUL-1609), and
// a lead that reads as complete would make an absent sign read as a safe one (B6).
export const WATCH_FOR_LEAD = 'Watch for these:';

/** The dog's bloat line (§3; T11 held for capture, GAP-14). Static, never "GDV". */
export function bloatLine(petName: string | null | undefined): string {
  const p = named(petName);
  return `Go to your vet or an emergency clinic now if ${p} retches with nothing coming up, or ${p}'s belly looks swollen or tight. That can be bloat.`;
}

/** The merge window in words: witnessed logs closer than this are one onset (§8.9). */
function mergeWords(): string {
  return FLOOR_MERGE_MINUTES === 30 ? 'half an hour' : `${FLOOR_MERGE_MINUTES} minutes`;
}

/** The anchor's onset instant: an earlier witnessed log within 30 minutes absorbs it (§8.9). */
function anchorOnsetMs(anchor: FloorVomit, vomits: readonly FloorVomit[]): number {
  const a = Date.parse(anchor.at);
  const all = vomits.some((v) => Date.parse(v.at) === a) ? vomits : [...vomits, anchor];
  return vomitOnsets(all).find((o) => o.at === a)?.onset ?? a;
}

export function watchForClauses(input: WatchForInput): WatchClause[] {
  const a = Date.parse(input.anchor.at);
  if (!Number.isFinite(a)) return [];
  const p = named(input.petName);
  const now = input.nowMs;
  const out: WatchClause[] = [];
  const ahead = (t: number) => t > now;

  if (input.anchor.confidence !== 'window') {
    const by = anchorOnsetMs(input.anchor, input.vomits) + FLOOR_SPAN_HOURS * HOUR;
    if (ahead(by)) {
      out.push({
        row: 'T2',
        tier: 'call_now',
        byMs: by,
        text: `you see ${p} vomit twice more by ${deadlineWords(by, now)}, with more than ${mergeWords()} between each`,
      });
    }
  }

  const lethargyBy = a + FLOOR_LETHARGY_HOURS * HOUR;
  if (ahead(lethargyBy)) {
    out.push({ row: 'T3', tier: 'call_now', byMs: lethargyBy, text: `${p} is low on energy by ${deadlineWords(lethargyBy, now)}` });
  }

  const age = ageInMonths(input.birthDate, a);
  const young = age === null || age < FLOOR_YOUNG_MONTHS;
  const pairBy = a + FLOOR_PAIR_HOURS * HOUR;
  if ((input.species === 'dog' || young) && ahead(pairBy)) {
    out.push({
      row: input.species === 'dog' ? 'T6' : 'T7',
      tier: 'call_today',
      byMs: pairBy,
      text: `${p} vomits again by ${deadlineWords(pairBy, now)}`,
    });
  }

  const t8 = persistenceClause(input, p);
  if (t8) out.push(t8);
  return out;
}

/**
 * T8 in calendar days, counting what is already logged (adversarial pass on this PR, B5):
 * the three-day runs holding the vomit's day are D-2..D, D-1..D+1 and D..D+2; the clause
 * names the days a run still lacks, choosing the run that lacks fewest, and only when every
 * lacking day is today or later. A vomit on each of three consecutive local days always
 * meets the floor's three 24-hour spans (each pair of days is more than 24 h and less than
 * 72 h apart at minute precision), EXCEPT across a DST change, where a local day is 23 or
 * 25 hours: then the clause is dropped rather than promising a call the floor would not
 * make (B4; the shipped repeat rule may still fire, the clause never claims it).
 */
function persistenceClause(input: WatchForInput, p: string): WatchClause | null {
  const a = Date.parse(input.anchor.at);
  const d = localDayIndex(new Date(a));
  const today = localDayIndex(new Date(input.nowMs));
  if (crossesDst(d - 2, d + 3, new Date(a))) return null;
  const logged = new Set(
    input.vomits.map((v) => Date.parse(v.at)).filter(Number.isFinite).map((t) => localDayIndex(new Date(t))),
  );
  logged.add(d);
  let best: number[] | null = null;
  for (const start of [d - 2, d - 1, d]) {
    const lacking = [start, start + 1, start + 2].filter((day) => !logged.has(day));
    if (lacking.length === 0 || lacking.some((day) => day < today)) continue;
    if (best === null || lacking.length < best.length) best = lacking;
  }
  if (!best) return null;
  const word = (day: number) => (day === today ? 'today' : day === today + 1 ? 'tomorrow' : 'the day after tomorrow');
  const text =
    best.length === 1
      ? `${p} vomits again ${word(best[0])}`
      : best[0] === today
        ? `${p} vomits today and again tomorrow`
        : best[0] === today + 1
          ? `${p} vomits on each of the next two days`
          : null;
  return text ? { row: 'T8', tier: 'call_today', byMs: null, text } : null;
}

/** Whether any local day in [fromDay, toDay) is not 24 hours long, read off the zone
 *  offset at each local midnight around `near`. */
function crossesDst(fromDay: number, toDay: number, near: Date): boolean {
  const base = localDayIndex(near);
  const midnight = (day: number) =>
    new Date(near.getFullYear(), near.getMonth(), near.getDate() + (day - base)).getTimezoneOffset();
  const first = midnight(fromDay);
  for (let day = fromDay + 1; day <= toDay; day++) if (midnight(day) !== first) return true;
  return false;
}

export function watchForList(input: WatchForInput): WatchForList | null {
  const clauses = watchForClauses(input);
  const now = clauses.filter((c) => c.tier === 'call_now').map((c) => c.text);
  const today = clauses.filter((c) => c.tier === 'call_today').map((c) => c.text);
  const lines: string[] = [];
  if (now.length > 0) lines.push(`Call your vet now if ${orList(now)}.`);
  if (today.length > 0) lines.push(`Call your vet today if ${orList(today)}.`);
  const emergency = input.species === 'dog' ? bloatLine(input.petName) : null;
  const a = Date.parse(input.anchor.at);
  const ageNote =
    clauses.some((c) => c.row === 'T7') && ageInMonths(input.birthDate, a) === null
      ? `${capitalised(named(input.petName))}'s birthday isn't on file, so this is read the way it would be for a young animal.`
      : null;
  if (lines.length === 0 && emergency === null) return null;
  return { emergency, lines, clauses, ageNote };
}

// ── Call today's action line ───────────────────────────────────────────────────

/** The pet's call-now signs, from the floor's call-now rows (T1/T2, T3). */
export function callNowSigns(petName: string | null | undefined): string {
  const p = named(petName);
  return `${p} vomits three times within a few hours, or vomits and is low on energy`;
}

/** The hours a vet is taken to be open for "today": 6 AM to 6 PM local. Outside them the
 *  line resolves to the next morning (§2 rule 1), with the call-now signs as the exception. */
export const CALL_TODAY_DAY_FROM_HOUR = 6;
export const CALL_TODAY_DAY_UNTIL_HOUR = 18;

/** Call today's line over a call that carries a photo finding or the model's own call:
 *  no leave to wait (call now's after-hours path). */
export const CALL_TODAY_NO_WAIT = "Call your vet today. If they're closed, call an emergency clinic.";

/** The contextual flags a call today may give leave to wait over, per read. An allow-list:
 *  a flag not named here (lethargy beside the sign, a flag a later server adds) keeps no
 *  leave to wait. `concurrent_lethargy` is out on both reads because "vomits and is low on
 *  energy" is a call-now sign (T3) and the line's exception must never already be met
 *  (adversarial pass on this PR, B1). */
export const WAIT_ALLOWED_FLAGS: Readonly<Record<'vomit' | 'stool', readonly string[]>> = {
  vomit: ['repeated_vomiting', 'feline_reduced_intake'],
  stool: ['repeated_loose_stool', 'concurrent_vomiting'],
};

/**
 * Whether the call came from the record alone, so the line may give leave to wait. Every
 * condition must hold, and unknown is never record-only:
 *   - the floor ran on this row (`engines_v3_en4` in its stamp), so the call-now signs the
 *     line names as its exception are signs the app raises on;
 *   - at least one contextual flag, and every one of them on the allow-list above;
 *   - no visual flag, and the flag list was read (absent is unknown);
 *   - no red-flag photo field, present or unclear (`photoFinding`, the section's call);
 *   - the model did not make its own call (`modelCall`): a pill, worms or plant matter can
 *     escalate the model with every enum field quiet (T16 to T18), and only its own
 *     verdict in the payload says so (B2).
 */
export function callFromRecordOnly(row: {
  kind: 'vomit' | 'stool';
  floorRan: boolean;
  contextual_flags?: readonly string[] | null;
  visual_flags?: readonly string[] | null;
  photoFinding: boolean;
  modelCall: boolean;
}): boolean {
  if (!row.floorRan || row.photoFinding || row.modelCall) return false;
  if (!Array.isArray(row.visual_flags) || row.visual_flags.length > 0) return false;
  const flags = row.contextual_flags;
  if (!Array.isArray(flags) || flags.length === 0) return false;
  return flags.every((f) => WAIT_ALLOWED_FLAGS[row.kind].includes(f));
}

/** Whether the model made its own call, handed the verdict it stored in its payload (the
 *  section reads the field, the one sanctioned reader): true when it asked for a call, and
 *  when a photographed read carries no verdict to check (a rescue, a failed parse). */
export function modelMadeCall(modelVerdict: unknown, hasPhoto: boolean): boolean {
  if (!hasPhoto) return false;
  return typeof modelVerdict !== 'string' || !isQuietVerdict(modelVerdict);
}

export function callTodayAction(input: {
  petName: string | null | undefined;
  nowMs: number;
  recordOnly: boolean;
}): string {
  if (!input.recordOnly) return CALL_TODAY_NO_WAIT;
  const signs = callNowSigns(input.petName);
  const h = new Date(input.nowMs).getHours();
  if (h >= CALL_TODAY_DAY_FROM_HOUR && h < CALL_TODAY_DAY_UNTIL_HOUR) {
    return `Call your vet today. If they're closed, first thing tomorrow, or an emergency clinic tonight if ${signs}.`;
  }
  if (h >= CALL_TODAY_DAY_UNTIL_HOUR) {
    return `Call your vet tonight if they're open, or first thing tomorrow. Call an emergency clinic tonight if ${signs}.`;
  }
  return `Call your vet first thing this morning. Call an emergency clinic now if ${signs}.`;
}

// ── What to tell them ──────────────────────────────────────────────────────────

export const TELL_THEM_HEADING = 'What to tell them:';

/** A vomit read's present findings, from enum fields only. */
export function vomitFindings(row: {
  blood_present?: string | null;
  foreign_material_present?: string | null;
}): string[] {
  const out: string[] = [];
  if (row.blood_present === 'fresh_red') out.push('fresh red blood in the photo');
  if (row.blood_present === 'coffee_ground') out.push('dark, gritty material in the photo that can be digested blood');
  if (row.foreign_material_present === 'yes') out.push("something in the photo that doesn't look like food");
  return out;
}

const WATERY_STOOL: Readonly<Record<string, string>> = {
  type_6_mushy: 'soft and mushy stool',
  type_7_watery: 'watery stool',
};

/** A stool read's present findings, from enum fields only. */
export function stoolFindings(row: {
  stool_consistency?: string | null;
  stool_blood_present?: string | null;
  stool_blood_type?: string | null;
  stool_mucus_present?: string | null;
  foreign_material_present?: string | null;
}): string[] {
  const out: string[] = [];
  const texture = row.stool_consistency ? WATERY_STOOL[row.stool_consistency] : undefined;
  if (texture) out.push(texture);
  if (row.stool_blood_present === 'yes') {
    out.push(
      row.stool_blood_type === 'fresh_red'
        ? 'fresh red blood in the photo'
        : row.stool_blood_type === 'dark_tarry'
          ? 'dark, tarry stool in the photo that can be digested blood'
          : 'blood in the photo',
    );
  }
  if (row.stool_mucus_present === 'yes') out.push('mucus in the photo');
  if (row.foreign_material_present === 'yes') out.push('something in the photo that may not be stool');
  return out;
}

export interface TellThemInput {
  petName: string | null | undefined;
  kind: 'vomit' | 'stool';
  /** The event this read is about. */
  anchor: FloorVomit;
  /** The pet's live vomit logs around the anchor; on a stool read, the vomits beside it. */
  vomits: readonly FloorVomit[];
  findings: readonly string[];
  /** The courses on board at the event, by the names the owner entered. */
  courses: readonly string[];
  nowMs: number;
}

/** The vomits the line counts: every live log within the floor's pair window either side
 *  of the anchor, found piles included and dated as found (§8.9's day rungs). */
export function vomitsAround(anchor: FloorVomit, vomits: readonly FloorVomit[], nowMs: number): number[] {
  const a = Date.parse(anchor.at);
  const reach = FLOOR_PAIR_HOURS * HOUR;
  const times = vomits
    .map((v) => Date.parse(v.at))
    .filter((t) => Number.isFinite(t) && Math.abs(t - a) <= reach && t <= nowMs + MIN);
  // Two piles found at the same minute are two vomits: counted, never de-duplicated.
  return times.sort((x, y) => x - y);
}

export function tellThem(input: TellThemInput): string | null {
  const a = Date.parse(input.anchor.at);
  if (!Number.isFinite(a)) return null;
  const p = capitalised(named(input.petName));
  const parts: string[] = [];

  if (input.kind === 'vomit') {
    const times = vomitsAround(input.anchor, input.vomits, input.nowMs);
    const found = input.anchor.confidence === 'window';
    if (times.length >= 2) {
      parts.push(
        `${times.length} vomits logged from ${pastWords(times[0], input.nowMs)} to ${pastWords(times[times.length - 1], input.nowMs)}`,
      );
    } else {
      parts.push(found ? `A vomit found at ${pastWords(a, input.nowMs)}` : `${p} vomited at ${pastWords(a, input.nowMs)}`);
    }
  } else {
    parts.push(`Stool logged at ${pastWords(a, input.nowMs)}`);
    const times = vomitsAround(input.anchor, input.vomits, input.nowMs);
    if (times.length > 0) parts.push(`${times.length === 1 ? '1 vomit' : `${times.length} vomits`} logged within a day of it`);
  }

  if (input.findings.length > 0) parts.push(input.findings.join(' and '));
  if (input.courses.length > 0) parts.push(`on ${input.courses.join(', ')}`);
  return `${parts.join('; ')}.`;
}
