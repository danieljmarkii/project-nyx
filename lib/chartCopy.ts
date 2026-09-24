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
export function weeklyBarsA11yLabel(model: WeeklyBucketsModel, noun: string): string {
  const n = model.weeks.length;
  const parts: string[] = [];
  parts.push(
    `${capitalize(noun)} by week, ${n} ${pluralize(n, 'week')} from ${dateWord(model.firstKey)} to ${dateWord(model.lastKey)}, weeks starting Sunday.`,
  );
  parts.push(`Counts by week: ${model.weeks.map((w) => w.count).join(', ')}. ${model.total} in these ${n} ${pluralize(n, 'week')}.`);
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
export function compareBarsA11yLabel(model: CompareWindowsModel, noun: string): string {
  const [a, b] = model.windows;
  const lower = (s: string) => (s.length === 0 ? s : s[0].toLowerCase() + s.slice(1));
  return `${capitalize(noun)}: ${a.count} in ${lower(a.label)}, ${a.coverageLine}; ${b.count} in ${lower(b.label)}, ${b.coverageLine}.`;
}

/** The lanes' caption under the counts — what the three numbers under each lane are. */
export function lanesBucketCaption(rapidWindowMinutes: number, longGapHours: number): string {
  return `The counts under each lane: under ${rapidWindowMinutes} min · ${rapidWindowMinutes} min to ${longGapHours} h · over ${longGapHours} h.`;
}

/** Every lane in one sentence, then the untimed disclosure — the shipped panel's bar. */
export function timingLanesA11yLabel(lanes: readonly LaneModel[], rapidWindowMinutes: number, longGapHours: number): string {
  const per = lanes.map((l) => {
    const [r, m, g] = l.bucketCounts;
    return `${l.label}: ${l.timedLine}. ${r} under ${rapidWindowMinutes} minutes, ${m} between ${rapidWindowMinutes} minutes and ${longGapHours} hours, ${g} after ${longGapHours} hours.`;
  });
  return `Timed from meals. ${per.join(' ')} ${lanesUntimedLine(lanes)}`;
}

export type DayMarkCoverage = 'logged' | 'left_some' | 'unlogged' | 'ahead';
export type DayMarkPhoto = 'none' | 'seen' | 'worth_a_call';

export interface DayMarkFacts {
  dayKey: string;
  count: number;
  coverage: DayMarkCoverage;
  medication: boolean;
  photo: DayMarkPhoto;
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
 */
export function dayMarkA11yLabel(f: DayMarkFacts, noun: string): string {
  const parts: string[] = [dayMarkDateWord(f.dayKey)];
  if (f.today) parts.push('today');
  if (f.coverage === 'ahead') parts.push('ahead');
  else if (f.coverage === 'unlogged') parts.push('nothing logged');
  else {
    if (f.symptomLayer && f.count > 0) parts.push(`${noun} logged ${f.count} ${pluralize(f.count, 'time')}`);
    else if (f.symptomLayer) parts.push(`logged, no ${noun}`);
    else parts.push('logged');
    if (f.coverage === 'left_some') parts.push('a meal left unfinished');
  }
  if (f.medication) parts.push('medication');
  if (f.photo === 'seen') parts.push('photographed');
  if (f.photo === 'worth_a_call') parts.push('photographed, read as worth a call');
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

/** The home-scale caveat needs TWO gates, and this is the first: the move as a fraction
 *  of the first reading. On its own it is C-34 verbatim — a percentage inherits the
 *  pet's mass, a scale's noise does not, so a 5 % bound alone printed the caveat beside a
 *  3.5 kg loss on a 70 kg dog (the adversarial pass on CUL-1067). */
export const HOME_SCALE_NOISE_FRAC = 0.05;

/** The caveat, verbatim from the design authority (§04). */
export const HOME_SCALE_CAVEAT = 'a home scale moves about that much on its own';

/**
 * "Down 0.2 kg (4%) since Jul 3 · a home scale moves about that much on its own" — the
 * delta spoken beside its caveat, or "No change since Jul 3". Null below two readings
 * (the number is the chart). Direction words only, never a verdict: down is not "lost"
 * and up is not "gained"; a flat line is "no change", never "steady".
 *
 * The caveat is GATED, not decorative, and by BOTH of a scale's bounds: the move must be
 * inside `HOME_SCALE_NOISE_FRAC` of the first reading AND inside `noiseAbs`, the scale's
 * own wobble in the caller's display unit (WeightCard: 0.2 kg ≈ 0.5 lbs). A 5 %
 * unintentional loss in a cat is a workup trigger; a 3.5 kg drop in a dog is not a
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
  noiseAbs: number,
): string | null {
  if (model.delta == null || model.deltaFrac == null || !model.first) return null;
  const since = `since ${dateOf(model.first.occurredAt)}`;
  // Interior readings only: the last reading's distance is what the delta itself says.
  // Interior readings only: the last reading's distance is what the delta itself says.
  const clipped = model.points.filter((p, i) => p.clipped && i !== model.points.length - 1).length;
  const clippedTail = clipped > 0 ? ` · ${clipped} ${pluralize(clipped, 'reading')} outside the band` : '';
  if (model.delta === 0) return `No change ${since}${clippedTail}`;
  const abs = Math.abs(model.delta);
  const shown = Math.round(abs * 10) / 10;
  const pct = Math.round(Math.abs(model.deltaFrac) * 100);
  const dir = model.delta < 0 ? 'Down' : 'Up';
  const amount = shown === 0 ? `less than 0.1 ${unit}` : `${shown.toFixed(1)} ${unit}`;
  const head = `${dir} ${amount}${pct > 0 ? ` (${pct}%)` : ''} ${since}`;
  const inNoise = Math.abs(model.deltaFrac) <= HOME_SCALE_NOISE_FRAC && abs <= noiseAbs;
  return `${head}${inNoise ? ` · ${HOME_SCALE_CAVEAT}` : ''}${clippedTail}`;
}
