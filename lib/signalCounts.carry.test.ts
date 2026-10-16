// CUL-1956 (CUL-1957, CUL-1958): a bout that ran past midnight, or into a new block, through the
// real screen builder and Home's row. The counts stay onsets (Q12, louder: disclose); every
// place that states one says beside it that a bout ran on, and the gallery keeps the tile of a
// bout that began the night before the first drawn week. Nothing here may read below the engine.
//
// Day keys only (C-29 / B-514): the three CI zones see one calendar.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn() }) }));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { buildSignalScreenModel, type SignalScreenEpisode, type SignalScreenInput } from './signalScreen';
import type { CachedFinding, ReflectionFinding, SymptomChronicityFinding, SymptomWorseningFinding } from './signal';
import { signalHomeLine, signalHomeLineFromScreen, type SignalHomeLine } from './signalHomeLine';
import { dayKeyFromIndex, localDayIndexOf } from './utils';

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);

const TODAY = '2026-09-27';

/** One bout: its onset `d` days from today, its last row `ranTo` days from today (default: the
 *  same day). Built from local components (C-29). */
function bout(d: number, ranTo: number = d, hour = 9, photo = false): SignalScreenEpisode {
  const dayKey = shift(TODAY, d);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error(dayKey);
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 11);
  const eventId = `ev-${dayKey}-${hour}`;
  return {
    eventId,
    occurredAt: at.toISOString(),
    dayKey,
    endDayKey: shift(TODAY, ranTo),
    minutesSinceMeal: null,
    photo: photo ? { localUri: null, storagePath: `pet/${eventId}/photo.jpg` } : null,
  };
}

const ENGINE_TEXT = 'The engine’s own sentence.';
const cachedOf = (finding: CachedFinding['finding']): CachedFinding => ({ rank: 0, text: ENGINE_TEXT, finding });

function inputOf(over: Partial<SignalScreenInput> & Pick<SignalScreenInput, 'cached' | 'episodes'>): SignalScreenInput {
  const loggedDays: string[] = [];
  for (let i = -120; i <= 0; i++) loggedDays.push(shift(TODAY, i));
  return {
    petName: 'Nyx',
    today: TODAY,
    trial: null,
    loggedDays,
    gateLoggedDays: loggedDays,
    recordStart: shift(TODAY, -300),
    verdicts: {},
    doses: [],
    notEating: false,
    trialVomitingLine: null,
    trialUnanswered: false,
    masking: null,
    generatedOn: null,
    countedAtMs: new Date(2026, 8, 27, 9, 14).getTime(),
    generatedAtMs: new Date(2026, 8, 27, 1, 2).getTime(),
    ...over,
  };
}

const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 4,
  priorCount: 1,
  currentDays: 4,
  priorDays: 1,
  trigger: 'more_days',
  tier: 'firm',
  windowDays: 7,
  ...over,
});
const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 4,
  spanDays: 40,
  activeWeeks: 4,
  symptomDays: 4,
  daysSinceLastEpisode: 1,
  firstOnsetIso: '2026-08-05T00:00:00Z',
  tier: 'standard',
  windowDays: 56,
  ...over,
});
const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 2,
  priorCount: 2,
  direction: 'flat',
  windowDays: 7,
  ...over,
});

function screen(finding: CachedFinding['finding'], episodes: SignalScreenEpisode[]) {
  const model = buildSignalScreenModel(inputOf({ cached: cachedOf(finding), episodes }));
  const row = signalHomeLineFromScreen(model.finding, signalHomeLine(model.finding, null) as SignalHomeLine, model);
  return { model, row };
}

describe('CUL-1957: a bout that ran past midnight inside the last 7 days', () => {
  it('a firm worsening keeps its onset days and says the day the bout ran into, on the screen and the row', () => {
    // Four onsets in the last 7 days; the one that began last night was still being logged today.
    const { model, row } = screen(worsening(), [bout(-1, 0, 23), bout(-3), bout(-4), bout(-5), bout(-9)]);
    expect(model.composed).not.toBeNull();
    expect(model.title).toBe('Vomiting on 4 of the last 7 days');
    expect(model.sentence).toBe(
      'Nyx has had vomiting on 4 of the last 7 days (4 episodes; a bout ran on into 1 more day), and on 1 of the 7 before — worth booking a vet visit soon.',
    );
    expect(row.count).toBe('4 episodes; a bout ran on into 1 more day, and on 1 of the 7 before');
  });

  it('a day the bout ran into that holds an onset of its own is already counted, so nothing is added', () => {
    const { model } = screen(worsening(), [bout(-1, 0, 23), bout(0, 0, 9), bout(-3), bout(-4), bout(-9)]);
    expect(model.sentence).not.toMatch(/ran on into/);
    expect(model.sentence).toMatch(/on 4 of the last 7 days \(4 episodes\)/);
  });
});

describe('CUL-1957: a bout that began before the last 7 days and ran into them', () => {
  // Began late on the 7th day back (the earlier block's last day), ran past midnight into this one.
  const eps = () => [bout(-7, -6, 23), bout(-1), bout(-2)];

  it('a standard worsening names the bout beside its episode count; the row says it in the week line’s words', () => {
    const { model, row } = screen(worsening({ tier: 'standard', trigger: 'more_episodes', currentCount: 2, currentDays: 2, priorCount: 1 }), eps());
    expect(model.weekly?.weeks[model.weekly.weeks.length - 1].carriedIn).toBe(true);
    expect(model.sentence).toBe(
      'Nyx has had 2 episodes of vomiting in the last 7 days (a bout from earlier ran into them), and 1 in the 7 before — worth a word with your vet.',
    );
    expect(row.count).toBe('A bout from earlier ran into the last 7 days · 1 in the 7 before');
  });

  it('a firm worsening says the day it ran into', () => {
    const { model } = screen(worsening({ currentCount: 2, currentDays: 2, priorCount: 1, priorDays: 1 }), eps());
    expect(model.sentence).toMatch(/on 2 of the last 7 days \(2 episodes; a bout ran on into 1 more day\)/);
  });

  it('a reflection says it too, and its row', () => {
    const { model, row } = screen(reflection({ currentCount: 2, priorCount: 2 }), [...eps(), bout(-10)]);
    expect(model.sentence).toMatch(/^We've logged 2 episodes of vomiting for Nyx in the last 7 days \(a bout from earlier ran into them\), and 2 in the 7 before\./);
    expect(row.count).toBe('2 in the last 7 days (a bout from earlier ran into them), 2 in the 7 before');
  });
});

describe('CUL-1957: chronicity — the weeks and the most recent day', () => {
  it('a week a bout ran into with no onset of its own is said beside "N of the last 8 weeks"', () => {
    // -14 is the last day of the third bar from the end; the bout ran into -13, the first day of
    // the second, which holds no onset.
    const { model, row } = screen(chronicity(), [bout(-1), bout(-14, -13, 23), bout(-30), bout(-40)]);
    expect(model.title).toBe('Vomiting in 4 of the last 8 weeks');
    expect(model.sentence).toMatch(
      /^We've logged vomiting for Nyx in 4 of the last 8 weeks — 4 episodes in those weeks, the most recent yesterday\. A bout that began earlier also ran into another of those weeks\. /,
    );
    expect(row.count).toBe('4 episodes in those weeks; a bout that began earlier also ran into another of those weeks');
  });

  it('"the most recent" never names only a day before a bout still going', () => {
    const { model } = screen(chronicity(), [bout(-1, 0, 23), bout(-14), bout(-30), bout(-40)]);
    expect(model.sentence).toContain('the most recent began yesterday and ran into today.');
    expect(model.sentence).not.toMatch(/the most recent yesterday/);
  });

  it('an older bout that ran on is dated at both ends', () => {
    const one = screen(chronicity({ daysSinceLastEpisode: 3 }), [bout(-3, -2, 23), bout(-14), bout(-30), bout(-40)]);
    expect(one.model.sentence).toContain('the most recent began 3 days ago and ran into the next day.');
    const two = screen(chronicity({ daysSinceLastEpisode: 4 }), [bout(-4, -2, 23), bout(-14), bout(-30), bout(-40)]);
    expect(two.model.sentence).toContain('the most recent began 4 days ago and ran into 2 days ago.');
  });

  it('a row dated after today is never a bout going on', () => {
    const { model } = screen(chronicity(), [bout(-1, 2, 23), bout(-14), bout(-30), bout(-40)]);
    expect(model.sentence).toContain('the most recent began yesterday and ran into today.');
  });
});

describe('CUL-1958: the gallery keeps a bout that began the night before the first drawn week', () => {
  it('its tile, its photo count and the count line move with it; the bars’ total stays onsets', () => {
    const weeks = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicity()), episodes: [bout(-1)] })).weekly;
    if (!weeks) throw new Error('no bars');
    const first = idx(weeks.firstKey) - idx(TODAY);
    const carried = bout(first - 1, first, 23, true);
    const { model } = screen(chronicity(), [carried, bout(-1, -1, 9, true), bout(-14), bout(-30), bout(-40)]);
    const g = model.episodes;
    if (!g) throw new Error('no gallery');
    expect(g.tiles.map((t) => t.eventId)).toContain(carried.eventId);
    expect(g.total).toBe(model.weekly?.total);
    expect(g.total).toBe(4);
    expect(g.carriedIn).toBe(1);
    expect(g.photographedCount).toBe(2);
    expect(g.countLine).toBe('4 in these 8 weeks, and a bout that began earlier ran into them, two photographed');
  });

  it('a bout that ended before the first drawn day has no tile', () => {
    const weeks = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicity()), episodes: [bout(-1)] })).weekly;
    if (!weeks) throw new Error('no bars');
    const first = idx(weeks.firstKey) - idx(TODAY);
    const gone = bout(first - 2, first - 1, 23, true);
    const { model } = screen(chronicity(), [gone, bout(-1), bout(-14), bout(-30), bout(-40)]);
    expect(model.episodes?.tiles.map((t) => t.eventId)).not.toContain(gone.eventId);
    expect(model.episodes?.carriedIn).toBe(0);
    expect(model.episodes?.countLine).toBe('4 in these 8 weeks, none photographed');
  });

  it('a photoless carried bout read as a call is said, as every photoless call is', () => {
    const weeks = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicity()), episodes: [bout(-1)] })).weekly;
    if (!weeks) throw new Error('no bars');
    const first = idx(weeks.firstKey) - idx(TODAY);
    const carried = bout(first - 1, first, 23);
    const model = buildSignalScreenModel(
      inputOf({ cached: cachedOf(chronicity()), episodes: [carried, bout(-1), bout(-14), bout(-30), bout(-40)], verdicts: { [carried.eventId]: 'worth_a_call' } }),
    );
    expect(model.episodes?.photoless.find((p) => p.eventId === carried.eventId)?.call).toBe('worth_a_call');
    expect(model.episodes?.countLine).toMatch(/^4 in these 8 weeks, and a bout that began earlier ran into them, none photographed, one read as /);
  });
});

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('PROPERTY: a bout that ran on is counted or said, and nothing reads below the engine', () => {
  it('over random records of bouts that cross midnight and blocks', () => {
    const rnd = lcg(0x1956);
    let composedSeen = 0;
    let carrySaid = 0;
    for (let t = 0; t < 600; t++) {
      // Bouts never overlap: each onset is on or after the last one's end.
      const eps: SignalScreenEpisode[] = [];
      let d = -60 + Math.floor(rnd() * 5);
      while (d <= 0) {
        const len = rnd() < 0.35 ? 1 + Math.floor(rnd() * 2) : 0;
        eps.push(bout(d, Math.min(0, d + len), 23));
        d = Math.min(0, d + len) + 1 + Math.floor(rnd() * 6);
      }
      // The engine counts onsets in ITS windows (`detection.ts`), so its numbers are the onset
      // counts, perturbed down or up to drive the gate both ways.
      const onsetsIn = (from: number, to: number) => eps.filter((e) => idx(e.dayKey) - idx(TODAY) >= from && idx(e.dayKey) - idx(TODAY) <= to);
      const nudge = () => Math.floor(rnd() * 3) - 1;
      const recent = onsetsIn(-6, 0);
      const prior = onsetsIn(-13, -7);
      const pick = rnd();
      const finding: CachedFinding['finding'] =
        pick < 0.4
          ? (() => {
              const look = onsetsIn(-55, 0);
              const weeks = new Set(look.map((e) => Math.floor((idx(TODAY) - idx(e.dayKey)) / 7))).size;
              const newest = look.length ? Math.min(...look.map((e) => idx(TODAY) - idx(e.dayKey))) : 0;
              return chronicity({ activeWeeks: Math.max(1, weeks + nudge()), episodeCount: Math.max(1, look.length + nudge()), daysSinceLastEpisode: Math.max(0, newest + nudge()) });
            })()
          : pick < 0.8
            ? (() => {
                const tier = (['standard', 'soft', 'firm'] as const)[Math.floor(rnd() * 3)];
                const trigger = tier === 'standard' ? 'more_episodes' : tier === 'soft' ? 'more_days' : rnd() < 0.5 ? 'more_days' : 'more_episodes';
                return worsening({
                  tier,
                  trigger,
                  currentCount: Math.max(1, recent.length + nudge()),
                  currentDays: Math.max(1, new Set(recent.map((e) => e.dayKey)).size + nudge()),
                  priorCount: prior.length,
                  priorDays: new Set(prior.map((e) => e.dayKey)).size,
                });
              })()
            : reflection({ currentCount: Math.max(0, recent.length + nudge()), priorCount: Math.max(recent.length, prior.length) });
      const { model, row } = screen(finding, eps);
      if (!model.composed) continue;
      composedSeen += 1;
      const c = model.composed.counts;
      const f = model.composed.finding;

      // Nothing states a number below the engine's for the same claim.
      if (f.type === 'symptom_chronicity') {
        expect(c.activeWeeks).toBeGreaterThanOrEqual(f.activeWeeks);
        expect(c.lookbackEpisodes).toBeGreaterThanOrEqual(f.episodeCount);
      } else {
        expect(c.recent.episodes).toBeGreaterThanOrEqual(f.currentCount);
        if (f.type === 'symptom_worsening') expect(c.recent.days).toBeGreaterThanOrEqual(f.currentDays);
      }

      // Every day or week a bout ran into that the stated count leaves out is said beside it,
      // on the screen and on the row.
      const days = f.type === 'symptom_worsening' && f.tier !== 'standard';
      if (f.type === 'symptom_chronicity') {
        if (c.carriedWeeks > 0) {
          carrySaid += 1;
          expect(model.sentence).toMatch(/also ran into (another|\d+ more) of those weeks/);
          expect(row.count).toMatch(/also ran into (another|\d+ more) of those weeks/);
        }
        // "The most recent" never names only a day before a bout that ran on.
        if (c.lastRanTo != null) {
          carrySaid += 1;
          expect(model.sentence).toMatch(/the most recent began .+ and ran into /);
        }
      } else if (days) {
        if (c.recent.carriedDays > 0) {
          carrySaid += 1;
          expect(model.sentence).toContain(`a bout ran on into ${c.recent.carriedDays} more day`);
          expect(row.count).toContain(`a bout ran on into ${c.recent.carriedDays} more day`);
        } else if (c.recent.carriedIn) {
          expect(model.sentence).toContain('a bout from earlier ran into them');
        }
      } else if (c.recent.carriedIn) {
        carrySaid += 1;
        expect(model.sentence).toContain('a bout from earlier ran into them');
        expect(row.count).toMatch(/a bout from earlier ran into (them|the last 7 days)/i);
      }

      // The recount's own definition, from the record: a stated "days" count plus the days said
      // beside it is every day in the last 7 holding a row of any bout.
      if (days) {
        const held = new Set<number>();
        for (const e of eps) {
          const end = Math.min(idx(e.endDayKey), idx(TODAY));
          for (let i = Math.max(idx(e.dayKey), idx(TODAY) - 6); i <= end; i++) held.add(i);
        }
        expect(c.recent.days + c.recent.carriedDays).toBe(held.size);
      }
      // A carried day is never a calm word: no "no vomiting", no reassurance.
      expect(model.sentence).not.toMatch(/\bno (more )?vomiting\b|settled|resolved|!/i);
    }
    // The property ran over something: composed screens, and carries said on them.
    expect(composedSeen).toBeGreaterThan(100);
    expect(carrySaid).toBeGreaterThan(30);
  });
});
