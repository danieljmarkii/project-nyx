// SCRATCH — adversarial falsification harness. Deleted after the run.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import {
  computeTrialFacts,
  type AllowedFood,
  type TrialFeeding,
  type TrialSpec,
  type TrialFacts,
} from './dietTrial';
import { resolveTrialCard, planTrialCard, type TrialCardInput } from './dietTrialCard';

const TRIAL: TrialSpec = { id: 't1', startedAt: '2026-07-01', targetDurationDays: 56, species: 'cat' };

function at(day: string, hour = 12): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}
function food(over: Partial<AllowedFood> & Pick<AllowedFood, 'foodItemId'>): AllowedFood {
  return { foodKey: null, label: 'Food', role: 'primary_diet', allowedFrom: '2026-07-01',
    allowedUntil: null, primaryProtein: null, proteins: [], ...over };
}
const DRY = food({ foodItemId: 'dry', foodKey: 'rcduck dry', label: 'RC Duck Dry',
  primaryProtein: 'duck', proteins: ['duck'] });
const JERKY = food({ foodItemId: 'jerky', foodKey: 'bwrabbit jerky', label: 'Rabbit Jerky',
  role: 'permitted_treat', primaryProtein: 'rabbit', proteins: ['rabbit'] });
const ALLOWED = [DRY, JERKY];

function feeding(over: Partial<TrialFeeding> & Pick<TrialFeeding, 'eventId'>): TrialFeeding {
  return { occurredAt: at('2026-07-10'), foodItemId: null, foodKey: null, label: null,
    foodType: 'meal', proteins: [], ...over };
}
/** day 1 == 2026-07-01 */
function dayKey(n: number): string {
  const d = new Date(2026, 6, n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function primary(id: string, day: number, hour: number, rating?: string | null): TrialFeeding {
  return feeding({ eventId: id, occurredAt: at(dayKey(day), hour), foodItemId: DRY.foodItemId,
    foodKey: DRY.foodKey, intakeRating: rating ?? undefined });
}
function nowOn(day: number, hour = 22): number {
  const d = new Date(2026, 6, day, hour); return d.getTime();
}

/** Faithful mirror of lib/dietTrialFacts.ts's adapter for the R1 fields. */
function cardInput(facts: TrialFacts, nowMs: number, over: Partial<TrialCardInput> = {}): TrialCardInput {
  const readable = facts.range ? facts : null;
  return {
    trial: { status: 'active', startedAt: '2026-07-01', targetDurationDays: 56, foodLabel: 'RC Duck Dry' },
    nowMs,
    petName: 'Mochi',
    species: 'cat',
    coverage: readable?.coverage
      ? { daysLogged: readable.coverage.daysLogged, daysElapsed: readable.coverage.daysElapsed } : null,
    exposures: readable ? {
      totalFeedings: readable.exposures.totalFeedings,
      offDiet: readable.exposures.offDiet,
      mostRecent: null,
      mayStateRecordClean: false,
    } : null,
    belowCoverageFloor: readable?.belowCoverageFloor ?? false,
    untrackedDaysBeforeFirstLog: readable?.untrackedDaysBeforeFirstLog ?? 0,
    allowedSetUnavailable: facts.allowedSetUnavailable,
    rangeRefusal: facts.rangeRefusal,
    trialDietRefusal: facts.trialDietRefusal,
    recentFinishedFeedings: facts.recentFinishedFeedings,
    rangeRefusalSpansEpisodes: facts.rangeRefusalSpansEpisodes,
    intakeRating: facts.intakeRating,
    freeFedOverlap: readable?.intakeNotDirectlyObserved ?? false,
    freeFed: readable?.intakeNotDirectlyObservedNow
      ? { loggedFeedings: readable.exposures.totalFeedings } : null,
    ...over,
  };
}

function show(label: string, m: ReturnType<typeof resolveTrialCard>): void {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${label} ===\nstate=${m.state}\n` +
    m.lines.map((l) => `  [${l.role}] ${l.text}`).join('\n') +
    `\n  actions: ${m.actions.map((a) => a.label).join(' | ')}`);
}

// ── CE-1 — one finished meal cancels 61 documented refusals ─────────────────
describe('CE-1 the single good meal', () => {
  it('61 refusals then a fortnight of near-silence with one finished bowl', () => {
    const feedings: TrialFeeding[] = [];
    // Days 1–30: twice-daily prescribed diet, every bowl rated refused.
    for (let d = 1; d <= 30; d += 1) {
      feedings.push(primary(`a${d}`, d, 8, 'refused'));
      feedings.push(primary(`b${d}`, d, 18, 'refused'));
    }
    // Days 31–44: she keeps LOGGING both meals but rates only two of them.
    for (let d = 31; d <= 44; d += 1) {
      feedings.push(primary(`c${d}`, d, 8, d === 35 ? 'all' : null));
      feedings.push(primary(`e${d}`, d, 18, d === 40 ? 'refused' : null));
    }
    const now = nowOn(44);
    const facts = computeTrialFacts({ trial: TRIAL, allowedFoods: ALLOWED, feedings, nowMs: now });
    // eslint-disable-next-line no-console
    console.log('CE-1 facts', {
      now: facts.trialDietRefusal, range: facts.rangeRefusal,
      spans: facts.rangeRefusalSpansEpisodes, recentFinished: facts.recentFinishedFeedings,
    });
    const m = resolveTrialCard(cardInput(facts, now));
    show('CE-1 day 44 (one finished bowl 9 days ago)', m);

    // Same record, read 5 days later — the finished bowl has aged out.
    const now2 = nowOn(49);
    const facts2 = computeTrialFacts({ trial: TRIAL, allowedFoods: ALLOWED, feedings, nowMs: now2 });
    // eslint-disable-next-line no-console
    console.log('CE-1b facts', {
      now: facts2.trialDietRefusal, range: facts2.rangeRefusal,
      spans: facts2.rangeRefusalSpansEpisodes, recentFinished: facts2.recentFinishedFeedings,
    });
    show('CE-1b day 49 (no new data at all)', resolveTrialCard(cardInput(facts2, now2)));
  });
});

// ── CE-2 — the dog that ate: some / all / some on day 2 ─────────────────────
describe('CE-2 some/all/some', () => {
  it('fires the live register on day 2 of 56', () => {
    const feedings = [
      primary('s1', 1, 8, 'some'),
      primary('s2', 1, 18, 'all'),
      primary('s3', 2, 8, 'some'),
    ];
    const now = nowOn(2, 12);
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'dog' }, allowedFoods: ALLOWED, feedings, nowMs: now });
    // eslint-disable-next-line no-console
    console.log('CE-2 facts', { now: facts.trialDietRefusal, range: facts.rangeRefusal,
      recentFinished: facts.recentFinishedFeedings });
    show('CE-2 dog, day 2, some/all/some',
      resolveTrialCard(cardInput(facts, now, { species: 'dog', petName: 'Biscuit' })));
  });

  it('cat, three "some" bowls across two days', () => {
    const feedings = [
      primary('s1', 1, 8, 'some'),
      primary('s2', 1, 18, 'some'),
      primary('s3', 2, 8, 'some'),
    ];
    const now = nowOn(2, 12);
    const facts = computeTrialFacts({ trial: TRIAL, allowedFoods: ALLOWED, feedings, nowMs: now });
    show('CE-2b cat, day 2, some/some/some', resolveTrialCard(cardInput(facts, now)));
  });
});

// ── CE-3 — free-fed bowl of the trial diet IN FORCE + rated refusals ────────
describe('CE-3 free-fed', () => {
  it('a bowl in force now plus logged refused wet meals', () => {
    const feedings: TrialFeeding[] = [];
    for (let d = 1; d <= 20; d += 1) {
      feedings.push(primary(`w${d}a`, d, 8, 'refused'));
      feedings.push(primary(`w${d}b`, d, 20, 'refused'));
    }
    const now = nowOn(20);
    const facts = computeTrialFacts({
      trial: TRIAL, allowedFoods: ALLOWED, feedings, nowMs: now,
      arrangements: [{ id: 'arr1', type: 'free_choice', label: 'Kibble bowl',
        startedAt: '2026-07-01', endedAt: null, foodItemId: DRY.foodItemId,
        foodKey: DRY.foodKey, proteins: ['duck'] } as never],
    });
    // eslint-disable-next-line no-console
    console.log('CE-3 facts', { freeFedNow: facts.intakeNotDirectlyObservedNow,
      overlap: facts.intakeNotDirectlyObserved, now: facts.trialDietRefusal });
    const input = cardInput(facts, now);
    // eslint-disable-next-line no-console
    console.log('CE-3 input.freeFed', input.freeFed, 'plan', planTrialCard(input));
    show('CE-3 free-fed bowl in force + refused wet meals', resolveTrialCard(input));
  });
});

// ── CE-4 — teach line has no recency: a 28-day rating blackout ──────────────
describe('CE-4 rating blackout', () => {
  it('rated for 28 days, then nothing for 28 more', () => {
    const feedings: TrialFeeding[] = [];
    for (let d = 1; d <= 56; d += 1) {
      feedings.push(primary(`x${d}a`, d, 8, d <= 28 ? 'all' : null));
      feedings.push(primary(`x${d}b`, d, 18, d <= 28 ? 'all' : null));
    }
    const now = nowOn(55);
    const facts = computeTrialFacts({ trial: TRIAL, allowedFoods: ALLOWED, feedings, nowMs: now });
    // eslint-disable-next-line no-console
    console.log('CE-4 facts', { intakeRating: facts.intakeRating,
      now: facts.trialDietRefusal, range: facts.rangeRefusal,
      recentFinished: facts.recentFinishedFeedings });
    show('CE-4 day 55, 27 days with zero intake data', resolveTrialCard(cardInput(facts, now)));
  });
});

// ── CE-5 — below floor starved: 3 refusals across 30 days ──────────────────
describe('CE-5 sparse record', () => {
  it('three logged feedings in 30 days, all refused', () => {
    const feedings = [primary('p1', 3, 8, 'refused'), primary('p2', 3, 20, 'refused'),
      primary('p3', 12, 9, 'refused')];
    const now = nowOn(30);
    const facts = computeTrialFacts({ trial: TRIAL, allowedFoods: ALLOWED, feedings, nowMs: now });
    // eslint-disable-next-line no-console
    console.log('CE-5 facts', { now: facts.trialDietRefusal, range: facts.rangeRefusal,
      spans: facts.rangeRefusalSpansEpisodes, recentFinished: facts.recentFinishedFeedings,
      belowFloor: facts.belowCoverageFloor, coverage: facts.coverage });
    show('CE-5 3 feedings / 30 days, all refused', resolveTrialCard(cardInput(facts, now)));
  });
});

// ── CE-6 — the now-fact on a COMPLETED card (B-570) ────────────────────────
describe('CE-6 terminal now-fact', () => {
  it('ate for six weeks, refused the last two, trial completed', () => {
    const feedings: TrialFeeding[] = [];
    for (let d = 1; d <= 42; d += 1) {
      feedings.push(primary(`g${d}a`, d, 8, 'all'));
      feedings.push(primary(`g${d}b`, d, 18, 'all'));
    }
    for (let d = 43; d <= 56; d += 1) {
      feedings.push(primary(`h${d}a`, d, 8, 'refused'));
      feedings.push(primary(`h${d}b`, d, 18, 'refused'));
    }
    const now = nowOn(56);
    const facts = computeTrialFacts({ trial: TRIAL, allowedFoods: ALLOWED, feedings, nowMs: now });
    // eslint-disable-next-line no-console
    console.log('CE-6 facts', { now: facts.trialDietRefusal, range: facts.rangeRefusal });
    const input = cardInput(facts, now, {
      trial: { status: 'completed', startedAt: '2026-07-01', targetDurationDays: 56,
        foodLabel: 'RC Duck Dry', endedAt: '2026-08-25' } as never,
    });
    // eslint-disable-next-line no-console
    console.log('CE-6 plan', planTrialCard(input));
    show('CE-6 completed, refused the last fortnight', resolveTrialCard(input));
  });
});
