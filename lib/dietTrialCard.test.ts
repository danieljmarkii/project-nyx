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
  resolveTrialStrip,
  formatTrialDate,
  trialEndDayIndex,
  BLIND_SPOT_QUALIFIER,
  type TrialCardInput,
  type TrialCardModel,
  type TrialCardLineRole,
} from './dietTrialCard';
import { getDietTrialProgress } from './analytics';

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
    model.action?.label ?? '',
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
    exposures: { totalFeedings: 68, offDiet: 0 },
    ...over,
  };
}

// ── The two rules, asserted across every state at once ───────────────────────

describe('the two rules (they govern every state)', () => {
  // Each entry is a state the card can reach, built at its triggering input.
  const everyState: Array<[string, TrialCardInput]> = [
    ['0 no trial', { ...activeInput(), trial: null }],
    ['1 day one', activeInput({
      nowMs: localNoon(2026, 7, 3),
      coverage: { daysLogged: 0, daysElapsed: 1 },
      exposures: null,
    })],
    ['2 clean', activeInput()],
    ['3 exposures', activeInput({
      exposures: {
        totalFeedings: 68,
        offDiet: 3,
        mostRecent: { label: 'Zuke’s Mini Naturals (chicken)', when: 'Yesterday, 6:40 pm' },
      },
    })],
    ['4 below floor', activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { totalFeedings: 9, offDiet: 0 },
    })],
    ['5 milestone', activeInput({ nowMs: localNoon(2026, 8, 27) })],
    ['6 overrun', activeInput({ nowMs: localNoon(2026, 9, 1) })],
    ['7a completed', activeInput({
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD, outcome: 'improved',
      },
      coverage: { daysLogged: 54, daysElapsed: 56 },
      exposures: { totalFeedings: 182, offDiet: 6 },
    })],
    ['7b abandoned (refusal)', activeInput({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD,
        stoppedReason: 'Biscuit wouldn’t eat it', stoppedForRefusal: true,
      },
      coverage: { daysLogged: 18, daysElapsed: 19 },
      exposures: { totalFeedings: 54, offDiet: 0 },
    })],
    ['8 intake decline', activeInput({
      species: 'cat',
      petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    })],
    ['9 free-fed', activeInput({ freeFed: { loggedFeedings: 22 } })],
    ['10 multi-pet caveat', activeInput({ otherPetNames: ['Mochi'] })],
  ];

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
    expect(model.action).toEqual({ id: 'start_trial', label: 'Start a diet trial' });
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
    // …and the FLOOR caveat rides with it, including here. B-417 PR 5's
    // adversarial pass found §5.2's "a floor, never a total" was stated on every
    // card except the clean one — the only sentence a reader can mistake for a
    // total was the only one with no qualifier attached.
    expect(textOf(model, 'qualifier')).toEqual([
      `${BLIND_SPOT_QUALIFIER} That’s what’s been logged, not everything that happened.`,
    ]);
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
    expect(model.action).toBeNull();
    expect(allStrings(model).join(' ')).not.toMatch(/log a meal/i);
  });
});

describe('state 3 — the day after a slip', () => {
  const model = resolveTrialCard(activeInput({
    exposures: {
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
      exposures: { totalFeedings: 68, offDiet: 1 },
    }));
    expect(textOf(one, 'qualifier')[0]).toContain('That 1 is what’s been logged, not a total.');
  });
});

describe('state 4 — below the coverage floor', () => {
  const model = resolveTrialCard(activeInput({
    belowCoverageFloor: true,
    coverage: { daysLogged: 6, daysElapsed: 23 },
    exposures: { totalFeedings: 9, offDiet: 0 },
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
      exposures: { totalFeedings: 9, offDiet: 0 },
    }));
    expect(withoutFlag.state).toBe('clean');
  });
});

describe('state 5 — the milestone', () => {
  const model = resolveTrialCard(activeInput({ nowMs: localNoon(2026, 8, 27) }));

  it('is action-first and never reads as permission to stop', () => {
    expect(model.state).toBe('milestone');
    expect(model.dayLine).toBe('Day 56 of 56 — the window you set is done.');
    expect(textOf(model, 'note')).toEqual(['Your vet decides when the diet changes.']);
    // ACVIM 2026: continue the diet ≥12 weeks before transitioning away. A
    // day-28 "trial complete" would tell a GI owner to stop at a quarter of that.
    expect(allStrings(model).join(' ')).not.toMatch(/complete|finished|you can stop|all done/i);
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
    exposures: { totalFeedings: 182, offDiet: 6 },
  }));

  it('keeps rendering after completion, as a dated range', () => {
    expect(model.state).toBe('completed');
    expect(model.kicker).toBe('Diet trial · finished');
    expect(model.dayLine).toBe('3 July – 27 August · 56 days');
    expect(model.progressFraction).toBeNull();
  });

  it('renders the owner-reported outcome as the OWNER’s judgement', () => {
    expect(textOf(model, 'note')).toEqual([
      'You said Biscuit was better at the end of it. That goes on the vet report in ' +
      'your name, so your vet reads it as your judgement rather than as something ' +
      'Culprit worked out.',
    ]);
    // §7: the words confirmed / diagnosis / food allergy may not appear near it.
    const joined = allStrings(model).join(' ');
    expect(joined).not.toMatch(/confirmed|diagnosis|food allergy/i);
  });

  it('offers the report, not another trial action', () => {
    expect(model.action).toEqual({ id: 'open_report', label: 'Open vet report' });
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
    exposures: { totalFeedings: 54, offDiet: 0 },
  }));

  it('is never framed as failure', () => {
    expect(refused.state).toBe('abandoned');
    expect(refused.kicker).toBe('Diet trial · stopped early');
    expect(refused.dayLine).toBe('3 July – 21 July · 19 days');
    expect(allStrings(refused).join(' ')).not.toMatch(/failed|failure|gave up|didn’t manage/i);
  });

  it('routes the refusal toward the vet, not toward a compliance verdict', () => {
    expect(textOf(refused, 'lead')).toEqual(['Stopped because Biscuit wouldn’t eat it.']);
    expect(textOf(refused, 'note')).toEqual([
      'That’s a useful thing for your vet to know — it usually means a different ' +
      'diet, not a different plan.',
    ]);
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
      exposures: { totalFeedings: 54, offDiet: 0 },
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
    exposures: { totalFeedings: 18, offDiet: 0 },
  }));

  // §5.2 proof #1: a cat refusing the hydrolyzed diet every day whose owner
  // dutifully logs the offered bowl scores 100% coverage and 0 exposures — a
  // maximally clean trial rendered over a starving animal.
  it('REPLACES the adherence line rather than rendering beside it', () => {
    expect(model.state).toBe('intake_decline');
    expect(textOf(model, 'fact')).toEqual([]);
    expect(allStrings(model).join(' ')).not.toMatch(/matched|feedings in total|Meals logged on/);
  });

  it('puts the cat before the trial', () => {
    expect(textOf(model, 'lead')).toEqual(['Mochi has left most of her food for 3 days.']);
    expect(textOf(model, 'note')).toEqual([
      'A cat that stops eating needs a call today, whatever the trial is doing. ' +
      'Culprit isn’t showing the trial numbers while this is going on.',
    ]);
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
      exposures: { totalFeedings: 182, offDiet: 6 },
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }));
    expect(textOf(m, 'fact')).toEqual([]);
    expect(allStrings(m).join(' ')).not.toMatch(/matched|feedings in total|Meals logged on/);
    expect(textOf(m, 'lead')).toEqual(['Mochi has left most of her food for 3 days.']);
    // The owner's outcome still renders — it is attribution, not adherence.
    expect(textOf(m, 'note').join(' ')).toContain('needs a call today');
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
      exposures: { totalFeedings: 54, offDiet: 0 },
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
      exposures: { totalFeedings: 54, offDiet: 0 },
    }));
    expect(allStrings(m).join(' ')).not.toMatch(/matched the trial diet or a permitted food/i);
    expect(textOf(m, 'fact').join(' ')).toContain('Culprit isn’t showing how clean');
  });
});

describe('replacement 9 — free-fed', () => {
  const model = resolveTrialCard(activeInput({
    petName: 'Mochi',
    freeFed: { loggedFeedings: 22 },
    exposures: { totalFeedings: 22, offDiet: 0 },
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

  it('still reports what WAS logged', () => {
    expect(textOf(model, 'fact')).toEqual([
      '22 bowl top-ups and wet meals logged; all 22 were the trial diet.',
    ]);
    expect(textOf(model, 'qualifier')).toEqual([BLIND_SPOT_QUALIFIER]);
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
