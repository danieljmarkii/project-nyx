// CUL-94 — the intake-decline detectors read the OWNER's day, on the phone and on the server.
//
// Both detectors split the record with a raw `now − N×24h` baseline cutoff and judged the
// recent window by UTC calendar day, so a meal logged between 24 hours ago and UTC midnight was
// counted nowhere, and a refusal bout across UTC midnight was half-collapsed. The fixtures are
// the issue's own runs, driven through BOTH real detectors (C-34: no re-derived rule) with the
// zone pinned on each side (C-29), and every instant written with its local offset so a reader
// sees the owner's clock. October 2026: New York is EDT (UTC−4), Los Angeles PDT (UTC−7).

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { detectIntakeDecline as phoneDetect } from './analytics';
import type { AnalyticsMeal } from './analytics';
import { detectIntakeDecline as serverDetect } from '../supabase/functions/generate-signal/detection';
import type { IntakeRating, MealEvent, Species } from '../supabase/functions/generate-signal/detection';

interface M {
  iso: string;
  rating: IntakeRating;
  food?: string;
}

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

function phoneTriggers(species: Species, meals: M[], nowIso: string, timeZone: string): string[] {
  const rows: AnalyticsMeal[] = meals.map((m) => ({
    ms: Date.parse(m.iso),
    foodItemId: m.food ?? 'f1',
    foodLabel: `Food ${m.food ?? 'f1'}`,
    foodType: 'meal',
    primaryProtein: null,
    intakeRating: m.rating,
  }));
  const res = phoneDetect({ species, nowMs: Date.parse(nowIso), meals: rows, freeFedSpans: [], timeZone });
  return res.status === 'watch' ? res.flags.map((f) => f.trigger) : [];
}

function serverTriggers(species: Species, meals: M[], nowIso: string, timezone: string | undefined): string[] {
  const mealEvents: MealEvent[] = meals.map((m, i) => ({
    id: `m${i}`,
    occurredAt: new Date(Date.parse(m.iso)).toISOString(),
    foodItemId: m.food ?? 'f1',
    primaryProtein: null,
    intakeRating: m.rating,
    foodType: 'meal',
    foodLabel: `Food ${m.food ?? 'f1'}`,
  }));
  return serverDetect({
    pet: { name: 'Pet', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents,
    feedingArrangements: [],
    now: new Date(Date.parse(nowIso)).toISOString(),
    timezone,
  }).map((f) => f.trigger);
}

/** Both real detectors, one verdict: the phone and the server must agree before it is read. */
function verdict(species: Species, meals: M[], nowIso: string, zone: string): string[] {
  const phone = phoneTriggers(species, meals, nowIso, zone);
  expect(serverTriggers(species, meals, nowIso, zone)).toEqual(phone);
  return phone;
}

const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;

/** Ten days of two full meals at the owner's 08:00 and 18:00, Oct 1–10. */
function tenGoodDays(offset: string): M[] {
  const out: M[] = [];
  for (let d = 1; d <= 10; d++) {
    out.push({ iso: `${day(d)}T08:00:00${offset}`, rating: 'all' });
    out.push({ iso: `${day(d)}T18:00:00${offset}`, rating: 'all' });
  }
  return out;
}

describe('CUL-94 — the New York cat keeps its card through the US evening', () => {
  // Ten days of "all", then two "picked" meals on Oct 11. The shipped detectors showed the card
  // at 18:05 and 19:59 EDT and dropped it at 20:00 EDT (UTC midnight) with no new evidence.
  const meals: M[] = [
    ...tenGoodDays('-04:00'),
    { iso: `${day(11)}T08:00:00-04:00`, rating: 'picked' },
    { iso: `${day(11)}T17:00:00-04:00`, rating: 'picked' },
  ];

  it.each([
    `${day(11)}T18:05:00-04:00`,
    `${day(11)}T19:59:00-04:00`,
    `${day(11)}T20:30:00-04:00`, // past UTC midnight: the old card was gone here
    `${day(12)}T06:00:00-04:00`, // the next morning, before breakfast: nothing new is known
  ])('fires at %s', (nowIso) => {
    expect(verdict('cat', meals, nowIso, NY)).toEqual(['consecutive_low']);
  });

  it('the next rated meal decides: a full breakfast clears it', () => {
    const withBreakfast = [...meals, { iso: `${day(12)}T07:00:00-04:00`, rating: 'all' as const }];
    expect(verdict('cat', withBreakfast, `${day(12)}T07:30:00-04:00`, NY)).toEqual([]);
  });

  it('and a low breakfast keeps it', () => {
    const withBreakfast = [...meals, { iso: `${day(12)}T07:00:00-04:00`, rating: 'some' as const }];
    expect(verdict('cat', withBreakfast, `${day(12)}T07:30:00-04:00`, NY)).toEqual(['consecutive_low']);
  });

  it('a whole local day with no rated meal is a logging gap, never read as anything', () => {
    expect(verdict('cat', meals, `${day(13)}T06:00:00-04:00`, NY)).toEqual([]);
  });
});

describe("CUL-94 — the Pacific cat's day is the owner's, not last night's dinner", () => {
  // "picked" at breakfast after a full dinner the night before, then "most" at dinner: a mean of
  // 2.0, on the single-day ceiling. Under UTC days last night's 18:00 PDT dinner (01:00 UTC) sat
  // in today's bucket and lifted the day over the ceiling, so no card at any point.
  const meals: M[] = [
    ...tenGoodDays('-07:00'),
    { iso: `${day(11)}T07:00:00-07:00`, rating: 'picked' },
    { iso: `${day(11)}T18:00:00-07:00`, rating: 'most' },
  ];

  it.each([
    `${day(11)}T08:00:00-07:00`, // after breakfast only
    `${day(11)}T19:00:00-07:00`, // after dinner: (1 + 3) / 2 = 2.0
    `${day(12)}T05:30:00-07:00`, // next morning, before breakfast
  ])('fires at %s', (nowIso) => {
    expect(verdict('cat', meals, nowIso, LA)).toEqual(['consecutive_low']);
  });
});

describe('CUL-94 — a refusal bout across UTC midnight is one refusal (B-092)', () => {
  // A dog's usual food, eaten well (prior mean 3.67), refused at 19:00 and 21:00 EDT, which is
  // 23:00 and 01:00 UTC. Under UTC days the 19:00 refusal stayed in `prior` (mean 2.75, under the
  // 3.0 floor) and the watch went silent; the owner's day collapses both.
  const meals: M[] = [
    { iso: `${day(6)}T18:00:00-04:00`, rating: 'all' },
    { iso: `${day(7)}T18:00:00-04:00`, rating: 'most' },
    { iso: `${day(8)}T18:00:00-04:00`, rating: 'all' },
    { iso: `${day(9)}T18:00:00-04:00`, rating: 'all', food: 'f2' },
    { iso: `${day(10)}T18:00:00-04:00`, rating: 'all', food: 'f2' },
    { iso: `${day(11)}T19:00:00-04:00`, rating: 'refused' },
    { iso: `${day(11)}T21:00:00-04:00`, rating: 'refused' },
  ];

  it('fires the refusal watch on both surfaces', () => {
    expect(verdict('dog', meals, `${day(11)}T22:00:00-04:00`, NY)).toEqual(['refused_normal_food']);
  });

  it('read in UTC days the refusal arm is still half-collapsed and silent (the defect, pinned)', () => {
    // (UTC days also split the bout into two "low days", so the day-count arm fires there: the
    // same mis-split, the other way. Only the refusal arm is the B-092 claim.)
    expect(verdict('dog', meals, `${day(11)}T22:00:00-04:00`, 'UTC')).not.toContain('refused_normal_food');
  });
});

describe('CUL-94 — the server with no usable zone reads UTC days, never silence', () => {
  const meals: M[] = [
    ...tenGoodDays('-04:00'),
    { iso: `${day(11)}T08:00:00-04:00`, rating: 'picked' },
    { iso: `${day(11)}T17:00:00-04:00`, rating: 'picked' },
  ];
  const nows = [`${day(11)}T18:05:00-04:00`, `${day(11)}T20:30:00-04:00`, `${day(12)}T06:00:00-04:00`];

  it.each([undefined, '', 'Not/A_Zone'])('timezone %p behaves exactly as UTC', (tz) => {
    for (const nowIso of nows) {
      expect(serverTriggers('cat', meals, nowIso, tz)).toEqual(serverTriggers('cat', meals, nowIso, 'UTC'));
    }
    // And UTC days still see this drop: a missing zone degrades the day boundary only.
    expect(serverTriggers('cat', meals, nows[0], tz)).toEqual(['consecutive_low']);
  });
});

describe('CUL-94 — a refusal day never dilutes the normal the next day is judged against', () => {
  // The adversarial pass's counterexample (S1c): with yesterday folded into the baseline, four
  // re-offered refusals pulled the normal from 3.5 to 2.86 and a "some" breakfast (2) was no
  // longer a full point below it. The harder she refused, the quieter the card went.
  const cat: M[] = [];
  for (let d = 1; d <= 9; d++) {
    cat.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'all' });
    cat.push({ iso: `${day(d)}T18:00:00-04:00`, rating: 'most' });
  }
  for (const t of ['07:30', '12:00', '18:00', '21:00']) cat.push({ iso: `${day(10)}T${t}:00-04:00`, rating: 'refused' });
  const catWithBreakfast = [...cat, { iso: `${day(11)}T07:30:00-04:00`, rating: 'some' as const }];

  it('the cat keeps its card on a still-low breakfast after a day of refusals', () => {
    expect(verdict('cat', catWithBreakfast, `${day(11)}T08:00:00-04:00`, NY)).toEqual(['consecutive_low']);
  });

  it.each([1, 2, 3, 4, 5])('and refusing harder never quiets it (%i refusals)', (n) => {
    const fewer = [
      ...cat.filter((m) => m.rating !== 'refused'),
      ...['07:30', '10:00', '12:00', '18:00', '21:00'].slice(0, n).map((t) => ({ iso: `${day(10)}T${t}:00-04:00`, rating: 'refused' as const })),
      { iso: `${day(11)}T07:30:00-04:00`, rating: 'some' as const },
    ];
    expect(verdict('cat', fewer, `${day(11)}T08:00:00-04:00`, NY)).toEqual(['consecutive_low']);
  });

  it('the dog (S2): a refusal day before two low days stays out of its normal', () => {
    const dog: M[] = [];
    for (let d = 3; d <= 7; d++) {
      dog.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'all' });
      dog.push({ iso: `${day(d)}T18:00:00-04:00`, rating: 'most' });
    }
    for (const t of ['08:00', '12:00', '18:00', '21:00']) dog.push({ iso: `${day(8)}T${t}:00-04:00`, rating: 'refused' });
    dog.push({ iso: `${day(9)}T08:00:00-04:00`, rating: 'some' }, { iso: `${day(9)}T18:00:00-04:00`, rating: 'some' });
    dog.push({ iso: `${day(10)}T08:00:00-04:00`, rating: 'some' });
    expect(verdict('dog', dog, `${day(10)}T09:00:00-04:00`, NY)).toEqual(['consecutive_low']);
  });

  it('and a GOOD day before the judged days still counts toward a thin normal', () => {
    // Read with the day before excluded, this record has three baseline meals, under the floor
    // of four; with it included the normal is 2.25 and the day's 1.0 is a full point under it.
    const thin: M[] = [
      { iso: `${day(5)}T08:00:00-04:00`, rating: 'refused' },
      { iso: `${day(6)}T18:00:00-04:00`, rating: 'all' },
      { iso: `${day(8)}T18:00:00-04:00`, rating: 'all' },
      { iso: `${day(10)}T07:00:00-04:00`, rating: 'picked' },
      { iso: `${day(11)}T08:00:00-04:00`, rating: 'picked' },
      { iso: `${day(11)}T15:00:00-04:00`, rating: 'picked' },
    ];
    expect(verdict('cat', thin, `${day(11)}T20:00:00-04:00`, NY)).toEqual(['consecutive_low']);
  });
});
