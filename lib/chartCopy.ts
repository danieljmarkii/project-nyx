// The chart family's WORDS (CUL-1064) — the accessibility labels and the small captions
// each chart in `components/charts/` speaks, kept out of the components so the same
// sentence is read wherever a chart is drawn, and testable without a renderer.
//
// A screen-reader user must hear what a sighted reader can see: every count, the
// denominator, and the disclosure. `TimingPanelCard` set that bar ("N couldn't be timed"
// is in its label) and these labels hold to it. A label here says something the visible
// text does not (the whole chart in one sentence) — it never rescues a truncation (C-8).
//
// nyx-voice: descriptive, never a verdict; no "!"; a zero is spoken as a zero.

import { isCallDisplay, TIER_WORDS, type CallDisplay } from './incidentTierWords';
import { formatCalendarDate } from './utils';
import {
  daysSoFarLabel,
  lanesUntimedLine,
  type CompareWindowsModel,
  type LaneModel,
  type WeeklyBucketsModel,
  type WeeklyMark,
  type WeightBandModel,
} from './chartModels';

function pluralize(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** "Jul 19" from a day key; the key itself if it cannot be formatted (never "Invalid Date"). */
export function dateWord(dayKey: string): string {
  return formatCalendarDate(dayKey) ?? dayKey;
}

/** The mark's words, with where it fell when it is not on the chart: "trial · Jun 1,
 *  before these weeks". A mark off the chart is SAID, never dropped (C-37). */
export function markWord(mark: WeeklyMark): string {
  if (mark.outside === 'before') return `${mark.label}, before these weeks`;
  if (mark.outside === 'after') return `${mark.label}, after these weeks`;
  return mark.label;
}

/** "3 earlier episodes not in these weeks · 1 dated after" — what the window left out,
 *  for sighted readers too; null when nothing was. */
export function weeklyOutsideLine(model: WeeklyBucketsModel): string | null {
  const parts: string[] = [];
  if (model.before > 0) parts.push(`${model.before} earlier ${pluralize(model.before, 'episode')} not in these weeks`);
  if (model.after > 0) parts.push(`${model.after} ${pluralize(model.after, 'episode')} dated after what is drawn`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The weekly bars in one sentence: the window, the counts by week, the total OVER THESE
 * WEEKS (never "in all" — a display window may index, only the record may be spoken as a
 * total, CUL-223), the logged days per week, the partial week's days so far, the mark,
 * and anything the window left out.
 */
export function weeklyBarsA11yLabel(
  model: WeeklyBucketsModel,
  noun: string,
  /** The weeks a masking span touches (CUL-1440): a zero there is said as "shaded", never "0". */
  masked?: readonly boolean[],
  /** What the shading stands for, said after the counts. */
  maskCaption?: string | null,
): string {
  const n = model.weeks.length;
  const parts: string[] = [];
  // What one bar is: a calendar week, or (the Signal, CUL-1217) seven days ending on the last
  // drawn day, so "this week" is never a word the bars do not draw.
  const span = model.endAligned === true ? `each 7 days, the last ending ${dateWord(model.lastKey)}` : 'weeks starting Sunday';
  parts.push(
    `${capitalize(noun)} by week, ${n} ${pluralize(n, 'week')} from ${dateWord(model.firstKey)} to ${dateWord(model.lastKey)}, ${span}.`,
  );
  parts.push(
    // A total of 0 over shaded weeks is the zero again, spoken (the adversarial pass): unsaid.
    `Counts by week: ${model.weeks.map((w, i) => (masked?.[i] === true && w.count === 0 ? 'shaded' : String(w.count))).join(', ')}.${masked?.some(Boolean) === true && model.total === 0 ? '' : ` ${model.total} in these ${n} ${pluralize(n, 'week')}.`}`,
  );
  if (masked != null && masked.some(Boolean) && maskCaption) parts.push(`Shaded weeks: ${maskCaption}`);
  parts.push(
    `Days logged per week: ${model.weeks
      .map((w) => (w.days.every((d) => d === 'ahead') ? 'not yet' : `${w.loggedCount} of ${w.daysSoFar}`))
      .join(', ')}.`,
  );
  const partial = model.weeks.find((w) => w.partial);
  if (partial) parts.push(`The week of ${dateWord(partial.startKey)} has ${daysSoFarLabel(partial)}.`);
  const beforeRecord = model.weeks.reduce((a, w) => a + w.days.filter((d) => d === 'before_record').length, 0);
  if (beforeRecord > 0) parts.push(`${beforeRecord} ${pluralize(beforeRecord, 'day')} before the record began, not counted.`);
  if (model.mark) parts.push(`${capitalize(markWord(model.mark))}.`);
  const outside = weeklyOutsideLine(model);
  if (outside) parts.push(`${capitalize(outside)}.`);
  return parts.join(' ');
}

/** "Vomiting: 19 in the 55 days before, logged 44 of 55 days; 21 in the trial's 55 days,
 *  logged 51 of 55 days." The noun is the same lower-case word every chart takes. */
export function compareBarsA11yLabel(
  model: CompareWindowsModel,
  noun: string,
  /** Which window a masking span touches (CUL-1440): a zero there is said as "shaded". */
  masked?: readonly [boolean, boolean],
  maskCaption?: string | null,
): string {
  const [a, b] = model.windows;
  const lower = (s: string) => (s.length === 0 ? s : s[0].toLowerCase() + s.slice(1));
  const said = (w: typeof a, i: number) => (masked?.[i] === true && w.count === 0 ? `${lower(w.label)}, shaded` : `${w.count} in ${lower(w.label)}`);
  const base = `${capitalize(noun)}: ${said(a, 0)}, ${a.coverageLine}; ${said(b, 1)}, ${b.coverageLine}.`;
  return masked != null && masked.some(Boolean) && maskCaption ? `${base} Shaded: ${maskCaption}` : base;
}

/** The lanes' caption under the counts — what the three numbers under each lane are. */
export function lanesBucketCaption(rapidWindowMinutes: number, longGapHours: number): string {
  return `The counts under each lane: under ${rapidWindowMinutes} min · ${rapidWindowMinutes} min to ${longGapHours} h · over ${longGapHours} h.`;
}

/** Every lane in one sentence, then the untimed disclosure — the shipped panel's bar. */
export function timingLanesA11yLabel(
  lanes: readonly LaneModel[],
  rapidWindowMinutes: number,
  longGapHours: number,
  /** What a masked lane's shading stands for (CUL-1440). */
  maskCaption?: string | null,
): string {
  const per = lanes.map((l) => {
    // A masked lane says it is shaded, and never speaks a zero (D1).
    if (l.masked === true && l.total === 0) return `${l.label}: shaded.`;
    const [r, m, g] = l.bucketCounts;
    const buckets: [number, string][] = [
      [r, `under ${rapidWindowMinutes} minutes`],
      [m, `between ${rapidWindowMinutes} minutes and ${longGapHours} hours`],
      [g, `after ${longGapHours} hours`],
    ];
    // In a masked lane a zero bucket is not said at all; the others keep their counts.
    const said = buckets.filter(([n]) => l.masked !== true || n > 0).map(([n, where]) => `${n} ${where}`);
    const shaded = l.masked === true ? ', shaded' : '';
    return `${l.label}${shaded}: ${l.timedLine}.${said.length > 0 ? ` ${said.join(', ')}.` : ''}`;
  });
  const masked = lanes.some((l) => l.masked === true) && maskCaption ? ` Shaded: ${maskCaption}` : '';
  return `Timed from meals. ${per.join(' ')} ${lanesUntimedLine(lanes)}${masked}`;
}

export type DayMarkCoverage = 'logged' | 'left_some' | 'unlogged' | 'ahead';
/** The day's photo fact, in the tier-word map's key for a call (EN-3). */
export type DayMarkPhoto = 'none' | 'seen' | CallDisplay;

export interface DayMarkFacts {
  dayKey: string;
  count: number;
  coverage: DayMarkCoverage;
  medication: boolean;
  photo: DayMarkPhoto;
  /** The loudest call any read on the day stands as, photo or not (CUL-1200, ruling (b)):
   *  spoken whatever the layers say, because presence escalates. Absent or null: none the
   *  phone holds, which is never spoken as an all-clear. */
  call?: CallDisplay | null;
  /** The day a bout began, when this day holds its rows and no bout of its own
   *  (CUL-1226). Then a zero is not "no <noun>": the record holds some. */
  continuesFrom?: string | null;
  /** The day holds a feeding or a symptom entry, so a zero may be spoken as "no <noun>".
   *  Required: a logged day that answers nothing (a dose, a weigh-in) says "logged" and no
   *  more (CUL-1074 brief 2, PM 2026-10-03). */
  answers: boolean;
  /** Qualifying meals refused on the day (the Meals layer; 0 with the layer off). */
  refusedMeals?: number;
  /** Qualifying meals left unfinished but not refused on the day (0 with the layer off). */
  leftSomeMeals?: number;
  /** The count is episodes (vomiting's 3-hour collapse), spoken as "2 episodes of vomiting",
   *  never "logged 2 times" over a count that is not two rows (CUL-1217, GC-3). */
  episodes?: boolean;
  /** The symptom layer is showing. Off, the count is not spoken — and the day is still
   *  not "clear": the coverage is spoken either way. */
  symptomLayer: boolean;
  today: boolean;
  selected: boolean;
}

/** "Saturday, September 19" from a day key, built from the key's own parts. */
export function dayMarkDateWord(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * The day in one sentence. A clean day reads "logged, no vomiting" — never an all-clear —
 * and a day ahead reads "ahead". A layer that is off says nothing about what it hid.
 *
 * The count is EPISODES, dated by their first row, so a bout that runs past midnight
 * counts on the day it began. The next day holds rows of it and a count of zero, and is
 * spoken as what it holds — "vomiting logged, part of the bout that began Sep 12" —
 * never "no vomiting" (CUL-1226). The words may say more than the rose, never less.
 */
export function dayMarkA11yLabel(f: DayMarkFacts, noun: string): string {
  const parts: string[] = [dayMarkDateWord(f.dayKey)];
  if (f.today) parts.push('today');
  if (f.coverage === 'ahead') parts.push('ahead');
  else if (f.coverage === 'unlogged') parts.push('nothing logged');
  else {
    if (f.symptomLayer && f.count > 0) {
      parts.push(f.episodes === true ? `${f.count} ${pluralize(f.count, 'episode')} of ${noun} logged` : `${noun} logged ${f.count} ${pluralize(f.count, 'time')}`);
    }
    else if (f.symptomLayer && f.continuesFrom) parts.push(`${noun} logged, part of the bout that began ${dateWord(f.continuesFrom)}`);
    else if (f.symptomLayer && f.answers) parts.push(`logged, no ${noun}`);
    else parts.push('logged');
    // A refusal is named and counted, never folded into "left unfinished" (CUL-1553). A
    // caller that does not split the meals (refused 0, left 0) keeps the coverage's word.
    const refused = f.refusedMeals ?? 0;
    const left = f.leftSomeMeals ?? 0;
    if (refused > 0) parts.push(`${refused} ${pluralize(refused, 'meal')} refused`);
    if (f.coverage === 'left_some' && (left > 0 || refused === 0)) parts.push('a meal left unfinished');
  }
  if (f.medication) parts.push('medication');
  // A call is spoken on its own, photo or not (CUL-1200): "read as worth a call" never
  // claims a photo, and "photographed" is said only where the Photos layer draws one.
  const call = f.call ?? (isCallDisplay(f.photo) ? f.photo : null);
  if (f.photo !== 'none') parts.push('photographed');
  if (call) parts.push(`read as ${TIER_WORDS[call].readAs}`);
  if (f.selected) parts.push('selected');
  return parts.join(', ');
}

/** "4.6 kg" — one decimal, the unit the caller displays. */
export function weightWord(value: number, unit: string): string {
  return `${value.toFixed(1)} ${unit}`;
}

/** The weight chart in one sentence. The delta is the CALLER's to speak, so it is not here. */
export function weightDotsA11yLabel(model: WeightBandModel, unit: string, dateOf: (iso: string) => string): string {
  if (model.state === 'empty' || !model.first || !model.last) return 'Weight, no readings.';
  if (model.state === 'number') return `Weight, one reading: ${weightWord(model.first.value, unit)} on ${dateOf(model.first.occurredAt)}.`;
  const n = model.points.length;
  // Interior readings only: the last reading's distance is what the delta itself says.
  const clipped = model.points.filter((p) => p.clipped).length;
  const tail = clipped > 0 ? ` ${clipped} ${pluralize(clipped, 'reading')} outside the band, drawn at its edge.` : '';
  return `Weight, ${n} readings from ${dateOf(model.first.occurredAt)} to ${dateOf(model.last.occurredAt)}, drawn by date on a band from 10 percent below to 10 percent above the first reading: ${weightWord(model.first.value, unit)} to ${weightWord(model.last.value, unit)}.${tail}`;
}

// ── The weight's spoken delta (D2-5 · CUL-1067) ───────────────────────────────

/** The home-scale caveat needs TWO bounds, and this is the first: the move as a fraction
 *  of the first reading, strictly under it. On its own it is C-34 verbatim — a percentage inherits the
 *  pet's mass, a scale's noise does not, so a 5 % bound alone printed the caveat beside a
 *  3.5 kg loss on a 70 kg dog (the adversarial pass on CUL-1067). */
export const HOME_SCALE_NOISE_FRAC = 0.05;

/** The caveat, verbatim from the design authority (§04). */
export const HOME_SCALE_CAVEAT = 'a home scale moves about that much on its own';

/** A run is stated from this many steps: each of the last N readings moved the same
 *  way as the one before it. Two steps is three readings — the smallest series in which a
 *  direction can repeat (PMD-3 as GC-7 ruled it: "runs stated"). */
export const WEIGHT_RUN_MIN_STEPS = 2;

/** The run at the END of the readings: how many of the last steps moved the same way,
 *  strictly (a flat step ends it — a reading equal to the one before is not lower), and
 *  which way. `steps: 0` when fewer than two readings. Read off the STORED values, never
 *  the display's rounding. */
export function trailingWeightRun(model: WeightBandModel): { steps: number; dir: 'down' | 'up' | null } {
  const v = model.points.map((p) => p.value);
  let steps = 0;
  let dir: 'down' | 'up' | null = null;
  for (let i = v.length - 1; i > 0; i--) {
    const d = v[i] - v[i - 1];
    const here = d < 0 ? 'down' : d > 0 ? 'up' : null;
    if (here == null || (dir != null && here !== dir)) break;
    dir = here;
    steps += 1;
  }
  return { steps, dir };
}


/**
 * "Down 0.2 kg (4%) since Jul 3 · a home scale moves about that much on its own" — the
 * delta spoken beside its caveat, or "No change since Jul 3". Null below two readings
 * (the number is the chart). Direction words only, never a verdict: down is not "lost"
 * and up is not "gained"; a flat line is "no change", never "steady".
 *
 * The caveat is GATED, not decorative (PMD-3 as GC-7 ruled it, CUL-1553). It prints only
 * at EXACTLY TWO readings, and only when the move is strictly inside both of a scale's
 * bounds — under `HOME_SCALE_NOISE_FRAC` of the first reading and under `gate.noiseAbs`,
 * in whole thousandths of the STORED readings (`gate.model`, grams on the app's
 * kilograms), never the rounded display unit — and never beside a percentage that reads
 * as 5 %.
 *
 * The ruling also allowed it "when readings disagree in direction". That branch is
 * WITHHELD here: five adversarial rounds each built a sustained 3–4.9 % cat loss that a
 * scatter heuristic over three or more readings called a wobble (an end up-tick, a 10 g
 * reading over the start, a step-down plateau, padding, sub-edge holds). A softener on
 * the one danger sign weight has is safe only when it cannot be walked around, so it is
 * withheld until a real statistical test (a sign or slope test) earns it back — put to
 * the PM as a better-than-the-rule brief on CUL-1557. With three or more readings, a
 * fall at the end is stated instead ("lower at each of the last 6 readings").
 * A 5 % unintentional loss in a cat is a workup trigger; a 3.5 kg drop in a dog is not a
 * scale wobble at any percentage — neither gets the sentence written to soften a wobble.
 *
 * "No change" is decided by the FACT (`delta === 0`), never by the display rounding: a
 * 300 g kitten losing 20 g is a 0.04 lb move that rounds to 0.0 and is a 7 % loss, and
 * the card must say the 7 %, not "No change". A move under the display's precision
 * prints as "less than 0.1 lbs" with its percentage.
 *
 * A reading outside the band BETWEEN the ends is disclosed beside the delta: first
 * versus last cannot see a 30 % dip that recovered, and a screen reader that hears "one
 * reading outside the band" must not then hear "No change" standing alone. The last
 * reading's own distance is the delta, so it is not counted twice.
 */
export function weightDeltaLine(
  model: WeightBandModel,
  unit: string,
  dateOf: (iso: string) => string,
  /** The same readings in the STORED unit, and a scale's wobble in that unit. */
  gate: { model: WeightBandModel; noiseAbs: number },
): string | null {
  if (model.delta == null || model.deltaFrac == null || !model.first) return null;
  const since = `since ${dateOf(model.first.occurredAt)}`;
  // Interior readings only: the last reading's distance is what the delta itself says.
  const clipped = model.points.filter((p, i) => p.clipped && i !== model.points.length - 1).length;
  const clippedTail = clipped > 0 ? ` · ${clipped} ${pluralize(clipped, 'reading')} outside the band` : '';
  // The gate must describe the SAME readings the line does: a reading the display drops
  // (a stored 0.01 kg rounds to 0.0 lbs) would otherwise set the direction and the
  // percentage from a dot that is not drawn (round 2). Unequal sets fall back to the
  // display's readings and never print the caveat.
  const sameReadings = gate.model.points.length === model.points.length;
  const g = sameReadings ? gate.model : model;
  // The FACT decides no-change, direction and percentage: the stored readings, never the
  // display's rounding (a 20 g move rounds to 0.0 lbs and is still a move).
  const factDelta = g.delta ?? model.delta;
  const factFrac = g.deltaFrac ?? model.deltaFrac;
  const run = trailingWeightRun(g);
  // A run is stated when it ACCUSES or agrees: a fall always (beside a gain it is the
  // half the reader must not miss), a rise only beside an overall rise. A rise of a few
  // grams beside a 24 % loss reads as recovery, and a rising line is not wellness (B-186;
  // the adversarial pass on CUL-1553).
  // A rise is stated only beside an overall rise at least a scale's own wobble: a few grams
  // up after a dip is not a recovery to announce (round 2).
  const realRise = sameReadings && Math.round(factDelta * 1000) >= Math.round(gate.noiseAbs * 1000);
  const runStated = run.steps >= WEIGHT_RUN_MIN_STEPS && (run.dir === 'down' || (run.dir === 'up' && realRise));
  const against = runStated && ((run.dir === 'down' && factDelta >= 0) || (run.dir === 'up' && factDelta < 0));
  const runTail = runStated ? ` · ${against ? 'but ' : ''}${run.dir === 'down' ? 'lower' : 'higher'} at each of the last ${run.steps} readings` : '';
  if (factDelta === 0) return `No change ${since}${runTail}${clippedTail}`;
  const abs = Math.abs(model.delta);
  const shown = Math.round(abs * 10) / 10;
  const pct = Math.round(Math.abs(factFrac) * 100);
  const dir = factDelta < 0 ? 'Down' : 'Up';
  const amount = shown === 0 ? `less than 0.1 ${unit}` : `${shown.toFixed(1)} ${unit}`;
  const head = `${dir} ${amount}${pct > 0 ? ` (${pct}%)` : ''} ${since}`;
  // Both bounds in thousandths of the stored unit (grams on the app's kilograms): a float
  // must not decide a strict edge — 4.6 − 4.4 is 0.19999999999999973, and 0.15 / 3.0 is
  // 0.04999999999999997, which handed an exact 5 % loss the caveat (round 3).
  const moveG = Math.round(Math.abs(factDelta) * 1000);
  const firstG = g.first ? Math.round(g.first.value * 1000) : 0;
  const inNoise =
    firstG > 0 &&
    moveG * Math.round(1 / HOME_SCALE_NOISE_FRAC) < firstG &&
    moveG < Math.round(gate.noiseAbs * 1000) &&
    // And the line never prints the caveat beside a percentage that READS as 5 %: a 4.75 %
    // loss displays "(5%)", the number a vet reads as a cat's workup trigger. This caps the
    // caveat at moves that DISPLAY under 5 % (about 4.5 %; an exact 4.5 % rounds down in
    // binary and shows "(4%)"), so it subsumes the strict 5 % bound above; both stay, the
    // bound stating the ruling and this the display's promise.
    pct < Math.round(HOME_SCALE_NOISE_FRAC * 100);
  // Two readings only (see the docstring: the scatter branch is withheld, CUL-1557).
  const caveat = sameReadings && inNoise && g.points.length === 2;
  return `${head}${runTail}${caveat ? ` · ${HOME_SCALE_CAVEAT}` : ''}${clippedTail}`;
}
