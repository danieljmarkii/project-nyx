// B-417 PR 6 — the outcome sheet's read (§4.3).
//
// What is worth pinning here, in rough order of what would hurt if it broke:
//   • the two stretches are EQUAL LENGTH and adjacent, so "14 before · 3 during"
//     is a comparison rather than an artefact of two different spans;
//   • an event is bucketed by its LOCAL day, on the same clock as the day
//     boundary this whole feature is defined on (B-421);
//   • the density series counts MEAL-TYPE days and nothing else — the denominator
//     `generate-report` settled on after two failed alternatives, one of which
//     certified the very artefact C5 exists to disclose;
//   • `beforeTracked` is FALSE when nothing at all was logged before the trial,
//     which is what stops a fabricated baseline rendering as a flattering zero.
//
// jest hoists jest.mock() above the imports, so anything a factory closes over
// must be `mock`-prefixed.

const mockGetAllAsync = jest.fn().mockResolvedValue([]);
jest.mock('./db', () => ({
  getDb: () => ({ getAllAsync: mockGetAllAsync }),
}));
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { loadTrialOutcomeFacts } from './dietTrialOutcomeFacts';

/** Local noon on a calendar date, so no fixture sits on a day boundary — the
 *  boundary is LOCAL midnight and that is precisely what is under test. */
function at(y: number, m: number, d: number, hour = 12): string {
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function ev(type: string, iso: string) {
  return { event_type: type, occurred_at: iso };
}

/** A 14-day trial started 15 July, read on 28 July → during = 15–28 July (14
 *  days), before = 1–14 July (14 days). */
const START = '2026-07-15';
const NOW = new Date(2026, 6, 28, 12).getTime();

async function load(rows: { event_type: string; occurred_at: string }[]) {
  mockGetAllAsync.mockResolvedValueOnce(rows);
  return loadTrialOutcomeFacts({ petId: 'pet-1', startedAt: START, nowMs: NOW });
}

beforeEach(() => { mockGetAllAsync.mockReset(); mockGetAllAsync.mockResolvedValue([]); });

describe('the two stretches', () => {
  it('are equal-length, adjacent, and inclusive of the start day', async () => {
    const facts = await load([]);
    expect(facts).not.toBeNull();
    // Day 1 IS the start day, the same inclusive convention getDietTrialProgress
    // and trialEndDayIndex use — 15 July through 28 July is 14 days, not 13.
    expect(facts!.duringDays).toBe(14);
    expect(facts!.beforeDays).toBe(14);
  });

  it('bucket each event by its LOCAL day, on both boundaries', async () => {
    const facts = await load([
      ev('itch', at(2026, 7, 14, 23)),  // last moment before → BEFORE
      ev('itch', at(2026, 7, 15, 0)),   // first moment of day 1 → DURING
      ev('itch', at(2026, 7, 28, 23)),  // today, late → DURING
      ev('itch', at(2026, 6, 30, 12)),  // outside the before window → neither
    ]);
    const itch = facts!.symptoms.find((s) => s.symptomType === 'itch')!;
    expect(itch.before).toBe(1);
    expect(itch.during).toBe(2);
  });

  it('ranks by the during count and names each symptom through symptomLabel', async () => {
    const facts = await load([
      ev('itch', at(2026, 7, 20)),
      ev('itch', at(2026, 7, 21)),
      ev('vomit', at(2026, 7, 5)),
    ]);
    expect(facts!.symptoms).toEqual([
      { symptomType: 'itch', label: 'Itch/Scratch', before: 0, during: 2 },
      // A symptom seen ONLY before the trial still renders — its disappearance is
      // the finding, and dropping it would hide the best news in the record.
      { symptomType: 'vomit', label: 'Vomit', before: 1, during: 0 },
    ]);
  });

  it('counts only symptom event types', async () => {
    const facts = await load([
      ev('meal', at(2026, 7, 20)),
      ev('stool_normal', at(2026, 7, 20)),
      ev('weight_check', at(2026, 7, 20)),
      ev('medication', at(2026, 7, 20)),
    ]);
    // `stool_normal` is not adverse and is deliberately not a symptom; a report
    // that counted normal stools as symptoms would read as a worsening pet.
    expect(facts!.symptoms).toEqual([]);
  });
});

describe('beforeTracked — the untracked stretch is named, never zeroed', () => {
  it('is false when nothing at all was logged before the trial', async () => {
    const facts = await load([ev('itch', at(2026, 7, 20))]);
    expect(facts!.beforeTracked).toBe(false);
  });

  it('is true on ANY logged event, not only a symptom', async () => {
    // The question it answers is "was this owner using the app at all before the
    // trial?" — a fortnight of diligently logged meals with no symptoms is a real
    // baseline, and treating it as untracked would throw away a true zero.
    const facts = await load([
      ev('meal', at(2026, 7, 8)),
      ev('itch', at(2026, 7, 20)),
    ]);
    expect(facts!.beforeTracked).toBe(true);
  });
});

describe('the C5 density series', () => {
  it('counts distinct MEAL-TYPE days in each stretch', async () => {
    const facts = await load([
      ev('meal', at(2026, 7, 8, 8)),
      ev('meal', at(2026, 7, 8, 18)),   // same day, still one
      ev('meal', at(2026, 7, 9)),
      ev('meal', at(2026, 7, 20)),
      ev('itch', at(2026, 7, 21)),      // not a meal
    ]);
    expect(facts!.meals).toEqual({
      before: { daysLogged: 2, days: 14 },
      during: { daysLogged: 1, days: 14 },
    });
  });

  it('is independent of the symptom series by construction', async () => {
    // The denominator that survived. `generate-report`'s TrialLoggingDensity
    // records the two that did not: ALL events saturates (habitual meal logging
    // certifies the artefact C5 discloses), and NON-MEAL events IS the symptom
    // series on a real record, making the line a tautology. A record of nothing
    // but symptoms must therefore report zero meal-days, not its own symptom
    // count.
    const facts = await load([
      ev('itch', at(2026, 7, 3)),
      ev('itch', at(2026, 7, 4)),
      ev('itch', at(2026, 7, 20)),
    ]);
    expect(facts!.meals.before.daysLogged).toBe(0);
    expect(facts!.meals.during.daysLogged).toBe(0);
  });
});

describe('degradation', () => {
  it('returns null rather than guessed counts when the read fails', async () => {
    mockGetAllAsync.mockRejectedValueOnce(new Error('database is locked'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await loadTrialOutcomeFacts({ petId: 'p', startedAt: START, nowMs: NOW })).toBeNull();
    spy.mockRestore();
  });

  it('returns null on an unparseable start date', async () => {
    expect(
      await loadTrialOutcomeFacts({ petId: 'p', startedAt: 'not-a-date', nowMs: NOW }),
    ).toBeNull();
  });

  it('handles a trial started today — one day each side, never zero', async () => {
    const facts = await loadTrialOutcomeFacts({
      petId: 'p', startedAt: '2026-07-28', nowMs: NOW,
    });
    expect(facts!.duringDays).toBe(1);
    expect(facts!.beforeDays).toBe(1);
    expect(facts!.meals.during.days).toBe(1);
  });
});
