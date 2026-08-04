// The I/O half of the log-time trial flags: evaluateMealTrialFlag (contents,
// rung 2) and evaluateMealMembershipFlag (list, rung 3). The pure predicates and
// copy are exercised in trialContaminant.test.ts (which stubs the db to THROW, to
// prove the pure layer never touches it). THIS suite is the opposite: a working
// in-memory db so the evaluator spine — the B-595 `isTrialRunning` gate, the
// shared ledger, and the food-record read — is covered end to end.
//
// The headline assertion here is B-595's close: a stale-active trial (past its
// effective end) suppresses BOTH log-time flags at the moment of a log, while the
// standing surfaces (tested elsewhere) keep their input.
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
  evaluateMealTrialFlag,
  evaluateMealMembershipFlag,
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

/** A hydrated duck trial: one resolved primary_diet food, allowed from day 1. */
function seedDuckTrial(opts: { startedDaysAgo: number; targetDays: number }) {
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

describe('evaluateMealMembershipFlag — the rung-3 list heads-up, end to end', () => {
  it('fires on an off-list food during a running trial', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const flag = await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() });
    expect(flag).toEqual({ kind: 'off_trial_list', trialId: 'trial-1', foodId: 'dental-treats' });
  });

  it('routes an off-list food WITH an off-trial protein to the contents flag, never both', async () => {
    // Rung-2 precedence through the real I/O path: the chicken chew is rung 2, so
    // the contents evaluator fires and the membership one is silent.
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const membership = await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() });
    expect(membership).toBeNull();
    const contents = await evaluateMealTrialFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() });
    expect(contents?.kind).toBe('off_diet_protein');
  });

  it('is silent when the logged food has no cache row (nothing to classify)', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    expect(await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'ghost', occurredAt: NOW() })).toBeNull();
  });

  it('is silent when there is no active trial', async () => {
    // mockTrialRow stays null → loadTrialProteinContext returns null → both evaluators
    // go quiet. Nothing to be off the list of.
    expect(await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
    expect(await evaluateMealTrialFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() })).toBeNull();
  });
});

describe('B-595 — the isTrialRunning gate suppresses BOTH log-time flags on a stale trial', () => {
  it('a trial past its effective end says nothing at log time (membership)', async () => {
    // Started 400 days ago, 28-day target → effective end (target + 56d grace) is
    // ~317 days in the past. isTrialRunning is false, so the moment-of-log heads-up
    // is dropped (Principle 1 friction), even though the off-list food would
    // otherwise be a textbook rung-3 exposure.
    seedDuckTrial({ startedDaysAgo: 400, targetDays: 28 });
    expect(await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
  });

  it('the same gate suppresses the contents flag too — this is B-595 closing', async () => {
    // The whole point of doing both flags in one PR: the pre-existing rung-2 flag
    // was NOT gated, so it kept interrupting logs on a trial abandoned months ago.
    seedDuckTrial({ startedDaysAgo: 400, targetDays: 28 });
    expect(await evaluateMealTrialFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() })).toBeNull();
  });

  it('still fires while the trial is genuinely running (the gate is not always-off)', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    expect(await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).not.toBeNull();
  });
});

describe('the shared ledger — one heads-up per food per trial, across both kinds', () => {
  it('a membership flag already SHOWN does not fire again', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const first = await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() });
    expect(first).not.toBeNull();
    // The surface spends the budget on render.
    await noteTrialFlagShown(first!);
    expect(await hasFlaggedFoodInTrial('trial-1', 'dental-treats')).toBe(true);
    // The second log of the same food is quiet — repeats are not news (mock §3).
    expect(await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).toBeNull();
  });

  it('the budget is SHARED across kinds — a food told once stays quiet even after its rung flips', async () => {
    // The genuine shared-ledger path (not the trivial one, where the food would be
    // rung-2 on both calls anyway): the chicken chew fires the CONTENTS flag (rung
    // 2), the surface spends the budget, THEN the panel is re-read mid-trial and the
    // chicken drops out — so the same food now classifies rung 3 and would otherwise
    // raise the MEMBERSHIP flag. The kind-agnostic ledger suppresses it.
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    const contents = await evaluateMealTrialFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() });
    expect(contents?.kind).toBe('off_diet_protein');
    await noteTrialFlagShown(contents!);
    // Re-read: chicken gone → the chew is now rung-3-eligible. A FRESH food in that
    // exact state fires membership, proving the classification really flipped...
    mockFoodRows['chicken-chew'].proteins = null;
    mockFoodRows['fresh-unread'] = { brand: 'X', product_name: 'Y', proteins: null, ingredients_notes: null, ai_extraction_confidence: null };
    expect((await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'fresh-unread', occurredAt: NOW() }))?.kind).toBe('off_trial_list');
    // ...but the chew, already spoken for by the contents flag, stays quiet. The
    // LEDGER silences it, not the classification (which is now membership-eligible).
    expect(await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'chicken-chew', occurredAt: NOW() })).toBeNull();
  });

  it('does NOT spend the budget just by evaluating (the read/write split holds)', async () => {
    seedDuckTrial({ startedDaysAgo: 5, targetDays: 84 });
    await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() });
    // No noteTrialFlagShown call → the food can still fire.
    expect(await hasFlaggedFoodInTrial('trial-1', 'dental-treats')).toBe(false);
    expect(await evaluateMealMembershipFlag({ petId: 'p1', foodId: 'dental-treats', occurredAt: NOW() })).not.toBeNull();
  });
});

describe('foodIntakeKey sanity (the fixture keys match the real derivation)', () => {
  it('the logged food resolves the same case-folded key the app would', () => {
    // Guards the fixture: readFoodProteinRecord derives foodKey via foodIntakeKey,
    // so this is what the membership predicate sees for duplicate-capture matching.
    expect(foodIntakeKey('PetCo', 'Dental Treats')).toBe('petcodental treats');
  });
});
