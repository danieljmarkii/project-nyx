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
  type TrialCardTrial,
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
    ['11 trial-diet refusal', activeInput({
      species: 'cat',
      petName: 'Mochi',
      trialDietRefusal: { refusedFeedings: 19, ratedFeedings: 22, days: 11 },
    })],
    ['12 intake unrated (teach)', activeInput({
      intakeRating: { rated: 1, feedings: 12, primaryRated: 1, primaryFeedings: 12 },
    })],
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
    expect(model.actions).toEqual([]);
    expect(allStrings(model).join(' ')).not.toMatch(/log a meal/i);
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
      'Culprit isn’t showing the trial numbers while this is going on.',
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
    expect(textOf(m, 'fact')).toEqual([]);
    expect(allStrings(m).join(' ')).not.toMatch(/matched|feedings in total|Meals logged on/);
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

// ── B-533 / R1 — the trial-diet refusal register ─────────────────────────────
//
// The patient `detectIntakeDecline` structurally cannot see: a diet refused from
// day 1 is uniformly low rather than declining, so the relative detector returns
// `{ status: 'none' }` and the chronic case DECAYS INTO the clean case. PR 5
// computed `trialDietRefusal` for exactly this and nothing consumed it.
describe('replacement 11 — the trial diet is going unfinished (R1)', () => {
  const refusal = { refusedFeedings: 19, ratedFeedings: 22, days: 11 };
  const model = resolveTrialCard(activeInput({
    species: 'cat',
    petName: 'Mochi',
    trialDietRefusal: refusal,
  }));

  it('REPLACES the adherence line rather than rendering beside it', () => {
    expect(model.state).toBe('trial_refusal');
    expect(textOf(model, 'fact')).toEqual([]);
    expect(allStrings(model).join(' ')).not.toMatch(/matched|feedings in total|Meals logged on/);
  });

  it('states the record with its own denominator, in the safety register', () => {
    const flags = textOf(model, 'flag');
    expect(flags[0]).toContain('19 feedings of the 22 trial-diet feedings you’ve rated');
    expect(flags[0]).toContain('across 11 days');
    expect(flags[1]).toContain('needs a call today');
    expect(flags[1]).toContain('isn’t showing how closely the diet was followed');
  });

  // The canonical refusing patient — every rated feeding unfinished — is the most
  // serious shape this fact takes, and must not read as the clumsiest sentence.
  it('states the all-unfinished case as a statement, not as arithmetic', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trialDietRefusal: { refusedFeedings: 28, ratedFeedings: 28, days: 14 },
    }));
    expect(textOf(m, 'flag')[0]).toBe(
      'Every one of the 28 trial-diet feedings you’ve rated was left unfinished, ' +
      'across 14 days.',
    );
  });

  // §5.2's floor may only ever move in the DISCLOSE-MORE direction. The first cut
  // of this state emitted the two flag lines and nothing else, which deleted a
  // real finding: an owner with logged off-diet exposures lost that count.
  it('keeps the off-diet count and its drill-in', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trialDietRefusal: refusal,
      exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 12 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      'Separately, 12 logged feedings were outside the trial diet. ' +
      'The 12 are what’s been logged, not a total.',
    ]);
    expect(m.actions.map((a) => a.id)).toEqual(['trial_manage', 'view_exposures']);
    // …but still no adherence reading: no coverage, no statement about matching.
    expect(allStrings(m).join(' ')).not.toMatch(/Meals logged on|matched/);
  });

  // Intake is not preference. Decline is frequently a DISEASE signal and the
  // trial is not a reason to reclassify it as taste.
  it('never softens toward preference', () => {
    expect(allStrings(model).join(' ')).not.toMatch(/pick|fussy|prefer|doesn’t like|taste/i);
  });

  // §6.5: the second path may not soften the first. The clinical lane owns the
  // headline whenever both are live.
  it('defers to the clinical intake-decline lane when both fire', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trialDietRefusal: refusal,
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    }));
    expect(m.state).toBe('intake_decline');
    expect(textOf(m, 'flag')[0]).toBe('Mochi has left most of her food for 3 days.');
    // Never two safety headlines stacked — that makes neither of them the headline.
    expect(textOf(m, 'flag').join(' ')).not.toContain('trial-diet feedings you’ve rated');
  });

  it('softens the register for a dog without borrowing the feline clock', () => {
    const m = resolveTrialCard(activeInput({
      species: 'dog',
      petName: 'Rex',
      trialDietRefusal: refusal,
    }));
    expect(textOf(m, 'flag')[1]).not.toContain('soon');
    expect(textOf(m, 'flag')[1]).toContain('your vet');
  });

  // The one state whose message is "this diet may need to change" cannot leave
  // the way out as a 13px link in the header.
  it('offers the way out as a card action', () => {
    expect(model.actions).toEqual([
      { id: 'trial_manage', label: 'Change or end the trial', emphasis: 'secondary' },
    ]);
  });

  // §4.3 — the decision never expires. A refusing trial that reaches its window
  // still has to be closable, or §7 renders a stopped intervention as ongoing.
  it('keeps the milestone reachable once the window is up', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: localNoon(2026, 9, 1),
      species: 'cat',
      petName: 'Mochi',
      trialDietRefusal: refusal,
    }));
    expect(m.state).toBe('trial_refusal');
    expect(m.actions.map((a) => a.id)).toEqual(['trial_manage', 'milestone']);
    // A bar pinned at 100% over a diet that isn't being eaten is completion
    // vocabulary drawn in pixels.
    expect(m.progressFraction).toBeNull();
  });

  // TERMINAL-STATE-AWARE, the same rule round 1b established for `stopped_reason`
  // — reached from the RECORD this time, so it covers the owner who ran the
  // window out and tapped "This trial is done" over a diet that went uneaten.
  it('withholds the clean statement on a COMPLETED trial too', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD,
      },
      coverage: { daysLogged: 54, daysElapsed: 56 },
      exposures: { mayStateRecordClean: false, totalFeedings: 182, offDiet: 0 },
      trialDietRefusal: refusal,
    }));
    expect(allStrings(m).join(' ')).not.toMatch(/matched the trial diet or a permitted food/i);
    expect(textOf(m, 'fact').join(' ')).toContain('Culprit isn’t showing how clean');
    // …and it still says what the record DOES hold. Not silence.
    expect(textOf(m, 'fact').join(' ')).toContain('meals offered on 54 of 56 days');
  });

  // An owner who stopped early for cost, over a diet the log shows was going
  // uneaten, gets the same withholding — but not the note that answers a reason
  // they did not give.
  it('withholds on an abandoned trial whose stated reason was not refusal', () => {
    const m = resolveTrialCard(activeInput({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
        targetDurationDays: 56, foodLabel: FOOD, stoppedReason: 'cost',
      },
      coverage: { daysLogged: 18, daysElapsed: 19 },
      exposures: { mayStateRecordClean: false, totalFeedings: 54, offDiet: 0 },
      trialDietRefusal: refusal,
    }));
    expect(textOf(m, 'lead')).toEqual(['Stopped because of the cost.']);
    expect(allStrings(m).join(' ')).not.toMatch(/matched the trial diet or a permitted food/i);
    expect(allStrings(m).join(' ')).not.toContain('a different diet, not a different plan');
  });

  // Home carries no room for the register, but it may not render a tidy coverage
  // line as though the trial were proceeding normally.
  it('empties the Home strip line while it is live', () => {
    const strip = resolveTrialStrip(activeInput({
      species: 'cat', petName: 'Mochi', trialDietRefusal: refusal,
    }));
    expect(strip?.header).toBe('Diet trial · day 23 of 56');
    expect(strip?.line).toBeNull();
  });
});

// ── B-533 / R1b — the intake-rating teach line ───────────────────────────────
//
// The refusal register above only fires on RATED feedings (R1a: an owner who is
// not rating must never be told her cat isn't eating), so this line is what makes
// it reachable at all.
describe('the intake-rating teach line (R1b)', () => {
  const unrated = { rated: 1, feedings: 12, primaryRated: 1, primaryFeedings: 12 };

  it('teaches the tap when most of the meal record is unrated', () => {
    const m = resolveTrialCard(activeInput({ intakeRating: unrated }));
    // The NARROW population is what fired (12 primary-diet feedings, 1 rated), so
    // the sentence names it. A single string denominated on the whole meal record
    // is false in exactly the case the narrow trigger exists for.
    expect(textOf(m, 'teach')).toEqual([
      'One tap makes these readable. Most of Biscuit’s logged meals of the trial diet ' +
      'don’t yet say how much was eaten, and on a diet trial that’s the part your vet reads.',
    ]);
  });

  // IT FIRES WHEN NOTHING IS WRONG, so nothing in it may imply otherwise — and
  // it is about the RECORD, never the person (§6.9) and never the animal.
  it('implies nothing is wrong with the pet and blames nobody', () => {
    const m = resolveTrialCard(activeInput({ intakeRating: unrated }));
    const text = textOf(m, 'teach').join(' ');
    expect(text).not.toMatch(/\byou (?:haven’t|have not|didn’t|failed|should)\b/i);
    expect(text).not.toMatch(/eating|refus|unwell|worry|wrong|missing/i);
    // Quiet, never the safety register.
    expect(textOf(m, 'flag')).toEqual([]);
  });

  it('stays silent once the owner is rating', () => {
    const m = resolveTrialCard(activeInput({ intakeRating: { rated: 9, feedings: 12, primaryRated: 9, primaryFeedings: 12 } }));
    expect(textOf(m, 'teach')).toEqual([]);
  });

  // A 0-of-1 record is not a habit. Teaching off it hands a correction to an
  // owner on day 1 of 56 for having logged one meal.
  it('stays silent on a sample too small to call "most"', () => {
    const m = resolveTrialCard(activeInput({ intakeRating: { rated: 0, feedings: 3, primaryRated: 0, primaryFeedings: 3 } }));
    expect(textOf(m, 'teach')).toEqual([]);
  });

  it('stays silent when there is nothing in range to have rated', () => {
    const m = resolveTrialCard(activeInput({ intakeRating: null }));
    expect(textOf(m, 'teach')).toEqual([]);
  });

  // The exposures card already carries a note the owner is meant to ACT on.
  it('yields the slot on the exposures card', () => {
    const m = resolveTrialCard(activeInput({
      intakeRating: unrated,
      exposures: {
        mayStateRecordClean: true,
        totalFeedings: 68,
        offDiet: 3,
        mostRecent: { label: 'Zuke’s Mini Naturals (chicken)', when: 'Yesterday' },
      },
    }));
    expect(m.state).toBe('exposures');
    expect(textOf(m, 'teach')).toEqual([]);
    expect(textOf(m, 'note').join(' ')).toContain('Keep going with the trial diet');
  });

  // Jordan's constraint: the owner below the floor gets MORE card, not less, and
  // is the owner the rating tap helps most.
  it('renders on the sub-floor card', () => {
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { mayStateRecordClean: true, totalFeedings: 9, offDiet: 0 },
      intakeRating: unrated,
    }));
    expect(m.state).toBe('below_floor');
    expect(textOf(m, 'teach')).toHaveLength(1);
  });

  // The register it teaches toward outranks it: an owner already being told the
  // diet is going uneaten does not also need the tap explained.
  it('gives way to the refusal register', () => {
    const m = resolveTrialCard(activeInput({
      intakeRating: unrated,
      trialDietRefusal: { refusedFeedings: 19, ratedFeedings: 22, days: 11 },
    }));
    expect(m.state).toBe('trial_refusal');
    expect(textOf(m, 'teach')).toEqual([]);
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
      '68 feedings in total.',
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
      'The first 28 days of the trial have no meals logged against them, so they’re ' +
      'left out of the days count above.',
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
      'The first day of the trial has no meals logged against it',
    );
  });

  // BREAK 7 — the teach line must key on the population the refusal lane READS.
  describe('the teach line asks the narrow question when it can', () => {
    it('fires when the prescribed diet is unrated even if the record looks rated', () => {
      const m = resolveTrialCard(activeInput({
        // 60% rated overall, 0% where the refusal lane looks.
        intakeRating: { rated: 60, feedings: 100, primaryRated: 0, primaryFeedings: 40 },
      }));
      expect(textOf(m, 'teach')).toHaveLength(1);
    });

    it('stays silent when the prescribed diet IS being rated', () => {
      const m = resolveTrialCard(activeInput({
        // The mirror image: a thin overall record, but the lane can see fine.
        intakeRating: { rated: 20, feedings: 100, primaryRated: 38, primaryFeedings: 40 },
      }));
      expect(textOf(m, 'teach')).toEqual([]);
    });

    // The wide population is the FALLBACK for when identity has missed and there
    // is no narrow population to measure — silence there would be just as wrong.
    it('falls back to the wide question when identity has missed entirely', () => {
      const m = resolveTrialCard(activeInput({
        intakeRating: { rated: 1, feedings: 12, primaryRated: 0, primaryFeedings: 0 },
      }));
      expect(textOf(m, 'teach')).toHaveLength(1);
    });
  });
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
  describe('an unusable allowed list withholds the exposure reading entirely', () => {
    const cold = (over: Partial<TrialCardInput> = {}) =>
      resolveTrialCard(activeInput({
        allowedSetUnavailable: true,
        exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 40 },
        ...over,
      }));

    it('never renders the accusation', () => {
      const m = cold();
      expect(allStrings(m).join(' ')).not.toMatch(/0 matched|40 did not|did not\./);
      expect(textOf(m, 'fact')).toContain(
        'No allowed-food list is recorded for this trial yet, so nothing here has been ' +
        'checked against it.',
      );
    });

    // Coverage is independent of what the trial permits, and it is the one fact
    // still worth stating.
    it('still states how completely the record was kept', () => {
      expect(textOf(cold(), 'fact')).toContain('Meals logged on 22 of 23 days.');
    });

    it('does not route to the exposures state or offer the drill-in', () => {
      const m = cold();
      expect(m.state).toBe('clean');
      expect(m.actions.map((a) => a.id)).not.toContain('view_exposures');
      expect(allStrings(m).join(' ')).not.toContain('Keep going with the trial diet');
    });

    it('withholds it on the sub-floor card too', () => {
      const m = cold({
        belowCoverageFloor: true,
        coverage: { daysLogged: 3, daysElapsed: 14 },
        exposures: { mayStateRecordClean: false, totalFeedings: 6, offDiet: 6 },
      });
      expect(allStrings(m).join(' ')).not.toMatch(/0 matched|6 did not/);
    });

    it('withholds it beside the refusal register too', () => {
      const m = cold({
        species: 'cat',
        petName: 'Mochi',
        trialDietRefusal: { refusedFeedings: 19, ratedFeedings: 22, days: 11 },
      });
      expect(m.state).toBe('trial_refusal');
      expect(allStrings(m).join(' ')).not.toMatch(/outside the trial diet/i);
      expect(m.actions.map((a) => a.id)).toEqual(['trial_manage']);
    });

    // …and a usable list is untouched: this must not become a blanket silencer.
    it('leaves a hydrated trial alone', () => {
      const m = resolveTrialCard(activeInput({
        exposures: { mayStateRecordClean: true, totalFeedings: 40, offDiet: 0 },
      }));
      expect(textOf(m, 'fact')).toContain(
        '40 feedings in total — all 40 matched the trial diet or a permitted food.',
      );
    });
  });

  // ROUND-2 #2 — the refusal card contradicted its own flag block: an absolute
  // "isn't showing the trial numbers" rendered one line above a trial number,
  // created by round 1's own fix for keeping the off-diet count.
  it('the refusal note names what it withheld, and does not contradict the count', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      trialDietRefusal: { refusedFeedings: 19, ratedFeedings: 22, days: 11 },
      exposures: { mayStateRecordClean: false, totalFeedings: 40, offDiet: 4 },
    }));
    const joined = allStrings(m).join(' ');
    expect(joined).toContain('isn’t showing how closely the diet was followed');
    expect(joined).not.toContain('isn’t showing the trial numbers');
    // The number it does show is still there.
    expect(textOf(m, 'fact').join(' ')).toContain('4 logged feedings were outside');
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
    const head = textOf(m, 'qualifier').join(' ');
    expect(head).toContain('have no meals logged against them');
    expect(head).not.toContain('nothing logged');
    // It qualifies the DAYS ratio, not the feeding total the treats are inside.
    expect(head).toContain('left out of the days count above');
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

  // ROUND-2 #5 — the teach sentence was denominated on the wide record while the
  // trigger was narrow, so it fired saying "most of Mochi's logged meals don't
  // say" over a record where 96% of them did.
  it('the teach sentence names the population it fired on', () => {
    const narrow = resolveTrialCard(activeInput({
      petName: 'Mochi',
      intakeRating: { rated: 100, feedings: 104, primaryRated: 0, primaryFeedings: 4 },
    }));
    expect(textOf(narrow, 'teach')[0]).toContain('logged meals of the trial diet');

    const wide = resolveTrialCard(activeInput({
      petName: 'Mochi',
      intakeRating: { rated: 1, feedings: 12, primaryRated: 0, primaryFeedings: 0 },
    }));
    expect(textOf(wide, 'teach')[0]).toContain('logged meals don’t yet say');
    expect(textOf(wide, 'teach')[0]).not.toContain('of the trial diet');
  });
});
