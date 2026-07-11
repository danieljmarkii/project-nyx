// dashboardCards imports `isNotEnoughData` from ./analytics, which transitively
// imports ./db (expo-sqlite). Nothing here touches the DB — stub it so the native
// module isn't loaded under jest (the analytics.test.ts / meals.test.ts pattern).
jest.mock('./db', () => ({ getDb: () => ({}) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  resolveDeltaTone,
  isEstablishedCount,
  MIN_SAMPLES_FOR_VERDICT,
  selectCardState,
  calibrationLine,
  describeCountDelta,
  deltaDirection,
  pluralize,
  intakeNotObservedNote,
  intakeRateDefinition,
  symptomCountDefinition,
  symptomFrequencyDefinition,
  topFoodDefinition,
  topProteinDefinition,
  compositionDefinition,
  type Polarity,
} from './dashboardCards';
import { notEnoughData } from './analytics';

// ── resolveDeltaTone — the §13 #6 colour-as-wellness ruling ──────────────────────
//
// This is the load-bearing safety mapping: a verdict colour attaches ONLY to an
// established multi-sample metric, adverse inverts, and a single observation is
// always neutral. Each block below pins one clause of the ruling so a regression
// can't quietly re-introduce a false-reassurance (or false-alarm) colour.

describe('resolveDeltaTone — §13 #6 ruling', () => {
  describe('not established (single observation / below floor) → always neutral (§11 #2)', () => {
    const polarities: Polarity[] = ['adverse', 'neutral', 'positive'];
    for (const polarity of polarities) {
      it(`${polarity}: a rising delta with established=false is neutral (n=1 never alarms)`, () => {
        expect(resolveDeltaTone({ polarity, delta: +3, established: false })).toBe('neutral');
      });
      it(`${polarity}: a falling delta with established=false is neutral (n=1 never reassures)`, () => {
        expect(resolveDeltaTone({ polarity, delta: -3, established: false })).toBe('neutral');
      });
    }
  });

  describe('a non-finite delta never earns a verdict (guards a future ratio metric)', () => {
    it('NaN delta → neutral on an adverse card (never a false-reassuring "calm")', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: NaN, established: true })).toBe('neutral');
    });
    it('±Infinity delta → neutral', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: Infinity, established: true })).toBe('neutral');
      expect(resolveDeltaTone({ polarity: 'positive', delta: -Infinity, established: true })).toBe('neutral');
    });
  });

  describe('adverse metric — inverted, gated on established (§11 #3)', () => {
    it('rising = concern (vomits up is a concern, never green)', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: +2, established: true })).toBe('concern');
    });
    it('falling = calm, NOT positive — a falling vomit count is never a green "win"', () => {
      const tone = resolveDeltaTone({ polarity: 'adverse', delta: -2, established: true });
      expect(tone).toBe('calm');
      expect(tone).not.toBe('positive');
    });
    it('flat = neutral (no change, no verdict)', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: 0, established: true })).toBe('neutral');
    });
  });

  describe('positive metric — rising is a quiet win; a drop is not alarmed here', () => {
    it('rising = positive (the one multi-sample win colour)', () => {
      expect(resolveDeltaTone({ polarity: 'positive', delta: +0.2, established: true })).toBe('positive');
    });
    it('falling = neutral — the floored decline detector owns concern, not a crude rate drop', () => {
      const tone = resolveDeltaTone({ polarity: 'positive', delta: -0.2, established: true });
      expect(tone).toBe('neutral');
      expect(tone).not.toBe('concern');
    });
  });

  describe('neutral metric — descriptive, never a verdict colour', () => {
    it('rising = neutral', () => {
      expect(resolveDeltaTone({ polarity: 'neutral', delta: +5, established: true })).toBe('neutral');
    });
    it('falling = neutral', () => {
      expect(resolveDeltaTone({ polarity: 'neutral', delta: -5, established: true })).toBe('neutral');
    });
  });
});

describe('isEstablishedCount — the n=1 verdict gate', () => {
  it(`requires the larger window to hold ≥ ${MIN_SAMPLES_FOR_VERDICT} events`, () => {
    expect(MIN_SAMPLES_FOR_VERDICT).toBe(2);
  });
  it('a single observation (1 vs 0) is NOT established → its delta stays neutral', () => {
    expect(isEstablishedCount(1, 0)).toBe(false);
    expect(resolveDeltaTone({ polarity: 'adverse', delta: +1, established: isEstablishedCount(1, 0) })).toBe('neutral');
  });
  it('0 vs 1 (a single prior observation) is NOT established', () => {
    expect(isEstablishedCount(0, 1)).toBe(false);
  });
  it('2 or more in either window is established', () => {
    expect(isEstablishedCount(2, 0)).toBe(true);
    expect(isEstablishedCount(0, 2)).toBe(true);
    expect(isEstablishedCount(3, 1)).toBe(true);
  });
});

// ── selectCardState — calibration / empty / populated (§10) ───────────────────────

describe('selectCardState — §10 state selection', () => {
  it('the notEnoughData sentinel → calibrating, carrying the honest "N more" remaining', () => {
    const state = selectCardState(notEnoughData(1, 4));
    expect(state).toEqual({ kind: 'calibrating', samples: 1, needed: 4, remaining: 3 });
  });

  it('remaining never goes negative (over-floor sentinel is clamped)', () => {
    const state = selectCardState(notEnoughData(5, 4));
    expect(state.kind).toBe('calibrating');
    if (state.kind === 'calibrating') expect(state.remaining).toBe(0);
  });

  it('real data + isEmpty → empty (a warm "none logged", not calibration)', () => {
    expect(selectCardState([], { isEmpty: true })).toEqual({ kind: 'empty' });
  });

  it('real non-empty data → populated', () => {
    expect(selectCardState([{ foo: 1 }], { isEmpty: false })).toEqual({ kind: 'populated' });
    expect(selectCardState({ rate: 0.8 })).toEqual({ kind: 'populated' });
  });

  it('calibration takes priority over isEmpty (a below-floor read is never shown as empty data)', () => {
    const state = selectCardState(notEnoughData(0, 4), { isEmpty: true });
    expect(state.kind).toBe('calibrating');
  });
});

// ── Copy helpers — numbers honest, voice warm/forward-looking ─────────────────────

describe('pluralize', () => {
  it('singular only for exactly 1', () => {
    expect(pluralize(1, 'meal')).toBe('meal');
    expect(pluralize(0, 'meal')).toBe('meals');
    expect(pluralize(3, 'meal')).toBe('meals');
  });
  it('honours an irregular plural', () => {
    expect(pluralize(2, 'day', 'days')).toBe('days');
  });
});

describe('calibrationLine — §10 "still learning the baseline — N more"', () => {
  it('states the honest remaining count and unit, with the pet name', () => {
    expect(calibrationLine(3, 'meal', 'Nyx')).toBe(
      "Still learning Nyx's baseline — 3 more meals to log.",
    );
  });
  it('pluralizes the unit by the remaining count', () => {
    expect(calibrationLine(1, 'meal', 'Nyx')).toBe(
      "Still learning Nyx's baseline — 1 more meal to log.",
    );
  });
  it('falls back to the second-person "your pet\'s" when no pet name is given', () => {
    expect(calibrationLine(2, 'day')).toBe("Still learning your pet's baseline — 2 more days to log.");
  });
  it('stays warm (no exclamation mark, forward-looking) even at the boundary', () => {
    const line = calibrationLine(0, 'meal', 'Nyx');
    expect(line).toBe("Still learning Nyx's baseline — almost there.");
    expect(line).not.toContain('!');
  });
});

describe('describeCountDelta — honest direction, no verdict word', () => {
  it('more this period', () => {
    expect(describeCountDelta(5, 3, 'week')).toBe('2 more than last week');
  });
  it('fewer this period (calm wording, never "improving")', () => {
    const line = describeCountDelta(3, 5, 'month');
    expect(line).toBe('2 fewer than the previous 30 days');
    expect(line).not.toMatch(/improv|better|worse|win/i);
  });
  it('same as the prior period', () => {
    expect(describeCountDelta(4, 4, 'week')).toBe('Same as last week');
  });
  it('up from a zero prior', () => {
    expect(describeCountDelta(3, 0, 'week')).toBe('Up from none last week');
  });
  it('down to zero this period', () => {
    expect(describeCountDelta(0, 3, '3month')).toBe('None in the last 3 months, down from 3');
  });
});

describe('deltaDirection', () => {
  it('maps the sign of the delta', () => {
    expect(deltaDirection(2)).toBe('up');
    expect(deltaDirection(-2)).toBe('down');
    expect(deltaDirection(0)).toBe('flat');
  });
});

describe('intakeNotObservedNote — §11 #6 free-feeding honesty', () => {
  it('never reads a free-fed absence as "didn\'t eat", and stays warm', () => {
    const note = intakeNotObservedNote();
    expect(note).toMatch(/free-fed/i);
    expect(note).not.toContain('!');
    expect(note).not.toMatch(/didn't eat|did not eat/i);
  });
});

// ── Metric definitions (B-100) — the info-affordance copy ─────────────────────────
//
// The load-bearing assertion is §11 #1: the INTAKE definitions ("Meals finished" and
// the ranking "% finished") describe HOW MUCH GOT EATEN and must NEVER relabel intake
// as a "preference"/"favourite" (intake is not preference). Plus the universal voice
// rules: no "!" (Pattern 4) and the pet name / second-person fallback (Pattern 1).

/** Vocabulary that would (mis)frame an intake metric as a like/dislike — §11 #1. */
const PREFERENCE_WORDS = /preference|prefer|favou?rite|\blikes?\b|\bloves?\b|enjoys?/i;

describe('metric definitions (B-100)', () => {
  // Both the named-pet AND the no-name (fallback) variant of every definition — so the
  // voice sweep below can't miss an "!" that only appears on the fallback path.
  const all = [
    intakeRateDefinition('Nyx'), intakeRateDefinition(),
    symptomCountDefinition('vomiting', 'Nyx'), symptomCountDefinition('vomiting'),
    symptomFrequencyDefinition('vomiting', 'Nyx'), symptomFrequencyDefinition('vomiting'),
    topFoodDefinition('Nyx'), topFoodDefinition(),
    topProteinDefinition('Nyx'), topProteinDefinition(),
    compositionDefinition('Nyx'), compositionDefinition(),
  ];

  it('every definition (named + no-name fallback) stays warm — no exclamation mark (Pattern 4)', () => {
    for (const d of all) expect(d).not.toContain('!');
  });

  describe('intakeRateDefinition — "Meals finished" (§11 #1/#6)', () => {
    const def = intakeRateDefinition('Nyx');
    it('names the exact rule: most/all eaten, treats out, free-fed out', () => {
      expect(def).toMatch(/most or all/i);
      expect(def).toMatch(/treats/i);
      expect(def).toMatch(/free-fed/i);
    });
    it('frames it as intake, NEVER as a preference/favourite (intake is not preference)', () => {
      expect(def).not.toMatch(PREFERENCE_WORDS);
    });
    it('threads the pet name, falling back to second-person "your pet\'s"', () => {
      expect(intakeRateDefinition('Nyx')).toContain("Nyx's");
      expect(intakeRateDefinition()).toContain("your pet's");
    });
    it('does not double the possessive if the caller hands in the "your pet" fallback', () => {
      // Belt-and-suspenders: the screen now passes the RAW name (helpers own the fallback),
      // but a caller passing "your pet" must still read "your pet's", never "your pet's's".
      const def = intakeRateDefinition('your pet');
      expect(def).toContain("your pet's");
      expect(def).not.toContain("pet's's");
    });
  });

  describe('the ranking "% finished" definitions are intake, not preference (§11 #1)', () => {
    it('topFood describes the share bar + how much got eaten, no preference word', () => {
      const def = topFoodDefinition('Nyx');
      expect(def).toMatch(/share of the diet/i);
      expect(def).toMatch(/eaten/i);
      expect(def).not.toMatch(PREFERENCE_WORDS);
    });
    it('topFood notes the treat exception so it matches a treat-topped row (no over-claim)', () => {
      // A treat can top the food list and shows a "treat" tag, not a rate (§11 #1 — a
      // ceiling finish-rate is not an intake signal); the definition must not imply
      // "% finished" is always present.
      expect(topFoodDefinition('Nyx')).toMatch(/treats? show/i);
    });
    it('topProtein covers exposure (meals + treats) and notes the treat tag — no preference word (B-111)', () => {
      // Post-B-111 the protein card ranks protein EXPOSURE incl. treats (flagged), so the
      // definition spans meals + treats and notes the treat tag (mirrors topFood), while still
      // never implying "preference"/"favourite" (§11 #1 — this card is intake, not preference).
      const def = topProteinDefinition('Nyx');
      expect(def).toMatch(/meals and treats/i);
      expect(def).toMatch(/treats? show/i);
      expect(def).toMatch(/eaten/i);
      expect(def).not.toMatch(PREFERENCE_WORDS);
    });
  });

  describe('symptom definitions', () => {
    it('the count points back to the History timeline (a verifiable raw count)', () => {
      const def = symptomCountDefinition('vomiting', 'Nyx');
      expect(def).toMatch(/vomiting/);
      expect(def).toMatch(/Nyx/);
      expect(def).toMatch(/History/);
    });
    it('the frequency calendar decodes "which days" + the darker = more scale', () => {
      const def = symptomFrequencyDefinition('vomiting', 'Nyx');
      expect(def).toMatch(/which days/i);
      expect(def).toMatch(/darker/i);
    });
    it('falls back to "your pet" with no name (Pattern 1)', () => {
      expect(symptomCountDefinition('vomiting')).toContain('your pet');
    });
  });

  describe('compositionDefinition — descriptive, never a verdict on feeding (§11 #1)', () => {
    const def = compositionDefinition('Nyx');
    it('frames the split as what was logged, not a judgement on how the owner feeds', () => {
      expect(def).toMatch(/not a verdict/i);
      expect(def).not.toMatch(PREFERENCE_WORDS);
    });
  });
});
