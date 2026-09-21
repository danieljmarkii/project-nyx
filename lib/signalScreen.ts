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
// Local SQLite for the record (the finding's episodes with their attachments, every
// logged day, the feedings + free-fed spans the lanes time against, the trial, the
// doses), and ONE PostgREST read: the per-incident verdicts, which live in the
// server-owned `event_ai_analysis` (never mirrored locally). That read is paged with
// `.range()` on a total key in fixed-size chunks (C-42: a read capped by a setting the
// code cannot see earns completeness from paging, never from a short page), and a chunk
// that fails leaves those episodes as "no read yet" rather than failing the screen — a
// verdict absent from the screen is not a reassurance (the tile says "no read yet"), and
// the record is still the record.
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
  weekLine,
  type SignalLanesModel,
  type SignalTrialWindow,
} from './signalWindows';
import { supabase } from './supabase';
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

/** The episodes inside the drawn weeks — what the chart counts and the gallery shows. */
function episodesInWeeks(episodes: readonly SignalScreenEpisode[], weekly: WeeklyBucketsModel): SignalScreenEpisode[] {
  const first = indexOf(weekly.firstKey);
  const last = indexOf(weekly.lastKey);
  return episodes.filter((e) => {
    const i = indexOf(e.dayKey);
    return i >= first && i <= last;
  });
}

function galleryOf(inWeeks: readonly SignalScreenEpisode[], verdicts: SignalScreenInput['verdicts']): SignalScreenEpisodes {
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
  const countLine = n === 0 ? `${total}, none photographed` : `${total}, ${smallNumber(n)} photographed`;
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
    const label = d.drugLabel.trim();
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
  const on = trial.foodLabel ? ` on ${trial.foodLabel}` : '';
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
    const n = compare.windows[0].days;
    lines.push(`Two windows of ${n} ${plural(n, 'day')}, compared as counts. Not a verdict on how ${input.petName} is doing.`);
  }
  lines.push(...medicationLines(input));
  if (input.trial) {
    lines.push('A diet change is one of several things that can move this.');
    lines.push(trialLine(input.trial));
  }
  return lines.filter((l) => l.trim().length > 0 && !hasBannedSignalVocabulary(l));
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
  const compare = signalCompare(windows);
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
  const inWeeks = episodesInWeeks(input.episodes, weekly);

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
    episodes: galleryOf(inWeeks, input.verdicts),
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

  const ids = episodes.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const attachments = await db.getAllAsync<AttachmentRow>(
    `SELECT event_id, local_uri, storage_path FROM event_attachments
     WHERE pet_id = ? AND event_id IN (${placeholders})
     ORDER BY sort_order ASC, created_at DESC`,
    [petId, ...ids],
  );
  const photoByEvent = new Map<string, SignalScreenPhoto>();
  for (const a of attachments) {
    if (!photoByEvent.has(a.event_id)) photoByEvent.set(a.event_id, { localUri: a.local_uri, storagePath: a.storage_path });
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

  return episodes.map((e) => ({
    eventId: e.id,
    occurredAt: e.occurred_at,
    dayKey: toLocalDayKey(new Date(e.ms)),
    minutesSinceMeal: minutesByOnset.get(e.ms) ?? null,
    photo: photoByEvent.get(e.id) ?? null,
  }));
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
        AND e.occurred_at >= ?`,
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

/** Ids per `.in()` chunk — well under PostgREST's URL budget. */
export const VERDICT_CHUNK = 100;
/** Rows per page inside a chunk. A chunk holds at most VERDICT_CHUNK ids and one row per
 *  event, so a page this size holds a whole chunk when the cap is at least this — and if
 *  it is not, the loop pages on regardless (C-42). */
export const VERDICT_PAGE = 100;

/**
 * The per-incident verdicts for the photographed episodes: `event_ai_analysis` rows by
 * event id, chunked and paged. A `null` verdict is a row without one (pending, failed);
 * an absent id is "no read yet". A chunk that errors is left absent — the tiles say so —
 * and never throws the screen.
 */
export async function readVerdicts(eventIds: readonly string[]): Promise<Record<string, EpisodeVerdict | null>> {
  const out: Record<string, EpisodeVerdict | null> = {};
  for (let c = 0; c < eventIds.length; c += VERDICT_CHUNK) {
    const chunk = eventIds.slice(c, c + VERDICT_CHUNK);
    for (let from = 0; ; from += VERDICT_PAGE) {
      const { data, error } = await supabase
        .from('event_ai_analysis')
        .select('event_id, status, recommendation')
        .in('event_id', chunk)
        // A TOTAL key: event_id is unique per row (one analysis per event), so no row can
        // be skipped between pages.
        .order('event_id', { ascending: true })
        .range(from, from + VERDICT_PAGE - 1);
      if (error) {
        console.warn('[signal-screen] verdict read failed:', error.message);
        break;
      }
      const page = (data ?? []) as { event_id: string; status: string | null; recommendation: EpisodeVerdict | null }[];
      for (const row of page) {
        out[row.event_id] = row.status === 'pending' ? null : (row.recommendation ?? null);
      }
      if (page.length < VERDICT_PAGE) break;
    }
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

  const photographedIds = episodes.filter((e) => e.photo != null).map((e) => e.eventId);
  const verdicts = photographedIds.length > 0 ? await readVerdicts(photographedIds) : {};

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
