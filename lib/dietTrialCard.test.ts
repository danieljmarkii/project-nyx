// The oracle §12 said did not exist (B-417 PR 4).
//
// QA's finding on v0.9's acceptance criteria: "not one of the seven named a
// harness or an oracle, and the three client surfaces carrying this feature
// (profile.tsx, useTrend.ts, TrendZone.tsx) have NO test file at all — there is
// not a single test anywhere under app/(tabs)/. Every card criterion was a
// manual assertion against an undefined oracle."
//
// This file is that oracle: every one of the eleven states asserted against its
// LITERAL expected string, plus the two rules asserted across ALL of them at
// once — because a rule that is only checked on the states someone remembered to
// check is not a rule. The bar-width criterion lives in DietTrialCard.test.tsx,
// where a width prop actually exists.
// `lib/analytics` (where `getDietTrialProgress` lives) imports the feeding-
// arrangements module, which pulls `lib/sync` → `lib/supabase` and its fail-fast
// env check. The resolver under test is pure and touches neither, so stub the
// edge of the graph exactly as lib/analytics.test.ts does.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import {
  resolveTrialCard,
  trialManageLabel,
  resolveTrialStrip,
  trialResponseStandingLine,
  planTrialCard,
  trialIdentityLabel,
  withholdingReasons,
  formatTrialDate,
  trialEndDayIndex,
  BLIND_SPOT_QUALIFIER,
  TRIAL_CARD_DISCLOSURES,
  type TrialCardInput,
  type TrialCardModel,
  type TrialCardTrial,
  type TrialCardLineRole,
  type TrialCardRegister,
  type TrialCardState,
} from './dietTrialCard';
import { getDietTrialProgress } from './analytics';
import type { TrialResponseCounts } from './trialResponseCounts';

const MS_PER_DAY = 86_400_000;

/** Local noon on a given calendar date, so a test never sits on a day boundary
 *  (the whole point of B-421 is that the boundary is LOCAL midnight). */
function localNoon(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function textOf(model: TrialCardModel, role: TrialCardLineRole): string[] {
  return model.lines.filter((l) => l.role === role).map((l) => l.text);
}

function allStrings(model: TrialCardModel): string[] {
  return [
    model.kicker,
    model.foodLabel ?? '',
    model.dayLine ?? '',
    model.windowLine ?? '',
    ...model.actions.map((a) => a.label),
    ...model.lines.map((l) => l.text),
  ];
}

const FOOD = 'Zignature Kangaroo Formula';

/** The design lock's worked example: started 3 July, 56-day skin trial, read on
 *  25 July → day 23 of 56, ending 27 August. */
function activeInput(over: Partial<TrialCardInput> = {}): TrialCardInput {
  return {
    trial: {
      status: 'active',
      startedAt: '2026-07-03',
      targetDurationDays: 56,
      foodLabel: FOOD,
    },
    nowMs: localNoon(2026, 7, 25),
    petName: 'Biscuit',
    species: 'dog',
    coverage: { daysLogged: 22, daysElapsed: 23 },
    exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 0 },
    ...over,
  };
}

// ── Every state the card can reach, built at its triggering input ────────────
//
// AT MODULE SCOPE since B-559, because it is no longer only the two rules'
// fixture list: the composition layer's own property tests walk it too, and the
// point of that layer is that ONE list is walked by EVERY cross-state rule. A
// second list would re-create the defect shape the layer exists to remove.
//
// `rangeRefusal` is the whole-range refusal history. It had NO fixture here at
// all before B-559 — which is why round 9's defect (the fact reaching three of
// eleven active states, with four more never seeing it) was invisible to a list
// whose name promises otherwise.
const REFUSING_RANGE = { days: 19, ratedFeedings: 38, refusedFeedings: 38, population: 'trial_diet' as const };

/** R1's now-fact, at the canonical patient: a cat eleven days into refusing its
 *  hydrolysate. Distinct numbers from `REFUSING_RANGE` so a test asserting on the
 *  rendered string cannot pass off the wrong fact. */
const REFUSING_NOW = { days: 11, ratedFeedings: 22, refusedFeedings: 19, population: 'trial_diet' as const };

const everyState: Array<[string, TrialCardInput]> = [
  ['0 no trial', { ...activeInput(), trial: null }],
  ['1 day one', activeInput({
    nowMs: localNoon(2026, 7, 3),
    coverage: { daysLogged: 0, daysElapsed: 1 },
    exposures: null,
  })],
  ['2 clean', activeInput()],
  ['3 exposures', activeInput({
    exposures: { mayStateRecordClean: true,
      totalFeedings: 68,
      offDiet: 3,
      mostRecent: { label: 'Zuke’s Mini Naturals (chicken)', when: 'Yesterday, 6:40 pm' },
    },
  })],
  ['4 below floor', activeInput({
    belowCoverageFloor: true,
    coverage: { daysLogged: 6, daysElapsed: 23 },
    exposures: { mayStateRecordClean: true, totalFeedings: 9, offDiet: 0 },
  })],
  ['5 milestone', activeInput({ nowMs: localNoon(2026, 8, 27) })],
  ['6 overrun', activeInput({ nowMs: localNoon(2026, 9, 1) })],
  ['7a completed', activeInput({
    trial: {
      status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
      targetDurationDays: 56, foodLabel: FOOD, outcome: 'improved',
    },
    coverage: { daysLogged: 54, daysElapsed: 56 },
    exposures: { mayStateRecordClean: true, totalFeedings: 182, offDiet: 6 },
  })],
  ['7b abandoned (refusal)', activeInput({
    trial: {
      status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
      targetDurationDays: 56, foodLabel: FOOD,
      stoppedReason: 'Biscuit wouldn’t eat it', stoppedForRefusal: true,
    },
    coverage: { daysLogged: 18, daysElapsed: 19 },
    exposures: { mayStateRecordClean: true, totalFeedings: 54, offDiet: 0 },
  })],
  ['8 intake decline', activeInput({
    species: 'cat',
    petName: 'Mochi',
    intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
  })],
  ['9 free-fed', activeInput({ freeFed: { loggedFeedings: 22 } })],
  ['10 multi-pet caveat', activeInput({ otherPetNames: ['Mochi'] })],
  // The two TERMINAL decline branches. Every other decline entry here is an
  // ACTIVE trial, which is exactly why the property test could not see them
  // withholding the floor.
  ['7a completed + decline', activeInput({
    species: 'cat', petName: 'Mochi',
    trial: {
      status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
      targetDurationDays: 56, foodLabel: FOOD,
    },
    intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
  })],
  ['7b abandoned + decline', activeInput({
    species: 'cat', petName: 'Mochi',
    trial: {
      status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
      targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'cost',
    },
    intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
  })],

  // ── The registers this list could not see before B-559 ────────────────────
  //
  // A `rangeRefusal` record reaches FIVE places — three active states through
  // one shared body, and both terminal cards through the register that replaces
  // it — and not one entry above carried the fact. The three below close that,
  // and the fourth walks `coverage_only`, the pre-classifier register that had
  // its own describe block and no seat at any cross-state rule.
  ['3 exposures, refusal in the RECORD', activeInput({
    species: 'cat', petName: 'Mochi',
    exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 9 },
    rangeRefusal: REFUSING_RANGE,
  })],
  ['7a completed, refusal in the RECORD', activeInput({
    trial: {
      status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
      targetDurationDays: 56, foodLabel: FOOD,
    },
    coverage: { daysLogged: 54, daysElapsed: 56 },
    exposures: { mayStateRecordClean: false, totalFeedings: 182, offDiet: 6 },
    rangeRefusal: REFUSING_RANGE,
  })],
  // The owner named COST; the record shows the diet went uneaten. Reaches the
  // refusal register from the record rather than from the stored reason, which
  // is the half R1 added and the half the stored-token fixture cannot exercise.
  ['7b abandoned for cost, refusal in the RECORD', activeInput({
    trial: {
      status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
      targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'cost',
    },
    coverage: { daysLogged: 18, daysElapsed: 19 },
    exposures: { mayStateRecordClean: false, totalFeedings: 54, offDiet: 2 },
    rangeRefusal: REFUSING_RANGE,
  })],
  ['2 clean, before the classifier', activeInput({ exposures: null })],

  // ── R1's live register, by BOTH routes it can be reached ──────────────────
  //
  // Two entries and not one, because they are two different predicates wearing
  // one register: the now-fact speaks for itself, and the range fact only speaks
  // through `liveRefusal`'s two stand-down guards. A single fixture would walk
  // the register while leaving the guarded route — the one whose semantics are
  // the open Dr. Chen question — checked by nothing that runs over every state.
  ['10 trial-diet refusal (the now-fact)', activeInput({
    species: 'cat', petName: 'Mochi', trialDietRefusal: REFUSING_NOW,
  })],
  ['10 trial-diet refusal (from the range, ratings gone quiet)', activeInput({
    species: 'cat', petName: 'Mochi',
    rangeRefusal: REFUSING_RANGE,
    recentFinishedFeedings: 0,
    rangeRefusalSpansEpisodes: true,
  })],
];

describe('the two rules (they govern every state)', () => {
  // R1 — the negative claim is deleted from the product. Four independent proofs
  // in §5.2 show no coverage level rescues it, which is why G2 came back as a
  // rule rather than a threshold. This is the greppable guard.
  const NEGATIVE_CLAIMS = [
    /no off-diet/i,
    /nothing off-diet/i,
    /\b0 off-diet/i,
    /no (?:contaminants|exposures|slips)/i,
    /clean (?:trial|elimination)/i,
    /perfectly? (?:clean|followed)/i,
  ];

  it.each(everyState)('R1 — %s renders no negative claim about the world', (_name, input) => {
    for (const s of allStrings(resolveTrialCard(input))) {
      for (const pattern of NEGATIVE_CLAIMS) {
        expect(s).not.toMatch(pattern);
      }
    }
  });

  // R2 — no blended coverage/adherence metric in ANY form. On this model the
  // only form a string can take is a percentage, and the only form a number can
  // take is `progressFraction`; the width assertion is in the component test.
  it.each(everyState)('R2 — %s renders no percentage anywhere', (_name, input) => {
    for (const s of allStrings(resolveTrialCard(input))) {
      expect(s).not.toMatch(/%/);
      expect(s).not.toMatch(/\bcompliance\b/i);
    }
  });

  // §6.9 — Culprit never SCORES the owner. Coverage is a statement about the
  // record, never a performance statement about the person.
  it.each(everyState)('§6.9 — %s renders no streak, grade or score', (_name, input) => {
    for (const s of allStrings(resolveTrialCard(input))) {
      expect(s).not.toMatch(/\b(streak|badge|grade|score|perfect week)\b/i);
    }
  });

  // `clinical-guardrails` PATTERN 8 — the never-reassure invariant is a TEST
  // ASSERTION, not a comment. The skill's own words: "Future copy edits — by you,
  // by me, by a future contributor copying the function for a sibling incident
  // type — will quietly drift." This card now carries two safety registers and a
  // teach line, all of which are copy someone will edit.
  //
  // The asymmetry being enforced: this surface may ESCALATE on the presence of a
  // logged fact, and may never REASSURE on the absence of one. Absence of a
  // refusal is not evidence the pet is eating.
  const REASSURANCE = /\b(fine|okay|ok|healthy|well|normal|nothing to worry|no concern|all clear|doing great)\b/i;

  it.each(everyState)('never reassures — %s', (_name, input) => {
    for (const s of allStrings(resolveTrialCard(input))) {
      expect(s).not.toMatch(REASSURANCE);
      // Nyx has no exclamation marks (nyx-voice), and a safety register is the
      // last place one would belong.
      expect(s).not.toContain('!');
    }
  });

  // "Intake is not preference" — decline is frequently a DISEASE signal, and a
  // trial is not a reason to reclassify it as taste. Asserted across every state
  // rather than only on the refusal one, because the states that would be most
  // tempted to soften are the terminal ones.
  // ── THE FLOOR RULE, ENFORCED ACROSS EVERY STATE ────────────────────────────
  //
  // Four rounds of adversarial review found the SAME defect in four different
  // branches: a branch that withheld an adherence reading also withheld the
  // off-diet count. Round 4 named why — each fix applied one of {withhold the
  // reading, withhold the count, disclose} to one register, and the branch it did
  // not visit inherited the opposite defect.
  //
  // Two independent rules, both of which hold everywhere: WITHHOLD THE READING
  // when the record cannot support it, and NEVER WITHHOLD THE FLOOR. This is the
  // second one, asserted over every state at once rather than trusted to each new
  // branch — because "a rule that is only checked on the states someone
  // remembered to check is not a rule" (this file's own opening).
  // ── THE FLOOR RULE, ENFORCED ACROSS EVERY STATE ────────────────────────────
  //
  // Rounds 1–4 found the SAME defect in four different branches: a branch that
  // withheld an adherence reading also withheld the off-diet count. Two
  // independent rules, both of which hold everywhere — WITHHOLD THE READING when
  // the record cannot support it, and NEVER WITHHOLD THE FLOOR.
  //
  // THE SKIP-GUARD IS AN EXPLICIT ALLOWLIST, and it has to be. The first version
  // skipped any state whose strings contained no feeding word — a condition
  // IMPLIED BY the defect, since a branch that deletes the count deletes the word
  // with it. It was therefore structurally incapable of failing on the two states
  // that were broken (`milestone`, `intake_decline`) and could only check
  // branches that already passed. Naming the exemptions forces each one to be a
  // decision with a reason.
  // ONE ENTRY, AND THE OTHER TWO WERE RETIRED RATHER THAN RE-ARGUED. Both read
  // as reasonable while `exposures` was hard-nulled — there was no count to lose,
  // so the exemption was vacuous. B-474's un-nulling made the silence real:
  // `day one` dropped off-diet feedings logged on day 1, and `milestone` withheld
  // twelve logged exposures at the exact moment the owner decides whether the
  // trial is done. §4.3's "no fact lines" is an argument about COVERAGE beside a
  // stop button; §5.2's floor is a different rule pointing the other way.
  const NO_RECORD_SUBSTRATE: Record<string, string> = {
    '0 no trial': 'no trial to have a record of',
  };

  it.each(everyState)('§5.2 — %s never withholds the off-diet count', (name, base) => {
    const model = resolveTrialCard({
      ...base,
      exposures: { mayStateRecordClean: false, totalFeedings: 124, offDiet: 12 },
    });
    const joined = allStrings(model).join(' ');
    if (NO_RECORD_SUBSTRATE[name]) {
      // An exempt state must render NO count at all — if it starts rendering one,
      // the exemption is stale and this fails rather than passing quietly.
      expect(joined).not.toMatch(/\d+ feedings in total|logged feedings were outside/);
      return;
    }
    expect(joined).toMatch(/\b12\b/);
  });

  it.each(everyState)('never softens intake toward preference — %s', (_name, input) => {
    for (const s of allStrings(resolveTrialCard(input))) {
      expect(s).not.toMatch(/\b(picky|fussy|prefers?|doesn’t like|dislikes?|taste)\b/i);
    }
  });

  it.each(everyState)('R2 — %s exposes only day progress as a fraction', (_name, input) => {
    const model = resolveTrialCard(input);
    if (model.progressFraction === null) return;
    const expected = getDietTrialProgress(
      {
        startedAt: input.trial!.startedAt,
        targetDurationDays: input.trial!.targetDurationDays,
      },
      input.nowMs,
    )!.fraction;
    expect(model.progressFraction).toBe(expected);
  });
});

// ── The eleven states, each with its literal expected string ─────────────────

describe('state 0 — no trial', () => {
  const model = resolveTrialCard({ ...activeInput(), trial: null });

  it('is the designed empty state, not a hidden card', () => {
    expect(model.state).toBe('no_trial');
    expect(model.kicker).toBe('Diet trial');
    expect(textOf(model, 'lead')).toEqual(['No trial running.']);
  });

  // Verbatim from the design-locked mock, and byte-identical to the string
  // B-417 PR 3 shipped — this card's action is what opens PR 3's modal, so the
  // two may not drift.
  it('names the payoff rather than the feature', () => {
    expect(textOf(model, 'forward')).toEqual([
      'If Biscuit’s vet has put them on an elimination diet, tell Culprit — it ' +
      'keeps the dated record your vet will ask for at the recheck.',
    ]);
  });

  it('uses the pet’s recorded pronoun when the app knows it', () => {
    const male = resolveTrialCard({ ...activeInput(), trial: null, petObjectPronoun: 'him' });
    expect(textOf(male, 'forward')[0]).toContain('has put him on an elimination diet');
    // Unknown sex falls back to the same value `petPronouns` returns.
    const unknown = resolveTrialCard({ ...activeInput(), trial: null });
    expect(textOf(unknown, 'forward')[0]).toContain('has put them on an elimination diet');
  });

  it('is the only entry point to PR 3', () => {
    expect(model.actions).toEqual([
      { id: 'start_trial', label: 'Start a diet trial', emphasis: 'secondary' },
    ]);
  });
});

describe('state 1 — day one', () => {
  const model = resolveTrialCard(activeInput({
    nowMs: localNoon(2026, 7, 3),
    coverage: { daysLogged: 0, daysElapsed: 1 },
    exposures: null,
  }));

  it('renders the day and the end date', () => {
    expect(model.state).toBe('day_one');
    expect(model.dayLine).toBe('Day 1 of 56');
    expect(model.windowLine).toBe('Ends 27 August');
  });

  it('makes no claim in EITHER direction — the forward line is the whole card', () => {
    expect(textOf(model, 'fact')).toEqual(['Nothing logged yet today.']);
    expect(textOf(model, 'forward')).toEqual([
      'From here, every meal and treat you log builds the record your vet reads.',
    ]);
  });

  // The state that would render "0 off-diet foods" most confidently.
  it('renders no exposure sentence at all', () => {
    expect(allStrings(model).join(' ')).not.toMatch(/matched/);
  });
});

// The polish pass extends B-616 FR-5's "What {pet} can eat" link from states 2/3/6
// to day_one/free_fed/below_floor — the running states that used to carry no action
// at all (day 1 most of all, where it removes the header being the only control).
describe('the "What {pet} can eat" link is offered on every running state', () => {
  it('day one offers it — the state where it was otherwise the only affordance', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: localNoon(2026, 7, 3),
      coverage: { daysLogged: 0, daysElapsed: 1 },
      exposures: null,
    }));
    expect(m.state).toBe('day_one');
    expect(m.actions.map((a) => a.id)).toContain('view_allowed_foods');
  });

  it('below the coverage floor offers it', () => {
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { mayStateRecordClean: true, totalFeedings: 9, offDiet: 0 },
    }));
    expect(m.state).toBe('below_floor');
    expect(m.actions.map((a) => a.id)).toContain('view_allowed_foods');
  });

  it('the free-fed replacement offers it', () => {
    const m = resolveTrialCard(activeInput({
      petName: 'Mochi',
      freeFed: { loggedFeedings: 22 },
      exposures: { mayStateRecordClean: false, totalFeedings: 22, offDiet: 0 },
    }));
    expect(m.state).toBe('free_fed');
    expect(m.actions.map((a) => a.id)).toContain('view_allowed_foods');
  });
});

describe('trialManageLabel — the header affordance, honest per state', () => {
  const start = { id: 'start_trial' as const, label: 'Start a diet trial', emphasis: 'secondary' as const };
  const link = { id: 'view_allowed_foods' as const, label: 'What Biscuit can eat', emphasis: 'link' as const };

  it('suppresses when the body already carries a Start CTA (empty + ordinary abandoned)', () => {
    expect(trialManageLabel({ state: 'no_trial', actions: [start] })).toBeNull();
    expect(trialManageLabel({ state: 'abandoned', actions: [start] })).toBeNull();
  });

  it('keeps a "+ Start" on a terminal card whose body has NO Start CTA', () => {
    // `completed`'s body is "Open vet report" only, so the header is its Start path.
    expect(trialManageLabel({ state: 'completed', actions: [] })).toBe('+ Start');
  });

  // "Replace", never "Change": on a running trial the header opens end-and-replace,
  // and "Change" read as an edit — routing an active (day-1: the ONLY) card to its
  // own destruction.
  it('says "Replace" on every running state', () => {
    for (const s of [
      'day_one', 'clean', 'exposures', 'below_floor', 'milestone',
      'overrun', 'intake_decline', 'free_fed', 'trial_refusal',
    ] as const) {
      expect(trialManageLabel({ state: s, actions: [link] })).toBe('Replace');
    }
  });

  // REGRESSION (`code-reviewer`, 2026-08-06): suppression is keyed on the ACTIONS,
  // not on `state` — an `abandoned` card whose body offers no way out must keep the
  // header, or the app's only trial-start entry point is a dead end.
  it('does NOT suppress an abandoned card whose body has no Start CTA', () => {
    expect(trialManageLabel({ state: 'abandoned', actions: [] })).toBe('+ Start');
  });
});

describe('the trial-start entry point is never stranded (code-reviewer regression)', () => {
  // Both branches below ship `state: 'abandoned', actions: []`, and this card is the
  // app's ONLY way to start a trial — so the header must be SHOWN, not suppressed.
  it('an abandoned trial with a live intake-decline flag keeps a way to start a new trial', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'other',
      },
      coverage: { daysLogged: 18, daysElapsed: 19 },
      exposures: { mayStateRecordClean: true, totalFeedings: 54, offDiet: 0 },
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }));
    expect(m.state).toBe('abandoned');
    expect(m.actions).toEqual([]); // the decline branch offers no body CTA…
    expect(trialManageLabel(m)).toBe('+ Start'); // …so the header must not be suppressed
  });

  it('a trial with an unparseable start date keeps a way to start a new trial', () => {
    const m = resolveTrialCard(activeInput({
      trial: { status: 'abandoned', startedAt: 'not-a-date', targetDurationDays: 56, foodLabel: FOOD },
    }));
    expect(m.state).toBe('abandoned');
    expect(m.actions).toEqual([]);
    expect(trialManageLabel(m)).toBe('+ Start');
  });
});

describe('state 2 — mid-trial, clean', () => {
  const model = resolveTrialCard(activeInput({
    standingNote: {
      title: 'About this food',
      body: 'It’s an over-the-counter limited-ingredient diet.',
    },
  }));

  it('renders day progress, not quality', () => {
    expect(model.state).toBe('clean');
    expect(model.dayLine).toBe('Day 23 of 56');
    expect(model.windowLine).toBe('Ends 27 August');
    expect(model.progressFraction).toBeCloseTo(23 / 56, 10);
  });

  // §5.1: coverage is about DAYS WITH MEALS; exposure is about ALL FEEDINGS.
  // They never share a sentence — a treat-only day is excluded from the 22 and
  // included in the 68, and 15.7% of live covered days are treat-only.
  it('renders coverage and exposures as two sentences with their own denominators', () => {
    expect(textOf(model, 'fact')).toEqual([
      'Meals logged on 22 of 23 days.',
      '68 feedings in total — all 68 matched the trial diet or a permitted food.',
    ]);
  });

  it('carries the blind-spot qualifier INLINE on the claim, never as a legend', () => {
    expect(textOf(model, 'qualifier')).toEqual([BLIND_SPOT_QUALIFIER]);
    expect(BLIND_SPOT_QUALIFIER).toContain('flavoured liquids and tablets');
  });

  it('carries the C2 standing fact once per trial, never per feeding', () => {
    expect(model.standingNote).toEqual({
      title: 'About this food',
      body: 'It’s an over-the-counter limited-ingredient diet.',
    });
  });

  it('has a forward line and no "Log a meal" action', () => {
    expect(textOf(model, 'forward')).toEqual(['5 weeks to go.']);
    // §4.2's rule is about LOGGING — "a second door to the same room is not a
    // feature" names the FAB's room. This was an `actions: []` assertion until
    // B-616 PR 2 added the allowed-set reference link, which is why it now names
    // the permitted set rather than asserting emptiness: an empty-array
    // expectation reads as "no actions ever" and would have to be rewritten by
    // every future addition, while what the card must never grow is a write path.
    expect(model.actions.map((a) => a.id)).toEqual(['view_allowed_foods']);
    expect(allStrings(model).join(' ')).not.toMatch(/log a meal/i);
  });

  // B-616 FR-5 — the allowed set's entry point. It is a REFERENCE, so it is quiet
  // (a link, never a button competing with the trial's own state) and it names its
  // destination rather than an instruction.
  it('offers the allowed set as a quiet reference link', () => {
    const [action] = model.actions;
    expect(action).toEqual({
      id: 'view_allowed_foods',
      label: 'What Biscuit can eat',
      emphasis: 'link',
    });
    // R1: the link is about the LIST. Nothing here judges what was fed.
    expect(action.label).not.toMatch(/off[- ]diet|slip|cheat|avoid|safe/i);
  });
});

describe('state 3 — the day after a slip', () => {
  const model = resolveTrialCard(activeInput({
    exposures: { mayStateRecordClean: true,
      totalFeedings: 68,
      offDiet: 3,
      mostRecent: { label: 'Zuke’s Mini Naturals (chicken)', when: 'Yesterday, 6:40 pm' },
    },
  }));

  it('renders both denominators, in positive form', () => {
    expect(model.state).toBe('exposures');
    expect(textOf(model, 'fact')).toEqual([
      'Meals logged on 22 of 23 days.',
      '68 feedings in total — 65 matched, 3 did not.',
    ]);
  });

  it('says the count is a floor, never a total — on the claim itself', () => {
    expect(textOf(model, 'qualifier')).toEqual([
      `${BLIND_SPOT_QUALIFIER} The 3 are what’s been logged, not a total.`,
    ]);
  });

  // §6.7. The screen that decides whether an owner finishes six weeks.
  it('records and continues — no restart, no voiding, no quantified reassurance', () => {
    expect(textOf(model, 'note')).toEqual([
      'Yesterday, 6:40 pm — Zuke’s Mini Naturals (chicken). Keep going with the ' +
      'trial diet. Your vet will want to see this at the recheck.',
    ]);
    const joined = allStrings(model).join(' ');
    expect(joined).not.toMatch(/start (over|again)|restart|ruined|void|compromised/i);
    expect(joined).not.toMatch(/probably won’t matter|small amount/i);
  });

  it('a single exposure reads "That 1 is", not "The 1 are"', () => {
    const one = resolveTrialCard(activeInput({
      exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 1 },
    }));
    expect(textOf(one, 'qualifier')[0]).toContain('That 1 is what’s been logged, not a total.');
  });
});

describe('state 4 — below the coverage floor', () => {
  const model = resolveTrialCard(activeInput({
    belowCoverageFloor: true,
    coverage: { daysLogged: 6, daysElapsed: 23 },
    exposures: { mayStateRecordClean: true, totalFeedings: 9, offDiet: 0 },
  }));

  // Jordan's binding constraint: the owner below the floor is by definition the
  // one closest to quitting, so the card gets MORE here, not less.
  it('does not go blank, empty or scary', () => {
    expect(model.state).toBe('below_floor');
    expect(model.lines.length).toBeGreaterThanOrEqual(4);
    expect(textOf(model, 'lead')).toEqual([
      'There isn’t enough logged yet for your vet to read much into this.',
    ]);
    expect(textOf(model, 'forward')).toEqual([
      'Every meal from here counts, and there are 5 weeks left to build it.',
    ]);
  });

  it('is about the RECORD, never the person', () => {
    expect(textOf(model, 'fact')).toEqual([
      'Of what’s on the record so far: meals on 6 of 23 days, 9 feedings in total, ' +
      'and all 9 matched the trial diet or a permitted food.',
    ]);
    expect(allStrings(model).join(' ')).not.toMatch(/you (haven’t|have not|aren’t|are not) (been )?log/i);
  });

  // §5.2 is two-sided: below the floor Culprit may neither claim a clean trial
  // NOR raise an absence-based alarm.
  it('raises no absence-based alarm', () => {
    expect(allStrings(model).join(' ')).not.toMatch(/no meals|hasn’t eaten|missing|failing/i);
  });

  // The floor's NUMBER is PR 5's to set (§5.2 leaves it undefined on purpose:
  // three defensible coverage definitions read 100% / 84% / 19% over the same 70
  // days of live data). This card never invents one.
  it('is driven by an input flag, never a threshold computed here', () => {
    const withoutFlag = resolveTrialCard(activeInput({
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { mayStateRecordClean: true, totalFeedings: 9, offDiet: 0 },
    }));
    expect(withoutFlag.state).toBe('clean');
  });
});

describe('state 5 — the milestone (PR 6, §4.3)', () => {
  const model = resolveTrialCard(activeInput({ nowMs: localNoon(2026, 8, 27) }));

  it('is action-first and never reads as permission to stop', () => {
    expect(model.state).toBe('milestone');
    expect(model.dayLine).toBe('Day 56 of 56 — the window you set is done.');
    expect(textOf(model, 'note')).toEqual(['Your vet decides when the diet changes.']);
    // ACVIM 2026: continue the diet ≥12 weeks before transitioning away. A
    // day-28 "trial complete" would tell a GI owner to stop at a quarter of that.
    expect(allStrings(model).join(' ')).not.toMatch(/complete|finished|you can stop|all done/i);
  });

  it('renders the day line as a HEADLINE and drops the bar', () => {
    // The design lock draws this as `.milestone-h` (serif, 21px) with NO progress
    // bar. PR 6's first cut routed it through the ordinary `dayLine` style and
    // kept a 100%-full accent bar — so the sentence that has to stop an owner
    // rendered exactly like "Day 23 of 56" on a Tuesday, under a saturated bar
    // that is completion vocabulary drawn in pixels. Caught by `pm-feature-review`.
    expect(model.dayLineRole).toBe('headline');
    expect(model.progressFraction).toBeNull();
    // Every other state keeps the quiet treatment.
    expect(resolveTrialCard(activeInput()).dayLineRole).toBe('meta');
    expect(resolveTrialCard(activeInput({ nowMs: localNoon(2026, 9, 1) })).dayLineRole).toBe('meta');
  });

  it('offers the three-way decision, action before verdict', () => {
    expect(model.actions.map((a) => a.id)).toEqual([
      'trial_extend', 'trial_complete', 'trial_stopped_early',
    ]);
    // Nothing on this card asks how it went. §4.3: a milestone that asks the
    // verdict first turns an unanswered card into a stalled trial, and a stalled
    // trial is the one the vet report renders as still ongoing.
    expect(allStrings(model).join(' ')).not.toMatch(/how did it go|better|worse/i);
  });

  it('`Keep going` names its default and is never the weaker option', () => {
    const [keep, done] = model.actions;
    expect(keep.label).toBe('Keep going — 4 more weeks');
    expect(done.label).toBe('This trial is done');
    // §4.3's weight rule, asserted where it can actually be asserted. The design
    // lock draws filled-plus-ghost (equal-OR-greater); the criterion is that
    // keep-going is never weaker, so this is the assertion that survives either
    // PM ruling on the mock's flagged question.
    const rank = { primary: 2, secondary: 1, link: 0 } as const;
    expect(rank[keep.emphasis]).toBeGreaterThanOrEqual(rank[done.emphasis]);
  });

  it('carries the ACVIM continuation sentence on a GI trial, and only there', () => {
    const gi = resolveTrialCard(
      activeInput({
        nowMs: localNoon(2026, 8, 27),
        trial: {
          status: 'active', startedAt: '2026-07-03', targetDurationDays: 56,
          foodLabel: FOOD, indication: 'gi',
        },
      }),
    );
    // The live clinical harm §4.3 names: a milestone at the ASSESSMENT window
    // reading as an ending, on a diet the vet wanted continued for three months.
    expect(textOf(gi, 'note')).toEqual([
      'Your vet decides when the diet changes. For gut problems, diets are often ' +
      'continued for around three months even when things look better early.',
    ]);
    expect(gi.actions[0].label).toBe('Keep going — 2 more weeks');

    // Skin and an unset indication both take the base note and the 28-day default.
    expect(textOf(model, 'note')[0]).not.toMatch(/three months/);
  });
});

describe('the continuation statement survives onto the TERMINAL cards', () => {
  // The second `adversarial-reviewer` pass's F2: the fix commit carried the
  // sentence onto the outcome SHEET and stopped there, so a GI owner read it once
  // while deciding and then lived with a card headed "Diet trial · finished" that
  // said nothing about continuing — on the indication ACVIM says continue >=12
  // weeks. This project's own B-494 rule one surface over: a flow that teaches the
  // owner it will tell them about continuation may not then go silent.
  function terminal(over: Partial<TrialCardTrial>) {
    return resolveTrialCard(
      activeInput({
        trial: {
          status: 'completed', startedAt: '2026-07-03', endedAt: '2026-07-30',
          targetDurationDays: 28, foodLabel: FOOD, indication: 'gi', ...over,
        },
      }),
    );
  }

  it('carries the ACVIM sentence onto a completed GI card', () => {
    expect(textOf(terminal({ outcome: 'improved' }), 'note').join(' ')).toMatch(
      /around three months/,
    );
  });

  it('answers `symptoms_resolved` instead of leaving it hanging', () => {
    // The case it most exists for: an owner who stopped BECAUSE things improved
    // has stopped a diet that may be working, short of the ACVIM window. Without
    // this the card renders their own stated reason back at them, unanswered.
    const m = terminal({ status: 'abandoned', stoppedReason: 'symptoms_resolved' });
    expect(textOf(m, 'lead')).toContain('Stopped because the symptoms cleared up.');
    expect(textOf(m, 'note').join(' ')).toMatch(/around three months/);
  });

  it('stays quiet when the VET was the one who said stop', () => {
    // Restating "your vet decides when the diet changes" to an owner whose vet has
    // already decided reads as second-guessing the clinician.
    const m = terminal({ status: 'abandoned', stoppedReason: 'vet_advised' });
    expect(textOf(m, 'note').join(' ')).not.toMatch(/Your vet decides/);
  });

  it('renders on every OTHER reason, so its presence is not a tell', () => {
    for (const reason of ['refused', 'cost', 'too_hard', 'symptoms_resolved', 'other']) {
      const m = terminal({ status: 'abandoned', stoppedReason: reason });
      expect(textOf(m, 'note').join(' ')).toMatch(/Your vet decides when the diet changes\./);
    }
  });
});

describe('the intake-decline replacement draws no saturated bar', () => {
  // F6: the decline branch inherited `progressFraction` from the base, so at day
  // 56 of 56 it drew a 100% accent bar over a pet that has stopped eating — on the
  // one card whose entire job is to say the animal outranks the trial. The
  // milestone drops its bar for exactly this reason one branch away.
  it('is null at the target and past it', () => {
    for (const now of [localNoon(2026, 8, 27), localNoon(2026, 9, 1)]) {
      const m = resolveTrialCard(
        activeInput({ nowMs: now, intakeDeclineHeadline: 'Mochi has eaten less than usual today.' }),
      );
      expect(m.state).toBe('intake_decline');
      expect(m.progressFraction).toBeNull();
    }
  });

  it('still carries real day progress mid-trial', () => {
    const m = resolveTrialCard(
      activeInput({ intakeDeclineHeadline: 'Mochi has eaten less than usual today.' }),
    );
    expect(m.progressFraction).toBeGreaterThan(0);
    expect(m.progressFraction).toBeLessThan(1);
  });
});

describe('the stopped-early reasons render as sentences, not tokens', () => {
  // PR 6 added `cost` / `too_hard` / `symptoms_resolved` to the reason set and, in
  // its first cut, to neither renderer — so the card read "Stopped because cost."
  // and "Stopped because too_hard.", and the vet report read "Stopped: too_hard."
  // The verbatim fallback is a good failure mode for a token nobody has got to
  // yet and a terrible one for a token the same PR introduced.
  it.each([
    ['refused', 'Stopped because Biscuit wouldn’t eat it.'],
    ['vet_advised', 'Stopped because the vet said to change diets.'],
    ['cost', 'Stopped because of the cost.'],
    ['too_hard', 'Stopped because keeping other food away was too hard.'],
    ['symptoms_resolved', 'Stopped because the symptoms cleared up.'],
    ['other', 'Stopped early.'],
  ])('%s renders as a sentence', (reason, expected) => {
    const model = resolveTrialCard(
      activeInput({
        trial: {
          status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
          targetDurationDays: 56, foodLabel: FOOD, stoppedReason: reason,
        },
      }),
    );
    expect(textOf(model, 'lead')).toContain(expected);
    // No raw token reaches the owner, on any reason.
    for (const s of allStrings(model)) expect(s).not.toMatch(/_/);
  });

  it('never blames the owner for the reason (§6.9)', () => {
    const all = ['cost', 'too_hard', 'symptoms_resolved'].map((reason) =>
      allStrings(
        resolveTrialCard(
          activeInput({
            trial: {
              status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
              targetDurationDays: 56, foodLabel: FOOD, stoppedReason: reason,
            },
          }),
        ),
      ).join(' '),
    ).join(' ');
    // "Stopped because YOU couldn't keep him off other food" is the same fact
    // written as a failing.
    expect(all).not.toMatch(/\byou (?:couldn’t|didn’t|failed)/i);
    expect(all).not.toMatch(/fail|gave up|too expensive for you/i);
  });
});

describe('state 6 — overrun', () => {
  const model = resolveTrialCard(activeInput({ nowMs: localNoon(2026, 9, 1) }));

  // Dr. Chen: "a trial that has drifted past its window without anyone closing
  // it is the most common thing I see, and an app that renders Day 61 of 56
  // tells me nobody is reading it."
  it('never renders "Day N of M" where N > M', () => {
    expect(model.state).toBe('overrun');
    expect(model.dayLine).toBe('Day 61 — 5 days past the window you set');
    expect(model.dayLine).not.toMatch(/of 56/);
    expect(model.windowLine).toBe('Window ended 27 August');
  });

  it('clamps the bar and lets the copy take over', () => {
    expect(model.progressFraction).toBe(1);
    expect(textOf(model, 'note')).toEqual([
      'Still running. Plenty of trials run past their window on the vet’s say-so. ' +
      'When you know what’s next, tell Culprit — a trial with no ending reads to ' +
      'your vet as one that’s still going.',
    ]);
  });

  it('still renders both record facts', () => {
    expect(textOf(model, 'fact')).toEqual([
      'Meals logged on 22 of 23 days.',
      '68 feedings in total — all 68 matched the trial diet or a permitted food.',
    ]);
  });

  it('reads "1 day past" in the singular', () => {
    const oneDay = resolveTrialCard(activeInput({ nowMs: localNoon(2026, 8, 28) }));
    expect(oneDay.dayLine).toBe('Day 57 — 1 day past the window you set');
  });
});

describe('state 7a — completed', () => {
  const model = resolveTrialCard(activeInput({
    trial: {
      status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
      targetDurationDays: 56, foodLabel: FOOD, outcome: 'improved',
    },
    coverage: { daysLogged: 54, daysElapsed: 56 },
    exposures: { mayStateRecordClean: true, totalFeedings: 182, offDiet: 6 },
  }));

  it('keeps rendering after completion, as a dated range', () => {
    expect(model.state).toBe('completed');
    expect(model.kicker).toBe('Diet trial · finished');
    expect(model.dayLine).toBe('3 July – 27 August · 56 days');
    expect(model.progressFraction).toBeNull();
  });

  it('renders the owner-reported outcome as the OWNER’s judgement', () => {
    expect(textOf(model, 'note')).toContain(
      'You said Biscuit was better at the end of it. That goes on the vet report in ' +
      'your name, so your vet reads it as your judgement rather than as something ' +
      'Culprit worked out.',
    );
    // §4.3 is a property of the FLOW: the continuation sentence reaches the
    // screen the owner LIVES WITH after ending the trial, not only the one that
    // offered to end it. It renders on every terminal path except `vet_advised`,
    // where the vet has already decided and restating it reads as second-guessing
    // them — so its presence is never a tell about which reason was picked.
    expect(textOf(model, 'note')).toContain('Your vet decides when the diet changes.');
    // §7: the words confirmed / diagnosis / food allergy may not appear near it.
    const joined = allStrings(model).join(' ');
    expect(joined).not.toMatch(/confirmed|diagnosis|food allergy/i);
  });

  it('offers the report, not another trial action', () => {
    expect(model.actions).toEqual([
      { id: 'open_report', label: 'Open vet report', emphasis: 'link' },
    ]);
  });

  // R4 (PM, 2026-07-27) — the qualitative approach is PAUSED; the data leads.
  // The outcome question stays but is explicitly optional and skippable, so the
  // card must render NOTHING rather than a placeholder when it went unanswered.
  // Pinned here because "it already works" is exactly how a conditional gets
  // deleted by a later edit: an `outcome` of null must produce no verdict line
  // and no gap where one would be.
  it('renders no verdict line at all when the owner skipped the question', () => {
    const m = resolveTrialCard(activeInput({
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD, outcome: null,
      },
      coverage: { daysLogged: 54, daysElapsed: 56 },
      exposures: { mayStateRecordClean: true, totalFeedings: 182, offDiet: 6 },
    }));
    expect(m.state).toBe('completed');
    const joined = allStrings(m).join(' ');
    expect(joined).not.toMatch(/You said/);
    expect(joined).not.toMatch(/not (?:answered|recorded)|no answer|unanswered|—\s*$/i);
    // The rest of the card is unchanged: the record still renders, and so does
    // the continuation sentence §4.3 owes a GI owner.
    expect(textOf(m, 'fact')).toContain('Meals logged on 54 of 56 days.');
    expect(textOf(m, 'note')).toContain('Your vet decides when the diet changes.');
    // …and the report is still one tap away, which is the point of state 7a.
    expect(m.actions.map((a) => a.id)).toEqual(['open_report']);
  });
});

describe('state 7b — abandoned', () => {
  const refused = resolveTrialCard(activeInput({
    trial: {
      status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
      targetDurationDays: 56, foodLabel: FOOD,
      stoppedReason: 'Biscuit wouldn’t eat it', stoppedForRefusal: true,
    },
    coverage: { daysLogged: 18, daysElapsed: 19 },
    exposures: { mayStateRecordClean: true, totalFeedings: 54, offDiet: 0 },
  }));

  it('is never framed as failure', () => {
    expect(refused.state).toBe('abandoned');
    expect(refused.kicker).toBe('Diet trial · stopped early');
    expect(refused.dayLine).toBe('3 July – 21 July · 19 days');
    expect(allStrings(refused).join(' ')).not.toMatch(/failed|failure|gave up|didn’t manage/i);
  });

  it('routes the refusal toward the vet, not toward a compliance verdict', () => {
    expect(textOf(refused, 'lead')).toEqual(['Stopped because Biscuit wouldn’t eat it.']);
    expect(textOf(refused, 'note')).toContain(
      'That’s a useful thing for your vet to know — it usually means a different ' +
      'diet, not a different plan.',
    );
    // The continuation sentence lands here too — see state 7a. Withholding it on
    // the refusal path specifically would make its presence a tell about which
    // reason the owner picked.
    expect(textOf(refused, 'note')).toContain('Your vet decides when the diet changes.');
  });

  // The round-1b defect, and it was a RULE change: round 1 rendered "All 54
  // matched the trial diet or a permitted food" three lines above "wouldn't eat
  // it". §5.2's composition rule was drawn as a LIVE-FLAG replacement only, so
  // it never reached the terminal states. A refused trial is structurally
  // incapable of rendering an adherence line.
  it('renders NO clean-trial statement anywhere, at any coverage', () => {
    const joined = allStrings(refused).join(' ');
    expect(joined).not.toMatch(/all 54 matched/i);
    expect(joined).not.toMatch(/matched the trial diet or a permitted food/i);
    expect(textOf(refused, 'fact')).toEqual([
      'Culprit isn’t showing how clean these 19 days were. A diet that wasn’t eaten ' +
      'can’t be read as one that was followed — the record is meals offered on 18 of ' +
      '19 days, 54 feedings in total, and what your vet needs from it is the refusal.',
    ]);
  });

  it('a NON-refusal abandonment still reports the record normally', () => {
    const cost = resolveTrialCard(activeInput({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'it cost too much',
      },
      coverage: { daysLogged: 18, daysElapsed: 19 },
      exposures: { mayStateRecordClean: true, totalFeedings: 54, offDiet: 0 },
    }));
    expect(textOf(cost, 'fact')).toEqual([
      'Meals logged on 18 of 19 days.',
      '54 feedings in total — all 54 matched the trial diet or a permitted food.',
    ]);
  });
});

describe('replacement 8 — intake decline', () => {
  const model = resolveTrialCard(activeInput({
    species: 'cat',
    petName: 'Mochi',
    intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    coverage: { daysLogged: 9, daysElapsed: 9 },
    exposures: { mayStateRecordClean: true, totalFeedings: 18, offDiet: 0 },
  }));

  // §5.2 proof #1: a cat refusing the hydrolyzed diet every day whose owner
  // dutifully logs the offered bowl scores 100% coverage and 0 exposures — a
  // maximally clean trial rendered over a starving animal.
  it('REPLACES the adherence line rather than rendering beside it', () => {
    expect(model.state).toBe('intake_decline');
    expect(textOf(model, 'fact')).toEqual([]);
    expect(allStrings(model).join(' ')).not.toMatch(/matched|feedings in total|Meals logged on/);
  });

  // Round 5 moved both lines onto the `flag` role. The rule they encode was
  // already structural in the resolver; what was missing is that the VIEW drew
  // them in ordinary body weight, so the one composition §5.2 makes structural
  // was the quietest thing on the card.
  it('puts the cat before the trial, in the safety register', () => {
    expect(textOf(model, 'flag')).toEqual([
      'Mochi has left most of her food for 3 days.',
      'A cat that stops eating needs a call today, whatever the trial is doing. ' +
      'Culprit isn’t reading these days as a clean run while this is going on.',
    ]);
    // …and NOT as body text, which is what the tinted block replaces.
    expect(textOf(model, 'lead')).toEqual([]);
    expect(textOf(model, 'note')).toEqual([]);
  });

  it('still renders the day counter, which is not a claim about the pet', () => {
    expect(model.dayLine).toBe('Day 23 of 56');
  });
});

// The two defects the wrap's adversarial pass found — pinned so they stay dead.
describe('the intake-decline replacement is TERMINAL-STATE-AWARE', () => {
  // Round 1b's lesson, in mirror image: the first cut of this resolver made
  // refusal terminal-aware but let a LIVE decline flag through the terminal
  // branches, so a completed trial rendered its full adherence lines over a cat
  // that has stopped eating NOW.
  it('a completed trial with a live flag renders no record line', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD, outcome: 'improved',
      },
      coverage: { daysLogged: 54, daysElapsed: 56 },
      exposures: { mayStateRecordClean: true, totalFeedings: 182, offDiet: 6 },
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }));
    // The READING is gone — no coverage, no statement about what matched.
    expect(allStrings(m).join(' ')).not.toMatch(/matched|feedings in total|Meals logged on/);
    // …but the FLOOR is not. Both terminal decline branches used to withhold the
    // off-diet count that the ACTIVE card discloses on the identical record —
    // round 4's rule in the two branches `everyState` cannot walk, since every
    // decline fixture in that list is an active trial.
    expect(textOf(m, 'fact').join(' ')).toContain(
      'Separately, 6 logged feedings were outside the trial diet.',
    );
    expect(textOf(m, 'flag')).toContain('Mochi has left most of her food for 3 days.');
    // The owner's outcome still renders — it is attribution, not adherence.
    expect(textOf(m, 'flag').join(' ')).toContain('needs a call today');
  });

  it('an abandoned trial with a live flag renders no record line', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'other',
      },
      coverage: { daysLogged: 18, daysElapsed: 19 },
      exposures: { mayStateRecordClean: true, totalFeedings: 54, offDiet: 0 },
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }));
    expect(textOf(m, 'fact')).toEqual([]);
    expect(allStrings(m).join(' ')).not.toMatch(/matched|feedings in total|Meals logged on/);
  });
});

describe('the stopped_reason TOKEN contract (PR 3’s endActiveTrial)', () => {
  // The shipped writer stores tokens (`refused` / `vet_advised` / `other`),
  // documented in lib/dietTrialSetup.ts as load-bearing. The resolver maps them —
  // "Stopped because refused." is not a sentence — and refusal is DERIVED from
  // the token, so the no-adherence-line rule cannot be lost to a caller that
  // forgot to set the boolean.
  it('maps the tokens to owner-facing phrases', () => {
    const withReason = (stoppedReason: string) => resolveTrialCard(activeInput({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD, stoppedReason,
      },
    }));
    expect(textOf(withReason('refused'), 'lead'))
      .toEqual(['Stopped because Biscuit wouldn’t eat it.']);
    expect(textOf(withReason('vet_advised'), 'lead'))
      .toEqual(['Stopped because the vet said to change diets.']);
    expect(textOf(withReason('other'), 'lead')).toEqual(['Stopped early.']);
  });

  it('the raw token never renders', () => {
    const m = resolveTrialCard(activeInput({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'vet_advised',
      },
    }));
    expect(allStrings(m).join(' ')).not.toMatch(/vet_advised|because refused\./);
  });

  it('the token ALONE suppresses the adherence line — no boolean needed', () => {
    const m = resolveTrialCard(activeInput({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'refused',
        // NOTE: stoppedForRefusal deliberately NOT set.
      },
      coverage: { daysLogged: 18, daysElapsed: 19 },
      exposures: { mayStateRecordClean: true, totalFeedings: 54, offDiet: 0 },
    }));
    expect(allStrings(m).join(' ')).not.toMatch(/matched the trial diet or a permitted food/i);
    expect(textOf(m, 'fact').join(' ')).toContain('Culprit isn’t showing how clean');
  });
});

describe('replacement 9 — free-fed', () => {
  // A FREE-FED TRIAL CAN NEVER CLAIM ALL-MATCHED — `mayStateRecordClean` returns
  // false on `intakeNotDirectlyObserved` alone, so the loader can only ever
  // supply `false` here. The fixture says so explicitly rather than relying on
  // the resolver's state check, because that is the contract the wiring keeps.
  const model = resolveTrialCard(activeInput({
    petName: 'Mochi',
    freeFed: { loggedFeedings: 22 },
    exposures: { mayStateRecordClean: false, totalFeedings: 22, offDiet: 0 },
  }));

  // Without this the most tightly controlled feline trial in the app scores
  // near-zero coverage and Culprit spends eight weeks telling a compliant owner
  // she is failing.
  it('replaces the coverage RATIO with the not-directly-observed marker', () => {
    expect(model.state).toBe('free_fed');
    expect(textOf(model, 'lead')).toEqual([
      'Mochi grazes from a bowl that’s topped up, so there’s no day-by-day count of ' +
      'what was eaten.',
    ]);
    expect(allStrings(model).join(' ')).not.toMatch(/Meals logged on \d+ of \d+ days/);
  });

  // ── THE FLIPPED LOCK (round 5 ①; this test used to assert the forbidden
  // string verbatim). "all 22 were the trial diet" is EXACTLY the sentence
  // `mayStateRecordClean` refuses under `intakeNotDirectlyObserved`, and it was
  // green — a test locking a rule violation in place, which is the worst kind of
  // green there is. Both intake lanes are structurally blind in this state: a
  // topped-up bowl produces no rated feedings, and `detectIntakeDecline` excludes
  // free-fed foods by invariant #6. Unobservable is not clean.
  it('reports the COUNT and makes no claim about what matched', () => {
    expect(textOf(model, 'fact')).toEqual(['22 bowl top-ups and wet meals logged so far.']);
    expect(textOf(model, 'qualifier')).toEqual([BLIND_SPOT_QUALIFIER]);
    expect(allStrings(model).join(' ')).not.toMatch(/all \d+ (were|matched)/i);
  });

  it('names an off-list bowl even though it cannot affirm a clean one', () => {
    const m = resolveTrialCard(activeInput({
      petName: 'Mochi',
      freeFed: { loggedFeedings: 22 },
      exposures: { mayStateRecordClean: false, totalFeedings: 22, offDiet: 4 },
    }));
    // The floor direction is DISCLOSE MORE. Withholding the claim must never
    // withhold the exposure.
    expect(textOf(m, 'fact')).toEqual([
      '22 bowl top-ups and wet meals logged so far; 4 were not the trial diet.',
    ]);
  });

  it('says "1 bowl top-up or wet meal", not "1 bowl top-ups"', () => {
    const m = resolveTrialCard(activeInput({
      petName: 'Mochi',
      freeFed: { loggedFeedings: 1 },
      exposures: { mayStateRecordClean: false, totalFeedings: 1, offDiet: 0 },
    }));
    expect(textOf(m, 'fact')).toEqual(['1 bowl top-up or wet meal logged so far.']);
  });

  // Round 5: Sam's card was a count and a caveat for six weeks. The card's job
  // is keeping her IN the trial (§4.2), and this was the one active state with
  // nothing forward on it.
  it('carries a forward line', () => {
    expect(textOf(model, 'forward')).toEqual(['5 weeks to go.']);
  });
});



// ── B-533 — the gate on the one affirmative sentence this file says ──────────
describe('mayStateRecordClean gates the CLAIM, never the COUNT', () => {
  // Every break the pre-ship review found at this boundary was the same break:
  // the module withholds for five computed reasons and the card knew none of them.
  it('says the count and stops when the claim is not sayable', () => {
    const m = resolveTrialCard(activeInput({
      exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 0 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      'Meals logged on 22 of 23 days.',
      '68 feedings in total. Culprit isn’t saying how many matched the trial diet on ' +
      'this record.',
    ]);
    expect(allStrings(m).join(' ')).not.toMatch(/all \d+ matched/i);
  });

  it('still says it when the module allows it', () => {
    const m = resolveTrialCard(activeInput());
    expect(textOf(m, 'fact')).toContain(
      '68 feedings in total — all 68 matched the trial diet or a permitted food.',
    );
  });

  // §5.2 rules the exposure count a FLOOR, and the floor direction is DISCLOSE
  // MORE. Withholding the number is how the last two attempts at this wiring
  // deleted real findings.
  it('never withholds the off-diet count', () => {
    const m = resolveTrialCard(activeInput({
      exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 3 },
    }));
    expect(textOf(m, 'fact')).toContain('68 feedings in total — 65 matched, 3 did not.');
  });

  // The sub-floor card carried its OWN copy of the affirmative claim, which is
  // exactly how a rule enforced in one place ships broken in another.
  it('gates the sub-floor card’s combined sentence too', () => {
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { mayStateRecordClean: false, totalFeedings: 9, offDiet: 0 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      'Of what’s on the record so far: meals on 6 of 23 days, and 9 feedings in total.',
    ]);
    expect(allStrings(m).join(' ')).not.toMatch(/all \d+ matched/i);
  });
});

describe('replacement 10/11 — the multi-pet scope caveat', () => {
  it('gates the claim on household pet count alone', () => {
    const model = resolveTrialCard(activeInput({ otherPetNames: ['Mochi'] }));
    expect(textOf(model, 'caveat')).toEqual([
      'Biscuit shares a home with Mochi. Culprit records food against one pet at a ' +
      'time, so it can’t rule out Biscuit eating something logged for them.',
    ]);
  });

  // feeding_arrangements.is_shared ships INERT ("the UX always writes FALSE"),
  // so a shared bowl is NOT knowable and no copy may imply it is.
  it('claims nothing about bowls', () => {
    const model = resolveTrialCard(activeInput({ otherPetNames: ['Mochi'] }));
    expect(allStrings(model).join(' ')).not.toMatch(/bowl|shares? (a|the) (bowl|dish)/i);
  });

  it('names several housemates readably', () => {
    const model = resolveTrialCard(activeInput({ otherPetNames: ['Mochi', 'Rex', 'Bo'] }));
    expect(textOf(model, 'caveat')[0]).toContain('shares a home with Mochi, Rex and Bo.');
  });

  // It gates a CLAIM. With no claim on the card there is nothing to gate, and an
  // unattached caveat is noise on the two states that most need to be calm.
  it('does not fire when there is no claim above it', () => {
    const declining = resolveTrialCard(activeInput({
      otherPetNames: ['Mochi'],
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }));
    expect(textOf(declining, 'caveat')).toEqual([]);
  });
});

// ── The pre-PR-5 wiring: no classifier means silence, never an all-clear ─────

describe('with no exposure classifier available (before PR 5)', () => {
  const model = resolveTrialCard(activeInput({ exposures: null }));

  it('renders coverage but says NOTHING about what matched', () => {
    expect(textOf(model, 'fact')).toEqual(['Meals logged on 22 of 23 days.']);
    expect(allStrings(model).join(' ')).not.toMatch(/matched|did not|off-diet/i);
  });

  it('still carries the blind-spot qualifier on the coverage claim', () => {
    expect(textOf(model, 'qualifier')).toEqual([BLIND_SPOT_QUALIFIER]);
  });
});

// ── Day math: inherited from B-421's oracle, never re-derived ───────────────

describe('day math', () => {
  it('is getDietTrialProgress and nothing else', () => {
    const input = activeInput();
    const model = resolveTrialCard(input);
    const progress = getDietTrialProgress(
      { startedAt: '2026-07-03', targetDurationDays: 56 },
      input.nowMs,
    )!;
    expect(model.dayLine).toBe(`Day ${progress.dayCounter} of ${progress.targetDays}`);
    expect(model.progressFraction).toBe(progress.fraction);
  });

  // The AC pins the counter under UTC−7 and UTC+11 at 00:30 and 23:30 local.
  // `Date` in this runner is fixed to the host zone, so the equivalent assertion
  // is that a local-midnight-crossing does not move the counter within one local
  // day, and that both edges of the day agree — which is what B-421 bought.
  it('is stable across a local day, at both edges', () => {
    const at0030 = new Date(2026, 6, 25, 0, 30, 0).getTime();
    const at2330 = new Date(2026, 6, 25, 23, 30, 0).getTime();
    const early = resolveTrialCard(activeInput({ nowMs: at0030 }));
    const late = resolveTrialCard(activeInput({ nowMs: at2330 }));
    expect(early.dayLine).toBe('Day 23 of 56');
    expect(late.dayLine).toBe('Day 23 of 56');
  });

  it('flips exactly once at the next local midnight', () => {
    const lastMinute = new Date(2026, 6, 25, 23, 59, 0).getTime();
    const firstMinute = new Date(2026, 6, 26, 0, 1, 0).getTime();
    expect(resolveTrialCard(activeInput({ nowMs: lastMinute })).dayLine).toBe('Day 23 of 56');
    expect(resolveTrialCard(activeInput({ nowMs: firstMinute })).dayLine).toBe('Day 24 of 56');
  });

  it('ends a 56-day window on start + 55, not start + 56', () => {
    const start = trialEndDayIndex(Math.floor(Date.UTC(2026, 6, 3) / MS_PER_DAY), 56);
    expect(formatTrialDate(start)).toBe('27 August');
  });

  it('survives an unparseable start date without guessing a day', () => {
    const model = resolveTrialCard(activeInput({
      trial: { status: 'active', startedAt: 'not-a-date', targetDurationDays: 56, foodLabel: FOOD },
    }));
    expect(model.dayLine).toBeNull();
    expect(model.progressFraction).toBeNull();
    expect(model.lines).toEqual([]);
  });
});

// ── The Home strip ──────────────────────────────────────────────────────────

describe('the Home strip', () => {
  it('renders only while a trial is ACTIVE', () => {
    expect(resolveTrialStrip({ ...activeInput(), trial: null })).toBeNull();
    expect(resolveTrialStrip(activeInput({
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD,
      },
    }))).toBeNull();
    expect(resolveTrialStrip(activeInput({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD,
      },
    }))).toBeNull();
    expect(resolveTrialStrip(activeInput())).not.toBeNull();
  });

  it('is a day count, a day bar and one line', () => {
    const strip = resolveTrialStrip(activeInput())!;
    expect(strip.header).toBe('Diet trial · day 23 of 56');
    expect(strip.line).toBe(
      'Zignature Kangaroo Formula · ends 27 August · meals logged on 22 of 23 days',
    );
    expect(strip.progressFraction).toBeCloseTo(23 / 56, 10);
  });

  it('renders no percentage and no blended metric', () => {
    const strip = resolveTrialStrip(activeInput())!;
    expect(`${strip.header} ${strip.line}`).not.toMatch(/%|compliance/i);
  });

  it('never reads "day N of M" past the window', () => {
    const strip = resolveTrialStrip(activeInput({ nowMs: localNoon(2026, 9, 1) }))!;
    expect(strip.header).toBe('Diet trial · day 61 — 5 days past');
    expect(strip.line).toContain('window ended 27 August');
  });

  it('drops the coverage line while an intake-decline flag is live', () => {
    const strip = resolveTrialStrip(activeInput({
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }))!;
    expect(strip.line).toBeNull();
    expect(strip.header).toBe('Diet trial · day 23 of 56');
  });
});

// ── The standing vomit-count line (Signals v2 / CUL-13, §4.2) ────────────────
const counts = (over: Partial<TrialResponseCounts> = {}): TrialResponseCounts => ({
  trialDayNumber: 20,
  trialCount: 4,
  baselineCount: 20,
  trialLoggedDays: 18,
  baselineLoggedDays: 40,
  baselineWindowDays: 49,
  densityComparable: true,
  ...over,
});

describe('trialResponseStandingLine (CUL-13)', () => {
  it('renders the two-sided comparison when both windows clear the logged-days floor (mock B1 + B-775 matched units)', () => {
    // B-775: both windows in the SAME unit (days), + "a longer stretch" when the baseline covers ≥1.5×
    // the trial era, so "4 vs 20" can't be read as a like-for-like ratio over unequal windows.
    expect(trialResponseStandingLine(counts())).toBe(
      "Vomiting: 4 in the trial's 20 days · 20 in the 49 days before, a longer stretch.",
    );
  });

  it('shows a two-sided zero without inverting it (the wedge fewer case)', () => {
    expect(trialResponseStandingLine(counts({ trialCount: 0, baselineCount: 7 }))).toBe(
      "Vomiting: 0 in the trial's 20 days · 7 in the 49 days before, a longer stretch.",
    );
  });

  it('drops the baseline clause below the floor (trial-so-far only — the config comment)', () => {
    // A baseline too thin to compare → trial count only; the trial count is never gated away.
    expect(trialResponseStandingLine(counts({ baselineLoggedDays: 3, trialCount: 2 }))).toBe(
      "Vomiting: 2 in the trial's 20 days.",
    );
    // A too-new trial (its own window under-logged) also drops to trial-so-far.
    expect(trialResponseStandingLine(counts({ trialLoggedDays: 3, trialDayNumber: 4, trialCount: 2 }))).toBe(
      "Vomiting: 2 in the trial's 4 days.",
    );
  });

  it('renders nothing when there is no vomiting to describe (never a proactive "0")', () => {
    // Full comparison but no vomiting either window → no line (not "0 · 0").
    expect(trialResponseStandingLine(counts({ trialCount: 0, baselineCount: 0 }))).toBeNull();
    // Below the floor with no trial vomiting → no line (nothing to report yet).
    expect(trialResponseStandingLine(counts({ baselineLoggedDays: 2, trialCount: 0 }))).toBeNull();
  });

  it('pluralises days (both windows in days — B-775)', () => {
    expect(trialResponseStandingLine(counts({ trialDayNumber: 1, trialCount: 1, baselineLoggedDays: 2 }))).toBe(
      "Vomiting: 1 in the trial's 1 day.",
    );
    // A short baseline window (7 days) is NOT ≥1.5× the 20-day trial, so no "longer stretch" cue.
    expect(trialResponseStandingLine(counts({ baselineWindowDays: 7, baselineCount: 3 }))).toBe(
      "Vomiting: 4 in the trial's 20 days · 3 in the 7 days before.",
    );
  });

  it('B-775 — no "longer stretch" cue once the trial era is not the shorter window (safe direction)', () => {
    // trial 40 days vs a 49-day baseline: 49 < 40×1.5, so the windows are comparable enough — no cue,
    // and a falling count over the (longer) trial window under-states the drop, the safe direction.
    expect(trialResponseStandingLine(counts({ trialDayNumber: 40, trialCount: 4, baselineCount: 20 }))).toBe(
      "Vomiting: 4 in the trial's 40 days · 20 in the 49 days before.",
    );
  });

  it('carries no percentage or verdict', () => {
    const line = trialResponseStandingLine(counts()) ?? '';
    expect(line).not.toMatch(/%|working|improv|clean|better|worse/i);
  });

  // THE DENSITY GUARD (adversarial-reviewer, CUL-13) — the never-reassure fix. A reduction on
  // non-comparable logging must NOT show the reassuring baseline; a rise (escalation) always may.
  it('withholds the reassuring reduction when logging density is not comparable', () => {
    // The wedge-attrition case: 0 vomits logged during the trial vs 20 before, but the trial was
    // logged far less intensely than the baseline (densityComparable false). The dangerous
    // "0 · was 20" must NOT render — it drops to trial-so-far, which returns null for trialCount 0.
    expect(
      trialResponseStandingLine(counts({ trialCount: 0, baselineCount: 20, densityComparable: false })),
    ).toBeNull();
    // A non-zero reduction on non-comparable logging still withholds the baseline clause (trial-so-far).
    expect(
      trialResponseStandingLine(counts({ trialCount: 3, baselineCount: 20, densityComparable: false })),
    ).toBe("Vomiting: 3 in the trial's 20 days.");
  });

  it('still shows a RISE on non-comparable logging (escalation is never withheld)', () => {
    // more-during-trial: 8 vs 2. Not a reduction, so the density guard does not apply — the full
    // comparison shows even when densityComparable is false (matching the detector's asymmetry).
    expect(
      trialResponseStandingLine(counts({ trialCount: 8, baselineCount: 2, densityComparable: false })),
    ).toBe("Vomiting: 8 in the trial's 20 days · 2 in the 49 days before, a longer stretch.");
  });

  it('shows the reduction when density IS comparable (the genuine improving trial)', () => {
    expect(
      trialResponseStandingLine(counts({ trialCount: 4, baselineCount: 20, densityComparable: true })),
    ).toBe("Vomiting: 4 in the trial's 20 days · 20 in the 49 days before, a longer stretch.");
  });
});

describe('resolveTrialStrip — the standing line wiring (CUL-13)', () => {
  it('maps input.trialResponse into the strip model as a second line', () => {
    const strip = resolveTrialStrip(activeInput({ trialResponse: counts() }))!;
    expect(strip.trialResponseLine).toBe("Vomiting: 4 in the trial's 20 days · 20 in the 49 days before, a longer stretch.");
  });

  it('is null when the flag is off (no input.trialResponse) — byte-identical strip', () => {
    expect(resolveTrialStrip(activeInput())!.trialResponseLine).toBeNull();
  });

  it('is suppressed while an intake-decline flag is live (never a count beside a safety flag)', () => {
    const strip = resolveTrialStrip(activeInput({
      trialResponse: counts(),
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }))!;
    expect(strip.trialResponseLine).toBeNull();
    expect(strip.line).toBeNull();
  });
});

// ── The card half of the B-533 adversarial regressions ──────────────────────
describe('B-533 adversarial regressions — the card half', () => {
  // BREAK 4 — the §10 S3 head clip is right, and the silence was not. A trial
  // back-dated to the clinic visit 30 days ago whose first log is yesterday
  // rendered "Day 30 of 56" over "Meals logged on 2 of 2 days" and claimed the
  // record was clean: a MORE reassuring card than the un-clipped one it replaced.
  // The report has always rendered the head; the card computed it and dropped it.
  it('discloses the untracked head the coverage denominator excludes', () => {
    const m = resolveTrialCard(activeInput({
      coverage: { daysLogged: 2, daysElapsed: 2 },
      exposures: { mayStateRecordClean: false, totalFeedings: 4, offDiet: 0 },
      untrackedDaysBeforeFirstLog: 28,
    }));
    expect(textOf(m, 'qualifier')).toContain(
      'The first 28 days of the trial aren’t counted here — no meals were logged against ' +
      'them yet.',
    );
    // The clip is not presented as the owner's failing — no "you", no "missing".
    const head = textOf(m, 'qualifier').join(' ');
    expect(head).not.toMatch(/\byou\b|missed|missing|failed/i);
  });

  it('says nothing about a head when there isn’t one', () => {
    const m = resolveTrialCard(activeInput({ untrackedDaysBeforeFirstLog: 0 }));
    expect(allStrings(m).join(' ')).not.toMatch(/logged against/);
  });

  it('renders the head on the sub-floor card too', () => {
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { mayStateRecordClean: false, totalFeedings: 9, offDiet: 0 },
      untrackedDaysBeforeFirstLog: 1,
    }));
    expect(textOf(m, 'qualifier').join(' ')).toContain(
      'The first day of the trial isn’t counted here',
    );
  });

  // BREAK 7 — the teach line must key on the population the refusal lane READS.
});

// ── Round 2 of the adversarial pass: what the FIRST round's fixes broke ──────
//
// Every case below was executed against commit 7a5c46e and rendered a wrong
// answer. They are the cost of fixing round 1 in a hurry, and they are pinned
// here because four of the five are new copy rather than new logic — the class
// that drifts silently.
describe('B-533 adversarial regressions — round 2', () => {
  // ROUND-2 #1, the worst. `allowedSetUnavailable` was wired ONLY into the claim
  // gate, and that gate lives on the `offDiet <= 0` branch — which an empty
  // permit set can never reach, because every feeding falls to rung 3 and
  // `offDiet` equals the total. The card told a fully compliant owner "0 matched,
  // 40 did not" and offered to list her own prescription, while the report
  // withheld the same reading.
  // ROUND-3 SUPERSEDES ROUND-2 HERE. Round 2 made `allowedSetUnavailable`
  // SUPPRESS the exposure reading; round 3 executed that and showed it deletes
  // real findings, is discontinuous at the ten-feeding floor (more evidence →
  // less disclosure), and asserts something false whenever a stale-but-present
  // row is what triggered it. These tests assert the replacement rule: the count
  // and the drill-in always stay, and what is added is the caveat naming which
  // DIRECTION the number is wrong in.
  describe('an unusable allowed list is DISCLOSED, never suppressed', () => {
    const cold = (over: Partial<TrialCardInput> = {}) =>
      resolveTrialCard(activeInput({
        allowedSetUnavailable: true,
        exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 40 },
        ...over,
      }));

    it('keeps the count, the floor suffix and the drill-in', () => {
      const m = cold();
      expect(textOf(m, 'fact')).toContain('40 feedings in total — 0 matched, 40 did not.');
      expect(m.state).toBe('exposures');
      expect(m.actions.map((a) => a.id)).toContain('view_exposures');
    });

    // TWO-SIDED. Naming only the exculpatory reading hands a pre-written excuse
    // to the most non-adherent record the app can produce — the owner feeding the
    // old kibble twice a day trips this flag with a perfectly correct list.
    it('names BOTH readings and excuses neither', () => {
      const q = textOf(cold(), 'qualifier').join(' ');
      // NAMES THE CAUSE THE APP OWNS, and instructs nothing. Earlier drafts said
      // "what's being fed isn't the trial diet" (§6.9 — scores the person) and
      // "Worth checking the list before your vet reads this" — an instruction with
      // no route, since the only affordance on this card opens a sheet offering to
      // END the trial, and a vet-as-audience framing besides.
      expect(q).toContain('Culprit can’t match these against the food list');
      expect(q).not.toContain('this count is too high');
      expect(q).not.toContain('hasn’t been going in');
      expect(q).not.toContain('what’s being fed');
      expect(q).not.toMatch(/Worth checking|before your vet reads/);
    });

    // "not a total" says the true number is ≥ N; the caveat says it may be lower.
    // With an unusable list `offDiet > 0` holds by construction, so the two
    // ALWAYS co-rendered — two opposite arrows on one card.
    it('does not render the floor suffix beside the caveat', () => {
      const q = textOf(cold(), 'qualifier').join(' ');
      expect(q).not.toContain('what’s been logged, not a total');
    });

    // THE DISCONTINUITY, now smoothed in both directions. Round 2 made crossing
    // the reconciliation floor DELETE the finding. Round 4 fixed the deletion but
    // left the caveat gated on the floor, so below it the card was strictly MORE
    // accusatory — the floor suffix asserting the true number is higher, with no
    // caveat at all. The count renders on both sides and so does the caveat.
    it('renders continuously across the reconciliation floor', () => {
      const nine = resolveTrialCard(activeInput({
        allowedSetUnavailable: false,
        exposures: { mayStateRecordClean: false, totalFeedings: 9, offDiet: 9 },
      }));
      const ten = cold({
        exposures: { mayStateRecordClean: false, totalFeedings: 10, offDiet: 10 },
      });
      expect(textOf(nine, 'fact')).toContain('9 feedings in total — 0 matched, 9 did not.');
      expect(textOf(ten, 'fact')).toContain('10 feedings in total — 0 matched, 10 did not.');
      expect(nine.state).toBe(ten.state);
      expect(textOf(nine, 'qualifier').join(' ')).toContain('can’t match these against the food list');
      expect(textOf(ten, 'qualifier').join(' ')).toContain('can’t match these against the food list');
    });

    // …but a trial that genuinely opens with a couple of off-list meals is not
    // yet a pattern, and must not be told nothing matched.
    it('stays quiet on the first couple of off-list meals', () => {
      const m = resolveTrialCard(activeInput({
        allowedSetUnavailable: false,
        exposures: { mayStateRecordClean: false, totalFeedings: 2, offDiet: 2 },
      }));
      expect(textOf(m, 'qualifier').join(' ')).not.toContain('can’t match these against the food list');
    });

    // And it never contradicts the count above it — a permitted topper is enough
    // to produce "40 matched" one line over "None of these matched".
    it('never renders beside a partial match', () => {
      const m = cold({
        exposures: { mayStateRecordClean: false, totalFeedings: 60, offDiet: 20 },
      });
      expect(textOf(m, 'fact').join(' ')).toContain('40 matched, 20 did not');
      expect(textOf(m, 'qualifier').join(' ')).not.toContain('can’t match these against the food list');
    });

    // It never claims no list exists — the commoner trigger is a list that IS
    // recorded and matches nothing, rendered two lines under the card's own
    // food label.
    it('never asserts that no list is recorded', () => {
      expect(allStrings(cold()).join(' ')).not.toMatch(/No allowed-food list is recorded/);
    });

    // ROUND-3 #2: three of the four suppressing paths went silent without saying
    // so — the exact failure `trialViabilityNote`'s docstring names.
    it('discloses on the sub-floor card', () => {
      const m = cold({
        belowCoverageFloor: true,
        coverage: { daysLogged: 3, daysElapsed: 23 },
        exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 40 },
      });
      expect(textOf(m, 'fact').join(' ')).toContain('40 feedings in total');
      expect(textOf(m, 'qualifier').join(' ')).toContain('can’t match these against the food list');
    });

    it('discloses on the free-fed card', () => {
      const m = cold({ freeFed: { loggedFeedings: 40 } });
      expect(m.state).toBe('free_fed');
      expect(textOf(m, 'qualifier').join(' ')).toContain('can’t match these against the food list');
    });
  });

  // ROUND-2 #3 — the head is anchored on NON-TREAT feedings, so "nothing logged"
  // was false for an owner who logged a dental chew every day of it, and was
  // contradicted by the feeding count one line above.
  it('the untracked head says "no meals", not "nothing"', () => {
    const m = resolveTrialCard(activeInput({
      coverage: { daysLogged: 2, daysElapsed: 2 },
      exposures: { mayStateRecordClean: false, totalFeedings: 52, offDiet: 0 },
      untrackedDaysBeforeFirstLog: 28,
    }));
    // CAUSE FIRST. "The first 28 days have no meals logged against them" put the
    // accusatory clause first and the exonerating one last; and "the days count
    // above" was a wrong referent on the sub-floor card, where coverage is a
    // clause inside one paragraph rather than a discrete line.
    const head = textOf(m, 'qualifier').join(' ');
    // THE ASSERTION USED TO PIN THE OPPOSITE OF ITS OWN NAME. Round 2 fixed the
    // head to say "no meals" (the head anchors on NON-TREAT feedings, so an owner
    // logging a dental chew daily got "nothing was logged" over a count that
    // included all 28 of those treats). Round 8's cause-first rewrite replaced the
    // string with "nothing" again and updated THIS LINE to match — so the
    // regression shipped green under a test named after the rule it broke, with
    // the function's own all-caps docstring still claiming the fix.
    expect(head).toContain('aren’t counted here — no meals were logged against them yet');
    expect(head).not.toContain('nothing was logged');
    expect(head).not.toContain('the days count above');
  });

  // ROUND-2 #4 — the widened arrangement read latched `free_fed`: a bowl removed
  // on day 3 described 82 logged meals as bowl top-ups, in the present tense, and
  // deleted the coverage ratio, 38 days after the bowl went.
  it('the free-fed state keys on a bowl in force NOW, not one that ever overlapped', () => {
    // The loader supplies `freeFed` from `intakeNotDirectlyObservedNow`, so a
    // removed bowl arrives as null here — while the CLAIM stays withheld through
    // `mayStateRecordClean`, which keys on the overlap.
    const m = resolveTrialCard(activeInput({
      freeFed: null,
      coverage: { daysLogged: 41, daysElapsed: 41 },
      exposures: { mayStateRecordClean: false, totalFeedings: 82, offDiet: 0 },
    }));
    expect(m.state).not.toBe('free_fed');
    expect(allStrings(m).join(' ')).not.toMatch(/grazes from a bowl|bowl top-ups/);
    expect(textOf(m, 'fact')).toContain('Meals logged on 41 of 41 days.');
    // …and the claim is still withheld over the days nothing could observe.
    expect(allStrings(m).join(' ')).not.toMatch(/all \d+ matched/);
  });

});

// ── Round 3: the terminal blindness and the punished-honesty case ───────────

// ── The DoD pass on the SPLIT: what a subtractive edit left half-removed ─────
describe('B-533 PR A — the reduction’s own regressions', () => {
  // MERGE-BLOCKING when found. The split kept the §10 S3 coverage clip and
  // deleted the loader line that disclosed it, so the ordinary clinic hand-off —
  // trial back-dated to the visit, logging starts at home — rendered "Meals
  // logged on 2 of 2 days" under "Day 30 of 56" with nothing saying why, while
  // `generate-report` printed "The first 28 days…" off the same record. Strictly
  // more reassuring than the card it replaced.
  it('the clip and its disclosure ship together', () => {
    const m = resolveTrialCard(activeInput({
      coverage: { daysLogged: 2, daysElapsed: 2 },
      exposures: { mayStateRecordClean: false, totalFeedings: 4, offDiet: 0 },
      untrackedDaysBeforeFirstLog: 28,
    }));
    expect(textOf(m, 'fact')).toContain('Meals logged on 2 of 2 days.');
    expect(textOf(m, 'qualifier').join(' ')).toContain(
      'The first 28 days of the trial aren’t counted here',
    );
  });

  // State 4 became reachable in this PR (B-474's un-nulling) while its bowl
  // disclosure went to the sibling. Recording a bowl's removal is not something
  // this app may punish.
  it('names the bowl on the sub-floor card it just made reachable', () => {
    const m = resolveTrialCard(activeInput({
      petName: 'Mochi',
      belowCoverageFloor: true,
      freeFedOverlap: true,
      freeFed: null,
      coverage: { daysLogged: 17, daysElapsed: 38 },
      exposures: { mayStateRecordClean: false, totalFeedings: 34, offDiet: 0 },
    }));
    expect(m.state).toBe('below_floor');
    expect(textOf(m, 'qualifier').join(' ')).toContain(
      'For part of this trial Mochi had a bowl that was topped up',
    );
  });

  // The two exemptions B-474 turned from vacuous into real suppressions.
  it('discloses an off-diet feeding logged on day 1', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: localNoon(2026, 7, 3),
      coverage: { daysLogged: 1, daysElapsed: 1 },
      exposures: { mayStateRecordClean: false, totalFeedings: 3, offDiet: 2 },
    }));
    expect(m.state).toBe('day_one');
    expect(textOf(m, 'fact').join(' ')).toContain('2 logged feedings were outside the trial diet');
    // …and still no claim in either direction (R1).
    expect(allStrings(m).join(' ')).not.toMatch(/all \d+ matched|no off-diet/i);
  });

  it('discloses the floor at the milestone, where the owner decides', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: localNoon(2026, 8, 27),
      exposures: { mayStateRecordClean: false, totalFeedings: 124, offDiet: 12 },
    }));
    expect(m.state).toBe('milestone');
    expect(textOf(m, 'fact').join(' ')).toContain('12 logged feedings were outside the trial diet');
    // §4.3's actual bar: no COVERAGE beside the stop button, and no completion
    // vocabulary. Both still hold.
    expect(allStrings(m).join(' ')).not.toMatch(/Meals logged on|complete|finished/i);
  });
});

// ── What the DoD fixes themselves introduced ────────────────────────────────
describe('B-533 PR A — the fixes’ own regressions', () => {
  // GATE 1. The clip is right, but the strip is one line with nowhere to carry
  // the head — so a back-dated trial read "meals logged on 2 of 2 days" on Home,
  // a near-perfect record for the whole trial, in the reassuring direction, on
  // the Principle-3 intelligence surface, while the card and the report both
  // disclosed. It falsified the very invariant the gate-1 fix is named after.
  it('the Home strip drops a ratio it cannot qualify', () => {
    const clipped = activeInput({
      coverage: { daysLogged: 2, daysElapsed: 2 },
      exposures: { mayStateRecordClean: false, totalFeedings: 4, offDiet: 0 },
      untrackedDaysBeforeFirstLog: 28,
    });
    const strip = resolveTrialStrip(clipped);
    expect(strip?.header).toBe('Diet trial · day 23 of 56');
    expect(strip?.line ?? '').not.toMatch(/meals logged on/);
    // …and an unclipped trial still gets it: this is not a blanket deletion.
    const plain = resolveTrialStrip(activeInput({ untrackedDaysBeforeFirstLog: 0 }));
    expect(plain?.line ?? '').toMatch(/meals logged on 22 of 23 days/);
  });

  // GATE 2. Coverage excludes treats; the exposure count includes them. An owner
  // who logged two treats and no meal on day 1 got "Nothing logged yet today."
  // directly above "2 logged feedings were outside the trial diet".
  it('does not say nothing was logged above a count of what was', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: localNoon(2026, 7, 3),
      coverage: { daysLogged: 0, daysElapsed: 1 },
      exposures: { mayStateRecordClean: false, totalFeedings: 2, offDiet: 2 },
    }));
    expect(m.state).toBe('day_one');
    const joined = allStrings(m).join(' ');
    expect(joined).toContain('2 logged feedings were outside the trial diet');
    expect(joined).not.toContain('Nothing logged yet today.');
  });

  // …and a genuinely empty day 1 still says so.
  it('still says nothing was logged when nothing was', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: localNoon(2026, 7, 3),
      coverage: { daysLogged: 0, daysElapsed: 1 },
      exposures: { mayStateRecordClean: true, totalFeedings: 0, offDiet: 0 },
    }));
    expect(textOf(m, 'fact')).toContain('Nothing logged yet today.');
  });

  // GATE 5. The two states that took the floor as a DECLARED deviation silently
  // inherited a directive with it — "Worth checking the list before your vet
  // reads this" — which is not a floor, and lands before an owner has finished
  // populating the permitted list.
  it('day 1 and the milestone take the count without the directive', () => {
    for (const nowMs of [localNoon(2026, 7, 3), localNoon(2026, 8, 27)]) {
      const m = resolveTrialCard(activeInput({
        nowMs,
        allowedSetUnavailable: true,
        coverage: { daysLogged: 0, daysElapsed: 1 },
        exposures: { mayStateRecordClean: false, totalFeedings: 4, offDiet: 4 },
      }));
      const joined = allStrings(m).join(' ');
      expect(joined).toContain('4 logged feedings were outside the trial diet');
      expect(joined).not.toContain('Worth checking the list');
    }
  });
});

// ── Round 8: what the PRODUCT lens found that seven adversarial passes did not ─
//
// Seven rounds of one reviewer converged on "nothing that reviewer can see".
// `pm-feature-review` attacks a different class — whether a real owner in a car
// park understands the card — and found four things on its first run.
describe('B-533 PR A — the product lens (round 8)', () => {
  // The state that exists BECAUSE the app is uncertain rendered as the most
  // reassuring card in the set: cleaner than state 3, which at least says "4 did
  // not". The owner has never seen the affirmative variant, so she cannot notice
  // its absence — B-494's ruling one surface over.
  it('names the withholding instead of rendering a bare count', () => {
    const m = resolveTrialCard(activeInput({
      exposures: { mayStateRecordClean: false, totalFeedings: 112, offDiet: 0 },
    }));
    const fact = textOf(m, 'fact').join(' ');
    expect(fact).toContain('112 feedings in total.');
    expect(fact).toContain('Culprit isn’t saying how many matched the trial diet');
    // …and it must not point at an explanation that may not render: the reason
    // can be an oral-route exposure or an unclassifiable feeding, neither of
    // which emits a line.
    expect(fact).not.toMatch(/see below|below for why/i);
  });

  it('still makes the affirmative claim when the module allows it', () => {
    const m = resolveTrialCard(activeInput());
    expect(textOf(m, 'fact').join(' ')).toContain('all 68 matched the trial diet');
    expect(allStrings(m).join(' ')).not.toContain('isn’t saying how many matched');
  });

  // This file's header says the off-diet count is owed "in every state". The
  // strip rendered the one number that always looks good and omitted the one
  // that reports a finding — on the surface the wedge owner actually sees daily.
  it('the Home strip carries the off-diet floor', () => {
    const strip = resolveTrialStrip(activeInput({
      exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 4 },
    }));
    expect(strip?.line).toContain('4 outside the trial diet');
  });

  it('the Home strip says nothing about exposures when there are none', () => {
    const strip = resolveTrialStrip(activeInput());
    expect(strip?.line ?? '').not.toMatch(/outside the trial diet/);
  });

  // §6.9 — Culprit never scores the person, and never instructs toward a route
  // that does not exist. The only affordance on this card opens a sheet whose
  // options include ending the eight-week trial.
  it('the unmatched caveat names the cause and instructs nothing', () => {
    const m = resolveTrialCard(activeInput({
      allowedSetUnavailable: true,
      exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 40 },
    }));
    const q = textOf(m, 'qualifier').join(' ');
    expect(q).toContain('Culprit can’t match these against the food list');
    expect(q).not.toMatch(/what’s being fed|Worth checking|before your vet reads/);
  });

  // Cause before fact: the accusatory clause landed first and the exonerating
  // one last, and "the days count above" was a wrong referent on state 4.
  it('the untracked head leads with the reason, not the shortfall', () => {
    const m = resolveTrialCard(activeInput({
      coverage: { daysLogged: 2, daysElapsed: 2 },
      exposures: { mayStateRecordClean: false, totalFeedings: 4, offDiet: 0 },
      untrackedDaysBeforeFirstLog: 12,
    }));
    const head = textOf(m, 'qualifier').join(' ');
    expect(head).toContain('The first 12 days of the trial aren’t counted here');
    expect(head).not.toContain('the days count above');
    expect(head).not.toMatch(/\byou\b|missed|failed/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round 8's own findings, pinned. All three are the same shape: a fix made in
// one register was not carried to the surface or sibling that renders the same
// record, so the app said two different things about one cat in one second.
// ─────────────────────────────────────────────────────────────────────────────
describe('B-533 PR A — round 8 regressions', () => {
  // ①/② The strip's coverage clause had been patched twice — for the decline
  // flag, then for the untracked head — and each patch left the NEXT withholding
  // reason rendering. It is now one general predicate, so these four inputs
  // stand for the class rather than for themselves.
  describe('Home never states coverage the card states only with a caveat', () => {
    const qualified: Array<[string, Partial<TrialCardInput>]> = [
      ['a refusing cat', {
        exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 0 },
        rangeRefusal: { days: 19, ratedFeedings: 38, refusedFeedings: 38, population: 'trial_diet' as const },
      }],
      ['a live decline flag', {
        species: 'cat',
        intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
      }],
      ['a free-fed bowl', { freeFed: { loggedFeedings: 41 } }],
      ['an unobserved head', { untrackedDaysBeforeFirstLog: 12 }],
      // B-597 — the forgotten sibling. The strip stated a plain ratio while the
      // protein arm was off; the report withholds AND discloses on this.
      ['a dark antigen arm', { antigenArmDark: true }],
    ];
    // Home has one line and no room for the caveat, the head, or the "meals
    // OFFERED, not eaten" reframing that make the ratio honest on the card. So
    // it states the ratio only where the card states it bare. Before this, the
    // reassuring half of the pair — the ratio, never the finding — was the half
    // that survived onto the Principle-3 intelligence surface.
    it.each(qualified)('drops the ratio under %s', (_label, over) => {
      expect(resolveTrialStrip(activeInput(over))?.line ?? '')
        .not.toMatch(/meals logged on \d+ of \d+ days/);
    });

    it('still states it when the card states it plainly', () => {
      expect(resolveTrialStrip(activeInput())?.line)
        .toContain('meals logged on 22 of 23 days');
    });
  });

  // Round 9 routed the ACTIVE card through `pushRefusalWithheld` under
  // `rangeRefusal`, to stop it leading with a coverage ratio over a refused diet.
  // Two independent reviews broke it and the routing was reverted — so what is
  // pinned here is the RULING, not the patch. It now lives in `registerFor`'s
  // `completed`/`abandoned` case, which is the one place that decides whether the
  // refusal register speaks at all; the short version is that its floors were
  // derived for
  // a claim gate ("silence is cheap") and fire on day 2 of 56 for a dog rated
  // some / all / some, and the sentence's closing "…is the refusal" has no
  // antecedent on a live card until #499 ships the register.
  describe('the ACTIVE card under a whole-range refusal', () => {
    const refusing = activeInput({
      species: 'cat',
      petName: 'Mochi',
      exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 9 },
      rangeRefusal: { days: 19, ratedFeedings: 38, refusedFeedings: 38, population: 'trial_diet' as const },
    });

    it('makes no clinical assertion off a claim-gate predicate', () => {
      const all = allStrings(resolveTrialCard(refusing)).join(' ');
      expect(all).not.toContain('A diet that wasn’t eaten');
      expect(all).not.toContain('is the refusal');
    });

    // What the gate DOES do here is shipped and stays: the affirmative claim is
    // withheld, and the floor is still owed.
    it('still withholds the affirmative claim and still owes the floor', () => {
      const fact = textOf(resolveTrialCard(refusing), 'fact').join(' ');
      expect(fact).not.toMatch(/all \d+ matched/);
      // Disclosed inline on this state — `exposureLine`'s two-sided form, not
      // the separate floor sentence, which the table gives only to the registers
      // that withhold the reading (`record`'s row has `floor: null`).
      expect(fact).toContain('68 feedings in total — 59 matched, 9 did not.');
    });

    // …and Home stays quiet about coverage anyway, because the strip is
    // deliberately stricter than the card. This is the residual filed as B-566:
    // the CARD still states the ratio, and the register that should replace the
    // whole composition is #499's.
    it('keeps the ratio off Home even though the card states it', () => {
      expect(textOf(resolveTrialCard(refusing), 'fact').join(' '))
        .toContain('Meals logged on 22 of 23 days.');
      expect(resolveTrialStrip(refusing)?.line ?? '')
        .not.toMatch(/meals logged on/);
    });
  });

  // ③ `allowedSetUnavailable` is the ordinary two-device sync case: the permit
  // set has not hydrated, so EVERY feeding scores off-diet. The record-and-
  // continue note named the prescribed diet itself as the most recent slip and
  // said "Keep going with the trial diet" in the same breath.
  describe('an unhydrated permit set names no culprit', () => {
    const unhydrated = activeInput({
      allowedSetUnavailable: true,
      exposures: {
        mayStateRecordClean: false,
        totalFeedings: 40,
        offDiet: 40,
        mostRecent: { label: FOOD, when: 'yesterday' },
      },
    });

    // Asserted on the LINES, not on `allStrings` — the card's own `foodLabel`
    // names the trial diet legitimately, as the label of the trial. What it may
    // not do is name that same food in a sentence about what went wrong.
    it('never names a food as the slip', () => {
      const m = resolveTrialCard(unhydrated);
      expect(m.foodLabel).toBe(FOOD);
      expect(m.lines.map((l) => l.text).join(' ')).not.toContain('Kangaroo');
      expect(m.lines.map((l) => l.text).join(' ')).not.toMatch(/most recent|last one was/i);
    });

    // The count is an artefact of a comparator the app has just called unusable,
    // and the strip can carry neither the floor suffix nor the caveat that make
    // it honest on the card. So it carries nothing.
    it('the Home strip drops the off-diet clause it cannot qualify', () => {
      expect(resolveTrialStrip(unhydrated)?.line ?? '')
        .not.toMatch(/outside the trial diet/);
    });
  });

  // ④ PR A's own change — adding the off-diet floor to the decline branches —
  // falsified the sentence sitting directly above it. `trialViabilityNote` had
  // this exact sentence corrected twice; the sibling never got the edit.
  it('the decline register does not deny the number printed under it', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
      exposures: { mayStateRecordClean: false, totalFeedings: 60, offDiet: 12 },
    }));
    expect(textOf(m, 'fact').join(' '))
      .toContain('Separately, 12 logged feedings were outside the trial diet.');
    expect(textOf(m, 'flag').join(' ')).not.toContain('isn’t showing the trial numbers');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round 9 — two independent lenses, and the findings each one's own fix caused.
// ─────────────────────────────────────────────────────────────────────────────
describe('B-533 PR A — round 9 regressions', () => {
  // The merge-blocker round 8's OWN strip fix introduced. The most non-adherent
  // record the app can produce — a dog fed the old kibble twice a day for 23
  // days, permit list correct and fully hydrated — trips `allowedSetUnavailable`
  // via its second disjunct (no primary-diet feeding in ≥10 logged). Suppressing
  // the off-diet clause there left Home rendering the flattering half alone.
  it('Home says nothing about adherence when the comparator is unusable', () => {
    const unhydrated = activeInput({
      allowedSetUnavailable: true,
      exposures: { mayStateRecordClean: false, totalFeedings: 46, offDiet: 46 },
      coverage: { daysLogged: 23, daysElapsed: 23 },
    });
    const line = resolveTrialStrip(unhydrated)?.line ?? '';
    // Not the flattering half…
    expect(line).not.toMatch(/meals logged on \d+ of \d+ days/);
    // …and not the accusatory half it cannot qualify either.
    expect(line).not.toMatch(/outside the trial diet/);
  });

  // The card states this ratio INSIDE a paragraph framed as not-yet-readable.
  // The strip can carry the number but not the frame.
  it('Home drops a ratio the card only states inside a not-readable frame', () => {
    const subFloor = activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 8, daysElapsed: 30 },
      exposures: { mayStateRecordClean: false, totalFeedings: 11, offDiet: 0 },
    });
    expect(textOf(resolveTrialCard(subFloor), 'lead').join(' '))
      .toContain('isn’t enough logged yet');
    expect(resolveTrialStrip(subFloor)?.line ?? '').not.toMatch(/meals logged on/);
  });

  // Two opposite arrows, adjacent: "at least 5" welded to "maybe fewer". The
  // suppression keyed on the FLAG and the caveat on the COUNT, so below the
  // 10-feeding reconciliation floor the flag is off and both rendered.
  it('never renders the floor suffix beside the can’t-match caveat', () => {
    const five = resolveTrialCard(activeInput({
      exposures: { mayStateRecordClean: false, totalFeedings: 5, offDiet: 5 },
    }));
    const all = allStrings(five).join(' ');
    expect(all).toContain('Culprit can’t match these against the food list');
    expect(all).not.toContain('not a total');
  });

  it('still renders the floor suffix when no caveat qualifies it', () => {
    const partial = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
      exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 6 },
    }));
    expect(textOf(partial, 'fact').join(' ')).toContain('The 6 are what’s been logged, not a total.');
  });

  // Principle 5, on the state that most needs it. B-474's un-nulling turned
  // `coverage`/`exposures` into zeroed OBJECTS, which closed the only route to
  // the designed empty state — so it was written, shipped, and unreachable.
  it('the sub-floor card names an empty record rather than reciting zeroes', () => {
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 0, daysElapsed: 12 },
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0 },
    }));
    const all = allStrings(m).join(' ');
    expect(all).toContain('Nothing is on the record for this trial yet.');
    expect(all).not.toMatch(/meals on 0 of \d+ days/);
    expect(all).not.toContain('0 feedings in total');
  });

  // The app declining to answer a question nobody asked. There is nothing to
  // match when nothing was logged.
  it('makes no withholding statement over an empty record', () => {
    const m = resolveTrialCard(activeInput({
      coverage: { daysLogged: 0, daysElapsed: 3 },
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0 },
    }));
    expect(allStrings(m).join(' ')).not.toContain('isn’t saying how many matched');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-559 — THE COMPOSITION LAYER, ASSERTED AS A LAYER
//
// `pushExposureFloor` plus its cross-state property test (#498) answered the
// DISCLOSE half: one rule, one place, asserted over every state. Everything
// below is the other half — the withhold-the-reading side, plus the placement
// question the floor rule never had to ask.
//
// The shape these replace: nine rounds, one defect each time — "the branch I
// didn't visit inherited the opposite rule." Round 9's was invisible to
// `everyState` because that list carried no `rangeRefusal` fixture at all.
//
// Every assertion here is MUTATION-CHECKED: each one was broken in the resolver,
// observed to fail, and restored. Green is not evidence; a failed mutation is.
// ─────────────────────────────────────────────────────────────────────────────
describe('the composition layer (B-559)', () => {
  const ALL_REGISTERS = Object.keys(TRIAL_CARD_DISCLOSURES) as TrialCardRegister[];

  // EXHAUSTIVENESS IS THE WHOLE POINT. A register nobody walks is a register
  // whose rules nobody checks, which is precisely how `rangeRefusal` reached
  // five places under a list whose name promises every state. Adding a state or
  // a register now fails HERE — before it can inherit a rule by accident.
  it('everyState walks every register', () => {
    const walked = new Set(everyState.map(([, input]) => planTrialCard(input).register));
    expect(ALL_REGISTERS.filter((r) => !walked.has(r))).toEqual([]);
  });

  // AND EVERY STATE, WHICH IS NOT THE SAME TEST. Eleven states map onto eight
  // registers, many-to-one, so a twelfth state routed to `record` leaves the
  // register check green and is walked by nothing. `assertNever` closes the
  // compile-time half — a new state must NAME a register; this closes the other
  // half — somebody must WALK it. Gap named by `adversarial-reviewer`.
  const ALL_STATES: TrialCardState[] = [
    'no_trial', 'day_one', 'clean', 'exposures', 'below_floor', 'milestone',
    'overrun', 'completed', 'abandoned', 'intake_decline', 'free_fed', 'trial_refusal',
  ];

  it('everyState walks every state', () => {
    const walked = new Set(everyState.map(([, input]) => planTrialCard(input).state));
    expect(ALL_STATES.filter((s) => !walked.has(s))).toEqual([]);
  });

  // `planTrialCard` and `resolveTrialCard` are two entry points onto one set of
  // pure functions (`trialContext` → `stateFor` → `registerFor`), which is the
  // only reason the plan is a trustworthy oracle for the rendered card. They
  // share those functions rather than each deriving a state, but "they share
  // them" is a fact about today's code, and every assertion in this block reads
  // the plan and asserts on the card. So it is pinned rather than assumed.
  it.each(everyState)('the plan describes the card that renders — %s', (_name, input) => {
    expect(planTrialCard(input).state).toBe(resolveTrialCard(input).state);
  });

  // The table pinned, so a policy flip is a visible two-file diff with a failing
  // test naming the register — not a silent edit. Round 9's reverted fix is the
  // precedent: a ruling has to be pinned, not merely written down.
  it('is the table the resolver actually reads', () => {
    expect(TRIAL_CARD_DISCLOSURES).toEqual({
      none: {
        floor: null, unmatched: false, pastBowl: false, untrackedHead: false, scope: 'never',
      },
      decline: {
        floor: 'separately', unmatched: true, pastBowl: false, untrackedHead: false,
        scope: 'active_only',
      },
      refusal_withheld: {
        floor: 'plain', unmatched: true, pastBowl: false, untrackedHead: false, scope: 'never',
      },
      free_fed: {
        floor: null, unmatched: true, pastBowl: false, untrackedHead: false, scope: 'always',
      },
      so_far: {
        floor: null, unmatched: true, pastBowl: true, untrackedHead: true, scope: 'always',
      },
      floor_only: {
        floor: 'plain', unmatched: false, pastBowl: false, untrackedHead: false, scope: 'never',
      },
      coverage_only: {
        floor: null, unmatched: false, pastBowl: false, untrackedHead: true, scope: 'never',
      },
      record: {
        floor: null, unmatched: true, pastBowl: true, untrackedHead: true, scope: 'always',
      },
      trial_refusal: {
        floor: 'separately', unmatched: true, pastBowl: false, untrackedHead: false,
        scope: 'always',
      },
    });
  });

  // ── (a) WHICH REGISTER OWNS THE CARD ──────────────────────────────────────
  //
  // The bare coverage sentence is the mechanical proxy for "the reading": it is
  // the one string that reads as a verdict standing alone, and it is what round
  // 9 found leading a card over a cat refusing 38 of 38 rated feedings. The
  // refusal register deliberately restates coverage INSIDE its own reframing
  // ("meals OFFERED on …"), which is why this asserts on the sentence and not on
  // the digits.
  const OWNS_THE_RATIO: TrialCardRegister[] = ['record', 'coverage_only'];

  it.each(everyState)('the bare coverage ratio renders only where the register owns it — %s',
    (_name, input) => {
      const { register } = planTrialCard(input);
      const rendersRatio = allStrings(resolveTrialCard(input))
        .some((s) => /^Meals logged on \d+ of \d+ days\.$/.test(s));
      expect(rendersRatio).toBe(OWNS_THE_RATIO.includes(register) && Boolean(input.coverage));
    });

  // The affirmative claim is `mayStateRecordClean`'s to give, in EVERY state
  // that has a sentence for it. It shipped gated in `exposureLine` and ungated
  // in `soFarLine` — one rule enforced in one place and broken in another, which
  // is the file's oldest defect and the reason this is asserted over all of them.
  it.each(everyState)('withholds the affirmative claim wherever the module does — %s',
    (_name, base) => {
      const withheld = resolveTrialCard({
        ...base,
        exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 0 },
      });
      expect(allStrings(withheld).join(' '))
        .not.toMatch(/all \d+ matched|matched the trial diet or a permitted food/i);
    });

  // ── (b) WHICH DISCLOSURES APPLY ───────────────────────────────────────────
  //
  // Force each disclosure's own predicate on, RE-DERIVE the plan from the forced
  // input (so a state change cannot silently move the goalposts), and assert the
  // line renders exactly where the register's row allows it. This is what makes
  // the table load-bearing rather than documentation: a branch that reaches for
  // a disclosure its row does not carry — or drops one it does — fails here, on
  // every state at once. `adversarial-reviewer` confirmed that directly: a body
  // calling `pushUntrackedHead` itself fails 1 case, deleting the sequencer's
  // `policy.untrackedHead` gate fails 14, and `policy.pastBowl` fails 10.
  //
  // WHAT THEY CANNOT DO, said here rather than discovered later: they cannot
  // falsify a table VALUE. The assertion compares the render to the very cell
  // under review, so flipping a cell moves both sides and stays green. The guard
  // against that is `is the table the resolver actually reads` below — a literal
  // pin — plus, for the cells where a wrong value would be a clinical defect
  // rather than a cosmetic one, a hardcoded behavioural test that names no cell.
  // Six cells stood on the pin alone in the first cut; the two that matter most
  // now have their own tests.
  const FORCED = { mayStateRecordClean: false, totalFeedings: 124, offDiet: 12 };

  it.each(everyState)('the floor sentence renders exactly where the row says — %s',
    (_name, base) => {
      const input: TrialCardInput = { ...base, exposures: FORCED };
      const { register, disclosures } = planTrialCard(input);
      const texts = resolveTrialCard(input).lines.map((l) => l.text);
      expect(texts.some((t) => t.startsWith('Separately, 12 logged feedings were outside')))
        .toBe(disclosures.floor === 'separately');
      expect(texts.some((t) => t.startsWith('12 logged feedings were outside')))
        .toBe(disclosures.floor === 'plain');
      // …and a register carrying NO floor sentence still owes the count inline.
      // That is #498's rule, and this is where the two halves compose: withhold
      // the reading, never the floor — in one form or the other, always.
      if (disclosures.floor === null && register !== 'none') {
        expect(texts.join(' ')).toMatch(/\b12\b/);
      }
    });

  it.each(everyState)('the can’t-match caveat renders exactly where the row says — %s',
    (_name, base) => {
      // An unusable comparator puts every feeding on rung 3, so `offDiet` equals
      // the total by construction — the predicate every register with
      // `unmatched: true` is exercised against here, in both directions.
      const input: TrialCardInput = {
        ...base,
        allowedSetUnavailable: true,
        exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 40 },
      };
      const rendered = allStrings(resolveTrialCard(input))
        .some((s) => s.includes('Culprit can’t match these against the food list'));
      expect(rendered).toBe(planTrialCard(input).disclosures.unmatched);
    });

  it.each(everyState)('the past-bowl caveat renders exactly where the row says — %s',
    (_name, base) => {
      // `freeFed: null` is the predicate's own precondition — a bowl in force NOW
      // is the free-fed card's lead, not a caveat under it — so the `free_fed`
      // row is structurally unforceable and is exempt by construction rather
      // than by omission.
      const input: TrialCardInput = { ...base, freeFedOverlap: true, freeFed: null };
      const rendered = allStrings(resolveTrialCard(input))
        .some((s) => s.includes('had a bowl that was topped up'));
      expect(rendered).toBe(planTrialCard(input).disclosures.pastBowl);
    });

  it.each(everyState)('the untracked head renders exactly where the row says — %s',
    (_name, base) => {
      const input: TrialCardInput = { ...base, untrackedDaysBeforeFirstLog: 12 };
      const rendered = allStrings(resolveTrialCard(input))
        .some((s) => s.includes('The first 12 days of the trial aren’t counted here'));
      expect(rendered).toBe(planTrialCard(input).disclosures.untrackedHead);
    });

  it.each(everyState)('the multi-pet caveat renders exactly where the row says — %s',
    (_name, base) => {
      const input: TrialCardInput = { ...base, otherPetNames: ['Rex'], exposures: FORCED };
      const model = resolveTrialCard(input);
      const { state, register, disclosures } = planTrialCard(input);
      const terminal = state === 'completed' || state === 'abandoned';
      // `active_only` is the one preserved asymmetry: the live decline card gates
      // its floor line with the household caveat and the two terminal decline
      // branches never have. Written as a value in the table so it reads as a
      // decision someone can overturn, which is the only thing wrong with it.
      const allowed = disclosures.scope === 'always'
        || (disclosures.scope === 'active_only' && !terminal);
      // It gates a CLAIM: with nothing above it there is nothing to gate. That
      // second condition is PINNED rather than read off the model under test —
      // `hasFact = model.lines.some(...)` was an oracle derived from its own
      // subject, so a defect deleting the fact lines AND the caveat together
      // degenerated to `false === false` (`adversarial-reviewer`). With the
      // exposures forced above, every register except `none` owes at least one
      // fact line, so that is the assertion.
      expect(model.lines.some((l) => l.role === 'fact')).toBe(register !== 'none');
      expect(model.lines.some((l) => l.role === 'caveat')).toBe(allowed && register !== 'none');
    });

  // ── The two cells a wrong value would make a clinical defect ──────────────
  //
  // Named no cell, so they survive the table being edited. `floor_only.unmatched`
  // first: flipping it to `true` puts the can't-match caveat back on day 1 and
  // the milestone, which is the defect `caveat: false` was added to prevent —
  // and the #498 test that looks like it guards this asserts on copy that no
  // longer exists ("Worth checking the list"), so it is vacuous today.
  it('day 1 and the milestone take the off-diet count and no caveat with it', () => {
    for (const [label, nowMs] of [['day 1', localNoon(2026, 7, 3)], ['milestone', localNoon(2026, 8, 27)]] as const) {
      const m = resolveTrialCard(activeInput({
        nowMs,
        allowedSetUnavailable: true,
        coverage: { daysLogged: 0, daysElapsed: 1 },
        exposures: { mayStateRecordClean: false, totalFeedings: 4, offDiet: 4 },
      }));
      const joined = allStrings(m).join(' ');
      expect(`${label}: ${joined}`).toContain('4 logged feedings were outside the trial diet');
      expect(`${label}: ${joined}`).not.toContain('can’t match these against the food list');
    }
  });

  // …and `decline.scope`, whose value decides whether the sickest card in the
  // app gates its off-diet count with the household caveat. The asymmetry it
  // encodes is inherited rather than argued, so pin the behaviour on both sides
  // — that is what makes it safe to change later on purpose.
  it('the live decline card gates its count for a household; the terminal ones do not', () => {
    const decline = {
      species: 'cat' as const,
      petName: 'Mochi',
      otherPetNames: ['Rex'],
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
      exposures: { mayStateRecordClean: false, totalFeedings: 60, offDiet: 12 },
    };
    expect(textOf(resolveTrialCard(activeInput(decline)), 'caveat').join(' '))
      .toContain('shares a home with Rex');
    expect(textOf(resolveTrialCard(activeInput({
      ...decline,
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD,
      },
    })), 'caveat')).toEqual([]);
  });

  // ── ORDER IS PART OF THE COMPOSITION, AND NOTHING WAS PINNING IT ──────────
  //
  // Found by the B-559 purity harness, not by this file: swapping two disclosure
  // calls in `recordRegion` — the untracked head above the past bowl — passed
  // all 400 cases here. Both lines carry the `qualifier` role, and every
  // assertion in this file either joins the qualifiers before matching or checks
  // a substring, so role checks and text checks are BOTH blind to their order.
  // A reader is not: these four stack in one column and the sequence is the
  // argument (what the app knows, then what it cannot match, then the two
  // reasons the denominator is unfair).
  //
  // This is also B-563's worst realistic case, rendered — the five-hedge stack
  // on the state §4.2 hands the owner closest to quitting.
  it('composes the disclosures in one fixed order', () => {
    const model = resolveTrialCard(activeInput({
      petName: 'Mochi',
      otherPetNames: ['Rex'],
      freeFedOverlap: true,
      freeFed: null,
      untrackedDaysBeforeFirstLog: 12,
      allowedSetUnavailable: true,
      coverage: { daysLogged: 9, daysElapsed: 23 },
      exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 40 },
    }));
    expect(model.lines.map((l) => l.role)).toEqual([
      'fact', 'fact', 'qualifier', 'qualifier', 'qualifier', 'qualifier', 'caveat', 'note',
    ]);
    expect(textOf(model, 'qualifier').map((t) => (
      t.includes('only sees what') ? 'blind-spot'
        : t.includes('can’t match these') ? 'cant-match'
          : t.includes('bowl that was topped up') ? 'past-bowl'
            : t.includes('aren’t counted here') ? 'untracked-head'
              : `UNNAMED QUALIFIER: ${t}`
    ))).toEqual(['blind-spot', 'cant-match', 'past-bowl', 'untracked-head']);
  });

  // ── The strip's rule ──────────────────────────────────────────────────────
  //
  // Home has one line and nowhere to put the caveat, the head, or the "offered,
  // not eaten" reframing that make a ratio honest on the card, so it states the
  // ratio only when the record carries none of the seven withholding reasons.
  //
  // R1 ADDED THE SEVENTH, and it is the reason this shape was built: the strip
  // has no room for the refusal register itself — that lives on the Pet tab's
  // card — but it must not do the one thing it can do wrong here, which is render
  // a tidy coverage line as if the trial were proceeding normally. Silence on
  // Home, the register one tap away.
  //
  // ASSERTED AGAINST A SEPARATELY-WRITTEN PREDICATE, NOT AGAINST
  // `withholdingReasons`. The first cut of this test compared the strip's output
  // to `withholdingReasons(input).length === 0` — which is what the strip itself
  // computes, so it could only catch the strip ceasing to consult the list, and
  // NOT the list being wrong. `adversarial-reviewer` proved it: deleting the
  // `below_floor` push from `withholdingReasons` left this test GREEN (only
  // #498's hand-written per-reason tests caught it), and dropping a reason is
  // precisely the failure mode rounds 8/9 produced. The duplication below is the
  // point — an oracle that shares an implementation with its subject is a
  // change-detector, not a test.
  const REASONS_RESTATED = (input: TrialCardInput): boolean => (
    !input.intakeDeclineHeadline
    && !input.trialDietRefusal
    && !input.rangeRefusal
    && !input.freeFed
    && !input.allowedSetUnavailable
    && !input.antigenArmDark
    && !input.belowCoverageFloor
    && (input.untrackedDaysBeforeFirstLog ?? 0) === 0
  );

  it.each(everyState)('Home states the ratio only with an empty withholding list — %s',
    (_name, input) => {
      const strip = resolveTrialStrip(input);
      if (!strip) return;
      expect(/meals logged on \d+ of \d+ days/.test(strip.line ?? ''))
        .toBe(REASONS_RESTATED(input) && Boolean(input.coverage));
    });

  // …and the list is asserted directly, so a reason cannot be dropped from it
  // silently even on an input no fixture above happens to carry.
  it('names every withholding reason the record carries', () => {
    expect(withholdingReasons(activeInput())).toEqual([]);
    expect(withholdingReasons(activeInput({
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
      trialDietRefusal: REFUSING_NOW,
      rangeRefusal: REFUSING_RANGE,
      freeFed: { loggedFeedings: 4 },
      allowedSetUnavailable: true,
      antigenArmDark: true,
      untrackedDaysBeforeFirstLog: 12,
      belowCoverageFloor: true,
    }))).toEqual([
      'intake_decline', 'trial_diet_refusal', 'range_refusal', 'free_fed',
      'allowed_set_unavailable', 'antigen_arm_dark', 'untracked_head', 'below_floor',
    ]);
    // B-597 — the dark arm silences the strip on its own, the forgotten-sibling
    // case: nothing else is withholding, but the protein arm is off.
    expect(withholdingReasons(activeInput({ antigenArmDark: true })))
      .toEqual(['antigen_arm_dark']);
    // R1's now-fact is its OWN reason, keyed on the raw input rather than on
    // `liveRefusal`. A record carrying only the now-fact must silence the strip
    // even though `rangeRefusal` is absent — and, in the other direction, a range
    // fact that `liveRefusal` declines to speak from (the pet is eating again)
    // must STILL silence it, because the record it summarises is not a plain one.
    expect(withholdingReasons(activeInput({ trialDietRefusal: REFUSING_NOW })))
      .toEqual(['trial_diet_refusal']);
    expect(withholdingReasons(activeInput({
      rangeRefusal: REFUSING_RANGE, recentFinishedFeedings: 6, rangeRefusalSpansEpisodes: true,
    }))).toEqual(['range_refusal']);
    // THE HEAD IS "NOT ZERO", NOT "POSITIVE". A negative or NaN head is not a
    // plain record either, and rewriting the strip's original `=== 0` as `> 0`
    // narrowed the withholding in the REASSURING direction — Home stating a
    // ratio the pre-refactor strip suppressed. Unreachable through the loader,
    // undefended by any test, and found only by feeding an out-of-contract value
    // to a field every fixture generates in contract.
    for (const head of [-1, -7, Number.NaN]) {
      expect(withholdingReasons(activeInput({ untrackedDaysBeforeFirstLog: head })))
        .toEqual(['untracked_head']);
      expect(resolveTrialStrip(activeInput({ untrackedDaysBeforeFirstLog: head }))?.line ?? '')
        .not.toMatch(/meals logged on/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATE 10 — THE TRIAL DIET ITSELF IS GOING UNFINISHED (R1, mock round 5)
//
// The property tests above prove the register is PLACED correctly — it has a
// row, `everyState` walks it, and each disclosure renders exactly where the row
// says. None of them can see what it SAYS, or when it may speak. Those are the
// two things five adversarial rounds kept breaking, and the second one is the
// open Dr. Chen question, so both are pinned here with literal strings.
// ─────────────────────────────────────────────────────────────────────────────
describe('state 10 — the trial-diet refusal register', () => {
  const refusing = (over: Partial<TrialCardInput> = {}) => activeInput({
    species: 'cat', petName: 'Mochi', trialDietRefusal: REFUSING_NOW, ...over,
  });

  it('is the state, ahead of everything except the clinical lane', () => {
    expect(resolveTrialCard(refusing()).state).toBe('trial_refusal');
  });

  // THE HEADLINE CARRIES ITS OWN DENOMINATOR. R1a is that this register fires on
  // LOGGED EVIDENCE only, and a headline stating a numerator alone hides the
  // evidence base it rests on: "19 feedings were left unfinished" reads the same
  // whether the owner rated 22 feedings or 500. The denominator is what lets an
  // owner check the claim against her own memory.
  it('states the record with both numbers, and reports rather than accuses', () => {
    expect(textOf(resolveTrialCard(refusing()), 'flag')[0]).toBe(
      '19 feedings of the 22 trial-diet feedings you’ve rated were left unfinished, ' +
      'across 11 days.',
    );
  });

  // "LEFT UNFINISHED", NOT "REFUSED". The predicate widened to not-finished
  // (`refused` / `picked` / `some`) so it could see the cat that picks; copy that
  // kept saying "refused" would assert something the record does not contain
  // about three meals the owner rated "ate some".
  it('never says refused — the predicate is not-finished', () => {
    expect(allStrings(resolveTrialCard(refusing())).join(' ')).not.toMatch(/refused/i);
  });

  // The worst case must not read as the clumsiest sentence: when every rated
  // feeding was left unfinished — the canonical refusing patient — "38 feedings
  // of the 38 trial-diet feedings you've rated" is arithmetic where the reader
  // needs a statement.
  it('states the total-refusal case as a statement, not as arithmetic', () => {
    expect(textOf(resolveTrialCard(refusing({
      trialDietRefusal: { days: 19, ratedFeedings: 38, refusedFeedings: 38, population: 'trial_diet' as const },
    })), 'flag')[0]).toBe(
      'Every one of the 38 trial-diet feedings you’ve rated was left unfinished, ' +
      'across 19 days.',
    );
  });

  // ⚠️ THE FELINE REGISTER IS UNRATIFIED — Dr. Chen owes a ruling. It says
  // "today", raised from "soon" (which is what the design-locked mock draws),
  // because this lane is the only watcher on the 48h hepatic-lipidosis window for
  // a diet refused from day 1, and the canonical fixture is many times past it.
  // For a safety lane the safe error direction is toward the sooner word.
  it('names the feline clock, and the dog register does not borrow it', () => {
    expect(textOf(resolveTrialCard(refusing()), 'flag')[1]).toBe(
      'A diet Mochi isn’t eating can’t answer the question the trial was started for ' +
      '— and a cat that isn’t eating what’s put down needs a call today, whatever the ' +
      'trial is doing. Culprit isn’t reading these days as a clean run while this is ' +
      'going on.',
    );
    expect(textOf(resolveTrialCard(refusing({ species: 'dog', petName: 'Biscuit' })), 'flag')[1])
      .toContain('it’s worth a call to your vet');
  });

  // NOR MAY IT SAY "won't eat". That is a VOLITIONAL frame — it locates the cause
  // in the animal's choice, one short step from "picky" on the lane whose first
  // rule is that it never softens toward preference. "Isn't eating" reports the
  // same record and asserts nothing about why. (The cross-state preference guard
  // above cannot see this; "won't eat" contains none of its words.)
  it('never locates the cause in the animal’s choice', () => {
    for (const s of allStrings(resolveTrialCard(refusing()))) {
      expect(s).not.toMatch(/won’t eat|will not eat|refuses to eat/i);
    }
  });

  // IT MAY NOT SAY "a cat eating this little" — the trap the design-locked mock
  // walked into. The record here is about the TRIAL DIET going unfinished; a cat
  // that refuses the hydrolysate and clears a bowl of chicken every night
  // produces exactly this fact. Escalation is sanctioned; inventing a fact to
  // escalate on is not.
  it('escalates on the record it has, never on an intake claim it doesn’t', () => {
    expect(allStrings(resolveTrialCard(refusing())).join(' '))
      .not.toMatch(/eating this little|barely eating|hardly eating|not eating enough/i);
  });

  // THE STRUCTURAL REPLACEMENT, over the maximally clean-LOOKING record: the
  // default fixture is 22 of 23 days covered, 68 feedings, `mayStateRecordClean`
  // true. That is §5.2 proof #1 — the owner dutifully puts the bowl down and logs
  // it, so coverage saturates while the animal starves.
  it('replaces the adherence line over a record that looks immaculate', () => {
    const joined = allStrings(resolveTrialCard(refusing())).join(' ');
    expect(joined).not.toContain('Meals logged on 22 of 23 days.');
    expect(joined).not.toMatch(/all \d+ matched|matched the trial diet or a permitted food/i);
  });

  // …and the DECLINE still outranks it. Two stacked safety headlines would make
  // neither the headline, and §6.5 gives the clinical lane priority explicitly.
  it('defers to the clinical intake-decline lane when both are live', () => {
    const model = resolveTrialCard(refusing({
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }));
    expect(model.state).toBe('intake_decline');
    expect(textOf(model, 'flag')[0]).toBe('Mochi has left most of her food for 3 days.');
  });

  // The off-diet floor survives the register (the row says `separately`), and so
  // does the drill-in — a flag the owner cannot interrogate is an unfalsifiable
  // accusation (§6.3).
  it('keeps the off-diet count and its way in', () => {
    const model = resolveTrialCard(refusing({
      exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 4 },
    }));
    expect(textOf(model, 'fact')).toContain(
      'Separately, 4 logged feedings were outside the trial diet. The 4 are what’s ' +
      'been logged, not a total.',
    );
    expect(model.actions.map((a) => a.id)).toEqual(['trial_manage', 'view_exposures']);
  });

  // THE WAY OUT IS THE AFFORDANCE, and unlike the decline card it is not a link:
  // the action this state implies is changing or ending the trial. §4.2's
  // no-second-door rule is about LOGGING (the FAB), and on the one state whose
  // whole message is "this diet may need to change" the way out may not be a 13px
  // link in the corner.
  it('offers the way out at full weight, with no bar past the window', () => {
    const model = resolveTrialCard(refusing({ exposures: null }));
    expect(model.actions).toEqual([
      { id: 'trial_manage', label: 'Change or end the trial', emphasis: 'secondary' },
    ]);
    expect(model.progressFraction).not.toBeNull();

    // At or past the window the bar is pinned at 100%, and a saturated bar is
    // completion vocabulary drawn in pixels — over a diet that isn't being eaten,
    // the worst place in the app for it. The milestone stays reachable, because a
    // trial with no ending reads to the vet as one still going.
    const atWindow = resolveTrialCard(refusing({ nowMs: localNoon(2026, 8, 27) }));
    expect(atWindow.state).toBe('trial_refusal');
    expect(atWindow.progressFraction).toBeNull();
    expect(atWindow.actions.map((a) => a.id)).toContain('milestone');
  });

  // ── THE STAND-DOWN — the unratified half (Dr. Chen, blocking) ─────────────
  //
  // "When may a fired safety register be stood down?" is the hardest question the
  // five rounds surfaced. What is pinned below is the current answer and is
  // DEFENSIBLE RATHER THAN RATIFIED; each case is a defect that was executed.
  describe('the stand-down — symmetric with the fire (B-571)', () => {
    const fromRange = (over: Partial<TrialCardInput> = {}) => activeInput({
      species: 'cat',
      petName: 'Mochi',
      rangeRefusal: REFUSING_RANGE,
      recentFinishedFeedings: 0,
      recentRatedFeedings: 0,
      rangeRefusalSpansEpisodes: true,
      ...over,
    });

    // THE RULE, STATED ONCE: it takes the same weight of evidence to say this pet
    // is eating as it took to say it was not. Firing needs `REFUSAL_MIN_RATED`
    // ratings and a `REFUSAL_SHARE` refused share; standing down needs the same
    // sample and the complementary share. No new constant — the first cut's
    // defect was the SHAPE (four guards on, none off), not the choice of input.

    // ROUND 4's DEFECT: an owner documents 42 refusals, stops tapping intake, the
    // recency window empties, and the live register VANISHES over a cat that is
    // still refusing — the chronic case decaying into the clean case, reached
    // through the rating door instead of the baseline one.
    it('silence does not cancel it', () => {
      expect(resolveTrialCard(fromRange()).state).toBe('trial_refusal');
    });

    // ROUND 5's DEFECT: the predicate counted RATINGS rather than FINISHED
    // feedings, so two more logged refusals cancelled a register that had fired
    // on refusals — more evidence buying less disclosure.
    it('more logged refusals do not cancel it', () => {
      expect(resolveTrialCard(fromRange({ recentRatedFeedings: 4, recentFinishedFeedings: 0 }))
        .state).toBe('trial_refusal');
    });

    // ── `adversarial-reviewer` finding 1 — THE HEADLINE DEFECT ──────────────
    //
    // 60 of 60 bowls refused across 30 days; the owner keeps logging but rates
    // exactly one feeding in the last fortnight, `most`. The old predicate was a
    // bare `recentFinishedFeedings === 0`, so that ONE bowl stood the register
    // down and the card rendered "Meals logged on 44 of 44 days… 2 weeks to go."
    // over a cat that had refused everything for a month.
    it('one eaten bowl cannot cancel sixty documented refusals', () => {
      const model = resolveTrialCard(fromRange({
        recentRatedFeedings: 1, recentFinishedFeedings: 1,
      }));
      expect(model.state).toBe('trial_refusal');
      expect(allStrings(model).join(' ')).not.toContain('Meals logged on 22 of 23 days.');
    });

    // ── finding 2 — LOGGING EVIDENCE MUST NEVER BUY LESS DISCLOSURE ─────────
    //
    // The reviewer's sweep: F=0,R=0 fired, F=1,R=1 did not. An owner who
    // documented BOTH a refusal and a good meal got a quieter card than one who
    // rated nothing at all. Asserted as the property rather than the two points:
    // for a fixed count of finished feedings, adding refusals may only ever move
    // the register toward ON.
    it('is monotone — adding refusals never removes the register', () => {
      const sweep = (finished: number) => [0, 1, 2, 3, 4].map((refused) => (
        resolveTrialCard(fromRange({
          recentRatedFeedings: finished + refused, recentFinishedFeedings: finished,
        })).state === 'trial_refusal' ? 'ON' : 'off'
      ));
      // Read as a row per finished-count, refusals increasing left to right. The
      // property is that no row ever goes ON → off: once the evidence is enough
      // to speak, more refusals cannot take the voice away. Pinned as literals so
      // a regression names the exact cell, and so the rows are visibly non-vacuous
      // (`finished: 3` genuinely crosses at four refusals rather than never).
      expect({
        0: sweep(0).join(' '),
        1: sweep(1).join(' '),
        3: sweep(3).join(' '),
      }).toEqual({
        0: 'ON ON ON ON ON',
        1: 'ON ON ON ON ON',
        3: 'off off off off ON',
      });
    });

    // …and the specific inversion, pinned as a literal pair.
    it('documenting a refusal and a good meal is never quieter than logging nothing', () => {
      const loggedNothing = resolveTrialCard(fromRange()).state;
      const loggedBoth = resolveTrialCard(fromRange({
        recentRatedFeedings: 2, recentFinishedFeedings: 1,
      })).state;
      expect(loggedNothing).toBe('trial_refusal');
      expect(loggedBoth).toBe('trial_refusal');
    });

    // …and the one thing that DOES stand it down is evidence the diet is being
    // eaten, to the same standard the fire demanded. Three ratings, all finished.
    it('a sample that clears the fire’s own floors, eaten, does', () => {
      expect(resolveTrialCard(fromRange({
        recentRatedFeedings: 3, recentFinishedFeedings: 3,
      })).state).toBe('clean');
    });

    // …but the SAME three ratings mostly refused do not. This is the pair that
    // makes it a share rather than a presence test.
    it('the same sample, mostly refused, does not', () => {
      expect(resolveTrialCard(fromRange({
        recentRatedFeedings: 3, recentFinishedFeedings: 1,
      })).state).toBe('trial_refusal');
    });

    // The sample floor, at its boundary: two finished bowls out of two is a
    // perfect share and still too small a sample to overturn the history.
    it('holds the sample floor at its boundary', () => {
      expect(resolveTrialCard(fromRange({
        recentRatedFeedings: 2, recentFinishedFeedings: 2,
      })).state).toBe('trial_refusal');
      expect(resolveTrialCard(fromRange({
        recentRatedFeedings: 3, recentFinishedFeedings: 2,
      })).state).toBe('clean');
    });

    // The range fact drops the episode guard, which is right for a HISTORY and
    // wrong the moment a present-tense register reads it: one four-hour bout
    // straddling midnight fired "needs a call today" for the next 36 days.
    it('a single bout never fires the live register', () => {
      expect(resolveTrialCard(fromRange({ rangeRefusalSpansEpisodes: false })).state)
        .toBe('clean');
    });

    // The NOW-fact is not subject to any of it. It is already recency-bounded and
    // already span-guarded in `lib/dietTrial.ts`, so a stand-down input may not
    // silence a register speaking from evidence that is current by construction.
    it('never applies to the now-fact', () => {
      expect(resolveTrialCard(refusing({
        recentRatedFeedings: 9, recentFinishedFeedings: 9, rangeRefusalSpansEpisodes: false,
      })).state).toBe('trial_refusal');
    });

    // R1a, from the other side: the register fires on LOGGED EVIDENCE ONLY. An
    // owner who is not rating intake carries neither fact, so she can never be
    // told her cat isn't eating. Absence never alarms — G2's two-sidedness — and
    // it is the whole reason the teach line below exists.
    it('an owner who never rates intake is never told her cat isn’t eating', () => {
      expect(resolveTrialCard(activeInput({ species: 'cat', petName: 'Mochi' })).state)
        .toBe('clean');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R1b — THE INTAKE-RATING TEACH LINE
//
// It fires when NOTHING is wrong, which is the entire design: the register above
// can only see rated feedings, so an owner who never learns the tap has a trial
// whose viability the app is structurally blind to. Every word is about the
// RECORD — never the person (§6.9), never the animal.
// ─────────────────────────────────────────────────────────────────────────────
describe('the intake-rating teach line (R1b)', () => {
  const teaching = (over: Partial<TrialCardInput> = {}) => activeInput({
    petName: 'Mochi',
    intakeRating: { rated: 3, feedings: 20, primaryRated: 0, primaryFeedings: 0 },
    ...over,
  });

  it('teaches the tap on a record that is mostly unrated', () => {
    expect(textOf(resolveTrialCard(teaching()), 'teach')).toEqual([
      'One tap makes these readable. Most of Mochi’s logged meals don’t yet say how ' +
      'much was eaten, and on a diet trial that’s the part your vet reads.',
    ]);
  });

  it('goes quiet once the owner is rating', () => {
    expect(textOf(resolveTrialCard(teaching({
      intakeRating: { rated: 11, feedings: 20, primaryRated: 0, primaryFeedings: 0 },
    })), 'teach')).toEqual([]);
  });

  // The MIN_FEEDINGS floor. A 0-of-1 record is not a habit, and teaching off it
  // hands a correction to an owner on day 1 of 56 for the crime of having logged
  // one meal.
  it('does not correct an owner who has logged three meals', () => {
    expect(textOf(resolveTrialCard(teaching({
      intakeRating: { rated: 0, feedings: 3, primaryRated: 0, primaryFeedings: 0 },
    })), 'teach')).toEqual([]);
  });

  // NULL IS NOT 0/0. "Nothing in range to have rated" and "nothing rated" are
  // different facts; only the second is worth teaching about.
  it('says nothing when there is nothing in range to have rated', () => {
    expect(textOf(resolveTrialCard(teaching({ intakeRating: null })), 'teach')).toEqual([]);
  });

  // THE NARROW POPULATION WINS WHERE THERE IS ONE, and this is the counterexample
  // that forced it: an owner logging two unrated bowls of the prescribed diet
  // beside three rated permitted toppers a day has a 60% rated share overall and
  // 0% where it counts. Asking only the wide question goes silent on exactly the
  // record whose viability is unknowable.
  it('asks the narrow question when the refusal lane has a population to read', () => {
    expect(textOf(resolveTrialCard(teaching({
      intakeRating: { rated: 30, feedings: 50, primaryRated: 0, primaryFeedings: 20 },
    })), 'teach')).toEqual([
      'One tap makes these readable. Most of Mochi’s logged meals of the trial diet ' +
      'don’t yet say how much was eaten, and on a diet trial that’s the part your vet ' +
      'reads.',
    ]);
  });

  // …and the sentence NAMES the population it fired on. One string denominated on
  // the whole meal record, triggered by the narrow one, is false in exactly the
  // case the narrow trigger exists for — that owner has 96% of her logged meals
  // rated, and the wide sentence reads back at her as a wrong statement about her
  // own logging (§6.9).
  it('never claims the wide record is unrated when the narrow one fired it', () => {
    const joined = allStrings(resolveTrialCard(teaching({
      intakeRating: { rated: 48, feedings: 50, primaryRated: 0, primaryFeedings: 20 },
    }))).join(' ');
    expect(joined).toContain('logged meals of the trial diet');
    expect(joined).not.toContain('Mochi’s logged meals don’t yet say');
  });

  // NOT ON STATE 3. The exposures card already carries a note the owner is meant
  // to act on — record-and-continue, the sentence that decides whether they
  // finish six weeks — and a teaching aside underneath it competes for the same
  // slot. Every other state in that body has the slot free.
  it('yields the slot to record-and-continue on the exposures card', () => {
    expect(textOf(resolveTrialCard(teaching({
      exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 3 },
    })), 'teach')).toEqual([]);
    expect(textOf(resolveTrialCard(teaching({ nowMs: localNoon(2026, 9, 1) })), 'teach'))
      .toHaveLength(1);
  });

  // NOTHING IN IT MAY IMPLY ANYTHING IS WRONG WITH THE PET. It is not a safety
  // register and must never read as one — the state it renders on is a card where
  // nothing is wrong, which is the whole point of teaching there.
  it('is never a safety register', () => {
    const model = resolveTrialCard(teaching());
    expect(textOf(model, 'flag')).toEqual([]);
    for (const s of textOf(model, 'teach')) {
      expect(s).not.toMatch(/\b(vet|call|worth|concern|unfinished|isn’t eating)\b.*\bnow\b/i);
      expect(s).not.toMatch(/wrong|worry|urgent/i);
    }
  });
});

// ── The residual R1 leaves on the terminal cards (B-570) ────────────────────
//
// `trialDietRefusal` and `rangeRefusal` are not nested: a trial eaten for six
// weeks and refused for the last two clears the RANGE share and fires the recency
// one, so a FINISHED trial can carry a now-fact with no range fact. `registerFor`
// routes that to `record`, not to `refusal_withheld`.
//
// PINNED AS A BOUND, NOT AS A BLESSING. What holds is that the affirmative claim
// is withheld — the module gate reads the now-fact, so the adapter never hands
// the card `mayStateRecordClean: true` on such a record. What does NOT hold is
// that the finding is disclosed, and withholding a claim is not the same as
// disclosing a finding (this file's own `rangeRefusal` docstring). Changing it
// changes what an owner reads on a finished trial and belongs with the Dr. Chen
// stand-down ruling, so it is B-570.
describe('the terminal residual R1 leaves (B-570)', () => {
  const finishedButRefusing = (mayStateRecordClean: boolean) => activeInput({
    species: 'cat',
    petName: 'Mochi',
    trial: {
      status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
      targetDurationDays: 56, foodLabel: FOOD,
    },
    trialDietRefusal: REFUSING_NOW,
    coverage: { daysLogged: 54, daysElapsed: 56 },
    exposures: { mayStateRecordClean, totalFeedings: 182, offDiet: 0 },
  });

  it('withholds the clean claim, because the module gate reads the now-fact', () => {
    expect(allStrings(resolveTrialCard(finishedButRefusing(false))).join(' '))
      .not.toMatch(/all \d+ matched|matched the trial diet or a permitted food/i);
  });

  // The gap itself, stated so it cannot be mistaken for covered ground: the
  // register does not change, so the refusal is not NAMED on the terminal card.
  it('does not yet name the refusal there — the open half', () => {
    expect(planTrialCard(finishedButRefusing(false)).register).toBe('record');
    expect(allStrings(resolveTrialCard(finishedButRefusing(false))).join(' '))
      .not.toContain('left unfinished');
  });

  // …and Home still goes quiet over it, which is the half that IS closed: the
  // now-fact is its own withholding reason, keyed on the raw input.
  it('but Home is already silent about it', () => {
    expect(withholdingReasons(finishedButRefusing(false))).toContain('trial_diet_refusal');
  });
});

// ── B-530 — the live register survives a food-identity miss ──────────────────
//
// The card is where R1's refusal register lives, so the re-photographed-bag
// counterexample silences it here too: with no `primary_diet` match there is no
// narrow population, the fact goes null, and the card falls back to a record state
// that withholds its claim without ever saying WHY. `computeTrialFacts` now measures
// the same floors over the meal record in that state, and the population travels with
// the fact so both sentences widen together.
describe('B-530 — the register speaks when the trial diet cannot be identified', () => {
  const WIDE_REFUSAL = {
    days: 21,
    ratedFeedings: 42,
    refusedFeedings: 42,
    population: 'meal_record' as const,
  };

  it('renders the live refusal state, not a quiet record state', () => {
    const model = resolveTrialCard(
      activeInput({
        species: 'cat',
        petName: 'Miso',
        allowedSetUnavailable: true,
        trialDietRefusal: WIDE_REFUSAL,
      }),
    );
    expect(model.state).toBe('trial_refusal');
  });

  it('never names the trial diet it could not identify', () => {
    const text = resolveTrialCard(
      activeInput({
        species: 'cat',
        petName: 'Miso',
        allowedSetUnavailable: true,
        trialDietRefusal: WIDE_REFUSAL,
      }),
    )
      .lines.map((l) => l.text)
      .join(' ');
    expect(text).toMatch(/42 meals you’ve rated/);
    expect(text).not.toMatch(/trial-diet feedings/);
    // The gap is disclosed rather than papered over — and the escalation is unchanged,
    // because "this animal is not finishing what is put down" does not depend on
    // knowing which bag it came out of.
    expect(text).toMatch(/can’t match these meals to the foods on this trial’s list/);
    expect(text).toMatch(/needs a call today/);
    // And it still never softens toward preference.
    expect(text).not.toMatch(/picky|fussy|doesn’t like|to taste/i);
  });

  it('leaves the narrow, named finding alone when identity resolves', () => {
    const text = resolveTrialCard(
      activeInput({ species: 'cat', petName: 'Miso', trialDietRefusal: REFUSING_NOW }),
    )
      .lines.map((l) => l.text)
      .join(' ');
    expect(text).toMatch(/trial-diet feedings/);
    expect(text).not.toMatch(/can’t match these meals/);
  });
});

// ── B-704 — the "{Protein} trial" identity naming (TP-4 viewers) ──────────────
//
// The card kicker and the Home strip header lead with "{Protein} trial" when a
// protein resolves (either source), and fall back to the unchanged "Diet trial"
// otherwise. The food label stays the naming below, so the fallback is today's
// surface. `trialProtein` is already resolved by the loader — the resolver never
// re-derives it.

describe('B-704 trialIdentityLabel', () => {
  const base: TrialCardTrial = {
    status: 'active',
    startedAt: '2026-07-03',
    targetDurationDays: 42,
  };

  it('names the trial by its protein, capitalized, from either source', () => {
    expect(trialIdentityLabel({ ...base, trialProtein: { protein: 'rabbit', source: 'owner' } }))
      .toBe('Rabbit trial');
    expect(trialIdentityLabel({ ...base, trialProtein: { protein: 'rabbit', source: 'derived' } }))
      .toBe('Rabbit trial');
  });

  it('falls back to "Diet trial" when nothing resolves — never a "no protein" claim', () => {
    expect(trialIdentityLabel({ ...base, trialProtein: { protein: null, source: null } }))
      .toBe('Diet trial');
    expect(trialIdentityLabel({ ...base })).toBe('Diet trial');
    expect(trialIdentityLabel(null)).toBe('Diet trial');
  });
});

describe('B-704 card + strip render the protein identity', () => {
  const withProtein = (over: Partial<TrialCardInput> = {}): TrialCardInput => {
    const inp = activeInput(over);
    return { ...inp, trial: { ...inp.trial!, trialProtein: { protein: 'rabbit', source: 'owner' } } };
  };

  it('the active card kicker leads with the protein', () => {
    expect(resolveTrialCard(withProtein()).kicker).toBe('Rabbit trial');
  });

  it('the strip header leads with the protein, then the day suffix', () => {
    const strip = resolveTrialStrip(withProtein());
    expect(strip?.header).toBe('Rabbit trial · day 23 of 56');
  });

  it('the completed kicker keeps the protein identity', () => {
    const model = resolveTrialCard(withProtein({
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD, outcome: 'improved',
        trialProtein: { protein: 'rabbit', source: 'owner' },
      },
      nowMs: localNoon(2026, 8, 28),
    }));
    expect(model.kicker).toBe('Rabbit trial · finished');
  });

  it('unchanged fallback — no protein leaves the kicker and header as "Diet trial"', () => {
    expect(resolveTrialCard(activeInput()).kicker).toBe('Diet trial');
    expect(resolveTrialStrip(activeInput())?.header).toBe('Diet trial · day 23 of 56');
  });

  it('the food label is untouched by the naming — it stays the line below', () => {
    expect(resolveTrialCard(withProtein()).foodLabel).toBe(FOOD);
  });
});
