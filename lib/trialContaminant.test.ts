// The pure predicate + copy layer of the trial-contaminant check. lib/supabase
// fail-fasts on missing env and lib/db pulls expo-sqlite, so both are stubbed —
// the functions under test here take their facts as arguments precisely so the
// decision logic can be exercised without either. (The I/O half —
// loadTrialProteinContext / evaluateMealTrialFlag — is a thin assembly over these
// and is covered by the on-device QA script.)
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./db', () => ({ getDb: () => { throw new Error('no db in this suite'); } }));

import {
  offTrialProteins,
  resolveTargetProtein,
  trialFoodContaminants,
  foodContaminantFlag,
  trialDietNote,
  proteinList,
  mealFlagCopy,
  addFlagCopy,
  standingFlagCopy,
  localMidnightMs,
  type TrialProteinContext,
} from './trialContaminant';

// A duck elimination trial on "Zignature Duck", whose own panel WAS read and
// lists only duck — the clean baseline every other case perturbs.
function ctx(over: Partial<TrialProteinContext> = {}): TrialProteinContext {
  return {
    trialId: 't1',
    petId: 'p1',
    startedAtMs: new Date(2026, 6, 1).getTime(),
    trialFoodId: 'trial-food',
    trialFoodLabel: 'Zignature Duck',
    targetProtein: 'duck',
    trialFoodProteins: ['duck'],
    trialFoodCompleteness: { complete: true, provenance: 'panel_read' },
    ...over,
  };
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

describe('foodContaminantFlag — shape ② (a food that is not the trial diet)', () => {
  it('flags an off-trial protein in a different food', () => {
    expect(foodContaminantFlag(ctx(), 'other-food', ['chicken'])).toEqual({
      proteins: ['chicken'],
      targetProtein: 'duck',
    });
  });

  it('NEVER flags the trial diet itself — that is a trial-level standing fact', () => {
    // B-417 C2, PM-ratified: a per-feeding flag on the prescribed food fires
    // 100+ times across a 56-day trial. The fact still surfaces, on the trial
    // card (trialDietNote) and the food's own detail screen.
    expect(foodContaminantFlag(ctx({ trialFoodProteins: ['duck', 'chicken'] }),
      'trial-food', ['duck', 'chicken'])).toBeNull();
  });

  it('is silent with no context, no target, or nothing off-trial', () => {
    expect(foodContaminantFlag(null, 'other-food', ['chicken'])).toBeNull();
    expect(foodContaminantFlag(ctx({ targetProtein: null }), 'other-food', ['chicken'])).toBeNull();
    expect(foodContaminantFlag(ctx(), 'other-food', ['duck'])).toBeNull();
  });

  it('is silent — never an all-clear — for a food whose proteins are unknown', () => {
    // The D10 presence-only rule: an unread panel yields silence plus the Tier-1
    // disclosure caveat, never "nothing off-trial in this one".
    expect(foodContaminantFlag(ctx(), 'other-food', [])).toBeNull();
  });
});

describe('trialFoodContaminants — shape ① (the trial diet itself)', () => {
  it('finds the chicken hiding in a "duck" formula', () => {
    expect(trialFoodContaminants(ctx({ trialFoodProteins: ['duck', 'chicken'] })))
      .toEqual(['chicken']);
  });

  it('finds nothing in a genuinely single-protein trial diet', () => {
    expect(trialFoodContaminants(ctx())).toEqual([]);
  });
});

describe('trialDietNote — the trial card standing note', () => {
  it('names the contaminant when the trial diet carries one', () => {
    const note = trialDietNote(ctx({ trialFoodProteins: ['duck', 'chicken'] }));
    expect(note?.title).toBe('The trial food also lists chicken');
    expect(note?.body).toContain('clean answer');
  });

  it('says the panel was not read rather than implying a clean trial diet', () => {
    // The reassurance-on-absence case D10 exists for, on the one food this pet
    // eats every day for eight weeks.
    const note = trialDietNote(ctx({
      trialFoodCompleteness: { complete: false, provenance: 'no_panel_text' },
    }));
    expect(note?.title).toContain("ingredients haven't been read");
    expect(note?.body).toContain('unknown');
  });

  it('is silent only when the panel WAS read and really is single-protein', () => {
    expect(trialDietNote(ctx())).toBeNull();
  });

  it('is silent when the target protein is unknown', () => {
    expect(trialDietNote(ctx({ targetProtein: null }))).toBeNull();
  });

  it('never emits a reassuring string in any state', () => {
    const states: TrialProteinContext[] = [
      ctx(),
      ctx({ trialFoodProteins: ['duck', 'chicken'] }),
      ctx({ trialFoodCompleteness: { complete: false, provenance: 'low_confidence' } }),
      ctx({ targetProtein: null }),
    ];
    for (const s of states) {
      const note = trialDietNote(s);
      if (!note) continue;
      const text = `${note.title} ${note.body}`.toLowerCase();
      for (const banned of ['all clear', 'no other proteins', 'nothing else', 'looks clean', 'is clean', "you're fine"]) {
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
    const copy = mealFlagCopy({ proteins: ['chicken'], targetProtein: 'duck' }, 'Mochi');
    expect(copy.headline).toBe('This one has chicken.');
    expect(copy.detail).toContain("Mochi's duck trial should skip chicken");
    // Principle 1 — the log is already done; nothing here is a question or a gate.
    expect(copy.detail).toContain("The meal's saved");
    expect(`${copy.headline}${copy.detail}`).not.toMatch(/\?|are you sure|log anyway|!/i);
  });

  it('the add-time confirm does not assert a trial TYPE we were never told', () => {
    // The mock read "elimination trial"; diet_trials carries no indication column
    // (D6 deferred it), so claiming one would be a fabricated clinical detail.
    const copy = addFlagCopy({ proteins: ['chicken'], targetProtein: 'duck' }, 'Mochi');
    expect(copy.title).toBe('Heads up — this food lists chicken');
    expect(copy.body).toContain("Mochi's trial diet is duck");
    expect(copy.body).not.toMatch(/elimination|hydrolysed|hydrolyzed/i);
    expect(copy.body).toContain('vet');
  });

  it('the standing note names the food\'s property, not an event', () => {
    const copy = standingFlagCopy({ proteins: ['chicken', 'salmon'], targetProtein: 'duck' }, 'Mochi');
    expect(copy.title).toBe("Off Mochi's trial diet");
    expect(copy.body).toContain('chicken and salmon');
  });

  it('no owner-facing string carries an exclamation mark (nyx-voice)', () => {
    const flag = { proteins: ['chicken'], targetProtein: 'duck' };
    const all = [
      ...Object.values(mealFlagCopy(flag, 'Mochi')),
      ...Object.values(addFlagCopy(flag, 'Mochi')),
      ...Object.values(standingFlagCopy(flag, 'Mochi')),
      ...Object.values(trialDietNote(ctx({ trialFoodProteins: ['duck', 'chicken'] })) ?? {}),
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
