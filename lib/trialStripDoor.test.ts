// Home's trial strip as the door (TS-5, CUL-1301): whether this week's lane may draw.
// Spec §11 TS-5: "The lane renders only with no withholding reason, fresh facts and no
// live safety-class card; a day-1 trial refusal, an untracked head, a stood-down range
// refusal and a pet switch mid-load each render no lane."
//
// Every fixture goes through the REAL loaders over one stubbed database, the shape
// `lib/trialLedger.test.ts` uses and for its reason (C-35): the gate's claim is about
// what those loaders hand Home, so a hand-built input could be green over a record
// production never produces.

jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

const mockDb = {
  trial: null as Record<string, unknown> | null,
  allowed: [] as Array<Record<string, unknown>>,
  feedings: [] as Array<Record<string, unknown>>,
};
jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: jest.fn(async () => mockDb.trial),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('diet_trial_foods')) return mockDb.allowed;
      if (sql.includes('FROM meals m')) return mockDb.feedings;
      return [];
    }),
  }),
}));
jest.mock('./analytics', () => ({
  ...jest.requireActual('./analytics'),
  getIntakeDecline: jest.fn().mockResolvedValue({ status: 'none', flags: [] }),
}));
jest.mock('./trialContaminant', () => ({
  loadTrialProteinContext: jest.fn().mockResolvedValue(null),
  trialDietNote: jest.fn().mockReturnValue(null),
  antigenPausedNote: jest.fn(() => ({ title: 'paused', body: 'paused' })),
}));

import type { TrialFacts } from './dietTrial';
import { loadDietTrialFacts, loadTrialPredicateFacts } from './dietTrialFacts';
import { withholdingReasons, type TrialCardInput } from './dietTrialCard';
import { buildTrialLedger, thisWeekLane } from './trialLedger';
import { trialStripLane, type TrialStripLaneArgs } from './trialStripDoor';

const PET = { id: 'pet-1', name: 'Mochi', species: 'cat' as const };
const START_KEY = '2026-07-03';

/** Local wall time on trial day `n` (day 1 = Jul 3, 2026). */
function onDay(n: number, hour = 12): Date {
  return new Date(2026, 6, 3 + n - 1, hour, 0);
}

interface Rec {
  mealDays: number[];
  rating?: string;
  nowDay: number;
}

async function load(rec: Rec): Promise<{ input: TrialCardInput; facts: TrialFacts | null }> {
  mockDb.trial = {
    id: 't1', started_at: START_KEY, target_duration_days: 56, target_duration_days_initial: null,
    target_duration_set_at: null, status: 'active', ended_at: null, completed_at: null,
    stopped_reason: null, outcome: null, indication: 'skin', food_label: 'Royal Canin Rabbit',
    target_protein: null,
  };
  mockDb.allowed = [
    {
      food_item_id: 'f1', role: 'primary_diet', food_label: 'Royal Canin Rabbit',
      allowed_from: START_KEY, allowed_until: null,
      brand: 'Royal Canin', product_name: 'Rabbit', primary_protein: 'rabbit', proteins: '["rabbit"]',
    },
  ];
  mockDb.feedings = rec.mealDays.map((d) => ({
    event_id: `m${d}`, occurred_at: onDay(d, 8).toISOString(), food_item_id: 'f1',
    brand: 'Royal Canin', product_name: 'Rabbit', food_type: 'meal', proteins: '["rabbit"]',
    intake_rating: rec.rating ?? 'all',
  }));
  const nowMs = onDay(rec.nowDay, 20).getTime();
  const [input, core] = await Promise.all([
    loadDietTrialFacts({ pet: PET, nowMs }),
    loadTrialPredicateFacts(PET, nowMs),
  ]);
  return { input, facts: core?.facts ?? null };
}

const CLEAN: Rec = { mealDays: Array.from({ length: 10 }, (_, i) => i + 1), nowDay: 10 };

/** Every gate open, for the pet the record was loaded for. Each case below shuts one. */
function open(input: TrialCardInput, facts: TrialFacts | null): TrialStripLaneArgs {
  return {
    stripPetId: PET.id,
    input,
    inputFresh: true,
    facts: { status: 'ready', facts },
    safety: { petId: PET.id, live: false },
  };
}

describe('trialStripLane: every gate open', () => {
  it('draws the ledger current row, the same one the trial screen draws (non-vacuity)', async () => {
    const { input, facts } = await load(CLEAN);
    expect(withholdingReasons(input)).toEqual([]);
    const lane = trialStripLane(open(input, facts));
    expect(lane).not.toBeNull();
    expect(lane!.label).toBe('Week 2 · meals logged 3 of 3 so far');
    expect(lane).toEqual(thisWeekLane(buildTrialLedger({ input, facts }), input));
  });
});

describe('trialStripLane: the strip withholds its ratio, so no lane', () => {
  it('a trial refusal from day 1 (§12 finding 1: never seven tidy marks over a refusing cat)', async () => {
    const { input, facts } = await load({ ...CLEAN, rating: 'refused' });
    // The reason the lane would lie: a refused bowl is still a logged day.
    expect(facts!.coverage!.daysLogged).toBe(10);
    expect(withholdingReasons(input).length).toBeGreaterThan(0);
    expect(trialStripLane(open(input, facts))).toBeNull();
  });

  it('a range refusal the card register has stood down', async () => {
    const refused = await load({ ...CLEAN, rating: 'refused' });
    expect(refused.facts!.rangeRefusal).not.toBeNull();
    const stoodDown = { ...refused.input, trialDietRefusal: null, rangeRefusal: refused.facts!.rangeRefusal };
    expect(trialStripLane(open(stoodDown, refused.facts))).toBeNull();
  });

  it('an untracked head (the first meal logged on day 4)', async () => {
    const { input, facts } = await load({ mealDays: [4, 5, 6, 7, 8, 9, 10], nowDay: 10 });
    expect(withholdingReasons(input)).toContain('untracked_head');
    expect(trialStripLane(open(input, facts))).toBeNull();
  });

  it('a live intake decline on the card input', async () => {
    const { input, facts } = await load(CLEAN);
    expect(trialStripLane(open({ ...input, intakeDeclineHeadline: 'Mochi ate less' }, facts))).toBeNull();
  });
});

describe('trialStripLane: facts not fresh for the strip pet, so no lane', () => {
  it('a pet switch mid-load: the card input still belongs to the previous pet', async () => {
    const { input, facts } = await load(CLEAN);
    expect(trialStripLane({ ...open(input, facts), inputFresh: false })).toBeNull();
  });

  it('a pet switch mid-load: the ledger facts have not answered for this pet', async () => {
    const { input, facts } = await load(CLEAN);
    expect(trialStripLane({ ...open(input, facts), facts: { status: 'unknown' } })).toBeNull();
  });

  it('a ledger read that failed, found no trial, or could not compute its facts', async () => {
    const { input, facts } = await load(CLEAN);
    const base = open(input, facts);
    expect(trialStripLane({ ...base, facts: { status: 'unreadable' } })).toBeNull();
    expect(trialStripLane({ ...base, facts: { status: 'no_trial' } })).toBeNull();
    expect(trialStripLane({ ...base, facts: { status: 'ready', facts: null } })).toBeNull();
  });

  it('no pet and no input', async () => {
    const { input, facts } = await load(CLEAN);
    expect(trialStripLane({ ...open(input, facts), stripPetId: null })).toBeNull();
    // …even where the Signal also reported for no pet: two nulls are not a match.
    expect(
      trialStripLane({ ...open(input, facts), stripPetId: null, safety: { petId: null, live: false } }),
    ).toBeNull();
    expect(trialStripLane({ ...open(input, facts), input: null })).toBeNull();
  });
});

describe('trialStripLane: a safety-class Signal card is live, or the Signal has not answered', () => {
  it('a live safety card for this pet (the whole class, PM ruling 2026-09-27)', async () => {
    const { input, facts } = await load(CLEAN);
    expect(trialStripLane({ ...open(input, facts), safety: { petId: PET.id, live: true } })).toBeNull();
  });

  it('fails closed until the Signal has answered for this pet', async () => {
    const { input, facts } = await load(CLEAN);
    const base = open(input, facts);
    expect(trialStripLane({ ...base, safety: null })).toBeNull();
    expect(trialStripLane({ ...base, safety: { petId: PET.id, live: null } })).toBeNull();
    // An all-clear the Signal gave for ANOTHER pet says nothing about this one.
    expect(trialStripLane({ ...base, safety: { petId: 'pet-2', live: false } })).toBeNull();
  });
});
