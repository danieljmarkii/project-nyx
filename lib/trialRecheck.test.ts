// Get ready's recheck (TS-8 · CUL-1304; spec §0.2 T-3, §11 TS-8). The AC: the trial row asks
// Dr. Chen's questions as its headings, in his order, and EVERY NUMBER EQUALS THE TRIAL
// SCREEN'S FOR THE SAME FIXTURE. So every trial fixture goes through the real loaders over
// the stubbed database `trialScreenModel.test.ts` uses (C-35: the shapes production hands
// over), and the screen's model is built twice: once as the screen builds it (real facts),
// once as Get ready does (`NO_LEDGER_FACTS`). The recheck is read off the second and held to
// the first.
//
// The harness below is `trialScreenModel.test.ts`'s, copied rather than shared: a jest.mock
// factory is file-scoped, and the two suites must see the same database shapes.

jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

const mockDb = {
  trial: null as Record<string, unknown> | null,
  allowed: [] as Array<Record<string, unknown>>,
  feedings: [] as Array<Record<string, unknown>>,
  arrangements: [] as Array<Record<string, unknown>>,
  doses: [] as Array<Record<string, unknown>>,
};
jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: jest.fn(async () => mockDb.trial),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('diet_trial_foods')) return mockDb.allowed;
      if (sql.includes('FROM meals m')) return mockDb.feedings;
      if (sql.includes('medication_administrations')) return mockDb.doses;
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

import { oralRouteCopy, type TrialFacts } from './dietTrial';
import type { TrialPredicateFacts } from './dietTrialFacts';
import type { TrialFactsState } from '../hooks/useTrialFacts';
import { TRIAL_EXPOSURES_GROUP_ORAL, buildTrialExposuresScreen } from './trialExposuresScreen';
import { loadDietTrialFacts, loadTrialPredicateFacts } from './dietTrialFacts';
import { BLIND_SPOT_QUALIFIER, resolveTrialStrip, type TrialCardInput } from './dietTrialCard';
import { loadTrialAllowedSet, type TrialAllowedSet } from './trialAllowedSet';
import type { TrialResponseCounts } from './trialResponseCounts';
import type { Rundown, RundownTile } from './rundown';
import { localDayIndex } from './utils';
import {
  buildTrialScreenModel,
  type TrialScreenModel,
  type TrialScreenModelArgs,
  type TrialScreenTrial,
} from './trialScreenModel';
import {
  NO_LEDGER_FACTS,
  RECHECK_QUESTION_ORDER,
  buildTrialRecheck,
  recheckFactsState,
  recheckQuestion,
  type TrialRecheck,
} from './trialRecheck';

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
  /** Logged doses (CUL-1342), in `readDoses`' row shape. */
  doses?: Array<{
    day: number;
    hour?: number;
    drug: string;
    form: string | null;
    adherence?: string | null;
    /** A food vehicle, off the trial list (Acme Chicken Jerky). */
    vehicle?: boolean;
  }>;
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
  mockDb.doses = (rec.doses ?? []).map((d, i) => ({
    event_id: `d${d.day}-${i}`,
    occurred_at: onDay(d.day, d.hour ?? 7).toISOString(),
    adherence: d.adherence ?? 'given',
    paired_event_id: d.vehicle ? `v${d.day}` : null,
    generic_name: null,
    brand_name: d.drug,
    form: d.form,
    vehicle_food_item_id: d.vehicle ? 'fx' : null,
    vehicle_brand: d.vehicle ? 'Acme' : null,
    vehicle_product_name: d.vehicle ? 'Chicken Jerky' : null,
  }));
  mockDb.arrangements = rec.freeChoice
    ? [{ food_item_id: 'f1', active_from: START_KEY, active_until: null, brand: 'Royal Canin', product_name: 'Rabbit' }]
    : [];
}

interface Loaded {
  input: TrialCardInput;
  facts: TrialFacts | null;
  allowedSet: TrialAllowedSet;
  nowMs: number;
}

async function load(rec: Rec): Promise<Loaded> {
  seed(rec);
  const nowMs = onDay(rec.nowDay, 20).getTime();
  const [input, core, allowedSet] = await Promise.all([
    loadDietTrialFacts({ pet: PET, nowMs, signalsV2: true }),
    loadTrialPredicateFacts(PET, nowMs),
    loadTrialAllowedSet(PET.id, nowMs),
  ]);
  return { input, facts: core?.facts ?? null, allowedSet, nowMs };
}

function argsFor(l: Loaded, over: Partial<TrialScreenModelArgs> = {}): TrialScreenModelArgs {
  return {
    petId: PET.id,
    pet: { id: PET.id, name: PET.name },
    petsLoaded: true,
    petName: PET.name,
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

/** A vomiting count the strip will print — so a withheld line was there to leak. */
const VOMITING: TrialResponseCounts = {
  trialDayNumber: 23,
  trialCount: 3,
  baselineCount: 11,
  trialLoggedDays: 21,
  baselineLoggedDays: 30,
  baselineWindowDays: 49,
  densityComparable: true,
  trialLastEpisodeDayIndex: null,
};

const MOCHI_DAY_23: Rec = {
  target: 56,
  mealDays: Array.from({ length: 22 }, (_, i) => i + 1).filter((d) => d !== 11),
  treatDays: [17],
  extras: 2,
  nowDay: 23,
};

const REFUSING: Rec = {
  target: 56, mealDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rating: 'refused', nowDay: 10,
};

const DECLINE = 'Mochi has eaten less than usual for 2 days.';

/** The rundown's tiles for this page, in the shapes `buildRundown` emits. */
function rundown(tiles: RundownTile[] = TILES): Rundown {
  return {
    petName: 'Mochi',
    generatedAtMs: onDay(23, 20).getTime(),
    tiles,
    pastMedications: [],
    facts: { courses: [], medItemNames: new Map(), lastVisitAt: null, weighIns: [] },
  } as unknown as Rundown;
}

const TILES: RundownTile[] = [
  { key: 'weight', label: 'Weight', value: '41.2–42.0 lb', detail: '3 weigh-ins', tap: { kind: 'weight' } },
  { key: 'meds', label: 'Apoquel', value: 'Twice a day · last dose today', tap: { kind: 'medication', medicationId: 'm1' } },
  { key: 'meds', label: 'Cerenia', value: 'As needed · last dose Jul 20', tap: { kind: 'medication', medicationId: 'm2' } },
];

/** The screen's model as the SCREEN builds it (real facts) and as GET READY does. */
function bothModels(l: Loaded, input: TrialCardInput) {
  const screen = trialModel(buildTrialScreenModel(argsFor({ ...l, input })));
  const getReady = buildTrialScreenModel(argsFor({ ...l, input }, { facts: NO_LEDGER_FACTS }));
  return { screen, getReady };
}

function recheckFor(
  l: Loaded,
  input: TrialCardInput,
  over: Partial<Parameters<typeof buildTrialRecheck>[0]> = {},
): { screen: TrialScreenTrial; recheck: TrialRecheck | null } {
  const { screen, getReady } = bothModels(l, input);
  const recheck = buildTrialRecheck({
    screen: getReady,
    rundown: rundown(),
    weight: null,
    statedDeclines: [],
    // The facts read Get ready now makes (CUL-1342), answered, as production hands it over.
    facts: { status: 'ready', facts: l.facts },
    nowMs: l.nowMs,
    ...over,
  });
  return { screen, recheck };
}

const answersOf = (r: TrialRecheck, key: string) =>
  r.questions.find((q) => q.key === key)?.answers.map((a) => a.text) ?? null;

/** Every number in a string, in order: the unit the AC is about. */
const numbersIn = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

// ── The AC: every number equals the trial screen's ───────────────────────────

describe('every trial answer is the trial screen’s own line (§11 TS-8)', () => {
  const RECS: Array<[string, Rec]> = [
    ['day 23, a slip on day 17', MOCHI_DAY_23],
    ['day one', { target: 56, mealDays: [1], nowDay: 1 }],
    ['refusing', REFUSING],
    ['the milestone', { target: 56, mealDays: Array.from({ length: 56 }, (_, i) => i + 1), nowDay: 56 }],
    ['overrun', { target: 56, mealDays: Array.from({ length: 58 }, (_, i) => i + 1), nowDay: 58 }],
    ['free-fed', { target: 56, mealDays: [1, 2, 3], freeChoice: true, nowDay: 10 }],
    ['below the floor', { target: 56, mealDays: [1, 5], treatDays: [3], nowDay: 20 }],
  ];

  it.each(RECS)('%s: the facts, the qualifier, the safety lines and the vomiting line are the screen’s, word for word', async (_name, rec) => {
    const l = await load(rec);
    for (const trialResponse of [null, VOMITING]) {
      for (const intakeDeclineHeadline of [null, DECLINE]) {
        const input = { ...l.input, trialResponse, intakeDeclineHeadline };
        const { screen, recheck } = recheckFor(l, input);
        expect(recheck).not.toBeNull();

        // What the screen prints about the record, in the order the recheck walks it.
        const screenLines = [
          ...(screen.safety ?? []),
          ...screen.facts.map((f) => f.text),
          ...(screen.standingNote ? [`${screen.standingNote.title}. ${screen.standingNote.body}`] : []),
          ...(screen.qualifier ? [screen.qualifier] : []),
          ...(screen.vomiting ? [screen.vomiting] : []),
          ...(screen.forTheCall?.vomiting ? [screen.forTheCall.vomiting] : []),
        ];
        const trialAnswers = recheck!.questions
          .filter((q) => q.key === 'by_mouth' || q.key === 'eating' || q.key === 'symptoms')
          .flatMap((q) => q.answers.map((a) => a.text));

        // Nothing invented: every trial answer is a line the screen prints …
        for (const t of trialAnswers) expect(screenLines).toContain(t);
        // … and nothing the screen says about the record is dropped (the qualifier may
        // only drop with nothing to qualify, which the screen never produces with a fact).
        expect([...trialAnswers].sort()).toEqual([...screenLines].sort());
        // So the numbers are the screen's numbers.
        expect(trialAnswers.flatMap(numbersIn).sort()).toEqual(screenLines.flatMap(numbersIn).sort());
        // The header and sub-line are the screen's (the header is the strip's).
        expect(recheck!.title).toBe(screen.title);
        expect(recheck!.subline).toBe(screen.subline);
        // And the vomiting line is Home's field, null exactly when Home's is.
        expect(answersOf(recheck!, 'symptoms')).toEqual(
          resolveTrialStrip(input)?.trialResponseLine ? [resolveTrialStrip(input)!.trialResponseLine] : null,
        );
      }
    }
  });

  it('the Get ready read (no ledger facts) yields the same record lines as the screen’s read', async () => {
    // The one input the two builds differ in is the facts read, which the screen spends on
    // the ledger alone. Proven here rather than asserted in a comment (C-34).
    for (const [, rec] of RECS) {
      const l = await load(rec);
      const { screen, getReady } = bothModels(l, { ...l.input, trialResponse: VOMITING });
      const g = trialModel(getReady);
      expect(g.facts).toEqual(screen.facts);
      expect(g.safety).toEqual(screen.safety);
      expect(g.vomiting).toEqual(screen.vomiting);
      expect(g.qualifier).toEqual(screen.qualifier);
      expect(g.title).toEqual(screen.title);
      expect(g.ledger).toBeNull();
    }
    // Non-vacuity: the screen's read really does carry a ledger the Get ready read drops.
    const l = await load(MOCHI_DAY_23);
    expect(bothModels(l, l.input).screen.ledger).not.toBeNull();
  });
});

// ── The questions: Dr. Chen's, in his order ──────────────────────────────────

describe('the questions are the vet’s, in his order', () => {
  it('asks all five on a trial whose record answers all five', async () => {
    // A clean record (the teach line is placed on every state but `exposures`), mostly
    // unrated, so the record's honest answer to *is she eating it* is the teach line.
    const l = await load({ ...MOCHI_DAY_23, treatDays: [], rating: null, ratings: { 1: 'all' } });
    const { screen, recheck } = recheckFor(l, { ...l.input, trialResponse: VOMITING });
    expect(screen.facts.some((f) => f.role === 'teach')).toBe(true);
    expect(recheck!.questions.map((q) => q.key)).toEqual([
      'by_mouth', 'eating', 'symptoms', 'other_meds', 'weight',
    ]);
    expect(recheck!.questions.map((q) => q.question)).toEqual([
      'Has Mochi had anything besides the trial diet?',
      'Is Mochi eating the trial diet?',
      'What have Mochi’s symptoms done?',
      'What else is Mochi on?',
      'What does Mochi weigh?',
    ]);
    expect(RECHECK_QUESTION_ORDER).toEqual(['by_mouth', 'eating', 'symptoms', 'other_meds', 'weight']);
  });

  it('answers by mouth with the record region and the qualifier on its claim', async () => {
    const l = await load(MOCHI_DAY_23);
    const { recheck } = recheckFor(l, l.input);
    expect(answersOf(recheck!, 'by_mouth')).toEqual([
      'Meals logged on 21 of 23 days.',
      '22 feedings in total — 21 matched, 1 did not.',
      'That 1 is what’s been logged, not a total.',
      '6 days ago — Acme Chicken Jerky. Keep going with the trial diet. Your vet will want to see this at the recheck.',
      BLIND_SPOT_QUALIFIER,
    ]);
  });

  it('quotes the rundown’s own medication and weight tiles, label and all', async () => {
    const l = await load(MOCHI_DAY_23);
    const { recheck } = recheckFor(l, l.input);
    const meds = recheck!.questions.find((q) => q.key === 'other_meds')!.answers;
    expect(meds).toEqual([
      { text: 'Twice a day · last dose today', label: 'Apoquel', role: 'fact' },
      { text: 'As needed · last dose Jul 20', label: 'Cerenia', role: 'fact' },
    ]);
    expect(answersOf(recheck!, 'weight')).toEqual(['41.2–42.0 lb', '3 weigh-ins']);
  });

  it('quotes the past courses with their dates: the antiemetic the trial’s vomiting count cannot see past', async () => {
    // Adversarial pass: a dose-derived Cerenia course through the trial is never an active
    // regimen, so the first cut answered "None active" under a falling vomiting count.
    const l = await load(MOCHI_DAY_23);
    const r = rundown([
      { key: 'meds', label: 'Current meds', value: 'None active', tap: { kind: 'meds' }, empty: true },
    ]);
    const withPast = {
      ...r,
      pastMedications: [
        { key: 'meds_past', label: 'Cerenia', value: '9 doses · Jul 8 – Jul 22', detail: 'No end recorded', tap: null },
      ],
    } as unknown as Rundown;
    const { recheck } = recheckFor(l, { ...l.input, trialResponse: VOMITING }, { rundown: withPast });
    expect(recheck!.questions.find((q) => q.key === 'other_meds')!.answers).toEqual([
      { text: 'None active', label: null, role: 'fact' },
      { text: '9 doses · Jul 8 – Jul 22', label: 'Cerenia', role: 'fact' },
      { text: 'No end recorded', label: null, role: 'quiet' },
    ]);
  });

  it('quotes the rundown’s empty states as the rundown prints them', async () => {
    const l = await load(MOCHI_DAY_23);
    const { recheck } = recheckFor(l, l.input, {
      rundown: rundown([
        { key: 'weight', label: 'Weight', value: 'No weigh-ins logged', tap: { kind: 'weight' }, empty: true },
        { key: 'meds', label: 'Current meds', value: 'None active', tap: { kind: 'meds' }, empty: true },
      ]),
    });
    expect(recheck!.questions.find((q) => q.key === 'other_meds')!.answers).toEqual([
      { text: 'None active', label: null, role: 'fact' },
    ]);
    expect(answersOf(recheck!, 'weight')).toEqual(['No weigh-ins logged']);
  });

  it('folds Worth raising’s weight claim in when it fired (PM ruling D2)', async () => {
    const l = await load(MOCHI_DAY_23);
    const { recheck } = recheckFor(l, l.input, {
      weight: { text: 'Last weighed Jul 10 — before the last visit', detail: '41.2–42.0 lb · 3 weigh-ins' },
    });
    expect(answersOf(recheck!, 'weight')).toEqual([
      'Last weighed Jul 10 — before the last visit',
      '41.2–42.0 lb · 3 weigh-ins',
    ]);
  });
});

// ── The safety faces and the withholding ─────────────────────────────────────

describe('a pet that may not be eating', () => {
  it('a trial refusal with no vomit logged: the register answers *is she eating it*, and nothing about vomiting (D1)', async () => {
    const l = await load(REFUSING);
    const input = { ...l.input, trialResponse: { ...VOMITING, trialCount: 0 } };
    // Non-vacuity: the same counts over a pet that IS eating print a vomiting line.
    const eating = await load(MOCHI_DAY_23);
    expect(resolveTrialStrip({ ...eating.input, trialResponse: VOMITING })!.trialResponseLine).not.toBeNull();

    const { screen, recheck } = recheckFor(l, input);
    expect(screen.state).toBe('trial_refusal');
    expect(recheck!.isSafety).toBe(true);
    const eatingQ = recheck!.questions.find((q) => q.key === 'eating')!;
    expect(eatingQ.answers.map((a) => a.text)).toEqual(screen.safety);
    expect(eatingQ.answers.every((a) => a.role === 'flag')).toBe(true);
    // The heading is absent, not answered with a "none": the count is withheld, not zero.
    expect(recheck!.questions.map((q) => q.key)).not.toContain('symptoms');
    // By mouth is the screen's refusal record minus its ratio: on this record, nothing,
    // so the question is left out rather than answered with a floor-less "none".
    expect(recheck!.questions.map((q) => q.key)).toEqual(['eating', 'other_meds', 'weight']);
    // No coverage ratio over a refused bowl (S7), exactly as the screen withholds it.
    expect((answersOf(recheck!, 'by_mouth') ?? []).some((t) => t.startsWith('Meals logged on'))).toBe(false);
  });

  it('a trial refusal with vomiting logged quotes the screen’s *For the call* count, with its last date (T-4)', async () => {
    // The strip withholds its comparison over a pet that may not be eating; the screen's refusal
    // face still states the presence-only count. Get ready must not say less than the screen.
    const l = await load(REFUSING);
    const trialResponse = {
      ...VOMITING,
      trialDayNumber: 10,
      trialCount: 2,
      trialLastEpisodeDayIndex: localDayIndex(onDay(9).getTime()),
    };
    const input = { ...l.input, trialResponse };
    const { screen, recheck } = recheckFor(l, input);
    expect(screen.state).toBe('trial_refusal');
    expect(screen.vomiting).toBeNull();
    expect(screen.forTheCall?.vomiting).toBe("Vomiting logged: 2 in the trial's 10 days, the last on Jul 11");
    expect(answersOf(recheck!, 'symptoms')).toEqual([screen.forTheCall!.vomiting]);
    // Presence only: zero is never said.
    const zero = recheckFor(l, { ...input, trialResponse: { ...trialResponse, trialCount: 0 } }).recheck!;
    expect(zero.questions.map((q) => q.key)).not.toContain('symptoms');
  });

  it('an intake decline: the headline the list already leads with is not printed twice, the ask stays', async () => {
    const l = await load(MOCHI_DAY_23);
    const input = { ...l.input, intakeDeclineHeadline: DECLINE, trialResponse: VOMITING };
    const { screen, recheck } = recheckFor(l, input, { statedDeclines: [DECLINE] });
    expect(screen.safety![0]).toBe(DECLINE);
    expect(answersOf(recheck!, 'eating')).toEqual([screen.safety![1]]);
    expect(recheck!.isSafety).toBe(true);
    expect(recheck!.questions.map((q) => q.key)).not.toContain('symptoms');
    // And with nothing stated above it, the headline is kept (never dropped silently).
    const unstated = recheckFor(l, input).recheck!;
    expect(answersOf(unstated, 'eating')).toEqual(screen.safety);
  });

  it('a free-fed trial answers *is she eating it* with the bowl, never with a count of what was eaten', async () => {
    const l = await load({ target: 56, mealDays: [1, 2, 3], freeChoice: true, nowDay: 10 });
    const { screen, recheck } = recheckFor(l, l.input);
    expect(screen.state).toBe('free_fed');
    expect(answersOf(recheck!, 'eating')).toEqual([
      'Mochi grazes from a bowl that’s topped up, so there’s no day-by-day count of what was eaten.',
    ]);
    expect(recheck!.isSafety).toBe(false);
  });

  it('a record with nothing rated and no flag leaves *is she eating it* out (D1)', async () => {
    const l = await load(MOCHI_DAY_23);
    const { recheck } = recheckFor(l, l.input);
    expect(recheck!.questions.map((q) => q.key)).not.toContain('eating');
    expect(recheck!.isSafety).toBe(false);
  });
});

describe('an ended trial has no recheck row (PM ruling D3)', () => {
  it('completed and abandoned trials return null', async () => {
    for (const status of ['completed', 'abandoned'] as const) {
      const l = await load({ ...MOCHI_DAY_23, status, endedDay: 20, stoppedReason: status === 'abandoned' ? 'other' : null });
      const model = buildTrialScreenModel(argsFor(l, { facts: NO_LEDGER_FACTS }));
      expect(model.kind).toBe('trial');
      expect(
        buildTrialRecheck({
          screen: model, rundown: rundown(), weight: null, statedDeclines: [],
          facts: { status: 'ready', facts: l.facts }, nowMs: l.nowMs,
        }),
      ).toBeNull();
    }
  });

  it('no trial, an unreadable read and a loading read return null', () => {
    for (const screen of [
      { kind: 'no_trial', petName: 'Mochi' },
      { kind: 'unreadable', petName: 'Mochi' },
      { kind: 'loading' },
    ] as TrialScreenModel[]) {
      expect(
        buildTrialRecheck({
          screen, rundown: rundown(), weight: null, statedDeclines: [], facts: { status: 'unknown' }, nowMs: 0,
        }),
      ).toBeNull();
    }
  });
});

describe('the question copy', () => {
  it('names the pet and states no record fact', () => {
    for (const key of RECHECK_QUESTION_ORDER) {
      for (const chewables of [false, true]) {
        const q = recheckQuestion(key, 'Pixel', chewables);
        expect(q).toContain('Pixel');
        expect(q).not.toMatch(/\d/);
        expect(q).not.toContain('!');
        expect(q).not.toMatch(/\b(fussy|picky|prefers?|won’t|won't)\b/i);
      }
    }
    // Only the by-mouth question carries the chewable clause, and only when asked for.
    expect(recheckQuestion('by_mouth', 'Pixel', true)).toBe(
      'Has Pixel had anything besides the trial diet, chewable medicine included?',
    );
    expect(recheckQuestion('by_mouth', 'Pixel', false)).toBe('Has Pixel had anything besides the trial diet?');
    for (const key of RECHECK_QUESTION_ORDER.filter((k) => k !== 'by_mouth')) {
      expect(recheckQuestion(key, 'Pixel', true)).toBe(recheckQuestion(key, 'Pixel', false));
    }
  });
});

// ── CUL-1342: chewable and food-paired doses under *anything besides the trial diet* ──
//
// The oral-route lane (C3) is kept out of the feeding counts by design, so the card never
// states it and TS-8 shipped the by-mouth heading without its chewable clause. These drive
// the real loaders over doses in `readDoses`' row shape and hold the recheck's dose lines to
// the exposures screen's own "Given by mouth" rows for the same facts.

describe('the oral route under *anything besides the trial diet* (CUL-1342)', () => {
  const CHEWABLE_DAYS: Rec = {
    ...MOCHI_DAY_23,
    doses: [
      { day: 12, drug: 'Rimadyl', form: 'chewable' },
      { day: 19, drug: 'Rimadyl', form: 'chewable' },
    ],
  };

  /** The exposures screen's oral group for the same facts, as the recheck must quote it. */
  function screenDoseLines(l: Loaded): string[] {
    const model = buildTrialExposuresScreen(PET.name, l.facts, l.nowMs)!;
    const oral = model.groups.find((g) => g.title === TRIAL_EXPOSURES_GROUP_ORAL);
    return oral ? oral.rows.map((r) => `${r.label} · ${r.meta}`) : [];
  }

  const byMouth = (r: TrialRecheck) => r.questions.find((q) => q.key === 'by_mouth') ?? null;

  it('a logged chewable is named, as the exposures screen names it, and the heading asks for it', async () => {
    const l = await load(CHEWABLE_DAYS);
    const { recheck } = recheckFor(l, l.input);
    const q = byMouth(recheck!)!;
    expect(q.question).toBe('Has Mochi had anything besides the trial diet, chewable medicine included?');

    // The dose rows ARE the exposures screen's rows (label · date · tag), newest first.
    const doseLines = q.answers.filter((a) => a.label !== null).map((a) => `${a.label} · ${a.text}`);
    expect(screenDoseLines(l)).toHaveLength(2);
    expect(doseLines).toEqual(screenDoseLines(l));
    expect(doseLines[0]).toMatch(/^Rimadyl · Jul 21, .* · flavoured chewable$/);

    // The reason is `oralRouteCopy`, verbatim, ONCE for two doses of one drug (§6.8: keep
    // giving it, ask the vet about an unflavoured version; never "skip" or "stop").
    const reason = oralRouteCopy(l.facts!.oralRoute[0]).body;
    expect(q.answers.filter((a) => a.text === reason)).toEqual([{ text: reason, label: null, role: 'quiet' }]);
    expect(reason).toContain('Keep giving it exactly as prescribed');
    for (const a of q.answers) expect(a.text).not.toMatch(/\b(skip|stop|don’t give|don't give|hold)\b/i);

    // The food answer is untouched, the doses follow it, and the locked qualifier closes it.
    expect(q.answers.map((a) => a.text)).toEqual([
      'Meals logged on 21 of 23 days.',
      '22 feedings in total — 21 matched, 1 did not.',
      'That 1 is what’s been logged, not a total.',
      '6 days ago — Acme Chicken Jerky. Keep going with the trial diet. Your vet will want to see this at the recheck.',
      q.answers[4].text,
      q.answers[5].text,
      reason,
      BLIND_SPOT_QUALIFIER,
    ]);
  });

  it('a dose given inside an off-list food is named with the screen’s own tag', async () => {
    const l = await load({ ...MOCHI_DAY_23, doses: [{ day: 15, drug: 'Clavamox', form: 'tablet', vehicle: true }] });
    const q = byMouth(recheckFor(l, l.input).recheck!)!;
    expect(q.question).toContain('chewable medicine included');
    expect(q.answers.filter((a) => a.label !== null).map((a) => `${a.label} · ${a.text}`)).toEqual(screenDoseLines(l));
    expect(q.answers.find((a) => a.label === 'Clavamox')!.text).toMatch(/given inside food$/);
    expect(q.answers.map((a) => a.text)).toContain(
      'Clavamox was given inside food, so whatever it was hidden in counts too. Keep giving it exactly as ' +
        'prescribed — ask your vet whether there’s an unflavoured version to switch to.',
    );
  });

  it('none logged: the food-only heading and no dose line, never a "none" (G2, ruling D1)', async () => {
    // A plain tablet and a MISSED chewable: neither is an oral-route exposure (C3), so the
    // record answered and holds none. Non-vacuity: the same record with a given chewable
    // does carry the clause (the first test).
    const l = await load({
      ...MOCHI_DAY_23,
      doses: [
        { day: 12, drug: 'Apoquel', form: 'tablet' },
        { day: 14, drug: 'Rimadyl', form: 'chewable', adherence: 'missed' },
      ],
    });
    expect(l.facts!.oralRoute).toEqual([]);
    const { recheck } = recheckFor(l, l.input);
    const q = byMouth(recheck!)!;
    expect(q.question).toBe('Has Mochi had anything besides the trial diet?');
    expect(q.answers.every((a) => a.label === null)).toBe(true);
    const all = recheck!.questions.flatMap((x) => [x.question, ...x.answers.map((a) => a.text)]).join('\n');
    expect(all).not.toMatch(/chewable|by mouth|no medicine|none logged/i);
  });

  it('a read that has not answered lists nothing and keeps the food-only heading (C-12)', async () => {
    const l = await load(CHEWABLE_DAYS);
    expect(l.facts!.oralRoute).toHaveLength(2); // the doses were there to leak
    const states: TrialFactsState[] = [
      { status: 'unknown' },
      { status: 'unreadable' },
      { status: 'no_trial' },
      { status: 'ready', facts: null },
      // A read whose range could not be established: the exposures screen draws nothing either.
      { status: 'ready', facts: { ...l.facts!, range: null } },
    ];
    for (const facts of states) {
      const q = byMouth(recheckFor(l, l.input, { facts }).recheck!)!;
      expect(q.question).toBe('Has Mochi had anything besides the trial diet?');
      expect(q.answers.map((a) => a.text).join('\n')).not.toMatch(/Rimadyl|chewable/);
    }
  });

  it('over a trial refusal the doses still reach the vet, with the floor the card did not print', async () => {
    const l = await load({ ...REFUSING, doses: [{ day: 6, drug: 'Rimadyl', form: 'chewable' }] });
    const { screen, recheck } = recheckFor(l, l.input);
    expect(screen.state).toBe('trial_refusal');
    // Non-vacuity: the refusal face carries no record region and no qualifier of its own,
    // so before CUL-1342 there was no by-mouth question at all on this record.
    expect(screen.qualifier).toBeNull();
    const q = byMouth(recheck!)!;
    expect(q.question).toContain('chewable medicine included');
    expect(q.answers.map((a) => a.text)).toEqual([
      q.answers[0].text,
      oralRouteCopy(l.facts!.oralRoute[0]).body,
      BLIND_SPOT_QUALIFIER,
    ]);
    expect(q.answers[0].label).toBe('Rimadyl');
    // The refusal still makes this a safety row.
    expect(recheck!.isSafety).toBe(true);
  });

  it('two drugs keep two reasons; a daily chewable keeps one', async () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ day: i + 5, drug: 'Rimadyl', form: 'chewable' }));
    const l = await load({ ...MOCHI_DAY_23, doses: [...days, { day: 16, drug: 'Simparica', form: 'chewable' }] });
    const q = byMouth(recheckFor(l, l.input).recheck!)!;
    const reasons = q.answers.filter((a) => a.role === 'quiet' && a.text.includes('Keep giving it'));
    expect(reasons.map((a) => a.text.split(' ')[0])).toEqual(['Simparica', 'Rimadyl']);
    expect(q.answers.filter((a) => a.label !== null)).toHaveLength(11);
  });
});

describe('recheckFactsState: the second read is accepted only for the same trial', () => {
  const read = (id: string): TrialPredicateFacts =>
    ({ trial: { id }, stoppedForRefusal: false, facts: null }) as unknown as TrialPredicateFacts;

  it('maps each answer to the state it is, and a different trial to unreadable', () => {
    expect(recheckFactsState('unreadable', 't1')).toEqual({ status: 'unreadable' });
    expect(recheckFactsState(null, 't1')).toEqual({ status: 'no_trial' });
    expect(recheckFactsState(read('t1'), 't1')).toEqual({ status: 'ready', facts: null });
    // The trial ended or was replaced between the two reads: never one trial's doses under
    // another trial's heading, and never "none" either.
    expect(recheckFactsState(read('t2'), 't1')).toEqual({ status: 'unreadable' });
    expect(recheckFactsState(read('t1'), null)).toEqual({ status: 'unreadable' });
  });
});
