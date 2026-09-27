// The trial screen's model (TS-4 · CUL-1300; spec §3, §4, §11 TS-4). Every trial fixture
// goes through the REAL loaders (`loadDietTrialFacts` for the card input, the one
// `useDietTrial` calls; `loadTrialPredicateFacts` for the ledger's facts; `loadTrialAllowedSet`
// for the list) over one stubbed database, the harness `trialLedger.test.ts` uses, so the
// screen is asserted against the shapes production hands it (C-35).
//
// Every expected string is a LITERAL from the resolver's output (§11: "each with a literal
// expected string from the resolver"), and every withholding rule is asserted in its own
// case together with the non-vacuity half: the thing withheld was there to leak.

jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

const mockDb = {
  trial: null as Record<string, unknown> | null,
  allowed: [] as Array<Record<string, unknown>>,
  feedings: [] as Array<Record<string, unknown>>,
  arrangements: [] as Array<Record<string, unknown>>,
};
jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: jest.fn(async () => mockDb.trial),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('diet_trial_foods')) return mockDb.allowed;
      if (sql.includes('FROM meals m')) return mockDb.feedings;
      if (sql.includes('medication_administrations')) return [];
      if (sql.includes('feeding_arrangements')) return mockDb.arrangements;
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

import type { TrialFactsState } from '../hooks/useTrialFacts';
import type { TrialFacts } from './dietTrial';
import { loadDietTrialFacts, loadTrialPredicateFacts } from './dietTrialFacts';
import {
  BLIND_SPOT_QUALIFIER,
  isAnimalNotEating,
  resolveTrialCard,
  resolveTrialStrip,
  type TrialCardInput,
} from './dietTrialCard';
import { loadTrialAllowedSet, type TrialAllowedSet } from './trialAllowedSet';
import type { TrialResponseCounts } from './trialResponseCounts';
import {
  buildTrialScreenModel,
  noTrialLine,
  unreadableLine,
  type TrialScreenModel,
  type TrialScreenModelArgs,
  type TrialScreenTrial,
} from './trialScreenModel';

// ── The fixture record ───────────────────────────────────────────────────────

const PET = { id: 'pet-1', name: 'Mochi', species: 'dog' as const };
const START = { y: 2026, m: 6, d: 3 }; // Jul 3, 2026 (month is 0-based)
const START_KEY = '2026-07-03';

function onDay(n: number, hour = 12): Date {
  return new Date(START.y, START.m, START.d + n - 1, hour, 0);
}

function dayKey(n: number): string {
  const d = onDay(n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Rec {
  target: number;
  /** The designed window, when the trial was extended past it (CUL-1038). */
  targetInitial?: number | null;
  /** Per-day rating overrides on the trial meals. */
  ratings?: Record<number, string>;
  /** Per-day meal hour overrides (default 08:00). */
  hours?: Record<number, number>;
  /** Second meals of the trial diet on a day, each with its own hour and rating. */
  extraMeals?: Array<{ day: number; hour: number; rating: string | null }>;
  /** Meals that name no food (`food_item_id` null), each with its rating. */
  noFoodMeals?: Array<{ day: number; rating: string | null }>;
  /** No trial diet on the allowed list. */
  noPrimary?: boolean;
  status?: 'active' | 'completed' | 'abandoned';
  endedDay?: number | null;
  stoppedReason?: string | null;
  mealDays: number[];
  treatDays?: number[];
  rating?: string | null;
  freeChoice?: boolean;
  /** Extra permitted foods on the allowed list. */
  extras?: number;
  nowDay: number;
}

function seed(rec: Rec) {
  mockDb.trial = {
    id: 't1',
    started_at: START_KEY,
    target_duration_days: rec.target,
    target_duration_days_initial: rec.targetInitial ?? null,
    target_duration_set_at: null,
    status: rec.status ?? 'active',
    ended_at: rec.endedDay != null ? dayKey(rec.endedDay) : null,
    completed_at: null,
    stopped_reason: rec.stoppedReason ?? null,
    outcome: null,
    indication: 'skin',
    food_label: 'Royal Canin Rabbit',
    target_protein: null,
  };
  mockDb.allowed = [
    ...(rec.noPrimary ? [] : [{
      food_item_id: 'f1', role: 'primary_diet', food_label: 'Royal Canin Rabbit',
      allowed_from: START_KEY, allowed_until: null,
      brand: 'Royal Canin', product_name: 'Rabbit', primary_protein: 'rabbit', proteins: '["rabbit"]',
    }]),
    ...Array.from({ length: rec.extras ?? 0 }, (_, i) => ({
      food_item_id: `x${i}`, role: 'permitted_treat', food_label: `Rabbit Treat ${i}`,
      allowed_from: START_KEY, allowed_until: null,
      brand: 'Acme', product_name: `Rabbit Treat ${i}`, primary_protein: 'rabbit', proteins: '["rabbit"]',
    })),
  ];
  const feedings: Array<Record<string, unknown>> = [];
  for (const d of rec.mealDays) {
    feedings.push({
      event_id: `m${d}`, occurred_at: onDay(d, rec.hours?.[d] ?? 8).toISOString(), food_item_id: 'f1',
      brand: 'Royal Canin', product_name: 'Rabbit', food_type: 'meal', proteins: '["rabbit"]',
      intake_rating: rec.ratings?.[d] ?? (rec.rating === undefined ? 'all' : rec.rating),
    });
  }
  for (const x of rec.noFoodMeals ?? []) {
    feedings.push({
      event_id: `n${x.day}`, occurred_at: onDay(x.day, 8).toISOString(), food_item_id: null,
      brand: null, product_name: null, food_type: null, proteins: null, intake_rating: x.rating,
    });
  }
  for (const x of rec.extraMeals ?? []) {
    feedings.push({
      event_id: `m${x.day}-${x.hour}`, occurred_at: onDay(x.day, x.hour).toISOString(), food_item_id: 'f1',
      brand: 'Royal Canin', product_name: 'Rabbit', food_type: 'meal', proteins: '["rabbit"]',
      intake_rating: x.rating,
    });
  }
  for (const d of rec.treatDays ?? []) {
    feedings.push({
      event_id: `t${d}`, occurred_at: onDay(d, 19).toISOString(), food_item_id: 'fx',
      brand: 'Acme', product_name: 'Chicken Jerky', food_type: 'treat', proteins: '["chicken"]',
      intake_rating: null,
    });
  }
  mockDb.feedings = feedings;
  mockDb.arrangements = rec.freeChoice
    ? [{ food_item_id: 'f1', active_from: START_KEY, active_until: null, brand: 'Royal Canin', product_name: 'Rabbit' }]
    : [];
}

interface Loaded {
  input: TrialCardInput;
  facts: TrialFacts | null;
  allowedSet: TrialAllowedSet;
}

async function load(rec: Rec): Promise<Loaded> {
  seed(rec);
  const nowMs = onDay(rec.nowDay, 20).getTime();
  const [input, core, allowedSet] = await Promise.all([
    loadDietTrialFacts({ pet: PET, nowMs, signalsV2: true }),
    loadTrialPredicateFacts(PET, nowMs),
    loadTrialAllowedSet(PET.id, nowMs),
  ]);
  return { input, facts: core?.facts ?? null, allowedSet };
}

function argsFor(l: Loaded, over: Partial<TrialScreenModelArgs> = {}): TrialScreenModelArgs {
  return {
    petId: PET.id,
    pet: { id: PET.id, name: PET.name },
    petsLoaded: true,
    petName: PET.name,
    isActivePet: true,
    trial: { status: 'loaded', input: l.input, inputIsForPet: true },
    facts: { status: 'ready', facts: l.facts },
    allowedSet: l.allowedSet,
    appointment: null,
    ...over,
  };
}

function trialModel(m: TrialScreenModel): TrialScreenTrial {
  if (m.kind !== 'trial') throw new Error(`expected a trial model, got ${m.kind}`);
  return m;
}

const texts = (m: TrialScreenTrial) => m.facts.map((l) => l.text);

/** A vomiting count the strip will print — so a withheld line was there to leak. */
const VOMITING: TrialResponseCounts = {
  trialDayNumber: 23,
  trialCount: 3,
  baselineCount: 11,
  trialLoggedDays: 21,
  baselineLoggedDays: 30,
  baselineWindowDays: 49,
  densityComparable: true,
};

const MOCHI_DAY_23: Rec = {
  target: 56,
  // Days 1–22 logged except day 11; a treat on day 17 (the round-2 frame).
  mealDays: Array.from({ length: 22 }, (_, i) => i + 1).filter((d) => d !== 11),
  treatDays: [17],
  extras: 2,
  nowDay: 23,
};

// ── §3: the running trial, the round-2 frame ─────────────────────────────────

describe('a running trial (§3, round 2 §03)', () => {
  it('draws the frame: the strip’s header, the sub-line, the list, the ledger, the facts, the doors', async () => {
    const l = await load(MOCHI_DAY_23);
    const input = { ...l.input, trialResponse: VOMITING };
    const m = trialModel(buildTrialScreenModel(argsFor({ ...l, input }, {
      appointment: { id: 'appt-1', when: 'Thursday · 9:20 am' },
    })));

    expect(m.state).toBe('exposures');
    expect(m.title).toBe('Rabbit trial · day 23 of 56');
    expect(m.title).toBe(resolveTrialStrip(input)!.header);
    expect(m.subline).toBe('Royal Canin Rabbit · since Jul 3 · ends Aug 27');
    expect(m.safety).toBeNull();
    expect(m.allowedFoods).toEqual({
      label: 'What Mochi can eat',
      sub: 'The trial diet and 2 more allowed foods',
    });
    expect(m.ledger).not.toBeNull();
    expect(m.ledger!.rows.map((r) => r.countLabel).slice(0, 4)).toEqual([
      '7 of 7', '6 of 7', '7 of 7', '1 of 2 so far',
    ]);
    // The facts in the card's order; the coverage sentence is the ledger's caption.
    expect(texts(m)[0]).toBe('Meals logged on 21 of 23 days.');
    // The floor suffix stays beside the exposure count it qualifies; only the LOCKED
    // qualifier moves to the foot (at the foot it would sit under the vomiting line).
    expect(texts(m)).toEqual([
      'Meals logged on 21 of 23 days.',
      '22 feedings in total — 21 matched, 1 did not.',
      'That 1 is what’s been logged, not a total.',
      '6 days ago — Acme Chicken Jerky. Keep going with the trial diet. Your vet will want to see this at the recheck.',
    ]);
    expect(m.qualifier).toBe(BLIND_SPOT_QUALIFIER);
    expect(texts(m).some((t) => t.startsWith(BLIND_SPOT_QUALIFIER))).toBe(false);
    // Home's vomiting sentence, verbatim.
    expect(m.vomiting).toBe(
      "Vomiting: 3 in the trial's 23 days · 11 in the 49 days before, a longer stretch.",
    );
    expect(m.exposures).toEqual({ label: 'Outside the trial diet', sub: null });
    expect(m.getReady).toEqual({
      label: 'Get ready for the recheck', sub: 'Thursday · 9:20 am', appointmentId: 'appt-1',
    });
    expect(m.report).toEqual({ label: 'Vet report', sub: null });
    // The card's two references are doors here, never repeated as actions.
    expect(m.actions).toEqual([]);
    expect(m.manage).toBe('Manage the trial');
    expect(m.decision).toBeNull();
    expect(m.headline).toBeNull();
  });

  it('keeps every record line the card prints, in its order (S2: layout, never meaning)', async () => {
    const l = await load(MOCHI_DAY_23);
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    const card = resolveTrialCard(l.input);
    // Every card line, in order, with the qualifier split at its LOCKED prefix: the words
    // on the screen are exactly the card's words.
    const rejoined = [...m.facts.map((x) => x.text), m.qualifier].join(' ');
    const original = card.lines.map((x) => x.text).join(' ');
    expect(rejoined.split(' ').sort()).toEqual(original.split(' ').sort());
    const qualifierLine = card.lines.find((x) => x.text.startsWith(BLIND_SPOT_QUALIFIER))!;
    expect(qualifierLine.text).toBe(`${BLIND_SPOT_QUALIFIER} That 1 is what’s been logged, not a total.`);
    expect(m.facts.filter((x) => x.text.startsWith(BLIND_SPOT_QUALIFIER))).toEqual([]);
  });

  it('words the list door for one extra and for none', async () => {
    const one = await load({ ...MOCHI_DAY_23, extras: 1 });
    expect(trialModel(buildTrialScreenModel(argsFor(one))).allowedFoods?.sub).toBe(
      'The trial diet and 1 more allowed food',
    );
    const none = await load({ ...MOCHI_DAY_23, extras: 0 });
    expect(trialModel(buildTrialScreenModel(argsFor(none))).allowedFoods?.sub).toBe('The trial diet only');
  });

  it('draws the list door’s head alone while the allowed set has not hydrated (§3.4)', async () => {
    const l = await load(MOCHI_DAY_23);
    for (const allowedSet of [{ status: 'unknown' }, { status: 'unreadable' }] as const) {
      const m = trialModel(buildTrialScreenModel(argsFor(l, { allowedSet })));
      expect(m.allowedFoods).toEqual({ label: 'What Mochi can eat', sub: null });
    }
  });

  it('names the route’s pet, not the active one, and withholds /report for another pet (C-9)', async () => {
    const l = await load(MOCHI_DAY_23);
    const m = trialModel(buildTrialScreenModel(argsFor(l, { isActivePet: false })));
    expect(m.petName).toBe('Mochi');
    expect(m.allowedFoods?.label).toBe('What Mochi can eat');
    expect(m.report).toBeNull();
  });
});

// ── S3 / §3.7: the vomiting line is the strip's own field ─────────────────────

describe('the vomiting line equals the strip’s field for the same input, including null', () => {
  it('across every state the fixtures reach', async () => {
    const recs: Rec[] = [
      MOCHI_DAY_23,
      { target: 56, mealDays: [1], nowDay: 1 },
      { target: 56, mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rating: 'refused', nowDay: 10 },
      { target: 56, mealDays: Array.from({ length: 56 }, (_, i) => i + 1), nowDay: 56 },
      { target: 56, mealDays: Array.from({ length: 58 }, (_, i) => i + 1), nowDay: 58 },
      { target: 56, mealDays: [1, 2, 3], freeChoice: true, nowDay: 10 },
    ];
    let nonNull = 0;
    for (const rec of recs) {
      const l = await load(rec);
      for (const trialResponse of [null, VOMITING]) {
        for (const intakeDeclineHeadline of [null, 'Mochi has eaten less than usual for 2 days.']) {
          const input = { ...l.input, trialResponse, intakeDeclineHeadline };
          const m = trialModel(buildTrialScreenModel(argsFor({ ...l, input })));
          const strip = resolveTrialStrip(input)?.trialResponseLine ?? null;
          expect(m.vomiting).toBe(strip);
          if (strip !== null) nonNull += 1;
        }
      }
    }
    // Non-vacuous: the sweep reached lines the strip prints, and lines it withholds.
    expect(nonNull).toBeGreaterThan(0);
  });
});

// ── §3.2 / S4: the safety faces ───────────────────────────────────────────────

describe('a trial refusal (§3.2, §0.3, §12 findings 2 and 3)', () => {
  const REFUSING: Rec = {
    target: 56, mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rating: 'refused', nowDay: 10,
  };

  it('leads with the card’s register lines and carries only the card’s own actions', async () => {
    const l = await load(REFUSING);
    const input = { ...l.input, trialResponse: VOMITING };
    const m = trialModel(buildTrialScreenModel(argsFor({ ...l, input })));
    const card = resolveTrialCard(input);
    expect(m.state).toBe('trial_refusal');
    expect(m.safety).toEqual(card.lines.filter((x) => x.role === 'flag').map((x) => x.text));
    expect(m.safety![1]).toBe(
      'A diet Mochi isn’t eating can’t answer the question the trial was started for — and it’s worth a call to your vet, whatever the trial is doing. Culprit isn’t reading these days as a clean run while this is going on.',
    );
    // No Keep going and no Stopped early: choosing "wouldn't eat it" would drop the call.
    expect(m.actions.map((a) => a.id)).toEqual(['trial_manage']);
    expect(m.actions[0].label).toBe('Change or end the trial');
    expect(m.decision).toBeNull();
    expect(m.manage).toBeNull();
    // No ledger, not even folded, over a record where a refused bowl counts as a logged day.
    expect(l.facts!.coverage!.daysLogged).toBe(10);
    expect(m.ledger).toBeNull();
    expect(texts(m).some((t) => t.startsWith('Meals logged on'))).toBe(false);
    // The strip withholds the vomiting pair over a pet that isn't eating; so does the screen.
    expect(m.vomiting).toBeNull();
    expect(m.subline).toBe('Royal Canin Rabbit · since Jul 3');
  });

  it('withholds coverage and the ledger after the card’s register has stood down (S7)', async () => {
    const l = await load(REFUSING);
    expect(l.facts!.rangeRefusal).not.toBeNull();
    // The register stood down: no live refusal, the range fact kept (the raw reason).
    const input: TrialCardInput = {
      ...l.input,
      trialDietRefusal: null,
      rangeRefusal: l.facts!.rangeRefusal,
      rangeRefusalSpansEpisodes: false,
    };
    const card = resolveTrialCard(input);
    // Non-vacuity: the card prints the ratio here, by its standing ruling.
    expect(card.state).toBe('clean');
    expect(card.lines.map((x) => x.text)).toContain('Meals logged on 10 of 10 days.');
    expect(resolveTrialStrip(input)!.line).not.toContain('meals logged');

    const m = trialModel(buildTrialScreenModel(argsFor({ ...l, input })));
    expect(m.safety).toBeNull();
    expect(texts(m)).not.toContain('Meals logged on 10 of 10 days.');
    expect(m.ledger).toBeNull();
  });
});

describe('an intake decline (§3.2)', () => {
  it('leads with the decline and its ask, draws no ledger, and offers Manage after the doors', async () => {
    const l = await load(MOCHI_DAY_23);
    const input = {
      ...l.input,
      intakeDeclineHeadline: 'Mochi has eaten less than usual for 2 days.',
      trialResponse: VOMITING,
    };
    const m = trialModel(buildTrialScreenModel(argsFor({ ...l, input })));
    expect(m.state).toBe('intake_decline');
    expect(m.safety).toEqual([
      'Mochi has eaten less than usual for 2 days.',
      'A pet that goes off their food needs a call, whatever the trial is doing. Culprit isn’t reading these days as a clean run while this is going on.',
    ]);
    expect(m.title).toBe('Rabbit trial · day 23 of 56');
    expect(m.ledger).toBeNull();
    expect(m.vomiting).toBeNull();
    expect(m.actions).toEqual([]);
    // CUL-1339 #2 (a): the one way to change the trial once TS-6 makes the Pet tab a door.
    expect(m.manage).toBe('Manage the trial');
    expect(m.allowedFoods).toBeNull();
    // The off-diet floor survives the sickest card (the card's own rule), with its door.
    expect(m.exposures).not.toBeNull();
  });
});

// ── §3.9: milestone and overrun ───────────────────────────────────────────────

describe('the milestone (§0.3, §3.9, §12 finding 6)', () => {
  it('draws the headline, its note and three choices inline, and no ledger or coverage', async () => {
    const all = Array.from({ length: 56 }, (_, i) => i + 1);
    const l = await load({ target: 56, mealDays: all, treatDays: [30], nowDay: 56 });
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.state).toBe('milestone');
    expect(m.headline).toBe('Day 56 of 56 — the window you set is done.');
    expect(m.decision!.notes).toEqual(
      resolveTrialCard(l.input).lines.filter((x) => x.role === 'note').map((x) => x.text),
    );
    expect(m.decision!.actions.map((a) => [a.id, a.emphasis])).toEqual([
      ['trial_extend', 'primary'],
      ['trial_complete', 'secondary'],
      ['trial_stopped_early', 'secondary'],
    ]);
    expect(m.decision!.actions[0].label).toBe('Keep going — 4 more weeks');
    expect(m.actions).toEqual([]);
    expect(l.facts).not.toBeNull();
    expect(m.ledger).toBeNull();
    expect(texts(m).some((t) => t.startsWith('Meals logged on'))).toBe(false);
    // The off-diet floor stays, with its door.
    expect(m.exposures).not.toBeNull();
    expect(m.subline).toBe('Royal Canin Rabbit · since Jul 3');
    // No fourth control beside the decision (§3.9, round 2).
    expect(m.manage).toBeNull();
  });
});

describe('overrun', () => {
  it('keeps the ledger to the end line and puts “Tell Culprit what’s next” above it', async () => {
    const all = Array.from({ length: 58 }, (_, i) => i + 1);
    const l = await load({ target: 56, mealDays: all, nowDay: 58 });
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.state).toBe('overrun');
    expect(m.title).toBe('Rabbit trial · day 58 — 2 days past');
    expect(m.subline).toBe('Royal Canin Rabbit · since Jul 3 · window ended Aug 27');
    expect(m.decision!.actions.map((a) => a.label)).toEqual(['Tell Culprit what’s next']);
    expect(m.decision!.notes[0]).toMatch(/^Still running\./);
    expect(texts(m).some((t) => t.startsWith('Still running.'))).toBe(false);
    expect(m.ledger).not.toBeNull();
    expect(m.ledger!.rows.at(-1)!.days.at(-1)!.trialDay).toBe(56);
    expect(m.manage).toBe('Manage the trial');
  });
});

// ── Free-fed and the terminal trials ──────────────────────────────────────────

describe('free-fed', () => {
  it('leads with the arrangement line and draws no ledger', async () => {
    const l = await load({ target: 56, mealDays: [1, 2, 3], freeChoice: true, nowDay: 10 });
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.state).toBe('free_fed');
    expect(m.facts[0]).toEqual({
      role: 'lead',
      text: 'Mochi grazes from a bowl that’s topped up, so there’s no day-by-day count of what was eaten.',
    });
    expect(m.ledger).toBeNull();
  });
});

describe('ended trials (the 30-day grace)', () => {
  it('completed: the card’s kicker as the title, the full ledger, and Open vet report at the bottom', async () => {
    const all = Array.from({ length: 56 }, (_, i) => i + 1);
    const l = await load({ target: 56, status: 'completed', endedDay: 56, mealDays: all, nowDay: 60 });
    expect(resolveTrialStrip(l.input)).toBeNull();
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.state).toBe('completed');
    expect(m.title).toBe('Rabbit trial · finished');
    expect(m.subline).toBe(`Royal Canin Rabbit · ${resolveTrialCard(l.input).dayLine}`);
    expect(m.ledger).not.toBeNull();
    expect(m.actions.map((a) => a.label)).toEqual(['Open vet report']);
    // One door per action (S8): the action is the report's door.
    expect(m.report).toBeNull();
    expect(m.manage).toBeNull();
    expect(m.vomiting).toBeNull();
  });

  it('completed, for a pet that is not the active one: no door to the wrong pet’s report', async () => {
    const all = Array.from({ length: 56 }, (_, i) => i + 1);
    const l = await load({ target: 56, status: 'completed', endedDay: 56, mealDays: all, nowDay: 60 });
    const m = trialModel(buildTrialScreenModel(argsFor(l, { isActivePet: false })));
    expect(m.actions).toEqual([]);
    expect(m.report).toBeNull();
  });

  it('abandoned: Start a new trial at the bottom', async () => {
    const l = await load({
      target: 56, status: 'abandoned', endedDay: 12, stoppedReason: 'other',
      mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], nowDay: 20,
    });
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.state).toBe('abandoned');
    expect(m.title).toBe('Rabbit trial · stopped early');
    expect(m.actions.map((a) => [a.id, a.label])).toEqual([['start_trial', 'Start a new trial']]);
  });
});

// ── §4, S9: the answers that are not a trial ─────────────────────────────────

describe('loading, unreadable, no trial and an unknown pet are four screens (S9, C-12)', () => {
  it('loading while the pet list, the trial read or the facts read has not answered', async () => {
    const l = await load(MOCHI_DAY_23);
    expect(buildTrialScreenModel(argsFor(l, { petsLoaded: false, pet: null }))).toEqual({ kind: 'loading' });
    expect(
      buildTrialScreenModel(argsFor(l, { trial: { status: 'loading', input: null, inputIsForPet: false } })),
    ).toEqual({ kind: 'loading' });
    const unknown: TrialFactsState = { status: 'unknown' };
    expect(buildTrialScreenModel(argsFor(l, { facts: unknown }))).toEqual({ kind: 'loading' });
  });

  it('never prints the no-trial copy for a read that has not answered FOR THIS PET', async () => {
    // The previous pet's answer, "no trial", is still in the hook while this pet's read runs.
    const l = await load(MOCHI_DAY_23);
    const stale = { ...l.input, trial: null };
    for (const status of ['loading', 'loaded'] as const) {
      const m = buildTrialScreenModel(argsFor(l, { trial: { status, input: stale, inputIsForPet: false } }));
      expect(m).toEqual({ kind: 'loading' });
    }
  });

  it('unreadable: its own line, never the empty state', async () => {
    const l = await load(MOCHI_DAY_23);
    const m = buildTrialScreenModel(argsFor(l, { trial: { status: 'unreadable', input: null, inputIsForPet: false } }));
    expect(m).toEqual({ kind: 'unreadable', petName: 'Mochi' });
    expect(unreadableLine('Mochi')).toBe('I couldn’t pull Mochi’s trial just now.');
  });

  it('no trial: only once the read answered with none', async () => {
    const l = await load(MOCHI_DAY_23);
    const m = buildTrialScreenModel(argsFor(l, {
      trial: { status: 'loaded', input: { ...l.input, trial: null }, inputIsForPet: true },
      facts: { status: 'no_trial' },
    }));
    expect(m).toEqual({ kind: 'no_trial', petName: 'Mochi' });
    expect(noTrialLine('Mochi')).toBe('Mochi isn’t on a diet trial right now.');
    expect(noTrialLine('your pet')).toBe('Your pet isn’t on a diet trial right now.');
  });

  it('an unknown or archived pet, once the pet list has loaded', async () => {
    const l = await load(MOCHI_DAY_23);
    expect(
      buildTrialScreenModel(argsFor(l, { pet: null, trial: { status: 'no_pet', input: null, inputIsForPet: false } })),
    ).toEqual({ kind: 'unknown_pet' });
  });
});

// ── The adversarial pass on the built code (TS-4, spec §12's owed pass) ──────────────

describe('an ended trial with a live intake decline keeps the warning (S4, S7)', () => {
  const DECLINE = 'Mochi has eaten less than usual for 2 days.';
  const all = Array.from({ length: 56 }, (_, i) => i + 1);

  it('completed: the card’s register lines lead, with no ledger', async () => {
    const l = await load({ target: 56, status: 'completed', endedDay: 56, mealDays: all, treatDays: [30], nowDay: 60 });
    const input = { ...l.input, species: 'cat' as const, intakeDeclineHeadline: DECLINE };
    const card = resolveTrialCard(input);
    const flags = card.lines.filter((x) => x.role === 'flag').map((x) => x.text);
    // Non-vacuity: the ended card carries the warning.
    expect(flags[0]).toBe(DECLINE);
    expect(flags[1]).toMatch(/^A cat that stops eating needs a call today/);
    const m = trialModel(buildTrialScreenModel(argsFor({ ...l, input })));
    expect(m.state).toBe('completed');
    expect(m.safety).toEqual(flags);
    expect(m.ledger).toBeNull();
    expect(texts(m).some((t) => t === DECLINE)).toBe(false);
  });

  it('abandoned: the same', async () => {
    const l = await load({
      target: 56, status: 'abandoned', endedDay: 12, stoppedReason: 'other',
      mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], nowDay: 20,
    });
    const input = { ...l.input, species: 'cat' as const, intakeDeclineHeadline: DECLINE };
    const m = trialModel(buildTrialScreenModel(argsFor({ ...l, input })));
    expect(m.state).toBe('abandoned');
    expect(m.safety?.[0]).toBe(DECLINE);
    expect(m.ledger).toBeNull();
  });
});

describe('a stood-down refusal below the floor: the "so far" paragraph loses its ratio, never the floor (S7)', () => {
  it('refused early, then eaten (the ordinary cat)', async () => {
    // Days 1–3 refused, days 18–20 eaten, a treat on day 19; read on day 20.
    const l = await load({
      target: 56,
      mealDays: [1, 2, 3, 18, 19, 20],
      ratings: { 1: 'refused', 2: 'refused', 3: 'refused' },
      treatDays: [19],
      nowDay: 20,
    });
    expect(l.facts!.rangeRefusal).not.toBeNull();
    expect(l.input.trialDietRefusal ?? null).toBeNull();
    const card = resolveTrialCard(l.input);
    expect(card.state).toBe('below_floor');
    // Non-vacuity: the card prints the ratio inside the paragraph; Home does not.
    expect(card.lines.some((x) => /meals on 6 of 20 days/.test(x.text))).toBe(true);
    expect(resolveTrialStrip(l.input)!.line).not.toMatch(/meals logged/);

    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.state).toBe('below_floor');
    expect(texts(m).some((t) => /meals (logged )?on \d+ of \d+ days/i.test(t))).toBe(false);
    // The floor stays: the feeding counts and the one that did not match.
    expect(texts(m)).toContain(
      'Of what’s on the record so far: 7 feedings in total, and 6 matched and 1 did not.',
    );
    expect(m.ledger).toBeNull();
  });

  it('a 28-day window extended to 84, one refusing bout straddling midnight, read on day 60', async () => {
    const days = Array.from({ length: 28 }, (_, i) => i + 1);
    const l = await load({
      target: 84,
      targetInitial: 28,
      mealDays: days,
      // Three rated bowls, two refused across the midnight: the refusal floor is met.
      rating: null,
      ratings: { 1: 'refused', 2: 'refused' },
      hours: { 1: 23, 2: 1 },
      extraMeals: [{ day: 2, hour: 8, rating: 'all' }],
      nowDay: 60,
    });
    expect(l.facts!.rangeRefusal).not.toBeNull();
    const card = resolveTrialCard(l.input);
    expect(card.state).toBe('below_floor');
    expect(card.lines.some((x) => /meals on 28 of 28 days/.test(x.text))).toBe(true);
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(texts(m).some((t) => /\d+ of \d+ days/.test(t))).toBe(false);
    expect(texts(m).some((t) => /feedings in total/.test(t))).toBe(true);
  });
});

describe('a refusal at the window (spec conflict, awaiting a ruling)', () => {
  it('carries the card’s own actions, including the milestone link', async () => {
    const all = Array.from({ length: 56 }, (_, i) => i + 1);
    const l = await load({ target: 56, mealDays: all, rating: 'refused', nowDay: 56 });
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.state).toBe('trial_refusal');
    // Pinned as built: the card's own actions (TS-4 AC). The link opens the decision
    // sheet, which holds Stopped early; the ruling is on CUL-1300.
    expect(m.actions.map((a) => a.id)).toEqual(['trial_manage', 'milestone']);
    expect(m.decision).toBeNull();
    expect(m.ledger).toBeNull();
  });
});

describe('ended trials keep the exposures door (§3.6)', () => {
  it('completed with one treat', async () => {
    const all = Array.from({ length: 56 }, (_, i) => i + 1);
    const l = await load({ target: 56, status: 'completed', endedDay: 56, mealDays: all, treatDays: [30], nowDay: 60 });
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(m.exposures).toEqual({ label: 'Outside the trial diet', sub: null });
  });
});

// ── The adversarial re-run's two findings (TS-4) ──────────────────────────────────

describe('the coverage-null projection never reads a logged record as empty, nor keeps a referent-less line', () => {
  it('meals that name no food, no trial diet on the list, a stood-down refusal: no "nothing on the record"', async () => {
    const l = await load({
      target: 56, nowDay: 20, noPrimary: true, mealDays: [],
      noFoodMeals: [
        ...[1, 2, 3].map((day) => ({ day, rating: 'refused' })),
        ...[18, 19, 20].map((day) => ({ day, rating: 'all' })),
      ],
    });
    expect(isAnimalNotEating(l.input)).toBe(true);
    expect(l.input.coverage!.daysLogged).toBe(6);
    expect(l.input.exposures!.totalFeedings).toBe(0);
    // Non-vacuity: resolved without coverage, the card WOULD say the record is empty.
    const projectedCard = resolveTrialCard({ ...l.input, coverage: null });
    expect(projectedCard.lines.map((x) => x.text)).toContain('Nothing is on the record for this trial yet.');

    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(texts(m)).not.toContain('Nothing is on the record for this trial yet.');
    expect(texts(m).some((t) => /\d+ of \d+ days/.test(t))).toBe(false);
    expect(m.facts.filter((x) => x.role === 'fact')).toEqual([]);
  });

  it('the same shape above the floor: no "Nothing logged against the trial yet."', async () => {
    const l = await load({
      target: 56, nowDay: 20, noPrimary: true, mealDays: [],
      noFoodMeals: Array.from({ length: 20 }, (_, i) => ({ day: i + 1, rating: i < 10 ? 'refused' : 'all' })),
    });
    expect(isAnimalNotEating(l.input)).toBe(true);
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(texts(m)).not.toContain('Nothing logged against the trial yet.');
    expect(texts(m).some((t) => /\d+ of \d+ days/.test(t))).toBe(false);
  });

  it('an untracked head with head-period treats: no "aren’t counted here" under a total that counts them', async () => {
    const l = await load({
      target: 56, nowDay: 30,
      treatDays: [2, 3, 4, 5, 6, 7, 8, 9],
      mealDays: Array.from({ length: 21 }, (_, i) => i + 10),
      ratings: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 10, 'refused'])),
    });
    expect(isAnimalNotEating(l.input)).toBe(true);
    expect(l.input.untrackedDaysBeforeFirstLog).toBe(9);
    // Non-vacuity: the coverage-null card alone still prints the head line.
    expect(resolveTrialCard({ ...l.input, coverage: null }).lines.some((x) => /aren’t counted here/.test(x.text))).toBe(true);
    const m = trialModel(buildTrialScreenModel(argsFor(l)));
    expect(texts(m).some((t) => /aren’t counted here/.test(t))).toBe(false);
    // The floor survives: 8 treats did not match.
    expect(texts(m).some((t) => /8 did not/.test(t))).toBe(true);
  });
});

// ── CUL-1339 #2 (PM, 2026-09-27, option (a)) ─────────────────────────────────────────
//
// *Manage the trial* sits on the intake-decline face. Its two acts are "change the window"
// (a new `target_duration_days` on the same trial) and "replace the trial" (the running one
// ends, a new one starts today). The ruling's premise is that neither drops the call-today:
// the ask comes from the intake flag, not from the trial. Asserted by building the face
// over the record each act leaves behind, with the decline still live, and requiring the
// same register lines, word for word, on a cat (the "needs a call today" register).

describe('Manage on the intake-decline face never drops the call-today (CUL-1339 #2)', () => {
  const DECLINE = 'Mochi has eaten less than usual for 2 days.';
  const asCat = (l: Loaded) => ({ ...l, input: { ...l.input, species: 'cat' as const, intakeDeclineHeadline: DECLINE } });

  it('before, after changing the window, and after replacing the trial', async () => {
    const before = trialModel(buildTrialScreenModel(argsFor(asCat(await load(MOCHI_DAY_23)))));
    expect(before.state).toBe('intake_decline');
    expect(before.manage).toBe('Manage the trial');
    // Non-vacuity: the face carries the call-today to lose.
    expect(before.safety?.[0]).toBe(DECLINE);
    expect(before.safety?.[1]).toMatch(/^A cat that stops eating needs a call today/);

    const rewindowed = trialModel(
      buildTrialScreenModel(argsFor(asCat(await load({ ...MOCHI_DAY_23, target: 84 })))),
    );
    const replaced = trialModel(
      buildTrialScreenModel(argsFor(asCat(await load({ target: 56, mealDays: [1], nowDay: 1 })))),
    );
    for (const after of [rewindowed, replaced]) {
      expect(after.state).toBe('intake_decline');
      expect(after.safety).toEqual(before.safety);
      expect(after.manage).toBe('Manage the trial');
    }
    // Non-vacuity: the two acts really did change the trial the face is drawn over.
    expect(rewindowed.title).not.toBe(before.title);
    expect(replaced.title).not.toBe(before.title);
  });

  it('through the loader: the decline read takes the pet, never the trial, so a replaced trial inherits it', async () => {
    // The case above injects the headline. This one lets the REAL loader produce it, before
    // and after each act, over a detector that is watching (adversarial pass on TS-6, note 6).
    // Its limit, stated: the detector's own trial-independence (it reads every meal in its
    // lookback, `lib/analytics.ts` `getIntakeDecline`) is that module's contract; what this
    // pins is that nothing about the trial reaches the call.
    const { getIntakeDecline } = jest.requireMock('./analytics') as { getIntakeDecline: jest.Mock };
    const flag = {
      trigger: 'consecutive_low', class: 'health_watch', species: 'dog', baselineScore: 3,
      recentScore: 1, daysBelowBaseline: 2, refusedFoodLabel: null, ratedMealsConsidered: 12,
    };
    getIntakeDecline.mockResolvedValue({ status: 'watch', flags: [flag] });
    try {
      const records = [MOCHI_DAY_23, { ...MOCHI_DAY_23, target: 84 }, { target: 56, mealDays: [1], nowDay: 1 }];
      const faces: TrialScreenTrial[] = [];
      for (const rec of records) {
        getIntakeDecline.mockClear();
        const l = await load(rec);
        expect(l.input.intakeDeclineHeadline).toBeTruthy();
        // The read's whole argument list: the pet, its species, the clock. No trial.
        expect(getIntakeDecline.mock.calls).toEqual([[PET.id, PET.species, expect.any(Number)]]);
        faces.push(trialModel(buildTrialScreenModel(argsFor(l))));
      }
      for (const f of faces) {
        expect(f.state).toBe('intake_decline');
        expect(f.safety).toEqual(faces[0].safety);
        expect(f.manage).toBe('Manage the trial');
      }
      expect(faces[0].safety?.[1]).toMatch(/needs a call/);
    } finally {
      getIntakeDecline.mockResolvedValue({ status: 'none', flags: [] });
    }
  });
});
