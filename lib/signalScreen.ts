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
import { LOOK_EVENT_TYPE } from './monthReads';
import { isAnimalNotEating, resolveTrialStrip, trialIdentityLabel, type TrialCardTrial } from './dietTrialCard';
import { isTrialRunning } from './dietTrial';
import { loadDietTrialFacts, loadTrialPredicateFacts } from './dietTrialFacts';
import { classifyEpisodeSet, collapseEpisodes, DEFAULT_MEAL_TIMING_CONFIG, type OnsetConfidence } from './mealTiming';
import { drugDisplayName } from './medications';
import { CORRELATION_SYMPTOM_TYPES, readFeedingRows, readFreeFedSpans, TIMING_SYMPTOM_TYPE } from './patternsTiming';
import { readSignalCache, type CachedFinding, type SignalFinding } from './signal';
import { DENSITY_WITHHELD, evidenceText, hasBannedSignalVocabulary, reflectionExpandedExtras, symptomWord } from './signalCopy';
import { isFallingVomitPair, signalSaysNotEating, visibleFindings } from './signalVisible';
import {
  compareGateCounts,
  compareWithheld,
  weekLineWithheld,
  type FallingPairWithheld,
  type NotEatingFact,
} from './signalWithhold';
import { TRIAL_RESPONSE_COUNTS_DEFAULTS } from './trialResponseCounts';
import { foldIdentity } from './signalFold';
import { hasSignalTitleRule, signalTitle } from './signalTitle';
import { isOtherTrialReassurance, signalTrialWindowFor } from './signalTrialAnchor';
import {
  signalCompare,
  signalCompareSpec,
  signalLanes,
  CORRELATION_LOOKBACK_DAYS,
  signalChartSymptomOf,
  signalSymptomOf,
  signalWeeks,
  trialTooYoungToCompare,
  weekLine,
  MAX_COMPARE_DAYS,
  MIN_COMPARE_DAYS,
  type SignalLanesModel,
  type SignalWindowSpec,
  type SignalTrialWindow,
} from './signalWindows';
import { analysisChainOutstanding } from './analysisChain';
import { readCopies } from './readCopy';
import { readVerdictOf, type ReadCopyRow } from './readState';
import { isCallDisplay, louderCall, type CallDisplay, type TierDisplay } from './incidentTierWords';
import { dayKeyFromIndex, formatCalendarDate, formatTime, localDayIndexOf, toLocalDayKey } from './utils';
import { resolveRecordPetName, usePetStore } from '../store/petStore';

// ── The model ─────────────────────────────────────────────────────────────────

/** The words that stand for a per-incident read, as the tier-word map names them (EN-3,
 *  `lib/incidentTierWords.ts`): the four tiers on a new-rule read, the shipped three on
 *  an earlier-rule one. The words themselves live in the map, which the gallery reads;
 *  this module carries the key only. */
export type EpisodeVerdict = TierDisplay;

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
  /** Every local day with any log — never derived from the episodes (C-3). The chart's
   *  COVERAGE ticks. */
  loggedDays: readonly string[];
  /** The days a falling-pair GATE counts (`readGateLoggedDays`: the engine's comparison-gate
   *  symptoms, a meal, the finding's own sign) — never the coverage days (CUL-1216, F3). */
  gateLoggedDays: readonly string[];
  /** The gate's read failed (C-12): its days are unknown, not none. The gates fail closed on
   *  the empty set as before, and no compare is drawn at all — its strips and its why would
   *  print "logged on 0 and 0" beside real episodes (adversarial pass on CUL-1212). */
  gateUnanswered?: boolean;
  recordStart: string | null;
  /** Verdict by event id; an absent key is "no read yet". */
  verdicts: Readonly<Record<string, EpisodeVerdict | null>>;
  doses: readonly SignalDoseDay[];
  /**
   * The pet's not-eating register (CUL-1216, BRK-6): `isAnimalNotEating` over the route's
   * pet's trial facts, OR'd with an `intake_decline` in its Signal; null when the facts did
   * not answer. A falling vomit pair is withheld on true AND on null (fail closed).
   */
  notEating: NotEatingFact;
  /**
   * The trial strip's vomiting sentence for the route's pet, verbatim
   * (`resolveTrialStrip(input).trialResponseLine`), or null when the strip withholds it, the
   * facts did not answer, or no trial runs. On a running trial this is the screen's ONLY
   * before/during statement (CUL-1216, BRK-5 · PM ruling (a), 2026-09-27): the strip's fixed
   * 49-day baseline, its logged-day floors, its density gate and its not-eating gate, from
   * the one module that writes it — never a second trial compare over the screen's windows.
   */
  trialVomitingLine: string | null;
  /** The trial read failed, so `trial` is null by ignorance, not by fact (C-12): a falling
   *  week line then withholds (CUL-1216 re-review, N1). */
  trialUnanswered: boolean;
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
  /** Why no compare is drawn where one would have been (CUL-1216), else null. */
  compareWithheld: FallingPairWithheld | null;
  lanes: SignalLanesModel | null;
  episodes: SignalScreenEpisodes | null;
  /** *Why this is a Signal* — the lines, in order. */
  why: string[];
  /** The Home card is plain text for these (S1); the screen carries the phone script. */
  safety: boolean;
  /** The not-eating register as the phone script needs it: withhold a falling vomit
   *  chronicity compare unless the facts answered "eating" (CUL-1216, fail closed). */
  withholdFallingVomit: boolean;
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
  // A correlation names no window of the screen's (CUL-1218): its matched days span the
  // engine's 180-day read, so "inside the recent 28 days" would name a window the finding
  // never counted and miss a dose on a matched day months back. No lines, never wrong ones.
  if (input.cached.finding.type === 'food_symptom_correlation') return [];
  const [before, during] = medicationWindowSpec(input);
  const beforeStart = indexOf(before.startDay);
  const beforeEnd = beforeStart + before.days - 1;
  const duringStart = indexOf(during.startDay);
  const end = duringStart + during.days - 1;
  const byDrug = new Map<string, { before: string[]; during: string[] }>();
  for (const d of input.doses) {
    const label = safeLabel(d.drugLabel);
    if (!label) continue;
    const i = indexOf(d.dayKey);
    // Membership in each window, tested on its own: past the cap the two are apart, and a
    // dose in the gap between them is in neither window the lines name.
    const inBefore = i >= beforeStart && i <= beforeEnd;
    const inDuring = i >= duringStart && i <= end;
    if (!inBefore && !inDuring) continue;
    const entry = byDrug.get(label) ?? { before: [], during: [] };
    (inDuring ? entry.during : entry.before).push(d.dayKey);
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

/**
 * The two windows the medication lines name. Off a trial, or on one under the compare floor,
 * the screen's own compare windows. On a running trial the windows the printed trial sentence
 * counts (CUL-1216, BRK-5): the strip's fixed baseline immediately before the trial
 * (`TRIAL_RESPONSE_COUNTS_DEFAULTS.baselineDays`, 49) and the trial's own days — so a drug is
 * named exactly when it was dosed inside a window the reader is told about. The trial window
 * is anchored on the day counter, as every Signal surface's is, and capped at
 * `MAX_COMPARE_DAYS` so its dates stay inside the last year (C-19); past the cap it names
 * "the trial's last N days".
 */
export function medicationWindowSpec(input: Pick<SignalScreenInput, 'cached' | 'today' | 'trial'>): [SignalWindowSpec, SignalWindowSpec] {
  const trial = input.trial;
  if (trial && !trialTooYoungToCompare(trial)) {
    const todayIdx = indexOf(input.today);
    const run = Math.max(1, Math.floor(trial.dayCounter));
    const trialStart = todayIdx - run + 1;
    const days = Math.min(run, MAX_COMPARE_DAYS);
    const baseline = TRIAL_RESPONSE_COUNTS_DEFAULTS.baselineDays;
    return [
      { label: `The ${baseline} days before the trial`, startDay: dayKeyFromIndex(trialStart - baseline), days: baseline },
      {
        label: days < run ? `The trial's last ${days} days` : `The trial's ${days} ${plural(days, 'day')}`,
        startDay: dayKeyFromIndex(todayIdx - days + 1),
        days,
      },
    ];
  }
  return signalCompareSpec(input.cached.finding, input.today, input.trial);
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

/**
 * Why a compare the screen would have drawn is not drawn (CUL-1216). Counts are never
 * adjudicated here; the line says which fact stops the two from being read side by side,
 * and it is TRUE of the record it describes (adversarial pass, F5): the density line names
 * the window that was logged less, whichever it is. The days it names are the gate's
 * (`gateLogged`), the days that could have shown this sign. `not_eating_unknown` never
 * claims the pet is not eating: it says the app could not check.
 */
export function compareWithheldLine(
  reason: FallingPairWithheld,
  petName: string,
  compare: CompareWindowsModel,
  gateLogged: readonly [number, number],
): string {
  const n = compare.windows[0].days;
  const [a, b] = gateLogged;
  const logged = `Two windows of ${n} ${plural(n, 'day')}, with symptoms or meals logged on ${a} and ${b} of them.`;
  switch (reason) {
    case 'not_eating':
      return `The record says ${petName} hasn't been eating normally, so the vomiting counts aren't compared here. Less in the stomach can mean fewer episodes on its own.`;
    case 'not_eating_unknown':
      return `We couldn't check how ${petName} has been eating, so the vomiting counts aren't compared here. Less in the stomach can mean fewer episodes on its own.`;
    case 'thin':
      return `${logged} That's too few logged days to compare their counts.`;
    case 'density':
      return b < a
        ? `${logged} The recent one was logged on fewer days, so their counts aren't compared here: fewer logged days can look like fewer episodes on their own.`
        : `${logged} Logged that unevenly, their counts aren't compared here.`;
  }
}

/** The mock's §03 block, composed: the shipped why, the compare stated as counts and
 *  disclaimed (benign findings only — CUL-1216, BRK-39), or the reason it is withheld, or on
 *  a running trial the strip's own sentence; a falling reflection's density line and the
 *  mid-trial adjacency; the medication inside the windows; the diet line. */
export function whyLines(
  input: SignalScreenInput,
  compare: CompareWindowsModel | null,
  withheld: { reason: FallingPairWithheld; compare: CompareWindowsModel; gateLogged: readonly [number, number] } | null = null,
): string[] {
  const { finding } = input.cached;
  const lines: string[] = [evidenceText(finding, input.petName)];
  // A correlation's own window (CUL-1218): the matched days above come from the engine's
  // whole read, which the payload does not carry and nothing else on the screen states. No
  // chart sits under it to disagree — a correlation draws none (`signalChartSymptomOf`).
  if (finding.type === 'food_symptom_correlation') lines.push(correlationWindowLine(input.petName));
  // A falling reflection's own extras (SR-5), which the shipped card draws in its expand and
  // this screen had dropped: the engine's density line (disclosure or withheld) and, on a
  // running trial, the adjacency line. Falling-only, as on the card.
  const reflection = finding.type === 'reflection' ? reflectionExpandedExtras(finding, input.trial != null) : null;
  if (reflection?.densityLine) lines.push(reflection.densityLine);
  if (withheld) {
    // The engine's WITHHELD line already says the week pair is not compared; a second
    // density sentence would say it twice. Only that line: the engine's comparable
    // disclosure ("Counted from days you logged…") is not a reason, and beside it the
    // withheld compare still owes its own (adversarial pass, F4).
    const engineSaidIt = withheld.reason === 'density' && reflection?.densityLine === DENSITY_WITHHELD;
    if (!engineSaidIt) lines.push(compareWithheldLine(withheld.reason, input.petName, withheld.compare, withheld.gateLogged));
  } else if (compare) {
    const [a, b] = compare.windows;
    const n = a.days;
    // The logged days are NAMED in the sentence, both windows, always (S2: the control
    // side is present where the claim is; C-3: "two windows of 55 days" beside a partial
    // enumeration is a claim about the enumeration). A diligent baseline against a
    // drifting trial — 19 over 55 logged days vs 5 over 16, one rate — reads as a 4×
    // improvement from the bars alone; the sentence is where the reader learns why not
    // (adversarial pass, B3). Naming the asymmetry is not the word "fairly".
    lines.push(
      `Two windows of ${n} ${plural(n, 'day')}, with symptoms or meals logged on ${a.loggedCount} and ${b.loggedCount} of them. Compared as counts, not a verdict on how ${input.petName} is doing.`,
    );
  } else if (trialTooYoungToCompare(input.trial)) {
    // The floor, said (B1): no compare below `MIN_COMPARE_DAYS` days on the diet.
    lines.push(
      `${trialDayWord(input.trial as SignalTrialWindow)} — fewer than ${MIN_COMPARE_DAYS} days in, so there is no before-and-during compare yet.`,
    );
  } else if (
    input.trial &&
    input.trialVomitingLine &&
    finding.priorityClass !== 'safety' &&
    signalSymptomOf(finding) === 'vomit'
  ) {
    // On a running trial the one before/during statement is the strip's, verbatim — and
    // nothing when the strip withholds it (the trial screen's T-1 shape). A vomiting finding
    // only (it is a vomiting sentence), and never on a safety screen, whose one compare is
    // the engine's, in its phone script (BRK-39).
    lines.push(input.trialVomitingLine);
  }
  if (reflection?.trialAdjacency) lines.push(reflection.trialAdjacency);
  lines.push(...medicationLines(input));
  if (input.trial) {
    lines.push('A diet change is one of several things that can move this.');
    lines.push(trialLine(input.trial));
  }
  return lines.filter((l) => l.trim().length > 0 && !hasBannedSignalVocabulary(l));
}

/** Where a correlation's matched days come from: the engine's read (`CORRELATION_LOOKBACK_DAYS`). */
export function correlationWindowLine(petName: string): string {
  return `The pattern comes from the last ${CORRELATION_LOOKBACK_DAYS} days of ${petName}'s logs.`;
}

/** "Day 2 of the trial" — the floor line's opening. */
function trialDayWord(trial: SignalTrialWindow): string {
  return `Day ${trial.dayCounter} of the ${lowerFirst(trial.identity)}`;
}

/**
 * Whether the screen's first chart is the timing lanes (CUL-1270 · D2 = a): the finding
 * CLAIMS a time-from-a-meal, so the lanes are its evidence and lead; the weekly bars move
 * below the sentence. A recurrence or a frequency finding claims weeks, so its bars lead.
 * The clock-band finding claims an hour of the day, which the lanes do not draw, so it keeps
 * the bars first. No lanes to draw (a symptom the engine does not time) — the bars lead.
 */
export function screenLeadsWithLanes(model: Pick<SignalScreenModel, 'finding' | 'lanes'>): boolean {
  if (!model.lanes) return false;
  const t = model.finding.type;
  return t === 'postprandial_timing' || t === 'empty_stomach_timing' || t === 'timing_story';
}

// ── The builder (pure) ────────────────────────────────────────────────────────

export function buildSignalScreenModel(input: SignalScreenInput): SignalScreenModel {
  const { finding } = input.cached;
  const symptom = signalChartSymptomOf(finding);
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
      compareWithheld: null,
      lanes: null,
      episodes: null,
      why: whyLines(input, null),
      safety,
      withholdFallingVomit: input.notEating !== false,
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
  const gate = { finding, symptom, notEating: input.notEating, gateLoggedDays: input.gateLoggedDays };
  // THE ONE DRAWN COMPARE (CUL-1216). None on a SAFETY finding: its compare is the engine's,
  // in the phone script, over the engine's windows and denominator — drawing a second one
  // over local windows counted one population two ways (BRK-39). None on a running trial:
  // the screen's windows grew a baseline with the trial, counted looks as logged days and
  // carried none of the strip's gates, so the strip's own sentence stands in (BRK-5, PM
  // ruling (a)); a drawn trial compare is CUL-1308's question. Otherwise the halves of the
  // lookback, withheld when the pair falls and may not be read (BRK-4 / BRK-6).
  const trialCompares = input.trial != null && !trialTooYoungToCompare(input.trial);
  // The compare's strips count the GATE's days (CUL-1212): a window's "logged" beside a
  // comparison is the comparison-gate question ("could this window have caught the sign"),
  // the set its withheld line already names — never the bars' coverage ticks, where a dose
  // or a weight counts. `signalCompare` returns null where no compare is drawn at all.
  const drawable =
    safety || trialCompares || trialTooYoungToCompare(input.trial) || input.gateUnanswered
      ? null
      : signalCompare({ ...windows, loggedDays: input.gateLoggedDays });
  const specs = signalCompareSpec(finding, input.today, input.trial);
  const withheldReason = drawable ? compareWithheld(drawable, specs, gate) : null;
  const compare = withheldReason ? null : drawable;
  const withheld =
    withheldReason && drawable
      ? { reason: withheldReason, compare: drawable, gateLogged: compareGateCounts(specs, input.gateLoggedDays) }
      : null;
  const lineWithheld = weekLineWithheld(weekly, { ...gate, trial: input.trial, trialUnanswered: input.trialUnanswered });
  // The lanes time against meals, which the engine does for vomiting only (the shipped
  // panel's symptom); a cough has no "minutes after eating".
  const laneEpisodes = input.episodes.map((e) => ({ dayKey: e.dayKey, minutesSinceMeal: e.minutesSinceMeal }));
  const split =
    symptom === TIMING_SYMPTOM_TYPE ? signalLanes({ finding, today: input.today, trial: input.trial, episodes: laneEpisodes }) : null;
  // The two trial lanes ("Before the trial · In the trial") are a before/during pair too,
  // over the screen's own windows (adversarial pass, F2). They stay split where they show
  // the timing shape on a flat or rising count; on a safety screen (one compare, the
  // engine's — BRK-39) and wherever the in-trial lane holds FEWER episodes (the pair ruling
  // (a) and the not-eating gate withhold), they are one undivided lane over the lookback.
  const undivide =
    split != null && split.lanes.length === 2 && (safety || split.lanes[1].total < split.lanes[0].total);
  const lanes = undivide
    ? signalLanes({ finding, today: input.today, trial: input.trial, episodes: laneEpisodes, undivided: true })
    : split;
  const inWeeks = episodesInWeeks(input.episodes, weekly, input.today);

  return {
    identity,
    finding,
    title,
    sentence: input.cached.text,
    noun,
    weekly,
    weekLine: weekLine(weekly, lineWithheld != null),
    compare,
    compareWithheld: withheldReason,
    lanes,
    episodes: galleryOf(inWeeks, input.verdicts, weekly.weeks.length),
    why: whyLines(input, compare, withheld),
    safety,
    withholdFallingVomit: input.notEating !== false,
  };
}

// ── The loader ────────────────────────────────────────────────────────────────

export type SignalScreenLoad =
  | { status: 'ready'; model: SignalScreenModel; petName: string }
  /** No cache row for this pet, or the finding is no longer in it. */
  | { status: 'missing'; petName: string }
  /** The finding is in the cache and this build has no title rule for its type (CUL-1218,
   *  G10 extended): refused, never a blank screen titled "Signal". Never "missing" — the
   *  finding has not gone anywhere. */
  | { status: 'unsupported'; petName: string }
  /** The finding is in the cache and Home withholds it: a falling vomit pair over a pet that
   *  may not be eating (TS-9 · CUL-1305). Never "missing": that would read as "it stopped". */
  | { status: 'withheld'; petName: string };

/** The unsupported state's copy (CUL-1218): true, and no promise the app cannot keep. */
export const UNSUPPORTED_LINE = "I can't show this kind of signal yet.";

/** The withheld state's copy (TS-9 · CUL-1305). Why it is set aside, in plain words, and the
 *  shipped health backstop as the next step; never a count, never a direction as good news. */
export function withheldLines(petName: string): string[] {
  return [
    `This one is set aside while ${petName} may not be eating. Fewer vomits from an empty stomach isn't a sign of getting better.`,
    `If you're worried about ${petName}, your vet is the best call.`,
  ];
}

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

/**
 * The COVERAGE days (CUL-1212): every local day with a surviving event that is not a look,
 * and the record's start from the same rows. A look joins no other surface's coverage line
 * (the daily-look spec §5.6, floor 5) — the month (`lib/monthReads.ts`) and the vet report
 * (CUL-891) already exclude it — so a day with only a look on it is an UNLOGGED day here too,
 * and a record whose first entry is a look starts at its first real log (CUL-1194's class).
 *
 * Two questions, two sets (C-34). This answers "was anything logged that day" and feeds the
 * weekly bars' ticks. "Can this window vouch for a comparison" is `readGateLoggedDays`, which
 * the compare's strips and *Why* read instead.
 */
export async function readLoggedDays(petId: string): Promise<{ loggedDays: string[]; recordStart: string | null }> {
  const rows = await getDb().getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events WHERE pet_id = ? AND deleted_at IS NULL AND event_type != ?`,
    [petId, LOOK_EVENT_TYPE],
  );
  const days = new Set<string>();
  for (const r of rows) {
    const ms = Date.parse(r.occurred_at);
    if (Number.isFinite(ms)) days.add(toLocalDayKey(new Date(ms)));
  }
  const loggedDays = [...days].sort();
  return { loggedDays, recordStart: loggedDays[0] ?? null };
}

/**
 * The days a falling-pair GATE counts for this finding's sign (CUL-1216, adversarial pass
 * F3): a day with a comparison-gate symptom (`CORRELATION_SYMPTOM_TYPES`, the engine's
 * `countsTowardComparisonGate` cell, parity-pinned), a meal, or the finding's OWN sign (the
 * engine's `alsoCounts` rule — a cough compare counts cough days). Never a dose, a weight,
 * a note or a look: those are coverage, and they cannot vouch for the sign being watched.
 * The engine's `loggingDaysInWindow`, on the phone.
 */
export async function readGateLoggedDays(petId: string, symptomType: string | null): Promise<string[]> {
  const types = [...new Set<string>([...CORRELATION_SYMPTOM_TYPES, 'meal', ...(symptomType ? [symptomType] : [])])];
  const rows = await getDb().getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events WHERE pet_id = ? AND deleted_at IS NULL AND event_type IN (${types.map(() => '?').join(', ')})`,
    [petId, ...types],
  );
  const days = new Set<string>();
  for (const r of rows) {
    const ms = Date.parse(r.occurred_at);
    if (Number.isFinite(ms)) days.add(toLocalDayKey(new Date(ms)));
  }
  return [...days].sort();
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
  return core ? signalTrialWindowOf(core.trial, nowMs) : null;
}

/**
 * The trial row as the windows need it, or null when it is not running today. Pure, so the
 * screen's loader can build it from the trial row `loadDietTrialFacts` already read rather
 * than reading the row a second time (CUL-1216 review).
 */
export function signalTrialWindowOf(trial: TrialCardTrial, nowMs: number): SignalTrialWindow | null {
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
    }).display;
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
    out[tile.eventId] = tileVerdictOf(tile.eventId, boutOf(tile), each);
  }
  return out;
}

/**
 * The tile's words from its bout's (EN-3). A call on any row is the tile's, and among calls
 * the louder by the month's own rule (`louderCall`: call now over the rest, the new rule's
 * words over the shipped ones at the same rank), so the tile and the month's day never word
 * one bout two ways. With no call, the tile's own row's words, as before.
 */
export function tileVerdictOf(
  own: string,
  bout: readonly string[],
  each: Readonly<Record<string, EpisodeVerdict | null>>,
): EpisodeVerdict | null {
  let loudest: CallDisplay | null = null;
  for (const id of bout) {
    const d = each[id] ?? null;
    if (isCallDisplay(d)) loudest = louderCall(loudest, d);
  }
  return loudest ?? each[own] ?? null;
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
  if (!hasSignalTitleRule(cached.finding)) return { status: 'unsupported', petName };

  const today = toLocalDayKey(new Date(nowMs));
  const pet = pets.find((p) => p.id === petId) ?? null;
  const symptom = signalChartSymptomOf(cached.finding);

  const [episodes, logged, gateRead, trialFacts] = await Promise.all([
    symptom ? readSignalEpisodes(petId, symptom) : Promise.resolve([]),
    readLoggedDays(petId),
    // A gate that cannot read its days is UNANSWERED (C-12): no compare is drawn, and the
    // falling-pair gates see no days, so they withhold rather than print.
    symptom ? readGateLoggedDays(petId, symptom).catch(() => null) : Promise.resolve([] as string[]),
    // The route's pet's trial facts (C-9), the strip's own loader: the trial window, the
    // not-eating register and the strip's vomiting sentence all come from this ONE read of
    // the trial row. A failed read is null: no trial window (as a failed trial read always
    // was), and the register not answered — never "eating".
    pet
      ? loadDietTrialFacts({
          pet: { id: pet.id, name: pet.name, species: pet.species, sex: pet.sex },
          otherPetNames: pets.filter((p) => p.id !== pet.id).map((p) => p.name),
          signalsV2: true,
          nowMs,
          rethrowUnreadable: true,
        }).catch((e) => {
          console.warn('[signal-screen] trial facts read failed:', e);
          return null;
        })
      : Promise.resolve(null),
  ]);
  // CUL-1360: which trial the cached finding counted. A trial finding from a trial since
  // replaced or restarted is not this trial's: the screen draws a rising one in its own day
  // (no trial window — the title, the compare and the lanes all speak in the finding's own
  // span) and answers a falling one as Home does, not in the picture.
  const trialAnchor = {
    generatedAt: row?.generatedAt ?? null,
    trial: trialFacts?.trial ? signalTrialWindowOf(trialFacts.trial, nowMs) : null,
  };
  const trial = signalTrialWindowFor(cached.finding, trialAnchor);
  // Either fact withholds: the Signal's own intake decline answers on its own, whatever the
  // trial read did (a positive fact in hand is never downgraded to "unknown").
  const notEating: NotEatingFact = signalSaysNotEating(row?.findings ?? [])
    ? true
    : trialFacts
      ? isAnimalNotEating(trialFacts)
      : null;
  // THE SCREEN ANSWERS ONLY FOR A FINDING HOME WOULD DRAW (TS-9 · CUL-1305, adversarial pass).
  // The route is reachable without Home's stack in between: a stale door (the trial screen's
  // Signal row, a card tapped a beat before a regen landed), a deep link. The sentence is the
  // server's own and is drawn whole, so a falling vomit pair over a pet that may not be eating
  // would print its counts here while Home withholds the card (B-789, §5.2). Same predicate,
  // same register, failing closed (`notEating` null withholds, as Home does): a finding the
  // stack drops is not in the picture, and the screen says so.
  //
  // Three causes, three answers (C-37: return the REASON): a register that has not answered is
  // a failed read with Try again, never a permanent-sounding "gone" (the screen re-runs when the
  // pet list arrives); a withheld pair says why it is set aside; the stood-down line's offline
  // expiry and an older trial's falling pair (CUL-1360), the other things `visibleFindings`
  // drops, are "not in the picture".
  if (!visibleFindings(row?.findings ?? [], notEating !== false, nowMs, trialAnchor).includes(cached)) {
    // An older trial's falling pair is dropped by the anchor, not withheld by the register:
    // no retry and no reason about eating would be true of it.
    if (isOtherTrialReassurance(cached.finding, trialAnchor)) return { status: 'missing', petName };
    if (!isFallingVomitPair(cached.finding)) return { status: 'missing', petName };
    // A pet the loaded list does not hold (archived, or gone) can never answer: a retry would
    // be a dead button, so it is not in the picture (a raw deep link is the only way here).
    if (notEating === null && pets.length > 0 && !pet) return { status: 'missing', petName };
    if (notEating === null) throw new Error('the not-eating register has not answered');
    return { status: 'withheld', petName };
  }
  const trialVomitingLine = trialFacts ? (resolveTrialStrip(trialFacts)?.trialResponseLine ?? null) : null;

  // The doses that could fall inside either window the lines name: read from the earlier
  // window's first day, one day wide of it (a UTC instant is at most a day off a local
  // day, the med strip's own over-fetch).
  const [before] = medicationWindowSpec({ cached, today, trial });
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
    gateLoggedDays: gateRead ?? [],
    gateUnanswered: gateRead == null,
    recordStart: logged.recordStart,
    verdicts,
    doses,
    notEating,
    trialVomitingLine,
    // `trialFacts` is null only when the read threw (a trial-less pet answers the base input).
    trialUnanswered: pet != null && trialFacts == null,
  });
  return { status: 'ready', model, petName };
}

/** One entry per episode through the engine's collapse, for a caller holding instants —
 *  re-exported so a test can build the fixture the loader would. */
export { episodeDaysOf };
