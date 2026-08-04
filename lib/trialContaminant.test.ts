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
  foodMembershipFlag,
  allowedSetHydrated,
  trialDietNote,
  antigenPausedNote,
  sanctionedProteinsForTrial,
  proteinList,
  mealFlagCopy,
  membershipFlagCopy,
  addFlagCopy,
  standingFlagCopy,
  localMidnightMs,
  type TrialContaminantFlag,
  type TrialMembershipFlag,
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
    hasUnreadableRole: false,
    trialFoodCompleteness: { complete: true, provenance: 'panel_read' },
    ...over,
  };
}

/** A trial whose diet is unknown — the state that disables every check. */
const UNKNOWN_DIET = () => ctx({}, { primaryProtein: null, proteins: [] });

function flag(over: Partial<TrialContaminantFlag> = {}): TrialContaminantFlag {
  return { kind: 'off_diet_protein', proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'f1', ...over };
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
      kind: 'off_diet_protein',
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

// ── B-693 — the rung-3 MEMBERSHIP flag (a food not on the trial list) ─────────
describe('allowedSetHydrated — the one settled-ness test the flag and the cache share', () => {
  it('is true only when every primary_diet row is present AND resolved', () => {
    expect(allowedSetHydrated(ctx())).toBe(true);
  });

  it('is false while a primary_diet row is still un-resolved (mid-sync)', () => {
    // The food-cache row for the diet has not landed yet: primaryResolved < count.
    // An unhydrated list makes EVERY food look absent, so this must read false.
    expect(allowedSetHydrated(ctx({ primaryCount: 1, primaryResolved: 0 }))).toBe(false);
    expect(allowedSetHydrated(ctx({ primaryCount: 2, primaryResolved: 1 }))).toBe(false);
  });

  it('is false for a zero-primary set — an active trial always has a diet', () => {
    // A trial holding only a permitted treat, or nothing at all: `primaryCount`
    // is 0, which is the unhydrated signal, never an empty-but-loaded set.
    expect(allowedSetHydrated(ctx({ primaryCount: 0, primaryResolved: 0, allowedFoods: [] }))).toBe(false);
  });
});

describe('foodMembershipFlag — shape ③ (a food that is not on the allowed list)', () => {
  it('fires on the modal case: off the list, panel never read', () => {
    // The dental treats the PM's dogfood found — never added to the list, no
    // panel read — landed silently before B-693. Now it raises a MEMBERSHIP flag,
    // a fact about the list and never about contents.
    expect(foodMembershipFlag(ctx(), 'dental-treats', [])).toEqual({
      kind: 'off_trial_list',
      trialId: 't1',
      foodId: 'dental-treats',
    });
  });

  it('fires even when the off-list food carries ONLY the trial protein', () => {
    // A duck treat that is not on a duck trial's list is still off the list. The
    // flag is about MEMBERSHIP, not proteins — its own copy makes no contents
    // claim, so naming duck here would be neither possible nor wanted.
    expect(foodMembershipFlag(ctx(), 'plain-duck-treat', ['duck'])?.kind).toBe('off_trial_list');
  });

  it('RUNG-2 PRECEDENCE — an off-trial protein routes to the contents flag, never both', () => {
    // The single most important invariant: a food that carries chicken on a duck
    // trial is classified rung 2, so the CONTENTS flag fires and the membership
    // flag is silent. classifyFeeding returns one verdict, so the two can never
    // both fire for one feeding.
    const c = ctx();
    expect(foodMembershipFlag(c, 'chicken-chew', ['chicken'])).toBeNull();
    expect(foodContaminantFlag(c, 'chicken-chew', ['chicken'])?.kind).toBe('off_diet_protein');
  });

  it('never carries a proteins field — it cannot assert contents (claim-strength)', () => {
    // The type has no proteins; this pins that the runtime object has none either,
    // so nothing downstream can read a contents claim off a membership flag.
    const f = foodMembershipFlag(ctx(), 'dental-treats', []);
    expect(f).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(f, 'proteins')).toBe(false);
    expect(Object.keys(f as object).sort()).toEqual(['foodId', 'kind', 'trialId']);
  });

  it('is silent for a food that IS on the list (permitted), and for the trial diet itself', () => {
    const withTreat = ctx({
      allowedFoods: [
        TRIAL_FOOD,
        { ...TRIAL_FOOD, foodItemId: 'jerky', foodKey: null, role: 'permitted_treat', primaryProtein: 'rabbit', proteins: ['rabbit', 'chicken'] },
      ],
    });
    // A permitted food is never praised — absence of a flag is not a verdict (G2).
    // Matched by id (the diet_trial_foods row's food_item_id), as rung 1 does.
    expect(foodMembershipFlag(withTreat, 'jerky', ['rabbit', 'chicken'])).toBeNull();
    // The trial diet itself is on the list, so it is never a membership miss.
    expect(foodMembershipFlag(ctx(), 'trial-food', ['duck'])).toBeNull();
  });

  it('is silent with no context, out of window, and mid-sync (unhydrated list)', () => {
    // No trial → nothing to be off the list of.
    expect(foodMembershipFlag(null, 'x', [])).toBeNull();
    // Before the trial began — classifyFeeding returns out_of_window.
    expect(foodMembershipFlag(ctx(), 'x', [], null, '2019-06-01T12:00:00Z')).toBeNull();
    // THE CRITICAL SILENCE STATE: an unhydrated allowed set makes every food look
    // absent, the prescribed diet included. It must not fire until the list loads.
    expect(foodMembershipFlag(ctx({ primaryCount: 1, primaryResolved: 0 }), 'anything', [])).toBeNull();
    expect(foodMembershipFlag(ctx({ primaryCount: 0, primaryResolved: 0, allowedFoods: [] }), 'anything', [])).toBeNull();
  });

  it('never fires on the trial diet re-photographed under a fresh id (§5.4 key match)', () => {
    // The duplicate-capture hole: a re-photographed bag of the trial diet mints a
    // new uuid. Without the key it is "not on the list" (membership would fire on
    // the prescribed food); with it, rung 1 matches and it stays silent.
    expect(foodMembershipFlag(ctx(), 'a-fresh-uuid', ['duck'], TRIAL_FOOD.foodKey)).toBeNull();
  });

  it('KNOWN over-fire (B-699): a re-photo of the trial diet with DIVERGENT text fires membership', () => {
    // Adversarial pass P3. The §5.4 key guard silences a re-photo only when the new
    // capture's key EQUALS the stored diet's. Two captures of one bag can extract
    // different product text ("Duck" vs "Duck Formula"), so the keys diverge, rung 1
    // misses on both id and key, and membership fires on the PRESCRIBED diet — the
    // C2 alarm-fatigue direction. It is OVER-FIRE, never reassurance (a genuine
    // off-list food is never silenced), bounded to once by the ledger, and
    // self-healed by the add-to-list escape hatch; the shared root-cause dedup fix
    // is B-699 (cross-cutting, out of this lib-only PR). Pinned so the behaviour is
    // a known quantity, not a silent surprise — and so B-699 has a red test to flip.
    expect(foodMembershipFlag(ctx(), 'trial-food-rephoto', ['duck'], 'zignature-duck')?.kind)
      .toBe('off_trial_list');
    // Contrast: the SAME re-photo with a matching key is correctly silent (rung 1).
    expect(foodMembershipFlag(ctx(), 'trial-food-rephoto', ['duck'], TRIAL_FOOD.foodKey)).toBeNull();
  });
});

describe('membershipFlagCopy — list language only, never a contents claim', () => {
  it('names the list and the pet, and reports a saved meal (never asks)', () => {
    const copy = membershipFlagCopy('Biscuit');
    expect(copy.eyebrow).toBe('Off the trial list');
    expect(copy.headline).toBe('This one isn’t on Biscuit’s trial list.');
    expect(copy.detail).toContain('The meal’s saved');
    expect(copy.detail).toContain('counts in the trial record');
    expect(copy.detail).toContain('vet');
    expect(copy.addLine).toBe('Add to the trial list');
    // Principle 1 — the log is done; nothing here is a question, a gate, or a '+'.
    expect(`${copy.headline}${copy.detail}`).not.toMatch(/\?|are you sure|log anyway|!/i);
    expect(copy.addLine).not.toContain('+');
  });

  it('NEVER says off-diet, contaminant, or any all-clear (claim-strength + G2)', () => {
    // The adversarial line: an unread food must never be called a contaminant, and
    // no string may reassure on the absence of a finding.
    const all = Object.values(membershipFlagCopy('Biscuit')).join(' ').toLowerCase();
    for (const banned of [
      'off-diet', 'off diet', 'contaminant', 'contaminate',
      'no conflict', 'nothing off', 'all clear', 'looks clean', 'is clean',
      'safe', 'fine', 'no problem', 'nothing to worry',
    ]) {
      expect(all).not.toContain(banned);
    }
  });

  it('carries no exclamation mark in any string (nyx-voice)', () => {
    for (const s of Object.values(membershipFlagCopy('Biscuit'))) expect(s).not.toContain('!');
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
      .toEqual({ kind: 'off_diet_protein', proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'other' });
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

  it('B-556 — an allowed set that is PRESENT but has no readable trial diet does not claim there is no food', () => {
    // The state B-556 makes reachable: `narrowTrialFoodRole` sends a role this
    // build cannot read to `permitted_other`, so a trial can hold rows while
    // `primaryCount` is 0. The old copy asserted "no food attached yet" — an
    // absence the record contradicts, on the surface that also renders the
    // trial's own food label two lines up.
    const unreadableRole = trialDietNote(
      ctx({ primaryCount: 0, primaryResolved: 0, hasUnreadableRole: true }, { role: 'permitted_other' }),
    );
    expect(unreadableRole?.title).toContain('can’t check other foods');
    expect(unreadableRole?.body).not.toContain('no food attached');
    expect(unreadableRole?.body).toContain('doesn’t recognise what role');
    // And it must not promise a fix it cannot deliver: the row synced fine.
    expect(unreadableRole?.body).not.toContain('syncs');

    // The genuinely-empty set keeps the sentence that is true of it.
    const noFood = trialDietNote(ctx({ allowedFoods: [], primaryCount: 0, primaryResolved: 0 }));
    expect(noFood?.body).toContain('no food attached');
  });

  it('B-556 — "no readable diet" and "no diet designated" are not the same sentence', () => {
    // The adversarial probe's S2: an allowed set holding ONLY a permitted treat
    // reaches the same branch, and the first cut of this change gave it the
    // unreadable-role sentence — which reads as confusion among several foods
    // when the truth is that the owner never designated one. Same reason
    // `primaryResolved` exists one state over.
    const extrasOnly = trialDietNote(
      ctx(
        { primaryCount: 0, primaryResolved: 0, hasUnreadableRole: false },
        { role: 'permitted_treat' },
      ),
    );
    expect(extrasOnly?.body).toContain('None of this trial’s foods is marked as the diet itself');
    expect(extrasOnly?.body).not.toContain('doesn’t recognise what role');
    expect(extrasOnly?.body).not.toContain('no food attached');

    // A supplement-only set is the same fact and gets the same sentence.
    const supplementOnly = trialDietNote(
      ctx({ primaryCount: 0, primaryResolved: 0, hasUnreadableRole: false }, { role: 'supplement' }),
    );
    expect(supplementOnly?.body).toBe(extrasOnly?.body);
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

// ── B-529 / R7 — the client half of the relation + the silence rule ──────────
describe('B-529 — a hydrolysed trial diet does not flag itself on the card', () => {
  const hydrolysed = () =>
    ctx({ trialFoodLabel: 'Purina HA' }, {
      label: 'Purina HA',
      primaryProtein: 'hydrolyzed chicken',
      proteins: ['hydrolyzed chicken', 'chicken'],
    });

  it('emits no contamination note about the trial food naming its own source twice', () => {
    // Was: "The trial food also lists chicken" — a false accusation against the
    // prescription diet, on the surface the owner reads every day.
    const note = trialDietNote(hydrolysed());
    expect(note).toBeNull();
  });

  it('still names an intact-protein contaminant on the same trial', () => {
    // The absorption is scoped to a food's OWN primary and cannot travel: a
    // permitted extra carrying intact chicken is exactly as trial-invalidating
    // as before.
    const withChew = ctx({ trialFoodLabel: 'Purina HA' }, {
      label: 'Purina HA',
      primaryProtein: 'hydrolyzed chicken',
      proteins: ['hydrolyzed chicken', 'chicken'],
    });
    withChew.allowedFoods = [
      ...withChew.allowedFoods,
      {
        foodItemId: 'f-chew', foodKey: 'bdental chew', label: 'Dental Chew',
        role: 'permitted_treat', allowedFrom: '2020-01-01', allowedUntil: null,
        primaryProtein: 'beef', proteins: ['beef', 'chicken'],
      },
    ];
    const note = trialDietNote(withChew);
    expect(note?.title).toMatch(/also has chicken/i);
  });
});

describe('B-529 R7(c) + B-598 — the paused-arm disclosure reads the module flag', () => {
  // B-598 moved the pause off a SECOND `uncharacterizedTrialDietFoodsInRange`
  // re-derivation (today-anchored, blind to a membership gap) and onto the
  // module's `antigenArmDark` + `antigenAttributionPaused` — the same fields the
  // vet report reads. So `trialDietNote` now takes the flag rather than computing
  // its own answer, and the DERIVATION (does this record darken the arm?) is
  // `dietTrial.test.ts`'s job. These tests pin the note's PLACEMENT and copy.
  const partial = () => {
    const c = ctx({ primaryCount: 2, primaryResolved: 2 });
    c.allowedFoods = [
      ...c.allowedFoods,
      {
        foodItemId: 'f-wet', foodKey: 'zignature wet', label: 'Zignature Duck Wet',
        role: 'primary_diet', allowedFrom: '2020-01-01', allowedUntil: null,
        primaryProtein: null, proteins: ['duck', 'duck liver'],
      },
    ];
    return c;
  };

  it('says the checks are paused, and names the food the flag pointed at', () => {
    const note = trialDietNote(partial(), null, {
      antigenArmDark: true,
      pausedLabels: ['Zignature Duck Wet'],
    });
    expect(note).not.toBeNull();
    expect(note!.title).toBe('Protein checks are paused for this trial');
    expect(note!.body).toContain('Zignature Duck Wet');
    // "names no protein SOURCE", not "the field is empty" — a bare `hydrolyzed`
    // reaches this state with a main protein visibly set, so "no main protein set"
    // would contradict the food screen (B9's self-contradiction rule).
    expect(note!.body).toMatch(/no protein Culprit recognises as a source/);
  });

  it('discloses the MEMBERSHIP GAP even with nothing to name — the B-598 hole', () => {
    // The arm is dark and `antigenAttributionPaused` is EMPTY (no `primary_diet`
    // row was in force for that stretch), so the re-derivation found nothing and
    // returned null while the report rendered its unnamed row. The card is no
    // longer silent, and the unnamed copy names no phantom food.
    const note = trialDietNote(partial(), null, { antigenArmDark: true, pausedLabels: [] });
    expect(note).not.toBeNull();
    expect(note!.title).toBe('Protein checks are paused for this trial');
    expect(note!.body).toMatch(/no diet on the allowed list/);
    expect(note!.body).not.toMatch(/Zignature|Setting a main protein/);
  });

  it('reads as a record fact and never reassures, both variants', () => {
    for (const labels of [['Zignature Duck Wet'], [] as string[]]) {
      const note = trialDietNote(partial(), null, { antigenArmDark: true, pausedLabels: labels })!;
      const text = `${note.title} ${note.body}`;
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/\b(fine|safe|clean|no problem|all good|nothing to worry)\b/i);
    }
  });

  it('does not render the pause when the flag is absent or false', () => {
    // Belt-and-suspenders on the plumbing: the note must not invent a pause the
    // module did not compute. No opts and an explicit `false` both stay quiet.
    expect(trialDietNote(partial())?.title ?? '').not.toMatch(/Protein checks are paused/);
    expect(
      trialDietNote(partial(), null, { antigenArmDark: false, pausedLabels: ['Zignature Duck Wet'] })
        ?.title ?? '',
    ).not.toMatch(/Protein checks are paused/);
  });

  it('a real contamination outranks the pause (B-529 ④), even with the flag set', () => {
    // The precedence the re-derivation had is preserved: contamination is branch
    // #2, the pause branch #3, so a genuine finding about food A is never deleted
    // to explain a gap caused by food B.
    const c = ctx({ primaryCount: 2, primaryResolved: 2 }, {
      label: 'Duck Kibble', primaryProtein: 'duck', proteins: ['duck', 'chicken'],
    });
    c.allowedFoods = [
      ...c.allowedFoods,
      {
        foodItemId: 'f-wet', foodKey: 'duck wet', label: 'Duck Wet',
        role: 'primary_diet', allowedFrom: '2020-01-01', allowedUntil: null,
        primaryProtein: null, proteins: ['duck'],
      },
    ];
    const note = trialDietNote(c, null, { antigenArmDark: true, pausedLabels: ['Duck Wet'] });
    expect(note?.title).toMatch(/also lists chicken/i);
    expect(note?.title).not.toMatch(/paused/i);
  });

  it('stands down once every trial food carries a designation', () => {
    // With the arm no longer dark (`antigenArmDark: false`), what surfaces instead
    // is the ORDINARY standing contamination fact — `duck liver` is a genuine extra
    // against a `duck` primary, because the relation deliberately does NOT fold
    // tissue terms on read.
    const c = partial();
    c.allowedFoods = c.allowedFoods.map((f) =>
      f.primaryProtein == null ? { ...f, primaryProtein: 'duck' } : f,
    );
    const note = trialDietNote(c, null, { antigenArmDark: false, pausedLabels: [] });
    expect(note?.title).not.toMatch(/Protein checks are paused/);
    expect(note?.title).toMatch(/also lists duck liver/i);
  });
});

describe('antigenPausedNote — the owner-register mirror of the report row', () => {
  it('names one food', () => {
    const note = antigenPausedNote(['Zignature Duck Wet']);
    expect(note.body).toContain('Zignature Duck Wet has');
    expect(note.body).toContain('that food');
  });

  it('pluralises for several, and never lists a phantom on the empty gap', () => {
    const many = antigenPausedNote(['A Wet', 'B Kibble']);
    expect(many.body).toMatch(/Some of the trial foods have/);
    expect(many.body).toContain('those foods');
    const gap = antigenPausedNote([]);
    expect(gap.body).toMatch(/no diet on the allowed list/);
    // §5.3 — a dark arm costs ATTRIBUTION, not detection: the count survives.
    expect(gap.body).toMatch(/still counts what was eaten/);
  });

  it('ignores blank labels (a null-derived label never names a phantom)', () => {
    // `antigenAttributionPaused.map(f => f.label)` can carry an empty string; that
    // is the membership gap, not a food called "".
    const note = antigenPausedNote(['', '   ']);
    expect(note.body).toMatch(/no diet on the allowed list/);
  });
});

describe('B-529 ④ — the pause note does not delete a real contamination', () => {
  // Adversarial finding: the first cut returned the pause note BEFORE
  // contaminationNote, so an already-computed, still-valid finding about food A
  // was deleted from the owner's card because food B was missing a field.
  it('a genuine contamination still surfaces while another row is undesignated', () => {
    const c = ctx({ primaryCount: 2, primaryResolved: 2 }, {
      label: 'Duck Kibble',
      primaryProtein: 'duck',
      proteins: ['duck', 'chicken'],
    });
    c.allowedFoods = [
      ...c.allowedFoods,
      {
        foodItemId: 'f-wet', foodKey: 'duck wet', label: 'Duck Wet',
        role: 'primary_diet', allowedFrom: '2020-01-01', allowedUntil: null,
        primaryProtein: null, proteins: ['duck'],
      },
    ];
    const note = trialDietNote(c);
    expect(note?.title).toMatch(/also lists chicken/i);
    expect(note?.title).not.toMatch(/paused/i);
  });
});
