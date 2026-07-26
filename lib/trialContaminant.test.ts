// The pure predicate + copy layer of the trial-contaminant check. lib/supabase
// fail-fasts on missing env and lib/db pulls expo-sqlite, so both are stubbed —
// the functions under test here take their facts as arguments precisely so the
// decision logic can be exercised without either. (The I/O half —
// loadTrialProteinContext / evaluateMealTrialFlag — is a thin assembly over these
// and is covered by the on-device QA script.)
//
// RE-BASED BY B-417 PR 5. The predicate itself now lives in `lib/dietTrial.ts`
// and is tested there; what is exercised here is this module's own layer — the
// context shape, the ledger, and the copy — plus the behaviours the re-base was
// supposed to preserve. Every assertion below that survived a shape change kept
// its original comment, because the defect it pins is unchanged.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./db', () => ({ getDb: () => { throw new Error('no db in this suite'); } }));

// The rule-3 ledger IS testable without a device — it is AsyncStorage, which the
// project already mocks elsewhere. An in-memory stub keeps the assertions about
// behaviour (what gets suppressed) rather than about storage.
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
  offTrialProteins,
  resolveTargetProtein,
  trialTargetLine,
  hasFlaggedFoodInTrial,
  recordFlaggedFoodInTrial,
  noteTrialFlagShown,
  clearTrialHeadsUpLedger,
  resetHeadsUpLedgerCache,
  trialFoodContaminants,
  foodContaminantFlag,
  trialDietNote,
  sanctionedProteinsForTrial,
  proteinList,
  mealFlagCopy,
  addFlagCopy,
  standingFlagCopy,
  localMidnightMs,
  type TrialContaminantFlag,
  type TrialProteinContext,
} from './trialContaminant';
import type { AllowedFood } from './dietTrial';

// A duck elimination trial on "Zignature Duck", whose own panel WAS read and
// lists only duck — the clean baseline every other case perturbs. The start date
// is deliberately well in the past: membership and the trial window both resolve
// against the wall clock on the log-time path, and a fixture that only works in
// one month is a test that fails later for no reason.
const TRIAL_FOOD: AllowedFood = {
  foodItemId: 'trial-food',
  foodKey: 'zignature\u001Fduck formula',
  label: 'Zignature Duck',
  role: 'primary_diet',
  allowedFrom: '2020-01-01',
  allowedUntil: null,
  primaryProtein: 'duck',
  proteins: ['duck'],
};

function ctx(
  over: Partial<TrialProteinContext> = {},
  /** Perturb the TRIAL FOOD itself — the shape-① cases. */
  trialFood: Partial<AllowedFood> = {},
): TrialProteinContext {
  return {
    trialId: 't1',
    petId: 'p1',
    startedAtMs: new Date(2020, 0, 1).getTime(),
    spec: { id: 't1', startedAt: '2020-01-01' },
    allowedFoods: [{ ...TRIAL_FOOD, ...trialFood }],
    trialFoodLabel: 'Zignature Duck',
    primaryCount: 1,
    primaryResolved: 1,
    trialFoodCompleteness: { complete: true, provenance: 'panel_read' },
    ...over,
  };
}

/** A trial whose diet is unknown — the state that disables every check. */
const UNKNOWN_DIET = () => ctx({}, { primaryProtein: null, proteins: [] });

function flag(over: Partial<TrialContaminantFlag> = {}): TrialContaminantFlag {
  return { proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'f1', ...over };
}

describe('offTrialProteins', () => {
  it('names every protein that is not the trial target, in prominence order', () => {
    expect(offTrialProteins(['duck', 'chicken', 'salmon'], 'duck')).toEqual(['chicken', 'salmon']);
  });

  it('is silent for a food that is only the target protein', () => {
    expect(offTrialProteins(['duck'], 'duck')).toEqual([]);
  });

  it('is silent when the target is unknown — never "everything is off-trial"', () => {
    // The inversion this guards: with a null target, a naive difference would
    // report the trial diet's OWN protein as the contaminant.
    expect(offTrialProteins(['duck', 'chicken'], null)).toEqual([]);
  });

  it('is silent on an empty set — an unknown set is not a clean one', () => {
    expect(offTrialProteins([], 'duck')).toEqual([]);
  });

  it('canonicalizes and dedupes before comparing (Class-A artifacts do not fake a flag)', () => {
    // 'Duck By-Product Meal' is the SAME exposure as the trial's duck; keying it
    // raw would report the trial food's own protein as a contaminant.
    expect(offTrialProteins(['Duck By-Product Meal', 'Chicken Meal', 'chicken'], 'duck'))
      .toEqual(['chicken']);
  });

  it('keeps B-411\'s two unresolved terms distinct rather than guessing', () => {
    // `poultry` is NOT folded into chicken (it may be chicken or turkey), and
    // `chicken fat` is NOT folded into chicken (that would invent a protein
    // exposure). Under the "everything but the target" model both still surface,
    // so the under-claim costs precision in the copy, never a missed flag.
    expect(offTrialProteins(['poultry'], 'duck')).toEqual(['poultry']);
    expect(offTrialProteins(['chicken fat'], 'duck')).toEqual(['chicken fat']);
    // …and the mirror case: a poultry-labelled trial is not silently satisfied
    // by a chicken food.
    expect(offTrialProteins(['chicken'], 'poultry')).toEqual(['chicken']);
  });
});

describe('resolveTargetProtein', () => {
  it('reads the owner-designated primary, canonicalized', () => {
    expect(resolveTargetProtein('Duck')).toBe('duck');
    expect(resolveTargetProtein('Duck By-Product Meal')).toBe('duck');
  });

  it('is null for a cleared / junk / missing designation', () => {
    // Slice 3 writes a NULL primary when the owner CLEARS the main protein and
    // demotes it into the tail. Falling back to proteins[0] there would
    // resurrect the cleared designation and invert the whole check.
    expect(resolveTargetProtein(null)).toBeNull();
    expect(resolveTargetProtein('null')).toBeNull();
    expect(resolveTargetProtein('  ')).toBeNull();
  });
});

// ── The re-base: the trial diet is N foods, not one ──────────────────────────
describe('the sanctioned set is the union over every primary_diet food (B-453)', () => {
  it('a two-food trial sanctions BOTH foods\' proteins', () => {
    // The defect the stopgap existed to avoid, now fixed rather than muted: on a
    // wet+dry trial the single-column derivation computed the set from ONE food
    // and flagged the legitimately-allowed second trial food as a contaminant.
    const twoFood = ctx({
      allowedFoods: [
        TRIAL_FOOD,
        { ...TRIAL_FOOD, foodItemId: 'wet', foodKey: 'zignature\u001Fduck wet', primaryProtein: 'duck', proteins: ['duck', 'salmon'] },
      ],
      primaryCount: 2,
      primaryResolved: 2,
    });
    expect(sanctionedProteinsForTrial(twoFood).sort()).toEqual(['duck', 'salmon']);
    // …and the second trial food is silent, which is the whole point.
    expect(foodContaminantFlag(twoFood, 'wet', ['duck', 'salmon'])).toBeNull();
  });

  it('a permitted extra never widens the sanctioned set (D-A)', () => {
    const withTreat = ctx({
      allowedFoods: [
        TRIAL_FOOD,
        { ...TRIAL_FOOD, foodItemId: 'jerky', foodKey: 'brand\u001Frabbit jerky', role: 'permitted_treat', primaryProtein: 'rabbit', proteins: ['rabbit', 'chicken'] },
      ],
    });
    expect(sanctionedProteinsForTrial(withTreat)).toEqual(['duck']);
    // A DIFFERENT chicken food still flags, even though a permitted treat has it.
    expect(foodContaminantFlag(withTreat, 'other', ['chicken'])?.proteins).toEqual(['chicken']);
  });

  it('the permitted extra itself is silent at log time (§6.9)', () => {
    // Rung 1 stops it. Flagging a food the vet TOLD the owner to give scores the
    // owner for following instructions; D-B records the antigen for the report
    // instead, which is `lib/dietTrial.ts`'s job and tested there.
    const withTreat = ctx({
      allowedFoods: [
        TRIAL_FOOD,
        { ...TRIAL_FOOD, foodItemId: 'jerky', foodKey: 'brand\u001Frabbit jerky', role: 'permitted_treat', primaryProtein: 'rabbit', proteins: ['rabbit', 'chicken'] },
      ],
    });
    expect(foodContaminantFlag(withTreat, 'jerky', ['rabbit', 'chicken'])).toBeNull();
  });
});

describe('foodContaminantFlag — shape ② (a food that is not on the allowed list)', () => {
  it('flags an off-trial protein in a different food', () => {
    expect(foodContaminantFlag(ctx(), 'other-food', ['chicken'])).toEqual({
      proteins: ['chicken'],
      trialProteins: ['duck'],
      trialId: 't1',
      foodId: 'other-food',
    });
  });

  it('NEVER flags the trial diet itself — that is a trial-level standing fact', () => {
    // B-417 C2, PM-ratified: a per-feeding flag on the prescribed food fires
    // 100+ times across a 56-day trial. The fact still surfaces, on the trial
    // card (trialDietNote) and the food's own detail screen.
    expect(foodContaminantFlag(ctx({}, { proteins: ['duck', 'chicken'] }), 'trial-food',
      ['duck', 'chicken'])).toBeNull();
  });

  it('is silent with no context, no known trial diet, or nothing off-trial', () => {
    expect(foodContaminantFlag(null, 'other-food', ['chicken'])).toBeNull();
    expect(foodContaminantFlag(UNKNOWN_DIET(), 'other-food', ['chicken'])).toBeNull();
    expect(foodContaminantFlag(ctx(), 'other-food', ['duck'])).toBeNull();
  });

  it('is silent — never an all-clear — for a food whose proteins are unknown', () => {
    // The D10 presence-only rule: an unread panel yields silence plus the Tier-1
    // disclosure caveat, never "nothing off-trial in this one".
    expect(foodContaminantFlag(ctx(), 'other-food', [])).toBeNull();
  });

  it('is silent for a meal fed before the trial began', () => {
    // The window check moved INSIDE the predicate at the re-base, so this pins
    // that it did not get lost on the way.
    expect(foodContaminantFlag(ctx(), 'other-food', ['chicken'], null, '2019-06-01T12:00:00Z'))
      .toBeNull();
  });
});

describe('trialFoodContaminants — shape ① (the allowed list itself)', () => {
  it('finds the chicken hiding in a "duck" formula', () => {
    expect(trialFoodContaminants(ctx({}, { proteins: ['duck', 'chicken'] })))
      .toEqual(['chicken']);
  });

  it('finds nothing in a genuinely single-protein trial diet', () => {
    expect(trialFoodContaminants(ctx())).toEqual([]);
  });

  it('D-A — also covers a contaminated PERMITTED extra', () => {
    // The vet-approved rabbit jerky that also lists chicken fat is exactly as
    // trial-invalidating as a contaminated primary diet, and less likely to be
    // noticed.
    const withTreat = ctx({
      allowedFoods: [
        TRIAL_FOOD,
        { ...TRIAL_FOOD, foodItemId: 'jerky', role: 'permitted_treat', primaryProtein: 'rabbit', proteins: ['rabbit', 'chicken'] },
      ],
    });
    expect(trialFoodContaminants(withTreat)).toEqual(['chicken']);
  });
});

describe('trialDietNote — the trial card standing note', () => {
  it('names the contaminant when the trial diet carries one', () => {
    const note = trialDietNote(ctx({}, { proteins: ['duck', 'chicken'] }));
    expect(note?.title).toBe('The trial food also lists chicken');
    expect(note?.body).toContain('clean answer');
  });

  it('says the panel was not read rather than implying a clean trial diet', () => {
    // The reassurance-on-absence case D10 exists for, on the one food this pet
    // eats every day for eight weeks.
    const note = trialDietNote(ctx({
      trialFoodCompleteness: { complete: false, provenance: 'no_panel_text' },
    }));
    expect(note?.title).toContain('ingredients haven’t been read');
    expect(note?.body).toContain('unknown');
  });

  it('is silent only when the panel WAS read and really is single-protein', () => {
    expect(trialDietNote(ctx())).toBeNull();
  });

  it('does NOT go silent when the trial diet is unknown — see B9 below', () => {
    // An unknown diet disables every check in the module. Returning null here
    // gave the MOST unknown state the LEAST disclosure; it now says so.
    expect(trialDietNote(UNKNOWN_DIET())).not.toBeNull();
  });

  it('never emits a reassuring string in any state', () => {
    const states: TrialProteinContext[] = [
      ctx(),
      ctx({}, { proteins: ['duck', 'chicken'] }),
      ctx({ trialFoodCompleteness: { complete: false, provenance: 'low_confidence' } }),
      UNKNOWN_DIET(),
      ctx({ primaryCount: 0, primaryResolved: 0, allowedFoods: [] }),
    ];
    for (const s of states) {
      const note = trialDietNote(s);
      if (!note) continue;
      const text = `${note.title} ${note.body}`.toLowerCase();
      for (const banned of ['all clear', 'no other proteins', 'nothing else', 'looks clean', 'is clean', 'you’re fine']) {
        expect(text).not.toContain(banned);
      }
    }
  });
});

describe('copy', () => {
  it('lists one, two and three proteins readably', () => {
    expect(proteinList(['chicken'])).toBe('chicken');
    expect(proteinList(['chicken', 'salmon'])).toBe('chicken and salmon');
    expect(proteinList(['chicken', 'salmon', 'beef'])).toBe('chicken, salmon and beef');
  });

  it('the log-time heads-up reports a saved meal and never asks anything', () => {
    const copy = mealFlagCopy(flag(), 'Mochi');
    expect(copy.headline).toBe('This one has chicken.');
    expect(copy.detail).toContain('Mochi’s duck trial should skip chicken');
    // Principle 1 — the log is already done; nothing here is a question or a gate.
    expect(copy.detail).toContain('The meal’s saved');
    expect(`${copy.headline}${copy.detail}`).not.toMatch(/\?|are you sure|log anyway|!/i);
  });

  it('names EVERY trial protein on a multi-food trial, never just the first', () => {
    // Naming one protein of a two-protein trial told the owner the other was a
    // contaminant — the single-food projection surfacing in the copy layer.
    const copy = mealFlagCopy(flag({ trialProteins: ['duck', 'salmon'] }), 'Mochi');
    expect(copy.detail).toContain('Mochi’s duck and salmon trial');
  });

  it('the add-time confirm does not assert a trial TYPE we were never told', () => {
    // The mock read "elimination trial"; nothing in the schema records a diet
    // CLASS, so claiming one would be a fabricated clinical detail.
    const copy = addFlagCopy(flag(), 'Mochi');
    expect(copy.title).toBe('Heads up — this food lists chicken');
    expect(copy.body).toContain('Mochi’s trial diet is duck');
    expect(copy.body).not.toMatch(/elimination|hydrolysed|hydrolyzed/i);
    expect(copy.body).toContain('vet');
  });

  it('the standing note names the food\'s property, not an event', () => {
    const copy = standingFlagCopy(flag({ proteins: ['chicken', 'salmon'] }), 'Mochi');
    expect(copy.title).toBe('Off Mochi’s trial diet');
    expect(copy.body).toContain('chicken and salmon');
  });

  it('no owner-facing string carries an exclamation mark (nyx-voice)', () => {
    const all = [
      ...Object.values(mealFlagCopy(flag(), 'Mochi')),
      ...Object.values(addFlagCopy(flag(), 'Mochi')),
      ...Object.values(standingFlagCopy(flag(), 'Mochi')),
      ...Object.values(trialDietNote(ctx({}, { proteins: ['duck', 'chicken'] })) ?? {}),
    ];
    for (const s of all) expect(s).not.toContain('!');
  });
});

describe('localMidnightMs', () => {
  it('reads a DATE column as the owner\'s calendar day, not a UTC instant', () => {
    // diet_trials.started_at is a DATE. Parsing it as UTC midnight would exclude
    // the start-day breakfast of every owner east of Greenwich.
    expect(localMidnightMs('2026-07-01')).toBe(new Date(2026, 6, 1).getTime());
    expect(localMidnightMs('2026-07-01T00:00:00Z')).toBe(new Date(2026, 6, 1).getTime());
  });

  it('is NaN for an unparseable value, which disables the window check', () => {
    expect(Number.isNaN(localMidnightMs(''))).toBe(true);
  });
});


// ── Rule 3's ledger (B1 + B3 — the adversarial pass's top two breaks) ─────────
//
// The gate used to count MEALS of the food inside the trial window. Both cases
// below silently muted the feature outright under that design; both are correct
// by construction once the gate counts heads-ups GIVEN.
describe('heads-up ledger — one per food per trial, counted in heads-ups given', () => {
  beforeEach(async () => {
    mockStore.clear();
    resetHeadsUpLedgerCache();
  });

  it('suppresses only after a heads-up was actually shown', async () => {
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(false);
    await recordFlaggedFoodInTrial('t1', 'chew');
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(true);
  });

  it('B1 — a SUPPRESSED meal does not consume the budget', async () => {
    // Owner logs the chicken chew on the subway: no trial context, so
    // evaluateMealTrialFlag returns null and records nothing. An hour later, on
    // wifi, the same chew is logged again. Under the old meal-count gate the
    // count was 2 and the food was never flagged for the rest of a 56-day trial.
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(false);
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(false);
    await recordFlaggedFoodInTrial('t1', 'chew');
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(true);
  });

  it('B3 — meals fed BEFORE the trial was entered do not consume the budget', async () => {
    // The normal vet-directed setup: visit Monday, trial entered Thursday with
    // started_at back-dated. Foods fed Mon–Wed already have in-window meals, so
    // the meal-count gate was dead on arrival for exactly the foods most likely
    // to be contaminating the trial. The ledger knows nothing about meals.
    expect(await hasFlaggedFoodInTrial('trial-entered-late', 'chew')).toBe(false);
  });

  it('a NEW trial re-opens every food — the ledger is keyed by trial', async () => {
    // A chicken treat that was fine under a salmon trial is news again under a
    // duck one.
    await recordFlaggedFoodInTrial('salmon-trial', 'chicken-treat');
    expect(await hasFlaggedFoodInTrial('duck-trial', 'chicken-treat')).toBe(false);
  });

  it('survives a restart (the in-memory mirror is a cache, not the record)', async () => {
    await recordFlaggedFoodInTrial('t1', 'chew');
    resetHeadsUpLedgerCache();
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(true);
  });

  it('degrades a corrupt ledger toward SHOWING, never suppressing', async () => {
    mockStore.set('nyx.trialHeadsUp.v1', 'not json');
    resetHeadsUpLedgerCache();
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(false);
    mockStore.set('nyx.trialHeadsUp.v1', '["an","array"]');
    resetHeadsUpLedgerCache();
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(false);
  });

  it('is wiped on sign-out — it is per-account bookkeeping', async () => {
    await recordFlaggedFoodInTrial('t1', 'chew');
    await clearTrialHeadsUpLedger();
    expect(await hasFlaggedFoodInTrial('t1', 'chew')).toBe(false);
  });
});

// ── B7 — the duplicate capture of the trial diet ─────────────────────────────
describe('rung 1 survives a duplicate capture of the trial food', () => {
  it('excludes a re-photographed bag of the trial diet by brand+product', () => {
    // food-capture mints a fresh uuid every time, so re-photographing the trial
    // diet (to finally capture its ingredient panel) creates a row whose id is
    // not the allowed row's. An id-only match turned the trial diet's own
    // contamination into exactly the per-feeding verdict C2 forbids.
    // The live scenario: the allowed row knows the trial diet as duck only,
    // because nobody had read its panel when the trial was set up. The owner
    // re-photographs the bag, the panel finally reads, and the new capture lists
    // chicken as well — so without the key match this flags the PRESCRIBED food
    // as a contaminant on a 100%-compliant owner.
    const c = ctx();
    expect(foodContaminantFlag(c, 'a-fresh-uuid', ['duck', 'chicken'])).not.toBeNull();
    expect(foodContaminantFlag(c, 'a-fresh-uuid', ['duck', 'chicken'], TRIAL_FOOD.foodKey))
      .toBeNull();
  });

  it('still flags a genuinely different food that happens to be captured twice', () => {
    expect(foodContaminantFlag(ctx(), 'other', ['chicken'], 'purina\u001Fone chicken'))
      .toEqual({ proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'other' });
  });
});

// ── B9 / B8 — the most-unknown state must not get the least disclosure ───────
describe('an unknown trial diet discloses that the check is off', () => {
  it('B9 — says so rather than going silent', () => {
    const note = trialDietNote(UNKNOWN_DIET());
    expect(note).not.toBeNull();
    expect(note?.title).toContain('can’t tell');
    expect(note?.body).toContain('no main protein set');
  });

  it('B8 — the trial card names the trial protein, and claims NO coverage', () => {
    // "Checking other foods against duck" was the first cut, and the second
    // adversarial pass broke it: the check only sees foods with a captured
    // protein set — a small minority of a real library — so the line advertised
    // surveillance that mostly does not happen, turning rule 1's silence into an
    // implied "nothing conflicts". Naming the protein carries the same B8
    // disclosure and asserts nothing about what is being watched.
    expect(trialTargetLine(ctx())).toBe('Trial protein · Duck');
    expect(trialTargetLine(ctx())).not.toMatch(/check|watch|monitor|scan/i);
    expect(trialTargetLine(UNKNOWN_DIET())).toBeNull();
  });

  it('B8 — pluralises rather than dropping the second trial protein', () => {
    const twoFood = ctx({
      allowedFoods: [TRIAL_FOOD, { ...TRIAL_FOOD, foodItemId: 'wet', primaryProtein: 'salmon', proteins: ['salmon'] }],
      primaryCount: 2,
      primaryResolved: 2,
    });
    expect(trialTargetLine(twoFood)).toBe('Trial proteins · Duck and salmon');
  });

  it('B9 — distinguishes "no protein designated" from "we never read the food"', () => {
    // Collapsing these asserted "the trial food has no main protein set" about a
    // food the app had never loaded — an unproven claim about the record, on a
    // clinical surface.
    const unread = trialDietNote(ctx({ primaryCount: 1, primaryResolved: 0 }, { primaryProtein: null, proteins: [] }));
    expect(unread?.title).toContain('can’t check other foods');
    expect(unread?.body).toContain('hasn’t loaded');

    const noFood = trialDietNote(ctx({ allowedFoods: [], primaryCount: 0, primaryResolved: 0 }));
    expect(noFood?.body).toContain('no food attached');

    const designatedNone = trialDietNote(UNKNOWN_DIET());
    expect(designatedNone?.body).toContain('no main protein set');
  });
});


// ── Round-2 adversarial regressions ──────────────────────────────────────────

describe('rule 3 spends its budget only on a heads-up that was SHOWN', () => {
  beforeEach(async () => { mockStore.clear(); resetHeadsUpLedgerCache(); });

  it('the evaluator does NOT write the ledger — only noteTrialFlagShown does', async () => {
    // The round-2 break, reproduced by the reviewer: the evaluator recorded, and
    // it was wrapped in a 1200ms Promise.race so a slow cold evaluation could not
    // delay the card. A JS promise is not cancellable, so the ABANDONED inner
    // still computed the flag and wrote the ledger while the caller had already
    // shown a card with no heads-up — measured as
    // `shown to owner: null | ledger says already-told: true`. That food could
    // then never fire again for the rest of the trial: verbatim the
    // "suppressed heads-up consumed the budget" defect rule 3 was rewritten to
    // eliminate. The read and the write are now split; this pins the split.
    expect(await hasFlaggedFoodInTrial('t1', 'jerky')).toBe(false);
    await noteTrialFlagShown(flag({ foodId: 'jerky' }));
    expect(await hasFlaggedFoodInTrial('t1', 'jerky')).toBe(true);
  });

  it('there is no timeout constant left to reintroduce the race', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./trialContaminant') as Record<string, unknown>;
    expect(mod.MEAL_FLAG_TIMEOUT_MS).toBeUndefined();
  });
});

describe('the ledger is multi-pet safe', () => {
  beforeEach(async () => { mockStore.clear(); resetHeadsUpLedgerCache(); });

  it('recording under one trial does not drop another trial (B-086 multi-pet)', async () => {
    // The first cut wrote `{ [trialId]: … }` to prune dead trials, which dropped
    // every other trial's entries. Two littermates each on an elimination trial
    // is routine, so every pet switch re-opened the other's flagged foods and
    // defeated rule 3 outright.
    await recordFlaggedFoodInTrial('trial-pet-a', 'chew');
    await recordFlaggedFoodInTrial('trial-pet-b', 'salmon-treat');
    expect(await hasFlaggedFoodInTrial('trial-pet-a', 'chew')).toBe(true);
    expect(await hasFlaggedFoodInTrial('trial-pet-b', 'salmon-treat')).toBe(true);
  });

  it('still bounds growth across many completed trials', async () => {
    for (let i = 0; i < 12; i++) await recordFlaggedFoodInTrial(`trial-${i}`, 'food');
    const stored = JSON.parse(mockStore.get('nyx.trialHeadsUp.v1') as string) as Record<string, string[]>;
    expect(Object.keys(stored).length).toBeLessThanOrEqual(6);
    // The most recent trial is always kept.
    expect(await hasFlaggedFoodInTrial('trial-11', 'food')).toBe(true);
  });
});

describe('an empty brand+product key is not an identity', () => {
  it('two blank-named foods do not collide into the trial-diet exclusion', () => {
    // foodIntakeKey('','') is the bare separator, and brand/product are NOT NULL
    // but not non-empty — the confirm step has no non-empty guard. Treating that
    // as a match would silently mark an unrelated food as the trial diet and
    // never flag it: the dangerous direction.
    const blank = '\u001F';
    const c = ctx({}, { foodKey: blank });
    expect(foodContaminantFlag(c, 'some-other-food', ['chicken'], blank)).not.toBeNull();
  });
});
