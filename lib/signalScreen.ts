// The Signal's own screen — its model and its loader (Design v2 — the whole day, D2-3 ·
// CUL-1065; design authority `docs/culprit-design-v4-mockups.html` §03, ruled on the six
// reads of §06).
//
// The screen draws the evidence behind ONE finding: the weekly chart with every week's
// count and logged days, the count-anchored sentence, the before/during compare, the
// "timed from meals" lanes, the photographed episodes each with its OWN verdict, and why
// it is a Signal. Everything counted here is counted through the modules that already
// own the count — `lib/signalWindows.ts` for every window (one predicate for the card's
// bars, its line, the compare and the lanes), `lib/chartModels.ts` for the buckets,
// `lib/mealTiming.ts` for the minutes since a meal (G9: no second timing math) — and
// this file composes.
//
// ── TWO THINGS THE SIX READS RULED, KEPT HERE BY SHAPE ─────────────────────────
//   • PER-EPISODE VERDICTS, NEVER AN AGGREGATE. Dr. Chen: "the other three, monitor"
//     reassures by aggregation. The gallery model is one tile per photographed episode,
//     each carrying its own read (or the honest "no read yet"); there is no field for a
//     summary verdict, and `signalScreen.test.ts` greps every string this module can
//     produce for "the other".
//   • MEDICATION INSIDE THE WINDOW IS NAMED. Cerenia dosed on four days inside the trial
//     window is a fact the compare cannot show and the reader must have: `whyLines`
//     names every drug dosed inside either compare window with its dates, from the
//     record (delivered doses only — `given` / `partial`, the dose-duration rule D1),
//     and says nothing about medication when none was.
//
// ── THE READS ────────────────────────────────────────────────────────────────────
// Local SQLite, all of it: the record (the finding's episodes with their attachments,
// every logged day, the feedings + free-fed spans the lanes time against, the trial, the
// doses) and, since HV-5 (CUL-1162), the per-incident verdicts, from the PHONE'S COPY
// (`lib/readCopy.ts`) through the one read predicate every surface shares
// (`readVerdictOf`, `lib/readState.ts`). They used to be the one server fetch, so offline
// every tile said "no read yet". A copy that cannot be read leaves the episodes as "no
// read yet" rather than failing the screen: a verdict absent from the screen is not a
// reassurance (the tile says "no read yet"), and the record is still the record. A tile
// is read across its WHOLE bout (`readTileVerdicts`): the rose on any row of it is the
// tile's rose, and nothing calmer crosses from one row to another.
//
// C-9: the pet is the FINDING's pet — the id the route carries — named through
// `resolveRecordPetName`, never `activePet`.

import { getDietTrialProgress } from './analytics';
import { episodeDaysOf, type CompareWindowsModel, type WeeklyBucketsModel } from './chartModels';
import { getDb } from './db';
import { trialIdentityLabel } from './dietTrialCard';
import { isTrialRunning } from './dietTrial';
import { loadTrialPredicateFacts } from './dietTrialFacts';
import { classifyEpisodeSet, collapseEpisodes, DEFAULT_MEAL_TIMING_CONFIG, type OnsetConfidence } from './mealTiming';
import { drugDisplayName } from './medications';
import { readFeedingRows, readFreeFedSpans, TIMING_SYMPTOM_TYPE } from './patternsTiming';
import { readSignalCache, type CachedFinding, type SignalFinding } from './signal';
import { evidenceText, hasBannedSignalVocabulary, symptomWord } from './signalCopy';
import { canFold, foldIdentity } from './signalFold';
import { signalTitle } from './signalTitle';
import {
  signalCompare,
  signalCompareSpec,
  signalLanes,
  signalSymptomOf,
  signalWeeks,
  trialTooYoungToCompare,
  weekLine,
  MIN_COMPARE_DAYS,
  type SignalLanesModel,
  type SignalTrialWindow,
} from './signalWindows';
import { analysisChainOutstanding } from './analysisChain';
import { readCopies } from './readCopy';
import { readVerdictOf, type ReadCopyRow } from './readState';
import { dayKeyFromIndex, formatCalendarDate, formatTime, localDayIndexOf, toLocalDayKey } from './utils';
import { resolveRecordPetName, usePetStore } from '../store/petStore';

// ── The model ─────────────────────────────────────────────────────────────────

/** The per-incident read's verdict enum — `event_ai_analysis.recommendation`. The owner
 *  words for each live with the shipped read (`VomitAnalysisSection`'s label map), which
 *  the gallery imports; this module carries the key only. */
export type EpisodeVerdict = 'worth_a_call' | 'monitor' | 'not_enough_to_say';

export interface SignalScreenPhoto {
  localUri: string | null;
  storagePath: string;
}

/** One episode of the finding's symptom, after the engine's own re-log collapse. */
export interface SignalScreenEpisode {
  eventId: string;
  occurredAt: string;
  /** The device's local day key for `occurredAt` — the caller's one zone decision. */
  dayKey: string;
  /** Minutes since the preceding logged meal where the engine could time it; null where not. */
  minutesSinceMeal: number | null;
  photo: SignalScreenPhoto | null;
  /** Every logged row the engine's re-log collapse folded into this episode, the tile's
   *  own row among them. The loader reads the bout's verdicts from it; the builder never
   *  does. Absent reads as the one row `eventId` names. */
  boutIds?: readonly string[];
}

/** One delivered dose on one local day. */
export interface SignalDoseDay {
  drugLabel: string;
  dayKey: string;
}

export interface SignalScreenInput {
  cached: CachedFinding;
  petName: string;
  today: string;
  trial: SignalTrialWindow | null;
  episodes: readonly SignalScreenEpisode[];
  /** Every local day with any log — never derived from the episodes (C-3). */
  loggedDays: readonly string[];
  recordStart: string | null;
  /** Verdict by event id; an absent key is "no read yet". */
  verdicts: Readonly<Record<string, EpisodeVerdict | null>>;
  doses: readonly SignalDoseDay[];
}

export interface GalleryTile {
  eventId: string;
  occurredAt: string;
  /** "Sep 17" */
  dateWord: string;
  /** "5:11 PM" */
  timeWord: string;
  /** This episode's OWN read, or null when the record holds none yet. */
  verdict: EpisodeVerdict | null;
  photo: SignalScreenPhoto;
}

export interface SignalScreenEpisodes {
  /** Every episode in the drawn weeks. */
  total: number;
  photographedCount: number;
  /** "21, nine photographed" — the count line beside the section's title. */
  countLine: string;
  /** Newest first. */
  tiles: GalleryTile[];
}

export interface SignalScreenModel {
  /** `foldIdentity(finding)` — the route's key. */
  identity: string;
  finding: SignalFinding;
  title: string;
  /** The count-anchored sentence, phrased server-side (`CachedFinding.text`). */
  sentence: string;
  /** The lower-case noun every chart takes ("vomiting"), or null for a finding that counts none. */
  noun: string | null;
  weekly: WeeklyBucketsModel | null;
  weekLine: string | null;
  compare: CompareWindowsModel | null;
  lanes: SignalLanesModel | null;
  episodes: SignalScreenEpisodes | null;
  /** *Why this is a Signal* — the lines, in order. */
  why: string[];
  /** The screen offers *Keep it compact on Home* only for a class that folds. */
  foldable: boolean;
  /** The Home card is plain text for these (S1); the screen carries the phone script. */
  safety: boolean;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

const SMALL_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** "nine" up to twelve, then the numeral — the mock's "21, nine photographed". */
function smallNumber(n: number): string {
  return n >= 0 && n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n] : String(n);
}

function indexOf(key: string): number {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(`signalScreen: not a day key: ${key}`);
  return i;
}

/** The episodes inside the drawn weeks — what the chart counts and the gallery shows.
 *  Bounded above by TODAY, the bound the buckets use: a mis-dated episode tomorrow is
 *  "dated after what is drawn" on the chart and must not be a tile (C-4 — the two counts
 *  partition; adversarial pass, B6). */
function episodesInWeeks(episodes: readonly SignalScreenEpisode[], weekly: WeeklyBucketsModel, today: string): SignalScreenEpisode[] {
  const first = indexOf(weekly.firstKey);
  const last = Math.min(indexOf(weekly.lastKey), indexOf(today));
  return episodes.filter((e) => {
    const i = indexOf(e.dayKey);
    return i >= first && i <= last;
  });
}

function galleryOf(inWeeks: readonly SignalScreenEpisode[], verdicts: SignalScreenInput['verdicts'], weeks: number): SignalScreenEpisodes {
  const photographed = inWeeks
    .filter((e): e is SignalScreenEpisode & { photo: SignalScreenPhoto } => e.photo != null)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const tiles: GalleryTile[] = photographed.map((e) => {
    const d = new Date(e.occurredAt);
    return {
      eventId: e.eventId,
      occurredAt: e.occurredAt,
      dateWord: formatCalendarDate(e.dayKey) ?? e.dayKey,
      timeWord: Number.isNaN(d.getTime()) ? '' : formatTime(d),
      verdict: verdicts[e.eventId] ?? null,
      photo: e.photo,
    };
  });
  const total = inWeeks.length;
  const n = photographed.length;
  // The count names its window (CUL-223: a display-window count spoken as a record fact
  // is the anti-pattern; adversarial pass, B8): these are the drawn weeks' episodes.
  const scope = `${total} in these ${weeks} ${plural(weeks, 'week')}`;
  const countLine = n === 0 ? `${scope}, none photographed` : `${scope}, ${smallNumber(n)} photographed`;
  return { total, photographedCount: n, countLine, tiles };
}

// ── Why this is a Signal ──────────────────────────────────────────────────────

/** "Sep 9–12" for a contiguous run of days, "Sep 9" for one, else "on 4 days between Sep 9
 *  and Sep 20" — the dates the record holds, never a course the record did not log. */
export function doseDatesPhrase(dayKeys: readonly string[]): string {
  const idxs = [...new Set(dayKeys)].map(indexOf).sort((a, b) => a - b);
  const first = dayKeyFromIndex(idxs[0]);
  const last = dayKeyFromIndex(idxs[idxs.length - 1]);
  const firstWord = formatCalendarDate(first) ?? first;
  const lastWord = formatCalendarDate(last) ?? last;
  if (idxs.length === 1) return firstWord;
  const contiguous = idxs[idxs.length - 1] - idxs[0] === idxs.length - 1;
  if (contiguous) {
    // "Sep 9–12" inside one month; "Sep 29–Oct 2" across one.
    const sameMonth = first.slice(0, 7) === last.slice(0, 7);
    return sameMonth ? `${firstWord}–${last.slice(8).replace(/^0/, '')}` : `${firstWord}–${lastWord}`;
  }
  return `on ${idxs.length} days between ${firstWord} and ${lastWord}`;
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

/**
 * An owner-typed label (a drug, a food) made safe for a Signal line: a strength or a
 * percentage token ("Baytril 2.5%", "Weruva 95% Chicken") is REMOVED rather than the
 * whole line dropped. The B-733 rule dropped the med-context line on a benign card as
 * decoration; here the line is the confounder disclosure Dr. Chen conditioned round 3
 * on, and "95%" foods and "2.5%" injectables are ordinary names — a better-than-the-rule
 * case (adversarial pass, B5). Null only when the repaired label still trips the screen.
 */
export function safeLabel(label: string | null | undefined): string | null {
  const stripped = (label ?? '')
    .replace(/\s*\d+(?:[.,]\d+)?\s*%/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!stripped || hasBannedSignalVocabulary(stripped)) return null;
  return stripped;
}

/**
 * The medication lines: one per drug dosed inside either compare window, dated from the
 * record. Which window is said ("the trial's 55 days" / "the 55 days before it" / "both
 * windows"), because a course that straddles the start is a different fact from one
 * inside the trial. A line that trips the guardrail screen (a "%" in a drug name — the
 * med-context line's precedent, B-733) is dropped, never rendered.
 */
export function medicationLines(input: SignalScreenInput): string[] {
  const [before, during] = signalCompareSpec(input.cached.finding, input.today, input.trial);
  const beforeStart = indexOf(before.startDay);
  const duringStart = indexOf(during.startDay);
  const end = duringStart + during.days - 1;
  const byDrug = new Map<string, { before: string[]; during: string[] }>();
  for (const d of input.doses) {
    const label = safeLabel(d.drugLabel);
    if (!label) continue;
    const i = indexOf(d.dayKey);
    if (i < beforeStart || i > end) continue;
    const entry = byDrug.get(label) ?? { before: [], during: [] };
    (i < duringStart ? entry.before : entry.during).push(d.dayKey);
    byDrug.set(label, entry);
  }
  const lines: string[] = [];
  for (const [label, days] of byDrug) {
    const all = [...days.before, ...days.during];
    const where =
      days.before.length > 0 && days.during.length > 0
        ? 'across both windows'
        : days.during.length > 0
          ? `inside ${lowerFirst(during.label)}`
          : `inside ${lowerFirst(before.label)}`;
    const line = `${label} was given ${doseDatesPhrase(all)}, ${where}.`;
    if (!hasBannedSignalVocabulary(line)) lines.push(line);
  }
  return lines;
}

/** "Day 55 of 56 on Royal Canin Selected Protein PR." — never completion language at N ≥ M
 *  (the medication-duration rule D7, applied to the trial); past the window, the shipped
 *  strip's own words. */
export function trialLine(trial: SignalTrialWindow): string {
  const food = safeLabel(trial.foodLabel);
  const on = food ? ` on ${food}` : '';
  const over = trial.dayCounter - trial.targetDays;
  if (trial.targetDays > 0 && over > 0) {
    return `Day ${trial.dayCounter} — ${over} ${plural(over, 'day')} past the window you set${on}.`;
  }
  return trial.targetDays > 0 ? `Day ${trial.dayCounter} of ${trial.targetDays}${on}.` : `Day ${trial.dayCounter}${on}.`;
}

/** The mock's §03 block, composed: the shipped why, the compare stated as counts and
 *  disclaimed, the medication inside the window, the diet line. */
export function whyLines(input: SignalScreenInput, compare: CompareWindowsModel | null): string[] {
  const { finding } = input.cached;
  const lines: string[] = [evidenceText(finding, input.petName)];
  if (compare) {
    const [a, b] = compare.windows;
    const n = a.days;
    // The logged days are NAMED in the sentence, both windows, always (S2: the control
    // side is present where the claim is; C-3: "two windows of 55 days" beside a partial
    // enumeration is a claim about the enumeration). A diligent baseline against a
    // drifting trial — 19 over 55 logged days vs 5 over 16, one rate — reads as a 4×
    // improvement from the bars alone; the sentence is where the reader learns why not
    // (adversarial pass, B3). Naming the asymmetry is not the word "fairly".
    lines.push(
      `Two windows of ${n} ${plural(n, 'day')}, logged on ${a.loggedCount} and ${b.loggedCount} of them. Compared as counts, not a verdict on how ${input.petName} is doing.`,
    );
  } else if (trialTooYoungToCompare(input.trial)) {
    // The floor, said (B1): no compare below `MIN_COMPARE_DAYS` days on the diet.
    lines.push(
      `${trialDayWord(input.trial as SignalTrialWindow)} — fewer than ${MIN_COMPARE_DAYS} days in, so there is no before-and-during compare yet.`,
    );
  }
  lines.push(...medicationLines(input));
  if (input.trial) {
    lines.push('A diet change is one of several things that can move this.');
    lines.push(trialLine(input.trial));
  }
  return lines.filter((l) => l.trim().length > 0 && !hasBannedSignalVocabulary(l));
}

/** "Day 2 of the trial" — the floor line's opening. */
function trialDayWord(trial: SignalTrialWindow): string {
  return `Day ${trial.dayCounter} of the ${lowerFirst(trial.identity)}`;
}

// ── The builder (pure) ────────────────────────────────────────────────────────

export function buildSignalScreenModel(input: SignalScreenInput): SignalScreenModel {
  const { finding } = input.cached;
  const symptom = signalSymptomOf(finding);
  const noun = symptom ? symptomWord(symptom) : null;
  const identity = foldIdentity(finding);
  const safety = finding.priorityClass === 'safety';
  const title = signalTitle(finding, input.trial);

  if (!symptom) {
    return {
      identity,
      finding,
      title,
      sentence: input.cached.text,
      noun,
      weekly: null,
      weekLine: null,
      compare: null,
      lanes: null,
      episodes: null,
      why: whyLines(input, null),
      foldable: canFold(finding),
      safety,
    };
  }

  const episodeDays = input.episodes.map((e) => e.dayKey);
  const windows = {
    finding,
    today: input.today,
    trial: input.trial,
    episodeDays,
    loggedDays: input.loggedDays,
    recordStart: input.recordStart,
  };
  const weekly = signalWeeks(windows);
  const compare = trialTooYoungToCompare(input.trial) ? null : signalCompare(windows);
  // The lanes time against meals, which the engine does for vomiting only (the shipped
  // panel's symptom); a cough has no "minutes after eating".
  const lanes =
    symptom === TIMING_SYMPTOM_TYPE
      ? signalLanes({
          finding,
          today: input.today,
          trial: input.trial,
          episodes: input.episodes.map((e) => ({ dayKey: e.dayKey, minutesSinceMeal: e.minutesSinceMeal })),
        })
      : null;
  const inWeeks = episodesInWeeks(input.episodes, weekly, input.today);

  return {
    identity,
    finding,
    title,
    sentence: input.cached.text,
    noun,
    weekly,
    weekLine: weekLine(weekly),
    compare,
    lanes,
    episodes: galleryOf(inWeeks, input.verdicts, weekly.weeks.length),
    why: whyLines(input, compare),
    foldable: canFold(finding),
    safety,
  };
}

// ── The loader ────────────────────────────────────────────────────────────────

export type SignalScreenLoad =
  | { status: 'ready'; model: SignalScreenModel; petName: string }
  /** No cache row for this pet, or the finding is no longer in it. */
  | { status: 'missing'; petName: string };

interface EpisodeRow {
  id: string;
  occurred_at: string;
  occurred_at_confidence: string | null;
}

interface AttachmentRow {
  event_id: string;
  local_uri: string | null;
  storage_path: string;
}

interface DoseRow {
  occurred_at: string;
  generic_name: string | null;
  brand_name: string | null;
}

/** The finding's episodes from the local record, collapsed, with attachments and — for
 *  vomiting — the minutes since the preceding meal through the one timing predicate. */
export async function readSignalEpisodes(petId: string, symptomType: string): Promise<SignalScreenEpisode[]> {
  const db = getDb();
  const rows = await db.getAllAsync<EpisodeRow>(
    `SELECT id, occurred_at, occurred_at_confidence FROM events
     WHERE pet_id = ? AND event_type = ? AND deleted_at IS NULL`,
    [petId, symptomType],
  );
  const stamped = rows
    .map((r) => ({ ...r, ms: Date.parse(r.occurred_at) }))
    .filter((r) => Number.isFinite(r.ms));
  const episodes = collapseEpisodes(stamped, DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours);
  if (episodes.length === 0) return [];

  // A bout is EVERY row the collapse folded into its representative — the owner who logs
  // a vomit at 17:11, photographs the blood and re-logs at 17:31 has the photo (and its
  // read) on the SECOND row. Attachments are read for every member, and a bout's photo is
  // the first member's that has one (adversarial pass, B2). The same chained-gap rule as
  // the collapse (`collapseEpisodes`: a new episode starts >gap after its predecessor).
  const members = boutMembers(stamped, episodes, DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours);
  const allIds = stamped.map((r) => r.id);
  const placeholders = allIds.map(() => '?').join(',');
  const attachments = await db.getAllAsync<AttachmentRow>(
    `SELECT event_id, local_uri, storage_path FROM event_attachments
     WHERE pet_id = ? AND event_id IN (${placeholders})
     ORDER BY sort_order ASC, created_at DESC`,
    [petId, ...allIds],
  );
  const photoByRow = new Map<string, SignalScreenPhoto>();
  for (const a of attachments) {
    if (!photoByRow.has(a.event_id)) photoByRow.set(a.event_id, { localUri: a.local_uri, storagePath: a.storage_path });
  }
  // The bout's photo, and the ROW that holds it — the tile opens that record and the
  // verdict is read for that row, since the read is keyed on the photographed event.
  const photoByEpisode = new Map<string, { eventId: string; photo: SignalScreenPhoto }>();
  for (const e of episodes) {
    for (const id of members.get(e.id) ?? [e.id]) {
      const photo = photoByRow.get(id);
      if (photo) {
        photoByEpisode.set(e.id, { eventId: id, photo });
        break;
      }
    }
  }

  let minutesByOnset = new Map<number, number>();
  if (symptomType === TIMING_SYMPTOM_TYPE) {
    const [feedings, freeFedSpans] = await Promise.all([readFeedingRows(petId), readFreeFedSpans(petId)]);
    const timing = classifyEpisodeSet(
      episodes.map((e) => ({ onsetMs: e.ms, confidence: (e.occurred_at_confidence as OnsetConfidence | null) ?? null })),
      feedings,
      freeFedSpans,
    );
    minutesByOnset = new Map(timing.eligible.map((t) => [t.onsetMs, t.minutesSinceFeeding]));
  }

  return episodes.map((e) => {
    const held = photoByEpisode.get(e.id) ?? null;
    return {
      eventId: held ? held.eventId : e.id,
      occurredAt: e.occurred_at,
      dayKey: toLocalDayKey(new Date(e.ms)),
      minutesSinceMeal: minutesByOnset.get(e.ms) ?? null,
      photo: held ? held.photo : null,
      boutIds: members.get(e.id) ?? [e.id],
    };
  });
}

/** Representative id → every member id of its bout, walking the collapse's own chained
 *  gap rule over the same sorted rows, so the two can never disagree about a boundary. */
export function boutMembers<T extends { id: string; ms: number }>(
  rows: readonly T[],
  representatives: readonly T[],
  gapHours: number,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const sorted = [...rows].sort((a, b) => a.ms - b.ms);
  const repIds = new Set(representatives.map((r) => r.id));
  const gapMs = gapHours * 3_600_000;
  let current: string | null = null;
  let prev = Number.NEGATIVE_INFINITY;
  for (const r of sorted) {
    if (current === null || r.ms - prev > gapMs || (repIds.has(r.id) && r.id !== current)) current = r.id;
    const list = out.get(current) ?? [];
    list.push(r.id);
    out.set(current, list);
    prev = r.ms;
  }
  return out;
}

/** Every local day with any log: an event of any type, or an answered look (a look is a
 *  logged day — the daily-look spec §5.6, the report's own denominator). */
export async function readLoggedDays(petId: string): Promise<{ loggedDays: string[]; recordStart: string | null }> {
  const db = getDb();
  const [events, looks] = await Promise.all([
    db.getAllAsync<{ occurred_at: string }>(`SELECT occurred_at FROM events WHERE pet_id = ? AND deleted_at IS NULL`, [petId]),
    db.getAllAsync<{ local_day: string }>(
      `SELECT l.local_day FROM looks l JOIN events e ON e.id = l.event_id WHERE l.pet_id = ? AND e.deleted_at IS NULL`,
      [petId],
    ),
  ]);
  const days = new Set<string>();
  for (const r of events) {
    const ms = Date.parse(r.occurred_at);
    if (Number.isFinite(ms)) days.add(toLocalDayKey(new Date(ms)));
  }
  for (const r of looks) if (localDayIndexOf(r.local_day) != null) days.add(r.local_day);
  const loggedDays = [...days].sort();
  return { loggedDays, recordStart: loggedDays[0] ?? null };
}

/** Delivered doses (`given` / `partial` — D1's therapy-delivered count) since `fromIso`,
 *  one entry per dose day, named through the shipped display-name rule. */
export async function readDoseDays(petId: string, fromIso: string): Promise<SignalDoseDay[]> {
  const rows = await getDb().getAllAsync<DoseRow>(
    `SELECT e.occurred_at, mi.generic_name, mi.brand_name
       FROM medication_administrations ma
       JOIN events e ON e.id = ma.event_id
       LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
      WHERE ma.pet_id = ? AND e.pet_id = ? AND e.deleted_at IS NULL
        AND ma.adherence IN ('given', 'partial')
        AND substr(e.occurred_at, 1, 19) >= substr(?, 1, 19)`,
    // C-40: a local write spells an instant `…T04:00:00.000Z`, a hydrated row `…T04:00:00+00:00`,
    // and '+' sorts before '.', so a text bound drops the hydrated row at the boundary
    // second. The fixed-width first 19 characters are the same spelling on both sides,
    // so the bound compares equal instants as equal; the day of slack stays.
    [petId, petId, fromIso],
  );
  const out: SignalDoseDay[] = [];
  for (const r of rows) {
    const ms = Date.parse(r.occurred_at);
    const label = drugDisplayName(r.generic_name, r.brand_name);
    if (!Number.isFinite(ms) || !label) continue;
    out.push({ drugLabel: label, dayKey: toLocalDayKey(new Date(ms)) });
  }
  return out;
}

/** The running trial, as the windows need it, or null when none is running today. */
export async function readSignalTrial(
  pet: { id: string; name: string; species: 'dog' | 'cat' | 'other'; sex?: 'male' | 'female' | 'unknown' },
  nowMs: number,
): Promise<SignalTrialWindow | null> {
  const core = await loadTrialPredicateFacts(pet, nowMs);
  if (!core) return null;
  const { trial } = core;
  // The ONE predicate (`lib/dietTrial.ts`): a terminal or ended trial is not "on this
  // diet today", whatever its dates say (B-422).
  if (!isTrialRunning({ startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays, status: trial.status, endedAt: trial.endedAt }, nowMs)) {
    return null;
  }
  const progress = getDietTrialProgress({ startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays }, nowMs);
  if (!progress) return null;
  const startIdx = localDayIndexOf(trial.startedAt);
  if (startIdx == null) return null;
  return {
    startDay: dayKeyFromIndex(startIdx),
    identity: trialIdentityLabel(trial),
    dayCounter: progress.dayCounter,
    targetDays: progress.targetDays,
    foodLabel: trial.foodLabel ?? null,
  };
}

/**
 * The per-incident verdicts for the photographed episodes of one symptom, from the
 * phone's copy through the one read predicate (HV-5 / CUL-1162). Every id asked for gets
 * an answer: `worth_a_call` for the rose (a verdict the app does not recognise included,
 * spoken in the rose's words rather than the blank a raw lookup gave it), the standing
 * calm verdict for a finished calm read, and null — "no read yet" — for a read in flight,
 * a read that did not finish, or no read on this phone. A calm verdict never stands in
 * front of a read in flight, since it may describe a replaced photo (CUL-812's
 * reasoning). A copy that cannot be read answers nothing and never throws the screen.
 */
export async function readVerdicts(
  eventIds: readonly string[],
  eventType: string,
): Promise<Record<string, EpisodeVerdict | null>> {
  const out: Record<string, EpisodeVerdict | null> = {};
  if (eventIds.length === 0) return out;
  let copies: Map<string, ReadCopyRow>;
  try {
    copies = await readCopies(eventIds);
  } catch (e) {
    console.warn('[signal-screen] read copy failed:', e);
    return out;
  }
  for (const eventId of eventIds) {
    out[eventId] = readVerdictOf({
      eventType,
      // The gallery asks about its tiles' bouts. `hasPhoto` only separates the states
      // that carry no verdict (none, unread, off), so a photoless row of a bout is still
      // answered truly: its verdict is null unless its read finished.
      hasPhoto: true,
      copy: copies.get(eventId),
      inFlight: analysisChainOutstanding(eventId),
      // The owner's photo-reading choice arrives with CUL-552 (HV-18).
      readingOff: false,
    }).verdict;
  }
  return out;
}

/**
 * One verdict per photographed tile, read across its WHOLE bout (the adversarial pass's
 * F3 on #912). A tile shows one photo, but its bout may hold a second photographed row,
 * or a photoless row whose contextual read escalated (a cat that has not eaten, a second
 * vomit that hour); reading the tile's row alone put "Keep an eye out", or "no read yet",
 * over a rose sitting one row away. So the rose on ANY row of the bout is the tile's
 * (presence escalates: the month's own "the worse verdict wins"), and anything calmer
 * stays the tile's own row's, because a calm or missing read of another row says nothing
 * about this photo. A photoless row is asked about through the same predicate: its
 * verdict is null whenever it is not a finished read, whatever `hasPhoto` says.
 */
export async function readTileVerdicts(
  tiles: readonly Pick<SignalScreenEpisode, 'eventId' | 'boutIds'>[],
  eventType: string,
): Promise<Record<string, EpisodeVerdict | null>> {
  const boutOf = (t: Pick<SignalScreenEpisode, 'eventId' | 'boutIds'>) => [t.eventId, ...(t.boutIds ?? [])];
  const each = await readVerdicts([...new Set(tiles.flatMap(boutOf))], eventType);
  const out: Record<string, EpisodeVerdict | null> = {};
  for (const tile of tiles) {
    out[tile.eventId] = boutOf(tile).some((id) => each[id] === 'worth_a_call') ? 'worth_a_call' : (each[tile.eventId] ?? null);
  }
  return out;
}

/**
 * Everything the screen draws for one finding of one pet. The pet is the ROUTE's pet
 * (C-9), named from the store's list by id; the finding is found in that pet's cache by
 * its identity, so a re-ranked payload still resolves.
 */
export async function loadSignalScreen(petId: string, identity: string, nowMs: number = Date.now()): Promise<SignalScreenLoad> {
  const pets = usePetStore.getState().pets;
  const petName = resolveRecordPetName(pets, petId);
  const row = await readSignalCache(petId);
  const cached = row?.findings.find((f) => foldIdentity(f.finding) === identity) ?? null;
  if (!cached) return { status: 'missing', petName };

  const today = toLocalDayKey(new Date(nowMs));
  const pet = pets.find((p) => p.id === petId) ?? null;
  const symptom = signalSymptomOf(cached.finding);

  const [trial, episodes, logged] = await Promise.all([
    pet ? readSignalTrial({ id: pet.id, name: pet.name, species: pet.species, sex: pet.sex }, nowMs).catch(() => null) : Promise.resolve(null),
    symptom ? readSignalEpisodes(petId, symptom) : Promise.resolve([]),
    readLoggedDays(petId),
  ]);

  // The doses that could fall inside either compare window: read from the earlier
  // window's first day, one day wide of it (a UTC instant is at most a day off a local
  // day, the med strip's own over-fetch).
  const [before] = signalCompareSpec(cached.finding, today, trial);
  const fromIso = new Date((indexOf(before.startDay) - 1) * 86_400_000).toISOString();
  const doses = await readDoseDays(petId, fromIso).catch(() => [] as SignalDoseDay[]);

  const photographed = episodes.filter((e) => e.photo != null);
  // Every episode is the finding's symptom (`readSignalEpisodes` reads one type), so the
  // symptom is every bout row's type.
  const verdicts = photographed.length > 0 && symptom ? await readTileVerdicts(photographed, symptom) : {};

  const model = buildSignalScreenModel({
    cached,
    petName,
    today,
    trial,
    episodes,
    loggedDays: logged.loggedDays,
    recordStart: logged.recordStart,
    verdicts,
    doses,
  });
  return { status: 'ready', model, petName };
}

/** One entry per episode through the engine's collapse, for a caller holding instants —
 *  re-exported so a test can build the fixture the loader would. */
export { episodeDaysOf };
