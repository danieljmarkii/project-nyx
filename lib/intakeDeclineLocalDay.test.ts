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

  it('read in UTC days the split bout no longer silences the refusal arm either (CUL-1797)', () => {
    // Pinned as the defect until CUL-1797: the 19:00 refusal fell on the earlier UTC day and
    // dragged the food's normal under the floor. The trailing low day is now the decline and is
    // left out of the normal, so the calendar the bout is split by no longer decides the card.
    expect(verdict('dog', meals, `${day(11)}T22:00:00-04:00`, 'UTC')).toContain('refused_normal_food');
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
    // Every rated meal in the last 72 hours here is picked at (three, on two days), so the
    // sustained-refusal floor holds and REPLACES the day-count card with its louder one. Either is
    // the card this test protects; neither may go silent.
    expect(verdict('cat', thin, `${day(11)}T20:00:00-04:00`, NY)).toEqual(['sustained_refusal']);
  });
});

describe('CUL-94 — the buffer day holds the onset: a good morning, then the refusals', () => {
  // Adversarial pass 2. Each case fired before CUL-94 (its 24h cutoff fell inside the day by
  // accident) and went quiet under a whole-day reading of it.
  it.each([0, 1, 2, 3])('a marginal normal: an evening refusal never quiets the cat (%i refusals)', (k) => {
    const ratings: IntakeRating[] = ['all', 'some', 'most', 'most', 'all', 'some', 'most', 'some'];
    const meals: M[] = ratings.map((rating, i) => ({ iso: `${day(i + 1)}T08:00:00+00:00`, rating }));
    meals.push({ iso: `${day(10)}T07:00:00+00:00`, rating: 'all' }, { iso: `${day(10)}T12:00:00+00:00`, rating: 'all' });
    for (let i = 0; i < k; i++) meals.push({ iso: `${day(10)}T${20 + i}:00:00+00:00`, rating: 'refused' });
    meals.push({ iso: `${day(11)}T08:00:00+00:00`, rating: 'some' });
    expect(verdict('cat', meals, `${day(11)}T19:00:00+00:00`, 'UTC')).toContain('consecutive_low');
  });

  it.each([0, 1, 2, 3, 4])('a thin record, first week of logging (%i refusals)', (n) => {
    const meals: M[] = [6, 7, 8].map((d) => ({ iso: `${day(d)}T08:00:00+00:00`, rating: 'all' as const }));
    meals.push({ iso: `${day(10)}T07:00:00+00:00`, rating: 'all' });
    for (let i = 0; i < n; i++) meals.push({ iso: `${day(10)}T${20 + i}:00:00+00:00`, rating: 'refused' });
    meals.push({ iso: `${day(11)}T08:00:00+00:00`, rating: 'some' });
    expect(verdict('cat', meals, `${day(11)}T19:00:00+00:00`, 'UTC')).toContain('consecutive_low');
  });

  it('a meal ageing out of the 14-day window at a clock hour does not drop the card (case 4)', () => {
    // The raw window edge stays (see detection.ts); the buffer-day cuts carry this case.
    const meals: M[] = [
      { iso: '2026-09-27T20:00:00+00:00', rating: 'all' },
      { iso: '2026-09-28T08:00:00+00:00', rating: 'all' },
      { iso: '2026-09-29T08:00:00+00:00', rating: 'all' },
      { iso: '2026-09-30T08:00:00+00:00', rating: 'all' },
      { iso: `${day(10)}T20:00:00+00:00`, rating: 'refused' },
      { iso: `${day(10)}T22:00:00+00:00`, rating: 'refused' },
      { iso: `${day(11)}T08:00:00+00:00`, rating: 'some' },
    ];
    // Since CUL-2404 (a) the two refusals and the "ate some" also meet the sustained-refusal floor,
    // which replaces the day-count card with its louder one. Either is the card this protects.
    for (const at of ['19:00', '21:00', '23:30']) {
      const v = verdict('cat', meals, `${day(11)}T${at}:00+00:00`, 'UTC');
      expect({ at, card: v.includes('consecutive_low') || v.includes('sustained_refusal') }).toEqual({ at, card: true });
    }
  });
});

describe('CUL-1797 — the decline never counts as the normal (PM ruling, option 1)', () => {
  // The issue's own records, through both real detectors. Before the ruling a refusal day that
  // had aged PAST the buffer day stayed in the normal: the cat lost her card at n ≥ 4 on the
  // morning of Oct 12, the dog at n ≥ 3 on the evening of Oct 10. Either intake card protects
  // the pet (the sustained-refusal floor replaces the day-count card with its louder one).
  const TIMES = ['07:30', '10:00', '12:00', '18:00', '21:00', '22:00'];
  const card = (v: string[]) => v.includes('consecutive_low') || v.includes('sustained_refusal');

  function cat(n: number): M[] {
    const out: M[] = [];
    for (let d = 1; d <= 9; d++) {
      out.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'all' }, { iso: `${day(d)}T18:00:00-04:00`, rating: 'most' });
    }
    for (const t of TIMES.slice(0, n)) out.push({ iso: `${day(10)}T${t}:00-04:00`, rating: 'refused' });
    out.push({ iso: `${day(11)}T08:00:00-04:00`, rating: 'some' }, { iso: `${day(11)}T18:00:00-04:00`, rating: 'some' });
    out.push({ iso: `${day(12)}T07:30:00-04:00`, rating: 'some' });
    return out;
  }

  function dog(n: number): M[] {
    const out: M[] = [];
    for (let d = 1; d <= 6; d++) {
      out.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'all' }, { iso: `${day(d)}T18:00:00-04:00`, rating: 'most' });
    }
    for (const t of TIMES.slice(0, n)) out.push({ iso: `${day(7)}T${t}:00-04:00`, rating: 'refused' });
    for (const d of [8, 9]) {
      out.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'some' }, { iso: `${day(d)}T18:00:00-04:00`, rating: 'some' });
    }
    out.push({ iso: `${day(10)}T08:00:00-04:00`, rating: 'some' });
    return out;
  }

  const N = [0, 1, 2, 3, 4, 5, 6];

  it.each(N)('the cat (Oct 10–12) keeps an intake card at every hour of Oct 12 (%i refusals)', (n) => {
    for (const at of ['06:00', '08:00', '20:00']) {
      expect({ n, at, card: card(verdict('cat', cat(n), `${day(12)}T${at}:00-04:00`, NY)) }).toEqual({ n, at, card: true });
    }
  });

  it.each(N)('the dog (Oct 7–10) keeps an intake card at every hour of Oct 10 (%i refusals)', (n) => {
    for (const at of ['06:00', '09:00', '20:00']) {
      expect({ n, at, card: card(verdict('dog', dog(n), `${day(10)}T${at}:00-04:00`, NY)) }).toEqual({ n, at, card: true });
    }
  });

  it('the day-count card itself survives the harder refusal, not only the floor', () => {
    // Where the floor is quiet (Oct 9's good meals sit inside the cat's 72 hours; the dog's four
    // refusals all fall before 20:00 Oct 7, so its 72 hours hold only "some"), the card is the
    // day-count arm's, and its normal is the days before the refusals.
    expect(verdict('cat', cat(6), `${day(12)}T08:00:00-04:00`, NY)).toEqual(['consecutive_low']);
    expect(verdict('dog', dog(4), `${day(10)}T20:00:00-04:00`, NY)).toEqual(['consecutive_low']);
  });

  it('an ordinary dip two days back is not the decline: a steady record stays quiet', () => {
    // Nine days of "all"/"most", one "most" day, then a "most" today: nothing a full point down.
    const steady: M[] = [];
    for (let d = 1; d <= 10; d++) {
      steady.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'all' }, { iso: `${day(d)}T18:00:00-04:00`, rating: 'most' });
    }
    steady.push({ iso: `${day(11)}T08:00:00-04:00`, rating: 'most' });
    expect(verdict('cat', steady, `${day(11)}T09:00:00-04:00`, NY)).toEqual([]);
    expect(verdict('dog', steady, `${day(11)}T09:00:00-04:00`, NY)).toEqual([]);
  });

  describe('the refusal arm (CUL-2696, CUL-1790)', () => {
    it.each(N)('refusals of the food three days back never silence a fresh refusal (%i refusals)', (n) => {
      // Nine days eating it, n refusals on Oct 10, two good meals on Oct 11, refused at 08:00
      // Oct 12. Oct 11 was good, so neither the day-count card nor the floor speaks: this card
      // is the only one, and it went silent at n = 4.
      const meals: M[] = [];
      for (let d = 1; d <= 9; d++) meals.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'all' });
      for (const t of TIMES.slice(0, n)) meals.push({ iso: `${day(10)}T${t}:00-04:00`, rating: 'refused' });
      meals.push({ iso: `${day(11)}T08:00:00-04:00`, rating: 'all' }, { iso: `${day(11)}T18:00:00-04:00`, rating: 'all' });
      meals.push({ iso: `${day(12)}T08:00:00-04:00`, rating: 'refused' });
      expect(verdict('dog', meals, `${day(12)}T09:00:00-04:00`, NY)).toEqual(['refused_normal_food']);
    });

    it.each([1, 2, 3])('a bout across local midnight is one refusal, not a history of them (%i before midnight)', (k) => {
      // Four days eating it "most", then k refusals late on Oct 5 and one at 00:30 Oct 6.
      const meals: M[] = [];
      for (let d = 1; d <= 4; d++) meals.push({ iso: `${day(d)}T18:00:00-04:00`, rating: 'most' });
      for (let i = 0; i < k; i++) meals.push({ iso: `${day(5)}T23:${String(10 + 15 * i)}:00-04:00`, rating: 'refused' });
      meals.push({ iso: `${day(6)}T00:30:00-04:00`, rating: 'refused' });
      expect(verdict('dog', meals, `${day(6)}T01:00:00-04:00`, NY)).toContain('refused_normal_food');
    });

    it('a food refused on most days is still not "normally eaten"', () => {
      // Good, refused, refused, good, refused, then refused today: by day it sits at 1.6.
      const ratings: IntakeRating[] = ['all', 'refused', 'refused', 'all', 'refused'];
      const meals: M[] = ratings.map((rating, i) => ({ iso: `${day(i + 1)}T08:00:00-04:00`, rating }));
      meals.push({ iso: `${day(6)}T08:00:00-04:00`, rating: 'refused' });
      expect(verdict('dog', meals, `${day(6)}T09:00:00-04:00`, NY)).not.toContain('refused_normal_food');
    });
  });
});

describe('CUL-1797 adversarial pass 1 — refusing harder never quiets the new readings', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('a refusal day two days before the buffer, k = %i (A)', (k) => {
    // Oct 1–9 good; k refusals on Oct 10; "most" then "picked" on Oct 11; "some" twice on Oct 12
    // and 13. A walk back from the buffer judged Oct 11 against a normal that held Oct 10's
    // refusals, so the seventh refusal stopped it one day short and the cat went silent.
    const meals: M[] = [];
    for (let d = 1; d <= 9; d++) {
      meals.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'all' }, { iso: `${day(d)}T18:00:00-04:00`, rating: 'all' });
    }
    for (let i = 0; i < k; i++) meals.push({ iso: `${day(10)}T${String(7 + i).padStart(2, '0')}:00:00-04:00`, rating: 'refused' });
    meals.push({ iso: `${day(11)}T08:00:00-04:00`, rating: 'most' }, { iso: `${day(11)}T18:00:00-04:00`, rating: 'picked' });
    for (const d of [12, 13]) {
      meals.push({ iso: `${day(d)}T08:00:00-04:00`, rating: 'some' }, { iso: `${day(d)}T18:00:00-04:00`, rating: 'some' });
    }
    expect(verdict('cat', meals, `${day(13)}T19:00:00-04:00`, NY)).toContain('consecutive_low');
  });

  it.each([1, 2, 3, 4])('a refused re-offer on an older mixed day, k = %i (B)', (k) => {
    // Food B eaten well throughout keeps the day-count arm quiet. Food A: Oct 9 all, Oct 10–11
    // most, Oct 12 "all" then k refusals, Oct 13 most, refused Oct 14. One refusal on Oct 12 read
    // the food at 3.0 and fired; a second dragged that day's mean and silenced it.
    const meals: M[] = [];
    for (let d = 1; d <= 14; d++) {
      meals.push({ iso: `${day(d)}T07:00:00-04:00`, rating: 'all', food: 'b' }, { iso: `${day(d)}T19:00:00-04:00`, rating: 'all', food: 'b' });
    }
    meals.push(
      { iso: `${day(9)}T12:00:00-04:00`, rating: 'all', food: 'a' },
      { iso: `${day(10)}T12:00:00-04:00`, rating: 'most', food: 'a' },
      { iso: `${day(11)}T12:00:00-04:00`, rating: 'most', food: 'a' },
      { iso: `${day(12)}T12:00:00-04:00`, rating: 'all', food: 'a' },
    );
    for (let i = 0; i < k; i++) meals.push({ iso: `${day(12)}T${13 + i}:00:00-04:00`, rating: 'refused', food: 'a' });
    meals.push({ iso: `${day(13)}T12:00:00-04:00`, rating: 'most', food: 'a' }, { iso: `${day(14)}T12:00:00-04:00`, rating: 'refused', food: 'a' });
    expect(verdict('cat', meals, `${day(14)}T20:00:00-04:00`, NY)).toContain('refused_normal_food');
  });
});
