// CUL-1440 — no zero on the Signal screen beside a masking drug or a recent visit. Each case
// is one of the issue's counterexamples, built the way the loader builds it (C-35): the pure
// builder over day keys, and the masking from the shared span rule (`lib/maskingSpans.ts`)
// through `screenMaskingOf`, so the screen and the server's EN-10 lines read one rule.
//
// Timezone honesty (B-514): everything here is day keys, so no instant is read two ways.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn() }) }));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { buildSignalScreenModel, type SignalScreenEpisode, type SignalScreenInput } from './signalScreen';
import type { CachedFinding, SymptomChronicityFinding, TimeOfDayClusteringFinding, PostprandialTimingFinding } from './signal';
import { screenMaskingOf } from './screenMasking';
import type { MaskCourse } from './maskingSpans';
import type { SignalTrialWindow } from './signalWindows';
import { phoneScript } from './signalCopy';
import { dayKeyFromIndex, localDayIndexOf } from './utils';

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);

function episode(dayKey: string, hour: number, minutesSinceMeal: number | null = null): SignalScreenEpisode {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error(dayKey);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 11);
  return { eventId: `ev-${dayKey}-${hour}`, occurredAt: d.toISOString(), dayKey, minutesSinceMeal, photo: null };
}

const course = (drugLabel: string, startedOn: string, endedOn: string | null = null): MaskCourse => ({
  drugLabel,
  names: [],
  startedOn,
  endedOn,
  status: endedOn ? 'completed' : 'active',
});

const cachedOf = (finding: CachedFinding['finding'], text = 'A finding.'): CachedFinding => ({ rank: 0, text, finding });

function inputOf(over: Partial<SignalScreenInput> & Pick<SignalScreenInput, 'cached' | 'today' | 'episodes'>): SignalScreenInput {
  const loggedDays: string[] = [];
  for (let i = -120; i <= 0; i++) loggedDays.push(shift(over.today, i));
  return {
    petName: 'Nyx',
    trial: null,
    loggedDays,
    gateLoggedDays: loggedDays,
    recordStart: shift(over.today, -300),
    verdicts: {},
    doses: [],
    notEating: false,
    trialVomitingLine: null,
    trialUnanswered: false,
    masking: null,
    generatedOn: null,
    ...over,
  };
}

const chronicityCough = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'cough',
  episodeCount: 23,
  spanDays: 56,
  activeWeeks: 7,
  symptomDays: 20,
  daysSinceLastEpisode: 8,
  firstOnsetIso: '2026-07-10T00:00:00Z',
  tier: 'firm',
  windowDays: 56,
  ...over,
});

// ── Counterexample 1 · the weekly bars ────────────────────────────────────────

describe('CUL-1440 · 1 · the weekly bars beside prednisone', () => {
  // Cough Sep 17–19, prednisone Sep 21, today Sep 27 (the issue's record).
  const today = '2026-09-27';
  const episodes = [episode('2026-09-17', 9), episode('2026-09-18', 9), episode('2026-09-19', 9), episode('2026-08-20', 9)];
  const masking = screenMaskingOf({ sign: 'cough', signWord: 'coughing', courses: [course('Prednisone', '2026-09-21')], lastVisitOn: null, today });

  it('marks the prednisone week masked, so its zero loses its numeral, and names the drug', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicityCough()), today, episodes, masking }));
    const weeks = model.weekly!.weeks;
    const last = weeks.length - 1;
    expect(weeks[last].count).toBe(0); // fixture premise: the week under the drug is a zero
    expect(model.weeklyMask).not.toBeNull();
    expect(model.weeklyMask!.masked[last]).toBe(true);
    expect(model.weeklyMask!.caption).toContain('Prednisone from Sep 21 can hide coughing');
    expect(model.weeklyMask!.caption).toBe("Prednisone from Sep 21 can hide coughing, so a quiet week there isn't a sign it has settled.");
  });

  it('leaves a zero week that touches no span alone (the Sep 7 week keeps its 0)', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicityCough()), today, episodes, masking }));
    const weeks = model.weekly!.weeks;
    const sep6 = weeks.findIndex((w) => w.startKey === '2026-09-06');
    expect(sep6).toBeGreaterThanOrEqual(0);
    expect(weeks[sep6].count).toBe(0);
    expect(model.weeklyMask!.masked[sep6]).toBe(false);
  });

  it('a visit on Sep 10 masks from its own week, as an unrecorded drug', () => {
    const withVisit = screenMaskingOf({
      sign: 'cough',
      signWord: 'coughing',
      courses: [course('Prednisone', '2026-09-21')],
      lastVisitOn: '2026-09-10',
      today,
    });
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicityCough()), today, episodes, masking: withVisit }));
    const weeks = model.weekly!.weeks;
    const sep6 = weeks.findIndex((w) => w.startKey === '2026-09-06');
    expect(model.weeklyMask!.masked[sep6]).toBe(true);
    expect(model.weeklyMask!.caption).toContain("Anything given at the Sep 10 visit isn't in the record");
  });
});

// ── Counterexample 2 · the drawn compare ──────────────────────────────────────

describe('CUL-1440 · 2 · the drawn compare beside maropitant', () => {
  // A time-of-day vomit finding: 7 vomits 55–35 days ago, maropitant for the last 30 days.
  const today = '2026-09-30';
  const finding: TimeOfDayClusteringFinding = {
    type: 'timeofday_clustering',
    priorityClass: 'insight',
    symptomType: 'vomit',
    clusterStartLocalHour: 18,
    clusterWindowHours: 4,
    clusterCount: 6,
    eligibleCount: 7,
    totalEpisodes: 7,
    timezone: 'UTC',
    windowDays: 56,
  };
  const episodes = [-55, -52, -49, -45, -42, -38, -35].map((d) => episode(shift(today, d), 19));
  const masking = screenMaskingOf({ sign: 'vomit', signWord: 'vomiting', courses: [course('Maropitant', shift(today, -30))], lastVisitOn: null, today });

  it('draws the compare with the recent window masked, and its why line names the drug, never "compared as counts"', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(finding), today, episodes, masking }));
    expect(model.compare).not.toBeNull();
    expect(model.compare!.windows[1].count).toBe(0); // fixture premise: "Recent 30 days: 0"
    // Maropitant started 30 days ago, inside the earlier window's last days too: both touch the span.
    expect(model.compareMask).toEqual({ masked: [true, true], caption: expect.stringContaining('can hide vomiting') });
    const why = model.why.join(' ');
    expect(why).toContain("can hide vomiting, so they aren't a before and after.");
    expect(why).not.toContain('Compared as counts');
  });

  it('flag off (no masking): the compare and its why line are exactly as before', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(finding), today, episodes, masking: null }));
    expect(model.compareMask).toBeNull();
    expect(model.weeklyMask).toBeNull();
    expect(model.why.join(' ')).toContain('Compared as counts, not a verdict on how Nyx is doing.');
  });
});

// ── Counterexamples 4 and 5 · the phone script ────────────────────────────────

describe('CUL-1440 · 4 and 5 · the phone script', () => {
  const today = '2026-09-27';
  const episodes = [episode('2026-09-19', 9)];

  it('4 · names the drug beside "Most recent", so the date is read with the drug in view', () => {
    const masking = screenMaskingOf({ sign: 'cough', signWord: 'coughing', courses: [course('Prednisone', '2026-09-21')], lastVisitOn: null, today });
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicityCough()), today, episodes, masking }));
    const facts = phoneScript(model.finding, 'Nyx', false, model.scriptMasking);
    expect(facts).not.toBeNull();
    const labels = facts!.map((f) => f.label);
    expect(labels).toContain('Most recent');
    expect(facts).toContainEqual({ label: 'On board', value: 'Prednisone since Sep 21. It can hide coughing.' });
    expect(labels.indexOf('On board')).toBeGreaterThan(labels.indexOf('Most recent'));
  });

  it('5 · withholds the chronicity compare row when its earlier half reads 0 inside a visit\'s 42 days', () => {
    // A visit on Aug 20; the prior half (≈ Aug 3 – Aug 30) holds no cough, the recent one five.
    const finding = chronicityCough({
      compare: { halfDays: 28, recentCount: 5, priorCount: 0, recentLoggingDays: 27, priorLoggingDays: 25, comparable: true },
    });
    const masking = screenMaskingOf({ sign: 'cough', signWord: 'coughing', courses: [], lastVisitOn: '2026-08-20', today });
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(finding), today, episodes, masking, generatedOn: today }));
    expect(model.scriptMasking?.withholdCompare).toBe(true);
    const facts = phoneScript(model.finding, 'Nyx', false, model.scriptMasking)!;
    expect(facts.some((f) => f.label.startsWith('Recent '))).toBe(false);
    expect(facts).toContainEqual({ label: 'Last visit', value: "Aug 20. Anything given there isn't in the record." });
    // The same row with no masking still prints (flag off is unchanged).
    expect(phoneScript(finding, 'Nyx', false, null)!.some((f) => f.label.startsWith('Recent '))).toBe(true);
  });

  it('5 · a rise with no zero in a touched half keeps its row (the escalation direction)', () => {
    const finding = chronicityCough({
      compare: { halfDays: 28, recentCount: 5, priorCount: 2, recentLoggingDays: 27, priorLoggingDays: 25, comparable: true },
    });
    const masking = screenMaskingOf({ sign: 'cough', signWord: 'coughing', courses: [], lastVisitOn: '2026-08-20', today });
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(finding), today, episodes, masking, generatedOn: today }));
    expect(model.scriptMasking?.withholdCompare).toBe(false);
  });
});

// ── Counterexample 6 · what leads on a timing screen during a trial ───────────

describe('CUL-1440 · 6 · the lanes split at a masking course inside the trial', () => {
  const today = '2026-09-27';
  const trial: SignalTrialWindow = { startDay: '2026-08-29', identity: 'Rabbit trial', dayCounter: 30, targetDays: 56, foodLabel: 'Rabbit & Pea' };
  const finding: PostprandialTimingFinding = {
    type: 'postprandial_timing',
    priorityClass: 'insight',
    symptomType: 'vomit',
    rapidCount: 9,
    eligibleCount: 10,
    totalEpisodes: 13,
    rapidWindowMinutes: 30,
    lastTwoEligibleRapid: false,
    medianMinutesSinceFeeding: 12,
    feedingFormsInEvidence: [],
    windowDays: 56,
  };
  // Six before the trial, four in it before prednisone, three on prednisone: a RISING trial
  // count, the only shape that draws split lanes today (ruling (a) merges a falling pair).
  const episodes = [
    ...[-50, -45, -40, -38, -35, -31].map((d) => episode(shift(today, d), 8, 10)),
    ...[-28, -20, -15, -9].map((d) => episode(shift(today, d), 8, 12)),
    ...[-5, -3, -1].map((d) => episode(shift(today, d), 8, 15)),
  ];

  it('three lanes, the last hatched and named, and the diet never stands alone', () => {
    const masking = screenMaskingOf({ sign: 'vomit', signWord: 'vomiting', courses: [course('Prednisone', '2026-09-21')], lastVisitOn: null, today });
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(finding), today, episodes, trial, masking }));
    const lanes = model.lanes!.lanes;
    expect(lanes.map((l) => l.label)).toEqual([
      'Before the trial',
      'In the trial, Aug 29 to Sep 20',
      'In the trial, on Prednisone from Sep 21',
    ]);
    expect(lanes.map((l) => l.masked === true)).toEqual([false, false, true]);
    expect(lanes[2].total).toBe(3);
    expect(model.lanesMaskCaption).toContain('Prednisone from Sep 21 can hide vomiting');
  });

  it('flag off: the two lanes exactly as before', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(finding), today, episodes, trial, masking: null }));
    expect(model.lanes!.lanes.map((l) => l.label)).toEqual(['Before the trial', 'In the trial']);
    expect(model.lanes!.lanes.some((l) => l.masked === true)).toBe(false);
    expect(model.lanesMaskCaption).toBeNull();
  });
});
