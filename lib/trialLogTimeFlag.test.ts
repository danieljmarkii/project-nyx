// The I/O half of the log-time trial flag: evaluateMealLogTimeFlag — the B-693
// single-read composition that app/log.tsx and the FAB consume. It reads the
// trial context (TTL-cached) and the logged food's cache row ONCE, then composes
// the two pure predicates with rung-2 precedence, returning ONE of the two kinds:
// the CONTENTS flag (rung 2, a read panel names an off-trial protein) or the
// MEMBERSHIP flag (rung 3, the food simply isn't on the allowed list). The pure
// predicates and copy are exercised in trialContaminant.test.ts (which stubs the
// db to THROW, to prove the pure layer never touches it). THIS suite is the
// opposite: a working in-memory db so the evaluator spine — the B-595
// `isTrialRunning` gate, the shared ledger, and the food-record read — is covered
// end to end.
//
// The headline assertion here is B-595's close: a stale-active trial (past its
// effective end) suppresses the log-time flag whichever kind would have fired.
jest.mock('./supabase', () => ({ supabase: {} }));

// A controllable fake for the three reads the evaluator spine makes:
//   • getFirstAsync(ACTIVE_TRIAL_SQL)      → the active trial row
//   • getAllAsync(ALLOWED_SET_SQL)         → the allowed set, joined to the cache
//   • getFirstAsync(readFoodProteinRecord) → the LOGGED food's cache row
// Dispatched on the table each query names.
interface FakeTrialRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  target_duration_days: number;
}
interface FakeAllowedRow {
  food_item_id: string;
  role: string;
  food_label: string;
  allowed_from: string;
  allowed_until: string | null;
  brand: string | null;
  product_name: string | null;
  primary_protein: string | null;
  proteins: string | null;
  ingredients_notes: string | null;
  ai_extraction_confidence: string | null;
}
interface FakeFoodRow {
  brand: string;
  product_name: string;
  proteins: string | null;
  ingredients_notes: string | null;
  ai_extraction_confidence: string | null;
}

let mockTrialRow: FakeTrialRow | null = null;
let mockAllowedRows: FakeAllowedRow[] = [];
let mockFoodRows: Record<string, FakeFoodRow> = {};

jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: async (sql: string, params: unknown[]) => {
      if (sql.includes('food_items_cache')) return mockFoodRows[params[0] as string] ?? null;
      if (sql.includes('diet_trials')) return mockTrialRow;
      return null;
    },
    getAllAsync: async (sql: string) => (sql.includes('diet_trial_foods') ? mockAllowedRows : []),
  }),
}));

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  },
}));

import {
  evaluateMealLogTimeFlag,
  noteTrialFlagShown,
  hasFlaggedFoodInTrial,
  clearTrialContextCache,
  resetHeadsUpLedgerCache,
} from './trialContaminant';
import { foodIntakeKey } from './food';

// A DATE string ('YYYY-MM-DD') n days before today, built from LOCAL components so
// the fixture answers a local-day question in the runner's own zone (B-514 — never
// a UTC literal). `isTrialRunning`, the window, and membership all bucket locally,
// so a relative-to-now fixture is stable under the non-UTC CI matrix.
function localDateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A hydrated duck trial: one resolved primary_diet food, allowed from day 1.
 *  Returns the trial's start-day key so a test can assert the flag carries it. */
function seedDuckTrial(opts: { startedDaysAgo: number; targetDays: number }): { startedAt: string } {
  const startedAt = localDateDaysAgo(opts.startedDaysAgo);
  mockTrialRow = { id: 'trial-1', started_at: startedAt, ended_at: null, target_duration_days: opts.targetDays };
  mockAllowedRows = [
    {
      food_item_id: 'diet',
      role: 'primary_diet',
      food_label: 'Zignature Duck',
      allowed_from: startedAt,
      allowed_until: null,
      brand: 'Zignature',
      product_name: 'Duck Formula',
      primary_protein: 'duck',
      proteins: '["duck"]',
      ingredients_notes: 'duck, duck meal',
      ai_extraction_confidence: null,
    },
  ];
  // The two logged foods, neither on the allowed list:
  //   • dental-treats: no panel read      → rung 3 (membership)
  //   • chicken-chew:  chicken on a duck trial → rung 2 (contents)
  mockFoodRows = {
    'dental-treats': {
      brand: 'PetCo', product_name: 'Dental Treats',
      proteins: null, ingredients_notes: null, ai_extraction_confidence: null,
    },
    'chicken-chew': {
      brand: 'Acme', product_name: 'Chicken Chew',
      proteins: '["chicken"]', ingredients_notes: 'chicken', ai_extraction_confidence: null,
    },
  };
  return { startedAt };
}

const NOW = () => new Date().toISOString();

beforeEach(() => {
  mockStore.clear();
  resetHeadsUpLedgerCache();
  clearTrialContextCache();
  mockTrialRow = null;
  mockAllowedRows = [];
  mockFoodRows = {};
});

describe('evaluateMealLogTimeFlag — the single-read composition, end to end', () => {
  it('fires the MEMBERSHIP flag on an off-list food, carrying the trial day-math for the add sheet', async () => {
    // The dental treats the PM's dogfood found — never on the list, no panel read.
    // The flag now carries the trial's start + target so the completion card can
    // build the shipped AddTrialFoodSheet ("Joins the list · day N") without a
    // second trial read (B-693 PR 2).
    const { startedAt } = seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const flag = await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() });
    expect(flag).toEqual({
      kind: 'off_trial_list',
      trialId: 'trial-1',
      foodId: 'dental-treats',
      trialStartedAt: startedAt,
      trialTargetDurationDays: 84,
    });
  });

  it('fires the CONTENTS flag on an off-trial protein — rung-2 precedence, never both', async () => {
    // The chicken chew carries chicken on a duck trial: the composition returns the
    // CONTENTS flag and never the membership one — `??` short-circuits because
    // classifyFeeding routes it rung 2. One call, one flag, the right kind.
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const flag = await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() });
    expect(flag?.kind).toBe('off_diet_protein');
    // And it carries no membership schedule fields — it is a different shape.
    expect(Object.prototype.hasOwnProperty.call(flag, 'trialStartedAt')).toBe(false);
  });

  it('is silent when the logged food has no cache row (nothing to classify)', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'ghost', occurredAt: NOW() })).toBeNull();
  });

  it('is silent when there is no active trial (nothing to be off the list of)', async () => {
    // mockTrialRow stays null → loadTrialProteinContext returns null → the evaluator
    // goes quiet for either kind.
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() })).toBeNull();
  });
});

describe('B-595 — the isTrialRunning gate suppresses the log-time flag on a stale trial', () => {
  it('a trial past its effective end says nothing at log time — membership kind', async () => {
    // Started 400 days ago, 28-day target → effective end (target + 56d grace) is
    // ~317 days in the past. isTrialRunning is false, so the moment-of-log heads-up
    // is dropped (Principle 1 friction), even though the off-list food would
    // otherwise be a textbook rung-3 exposure.
    seedDuckTrial({ startedDaysAgo: 400, targetDays: 28 });
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
  });

  it('the same gate suppresses the contents kind too — this is B-595 closing', async () => {
    // The whole point of doing both flags in one gate: the pre-existing rung-2 flag
    // was NOT gated, so it kept interrupting logs on a trial abandoned months ago.
    seedDuckTrial({ startedDaysAgo: 400, targetDays: 28 });
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() })).toBeNull();
  });

  it('still fires while the trial is genuinely running (the gate is not always-off)', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).not.toBeNull();
  });
});

describe('the shared ledger — one heads-up per food per trial, across both kinds', () => {
  it('a membership flag already SHOWN does not fire again', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const first = await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() });
    expect(first).not.toBeNull();
    // The surface spends the budget on render.
    await noteTrialFlagShown(first!);
    expect(await hasFlaggedFoodInTrial('trial-1', 'dental-treats')).toBe(true);
    // The second log of the same food is quiet — repeats are not news (mock §3).
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
  });

  it('the budget is SHARED across kinds — a food told once stays quiet even after its rung flips', async () => {
    // The genuine shared-ledger path (not the trivial one, where the food would be
    // rung-2 on both calls anyway): the chicken chew fires the CONTENTS flag (rung
    // 2), the surface spends the budget, THEN the panel is re-read mid-trial and the
    // chicken drops out — so the same food now classifies rung 3 and would otherwise
    // raise the MEMBERSHIP flag. The kind-agnostic ledger suppresses it.
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const contents = await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() });
    expect(contents?.kind).toBe('off_diet_protein');
    await noteTrialFlagShown(contents!);
    // Re-read: chicken gone → the chew is now rung-3-eligible. A FRESH food in that
    // exact state fires membership, proving the classification really flipped...
    mockFoodRows['chicken-chew'].proteins = null;
    mockFoodRows['fresh-unread'] = { brand: 'X', product_name: 'Y', proteins: null, ingredients_notes: null, ai_extraction_confidence: null };
    expect((await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'fresh-unread', occurredAt: NOW() }))?.kind).toBe('off_trial_list');
    // ...but the chew, already spoken for by the contents flag, stays quiet. The
    // LEDGER silences it, not the classification (which is now membership-eligible).
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() })).toBeNull();
  });

  it('does NOT spend the budget just by evaluating (the read/write split holds)', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() });
    // No noteTrialFlagShown call → the food can still fire.
    expect(await hasFlaggedFoodInTrial('trial-1', 'dental-treats')).toBe(false);
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).not.toBeNull();
  });
});

// ── The six silence states (mock §4), verified END TO END through the spine ──────
//
// The PR-3 copy/safety matrix. The pure predicate (foodMembershipFlag) is
// unit-tested per state in trialContaminant.test.ts; the completion card's own
// silence is in MealCompletionCard.test.tsx. This block drives the same six through
// the REAL composition + I/O spine (evaluateMealLogTimeFlag), because three of them —
// ② unhydrated, ③ out-of-window, ⑤ permitted — were only ever covered at the pure
// level, so a spine that bypassed the predicate's guard would still have passed.
// ①/④/⑥ re-assert tersely here what the dedicated blocks above prove in depth, so
// the §4 checklist reads in one place (this is the artifact QA verifies against).
//
// "Nothing anywhere reassures" is the shape of these rows: a silence state returns
// the LITERAL absence of a flag (null), so there is no object and no field that
// could carry an all-clear. The complementary guarantee — that the copy which DOES
// fire never reassures — is pinned per-string in trialContaminant.test.ts
// (membershipFlagCopy: "NEVER says off-diet, contaminant, or any all-clear"; and
// mealFlagCopy's own no-reassure test). There is no seventh "this food is fine" path
// to test, by construction.
describe('the six silence states (mock §4) — end to end through the spine', () => {
  // ① dedicated depth: 'is silent when there is no active trial' + the B-595 block.
  it('① no running trial — no active row, and a stale-active trial past its effective end', async () => {
    // (a) no trial at all → loadTrialProteinContext returns null.
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
    // (b) stale-active — target + 56d grace elapsed, isTrialRunning false (B-595). A
    //     trial the owner never ended says nothing at the moment of a log.
    seedDuckTrial({ startedDaysAgo: 400, targetDays: 28 });
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
  });

  it('② trial list not loaded yet — an unhydrated allowed set never reads as empty', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    // The primary-diet cache row has not landed: brand + product_name both null, so
    // primaryResolved (0) < primaryCount (1) → allowedSetHydrated is false. Mid-sync,
    // EVERY food (the prescribed diet included) looks absent, so the flag must stay
    // quiet. Without the guard, membership would fire here — this is the P2 direction.
    mockAllowedRows[0].brand = null;
    mockAllowedRows[0].product_name = null;
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
  });

  it('③ feeding outside the trial window — a backfilled pre-trial meal says nothing', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    // occurredAt is 30 local days ago, before a trial that started 5 days ago →
    // classifyFeeding returns out_of_window. Built from LOCAL components (B-514): the
    // window buckets on local midnight, so a UTC literal would drift by the offset.
    const before = new Date();
    before.setDate(before.getDate() - 30);
    before.setHours(12, 0, 0, 0);
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: before.toISOString() })).toBeNull();
  });

  // ④ dedicated depth: 'fires the CONTENTS flag on an off-trial protein'. The
  //   membership flag's "silence" here is that the CONTENTS flag took the feeding.
  it('④ rung-2 precedence — a panel-read protein conflict fires CONTENTS, membership stays silent', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const flag = await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() });
    // Never both: classifyFeeding returns one verdict, so the off-trial protein routes
    // rung 2 and the membership flag never fires for this feeding.
    expect(flag?.kind).toBe('off_diet_protein');
    expect(flag?.kind).not.toBe('off_trial_list');
  });

  it('⑤ on the list (permitted) — a permitted food is never praised (G2)', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    // A vet-approved rabbit jerky ON the list, with a hydrated cache row. classifyFeeding
    // returns rung 1 (permitted), which pre-empts both contents and membership → total
    // silence. Absence of a flag is never a verdict — a permitted food is not affirmed.
    mockAllowedRows.push({
      food_item_id: 'jerky', role: 'permitted_treat', food_label: 'Rabbit Jerky',
      allowed_from: mockTrialRow!.started_at, allowed_until: null,
      brand: 'Ziwi', product_name: 'Rabbit', primary_protein: 'rabbit',
      proteins: '["rabbit"]', ingredients_notes: 'rabbit', ai_extraction_confidence: null,
    });
    mockFoodRows['jerky'] = {
      brand: 'Ziwi', product_name: 'Rabbit',
      proteins: '["rabbit"]', ingredients_notes: 'rabbit', ai_extraction_confidence: null,
    };
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'jerky', occurredAt: NOW() })).toBeNull();
  });

  // ⑥ dedicated depth: 'a membership flag already SHOWN does not fire again'.
  it('⑥ already told this trial — the shared ledger spends once per food per trial', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const first = await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() });
    expect(first).not.toBeNull();
    await noteTrialFlagShown(first!); // the surface spends the budget on render
    expect(await evaluateMealLogTimeFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
  });
});

describe('foodIntakeKey sanity (the fixture keys match the real derivation)', () => {
  it('the logged food resolves the same case-folded key the app would', () => {
    // Guards the fixture: readFoodProteinRecord derives foodKey via foodIntakeKey,
    // so this is what the membership predicate sees for duplicate-capture matching.
    // The separator is the 0x1F unit-separator (lib/food.ts) — built with
    // fromCharCode so an invisible literal can never be silently dropped from source.
    const SEP = String.fromCharCode(0x1f);
    expect(foodIntakeKey('PetCo', 'Dental Treats')).toBe(`petco${SEP}dental treats`);
  });
});
