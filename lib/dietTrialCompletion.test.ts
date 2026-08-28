// B-417 PR 6 — the completion milestone and the owner-reported outcome (§4.3).
//
// §12's PR-6 criteria, each with an oracle:
//   • the milestone renders ACTION-FIRST (asserted on the card, in
//     dietTrialCard.test.ts, where the state lives);
//   • it NEVER READS AS PERMISSION TO STOP — a greppable guard over the whole
//     module, not a spot-check of the strings someone remembered to check;
//   • `Keep going` has equal visual weight to `This trial is done` AND CANNOT SET
//     A TARGET AT OR BELOW THE CURRENT DAY — the one criterion the mock's own QA
//     note called out as having a real oracle: extend from day 56 must write ≥57;
//   • the outcome is owner-reported and rendered as such;
//   • abandoning carries no failure framing;
//   • a refusal reason routes to the intake lane.
import {
  buildOutcomeSheet, densityLine, extensionDays, extensionPhrase, milestoneNote,
  nextTargetDays, stopReasonNote, trialDecisionChoices, trialStopReasons,
  OUTCOME_OPTIONS, OUTCOME_QUESTION, OUTCOME_QUESTION_NOTE,
  STOPPED_SHEET_INTRO, STOPPED_SHEET_TITLE,
  type TrialOutcomeFacts,
} from './dietTrialCompletion';

function facts(over: Partial<TrialOutcomeFacts> = {}): TrialOutcomeFacts {
  return {
    duringDays: 56,
    beforeDays: 56,
    beforeTracked: true,
    beforeLoggedDays: 48,
    duringLoggedDays: 54,
    symptoms: [
      { symptomType: 'itch', label: 'Itch/Scratch', before: 14, during: 3 },
      { symptomType: 'skin_reaction', label: 'Skin reaction', before: 4, during: 1 },
    ],
    meals: {
      before: { daysLogged: 41, days: 56 },
      during: { daysLogged: 52, days: 56 },
    },
    ...over,
  };
}

// ── The extension: the criterion with an oracle ──────────────────────────────

describe('`Keep going` — the named default', () => {
  it('is +28d for skin and +14d for GI, in weeks', () => {
    expect(extensionDays('skin')).toBe(28);
    expect(extensionDays('gi')).toBe(14);
    expect(extensionPhrase(28)).toBe('4 more weeks');
    expect(extensionPhrase(14)).toBe('2 more weeks');
  });

  it('resolves an unset or `other` indication to the LONGER default', () => {
    // Same asymmetry `defaultDurationDays` makes, for the same reason: a too-long
    // extension costs two more weeks of a restrictive diet and is re-decidable at
    // the next milestone; a too-short one puts the stop button back in front of
    // the owner sooner than the evidence warrants.
    expect(extensionDays('other')).toBe(28);
    expect(extensionDays(null)).toBe(28);
    expect(extensionDays(undefined)).toBe(28);
  });

  it('never offers a blank field — the label carries the number', () => {
    for (const ind of ['skin', 'gi', 'other', null] as const) {
      expect(trialDecisionChoices(ind)[0].label).toMatch(/^Keep going — \d+ more weeks?$/);
    }
  });
});

describe('nextTargetDays — cannot set a target at or below the current day', () => {
  it('extends from the milestone: day 56 of 56, +28 → 84', () => {
    expect(nextTargetDays({ currentTargetDays: 56, dayCounter: 56, extraDays: 28 })).toBe(84);
  });

  it('extends from the DAY when the trial has overrun, not from the target', () => {
    // The mock's own QA note pairs this with state 6 deliberately: overrun is what
    // renders while the owner ignores the milestone, so many owners tap this on
    // day 61 of a 56-day trial. Extending the TARGET would write 84 — four weeks
    // that are only 23 days away. "4 more weeks" has to mean four more weeks.
    expect(nextTargetDays({ currentTargetDays: 56, dayCounter: 61, extraDays: 28 })).toBe(89);
  });

  it('is strictly greater than the current day for every input, including junk', () => {
    const cases = [
      { currentTargetDays: 56, dayCounter: 56, extraDays: 28 },
      { currentTargetDays: 56, dayCounter: 61, extraDays: 14 },
      { currentTargetDays: 28, dayCounter: 400, extraDays: 14 },
      { currentTargetDays: 0, dayCounter: 1, extraDays: 0 },
      { currentTargetDays: Number.NaN, dayCounter: 12, extraDays: Number.NaN },
      { currentTargetDays: 56.7, dayCounter: 56.2, extraDays: 27.9 },
    ];
    for (const c of cases) {
      expect(nextTargetDays(c)).toBeGreaterThan(Math.floor(c.dayCounter));
      expect(Number.isInteger(nextTargetDays(c))).toBe(true);
    }
  });
});

// ── The milestone's copy ─────────────────────────────────────────────────────

describe('milestoneNote', () => {
  it('hands the clinical decision to the vet on every indication', () => {
    for (const ind of ['skin', 'gi', 'other', null] as const) {
      expect(milestoneNote(ind)).toContain('Your vet decides when the diet changes.');
    }
  });

  it('adds the ACVIM continuation sentence on GI, and only on GI', () => {
    expect(milestoneNote('gi')).toMatch(/around three months/);
    for (const ind of ['skin', 'other', null] as const) {
      expect(milestoneNote(ind)).not.toMatch(/three months/);
    }
  });

  it('states clinical practice, never an instruction about this pet', () => {
    // "diets are often continued" is a fact about how these are run. "keep giving
    // the diet" would be Culprit prescribing, which §6.1 forbids outright.
    expect(milestoneNote('gi')).toMatch(/diets are often continued/);
    expect(milestoneNote('gi')).not.toMatch(/\byou should\b|\bkeep giving\b|\bdon’t stop\b/i);
  });
});

// ── The guard: no permission to stop, anywhere in the module ─────────────────

describe('§4.3 — the milestone never reads as permission to stop', () => {
  /// <reference types="node" />
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');

  // Source-scanned rather than model-scanned, for the same reason
  // `dietTrial.test.ts` scans its module: the failure this catches is a string
  // ADDED LATER to a copy function no test happens to call.
  //
  // TWO FILTERS, and both are load-bearing. Whole-line comments are stripped
  // because this module NAMES the vocabulary it refuses, in prose, and matching
  // raw source would make an accurate comment fail. And only PROSE literals are
  // scanned — a string with a space in it — because this module's own tokens
  // include `'complete'` and `'stopped_early'`, which are database values a
  // clinician never sees. Scanning every literal would flag the token and force
  // someone to weaken the pattern, which is how a guard stops guarding.
  const prose = [
    ...readFileSync(join(__dirname, 'dietTrialCompletion.ts'), 'utf8')
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
      })
      .join('\n')
      .matchAll(/'([^'\n]*)'/g),
  ]
    .map((m) => m[1])
    .filter((s) => s.includes(' '));

  // Sanity: the filter must actually be looking at the copy. A regex that matched
  // nothing would pass every assertion below in perfect silence.
  it('finds this module’s owner-facing prose to scan', () => {
    expect(prose.length).toBeGreaterThan(8);
    expect(prose.join(' ')).toContain('Your vet decides when the diet changes.');
  });

  const COMPLETION_VOCABULARY = [
    /\bcomplete/i,
    /\bfinished\b/i,
    /\bpassed\b/i,
    /well done/i,
    /congrat/i,
    /\bsuccess/i,
    /nice work/i,
    /you can stop/i,
    /\ball done\b/i,
  ];

  it.each(COMPLETION_VOCABULARY)('no owner-facing string matches %s', (pattern) => {
    for (const s of prose) expect(s).not.toMatch(pattern);
  });

  // §6.9 — Culprit never scores the owner, and this is the screen where a score
  // would be most tempting and most damaging.
  it('renders no percentage, streak, grade or score', () => {
    for (const s of prose) {
      expect(s).not.toMatch(/%/);
      expect(s).not.toMatch(/\b(?:streak|badge|grade|score|perfect week)\b/i);
    }
  });

  // R1, carried onto this surface. Absence of a logged exposure never reassures.
  it('renders no negative claim about the world', () => {
    for (const s of prose) {
      expect(s).not.toMatch(/no off-diet/i);
      expect(s).not.toMatch(/clean (?:trial|elimination)/i);
      expect(s).not.toMatch(/all clear/i);
    }
  });

  // `clinical-guardrails` Pattern 8: the never-reassure invariant is a TEST, not a
  // comment. The at-risk string here is the no-symptoms empty state, which is
  // deliberately written about the RECORD ("No symptoms are on the record") rather
  // than about the pet — the same distinction `monitor`'s "Keep an eye out" draws
  // against "All clear". This sheet is a cross-incident multi-sample read, which
  // is the one class where reassurance would even be permitted; §6.1 forbids it
  // anyway, because Culprit never scores the trial.
  it('never asserts the pet is well (the reassurance vocabulary)', () => {
    for (const s of prose) {
      expect(s).not.toMatch(/\b(?:fine|okay|healthy|well|normal)\b/i);
      expect(s).not.toMatch(/nothing to worry|no concern|looks good/i);
      // No manufactured enthusiasm, and no shouting (nyx-voice Pattern 4).
      expect(s).not.toMatch(/!/);
    }
  });

  it('never says the trial worked (§6.1 — Culprit never scores the trial)', () => {
    const sheet = buildOutcomeSheet({ facts: facts(), petName: 'Biscuit' });
    const all = [
      sheet.title, sheet.comparisonLine, ...sheet.factLines, sheet.densityLine,
      sheet.question, sheet.questionNote,
    ].join(' ');
    expect(all).not.toMatch(/\bworked\b|\bworking\b|\bimprov(?:ed|ing)\b|\bit’s the food\b/i);
    expect(all).not.toMatch(/confirmed|diagnos|food allerg/i);
  });
});

// ── The outcome sheet ────────────────────────────────────────────────────────

describe('the outcome sheet — the data leads, the question follows', () => {
  const sheet = buildOutcomeSheet({ facts: facts(), petName: 'Biscuit' });

  it('opens with the counts, before vs during, with the span named once', () => {
    expect(sheet.title).toBe('What changed over the 8 weeks');
    expect(sheet.comparisonLine).toBe('Compared with the 8 weeks before it started.');
    expect(sheet.factLines).toEqual([
      'Itch/Scratch: 14 before · 3 during.',
      'Skin reaction: 4 before · 1 during.',
    ]);
  });

  it('asks for the owner’s read only after the counts, and attributes it', () => {
    expect(sheet.question).toBe(OUTCOME_QUESTION);
    // §6.1's owner-facing sentence — the one v0.9 never wrote down. It names who
    // decides, and where the owner's answer lands and in whose name.
    expect(sheet.questionNote).toBe(OUTCOME_QUESTION_NOTE);
    expect(sheet.questionNote).toMatch(/your vet decides what it means/);
    expect(sheet.options).toEqual(OUTCOME_OPTIONS);
    expect(sheet.options.map((o) => o.value)).toEqual([
      'improved', 'no_change', 'worse', 'unsure',
    ]);
  });

  it('says the question is optional and skipping loses nothing (R4, B-536)', () => {
    // R4 flipped the un-gated Save from filed bug (B-508) to design; this copy is
    // what makes the design legible. The claim must also be TRUE: the report
    // renders the trial block from the record and omits the owner line when
    // unanswered (`render.ts` guards on `t.outcome`), so "either way" holds.
    expect(sheet.questionNote).toMatch(/Answering is optional — the counts go on the report either way\.$/);
    // …and legitimising the skip may not shade into discouraging the answer.
    expect(sheet.questionNote).toMatch(/Your read goes on the report/);
  });

  it('states the record, not the world, when nothing was logged either side', () => {
    const empty = buildOutcomeSheet({
      facts: facts({ symptoms: [] }),
      petName: 'Biscuit',
    });
    // "No symptoms" would be a claim about the pet. This is a claim about the log,
    // which is the only thing Culprit can see (R1 / the two-sided rule in §5.2:
    // below the floor Culprit may neither reassure NOR alarm on absence).
    expect(empty.factLines).toEqual(['No symptoms are on the record for either stretch.']);
    expect(empty.factLines[0]).not.toMatch(/^No symptoms\./);
  });

  it('names an untracked before-stretch instead of rendering it as zero', () => {
    // §5.2's S3 rule one surface over: the pre-adoption span is NAMED AS
    // UNTRACKED, never counted as failure — and never as a flattering baseline.
    // "14 before · 3 during" on an owner who had not installed the app before the
    // trial is a fabricated comparison on the screen where they decide what the
    // trial meant.
    const untracked = buildOutcomeSheet({
      facts: facts({
        beforeTracked: false,
        symptoms: [{ symptomType: 'itch', label: 'Itch/Scratch', before: 0, during: 3 }],
        meals: { before: { daysLogged: 0, days: 56 }, during: { daysLogged: 52, days: 56 } },
      }),
      petName: 'Biscuit',
    });
    expect(untracked.comparisonLine).toBe(
      'Nothing was logged in the 8 weeks before the trial started, so there’s ' +
      'nothing to compare these with.',
    );
    expect(untracked.factLines).toEqual(['Itch/Scratch: 3 during the trial.']);

    // THE ZERO MUST NOT SURFACE ANYWHERE, and "anywhere" is the whole assertion.
    // The first cut of this test scanned `factLines` only and passed while the
    // DENSITY line rendered "Meals logged: 0 of 56 days before, 52 of 56 during"
    // two lines under "there's nothing to compare these with" — the sheet
    // contradicting itself, and fabricating exactly the comparison `beforeTracked`
    // exists to prevent. Caught by `pm-feature-review`. Scan every string.
    const everyString = [
      untracked.title, untracked.comparisonLine, ...untracked.factLines,
      untracked.densityLine, untracked.question, untracked.questionNote,
    ].join(' ');
    expect(everyString).not.toMatch(/\b0 before\b/);
    expect(everyString).not.toMatch(/0 of \d+ days before/);
    // The during-half still renders: it is a fact about a stretch that happened.
    expect(untracked.densityLine).toContain(
      'Days you logged any food during the trial: 52 of 56.',
    );
  });

  it('drops the referents to the counts when a decline flag removes them', () => {
    // "Does THAT match" — match what? — and "next to THESE counts", of which there
    // are none on screen. The suppression is right; the two sentences that
    // survived it were pointing at nothing. Caught by `pm-feature-review`.
    const declining = buildOutcomeSheet({
      facts: facts(),
      petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    });
    expect(declining.question).toBe('How has it seemed to you?');
    expect(declining.questionNote).toMatch(/on the report in your name\./);
    expect(declining.questionNote).not.toMatch(/these counts/);
    // R4's optional sentence survives the suppression with its referent swapped:
    // "the record", because the counts it would otherwise point at are not on
    // screen in this state.
    expect(declining.questionNote).toMatch(/Answering is optional — the record goes on the report either way\.$/);
    // …and the title stops promising a span it is no longer reporting on.
    expect(declining.title).toBe('Before you close this trial');
  });

  it('lets a live intake-decline flag REPLACE the counts (§5.2, terminal-aware)', () => {
    const declining = buildOutcomeSheet({
      facts: facts(),
      petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
    });
    // The round-1b lesson: a rule drawn as a live-flag replacement on the ACTIVE
    // card never reached the terminal states. This sheet is terminal too, and a
    // pet that has stopped eating outranks a tally about the last eight weeks.
    expect(declining.declineLead).toBe('Mochi has left most of her food for 3 days.');
    // The component renders `declineLead` INSTEAD of the counts; the model keeps
    // both so the swap is a rendering decision with a visible input rather than a
    // silently-emptied array.
    expect(declining.factLines.length).toBeGreaterThan(0);
  });
});

// ── C5, and the denominator that survived four attempts ──────────────────────

describe('the C5 logging-density line', () => {
  it('renders the MEAL series only, before vs during', () => {
    // NOT "Meals logged" — that phrase belongs to the card's coverage line, which
    // EXCLUDES treats. This series includes them by design, and two metrics
    // sharing one name two taps apart (with this one systematically larger) reads
    // as the record improving between screens.
    expect(densityLine(facts(), 'Biscuit')).toContain(
      'Days you logged any food: 41 of 56 before, 52 of 56 during.',
    );
    expect(densityLine(facts(), 'Biscuit')).not.toContain('Meals logged');
  });

  it('carries NO verdict, in either direction', () => {
    // `generate-report`'s TrialLoggingDensity records both failed denominators and
    // both failed verdicts. The adjudicating forms — "so the drop isn't just less
    // logging" (certifies the artefact C5 exists to disclose) and "so a fall in
    // symptom counts cannot be separated from the fall in logging" (a tautology
    // that revokes the trial's own result) — are what round 5 deleted. An owner
    // reading a flattering number is exactly the person who stops a diet early.
    for (const f of [
      facts(),
      facts({ meals: { before: { daysLogged: 2, days: 56 }, during: { daysLogged: 54, days: 56 } } }),
      facts({ meals: { before: { daysLogged: 54, days: 56 }, during: { daysLogged: 2, days: 56 } } }),
    ]) {
      const line = densityLine(f, 'Biscuit');
      expect(line).not.toMatch(/\bso\b.*\b(?:isn’t|is not|cannot|can’t)\b/i);
      expect(line).not.toMatch(/logging (?:held up|fell|dropped)/i);
      expect(line).toMatch(/doesn’t judge whether a change in one explains a change in the other/);
    }
  });

  it('is MANDATORY — it renders on a short trial too, where the report goes silent', () => {
    // The report's 14-day floor exists because a weak CLAIM would discredit a
    // record that is fine. There is no claim here to be weak, and §4.3 makes the
    // line mandatory on this sheet, so two ratios render regardless of span.
    const short = buildOutcomeSheet({
      facts: facts({
        duringDays: 7, beforeDays: 7,
        meals: { before: { daysLogged: 5, days: 7 }, during: { daysLogged: 7, days: 7 } },
      }),
      petName: 'Biscuit',
    });
    expect(short.densityLine).toContain('Days you logged any food: 5 of 7 before, 7 of 7 during.');
  });

  it('says what it counts, so it is not mistaken for how the pet was', () => {
    expect(densityLine(facts(), 'Biscuit')).toContain(
      'That’s how much got logged, not how Biscuit was',
    );
  });

  it('B-536 — a tracked-but-food-less before-stretch never renders as "0 of N before"', () => {
    // The pre-ship adversarial counterexample, executed: symptoms logged on 30 of
    // the 56 before-days (so `beforeTracked` is true and the untracked branch
    // never fires), but not one meal. The guard keyed on ANY-event days while the
    // number counted MEAL days, so the sheet rendered "Days you logged any food:
    // 0 of 56 before, 52 of 56 during" — a fabricated zero that reads as "logging
    // went from nothing to daily", lending the symptom comparison a credibility
    // check it never passed, in the flattering direction, on the screen that ends
    // the intervention.
    const foodless = facts({
      beforeTracked: true,
      beforeLoggedDays: 30,
      meals: { before: { daysLogged: 0, days: 56 }, during: { daysLogged: 52, days: 56 } },
    });
    const line = densityLine(foodless, 'Biscuit');
    expect(line).not.toMatch(/0 of \d+ before/);
    expect(line).toContain('Days you logged any food during the trial: 52 of 56.');
    // The missing before-half is EXPLAINED, not silently dropped — the untracked
    // branch gets its explanation from the comparison line above it, but here the
    // comparison line renders normally (symptoms WERE tracked), so this line must
    // carry its own.
    expect(line).toContain('There’s no food logging from before the trial to compare that with.');
    // …and the explanation is a claim about the LOG, never a verdict about the
    // record's quality or the owner (the same no-verdict rule as the main line).
    expect(line).not.toMatch(/\bso\b.*\b(?:isn’t|is not|cannot|can’t)\b/i);
  });

  it('B-536 — the sheet built over that record carries the same guard end to end', () => {
    // Same record through `buildOutcomeSheet`, scanning every rendered string —
    // the instrument the untracked case's test uses, because a guard that holds
    // in `densityLine` and leaks through another field is the exact shape the
    // original bug had.
    const built = buildOutcomeSheet({
      facts: facts({
        beforeTracked: true,
        beforeLoggedDays: 30,
        meals: { before: { daysLogged: 0, days: 56 }, during: { daysLogged: 52, days: 56 } },
      }),
      petName: 'Biscuit',
    });
    const everyString = [
      built.title, built.comparisonLine, ...built.factLines,
      built.densityLine, built.question, built.questionNote,
    ].join(' ');
    expect(everyString).not.toMatch(/0 of \d+ (?:days )?before/);
    // The symptom comparison itself still renders both halves — symptoms WERE
    // observed before, and deleting a real finding to make one line safe is the
    // failure mode this feature has already paid for three times.
    expect(built.factLines).toEqual([
      'Itch/Scratch: 14 before · 3 during.',
      'Skin reaction: 4 before · 1 during.',
    ]);
  });

  it('B-536 — one meal-day before is a thin comparison, not a suppressed one', () => {
    // The guard is exactly "the meal series has no before-half", never a floor:
    // §5.2 deliberately leaves coverage floors elsewhere, and a real 1-of-56 is a
    // true thin number the owner may see.
    const thin = facts({
      meals: { before: { daysLogged: 1, days: 56 }, during: { daysLogged: 52, days: 56 } },
    });
    expect(densityLine(thin, 'Biscuit')).toContain(
      'Days you logged any food: 1 of 56 before, 52 of 56 during.',
    );
  });
});

// ── "Stopped early" ──────────────────────────────────────────────────────────

describe('the continuation statement survives the decision', () => {
  it('carries the ACVIM sentence onto the sheet that actually ends a GI trial', () => {
    // §4.3 is a property of the FLOW. The first cut put the sentence on the
    // decision point only, so a GI owner saw it once and then read the sheet that
    // ends the trial — and the terminal card after it — with no continuation
    // statement anywhere.
    const gi = buildOutcomeSheet({ facts: facts(), petName: 'Biscuit', indication: 'gi' });
    expect(gi.continuationNote).toMatch(/around three months/);
    expect(gi.continuationNote).toContain('Your vet decides when the diet changes.');
  });

  it('carries the base sentence on every other indication', () => {
    for (const ind of ['skin', 'other', null, undefined] as const) {
      const sheet = buildOutcomeSheet({ facts: facts(), petName: 'Biscuit', indication: ind });
      expect(sheet.continuationNote).toBe('Your vet decides when the diet changes.');
    }
  });
});

describe('a sparsely-logged before-stretch is named as sparse', () => {
  it('says how many days it can actually see', () => {
    // The install-during-a-flare case: four observable days inside a 56-day
    // stretch, and those four are the attention AND symptom peak. Rendered as
    // "the 8 weeks before it started" it is an attention spike plus regression to
    // the mean, drawn as a 4x improvement above a button that ends the trial.
    const sparse = buildOutcomeSheet({
      facts: facts({ beforeLoggedDays: 4 }),
      petName: 'Biscuit',
    });
    expect(sparse.comparisonLine).toContain('only 4 of those 56 days have anything logged');
    expect(sparse.comparisonLine).toContain('much less to compare with than it looks');
    // The counts still render — disclosure, never withholding (§5.2's floor
    // direction is DISCLOSE MORE, not say less).
    expect(sparse.factLines).toContain('Itch/Scratch: 14 before · 3 during.');
  });

  it('leaves a well-logged stretch described by its length', () => {
    const dense = buildOutcomeSheet({ facts: facts({ beforeLoggedDays: 48 }), petName: 'B' });
    expect(dense.comparisonLine).toBe('Compared with the 8 weeks before it started.');
  });
});

describe('the stopped-early reason set', () => {
  const options = trialStopReasons('Biscuit', { object: 'him', possessive: 'his' });

  it('captures §4.3’s six reasons as stable tokens', () => {
    expect(options.map((o) => o.value)).toEqual([
      'refused', 'cost', 'too_hard', 'vet_advised', 'symptoms_resolved', 'other',
    ]);
    // A vet reading "stopped at day 19 — wouldn't eat it" prescribes differently
    // than "stopped — cost", which is the whole justification for asking.
    expect(options[0].label).toBe('Biscuit wouldn’t eat it');
    expect(options[2].label).toBe('Too hard to keep him off everything else');
    expect(options[4].label).toBe('His symptoms cleared up');
  });

  it('defaults to they/them when the pet’s sex is unknown', () => {
    const neutral = trialStopReasons('Biscuit');
    expect(neutral[2].label).toBe('Too hard to keep them off everything else');
    expect(neutral[4].label).toBe('Their symptoms cleared up');
  });

  it('normalises rather than absolves — no failure framing (§6.6)', () => {
    const all = [STOPPED_SHEET_TITLE, STOPPED_SHEET_INTRO, ...options.map((o) => o.label)].join(' ');
    expect(all).not.toMatch(/fail|gave up|didn’t manage|unsuccessful|sorry/i);
    // …and no absolution either, which would be Culprit having an opinion about
    // the owner's choice.
    expect(all).not.toMatch(/that’s ok|don’t worry|no big deal/i);
    expect(STOPPED_SHEET_INTRO).toMatch(/Trials get stopped early all the time/);
  });

  it('routes a REFUSAL to the health lane, never to preference', () => {
    const note = stopReasonNote('refused', 'Biscuit');
    expect(note).toMatch(/health question/);
    expect(note).toMatch(/a different diet rather than a different plan/);
    // Named, not generic — Pattern 1. "a pet turning food down" is the register an
    // owner skims past.
    expect(note).toMatch(/^Worth telling your vet\. Biscuit turning food down/);
    // Intake is not preference. Never "picky", never "fussy", never softened.
    expect(note).not.toMatch(/picky|fussy|preference|doesn’t like/i);
  });

  it('points "symptoms cleared up" at the vet — the hazard through a side door', () => {
    // An owner stopping BECAUSE things improved is stopping a diet that may be
    // working, which on the GI indication is exactly the ACVIM ≥12-week harm the
    // milestone exists to prevent.
    const note = stopReasonNote('symptoms_resolved', 'Biscuit');
    expect(note).toMatch(/before the diet changes/);
    expect(note).toMatch(/continued rather than stopped/);
  });

  it('says nothing about the reasons that are the owner’s business', () => {
    // Culprit does not comment on an owner's money, or on how hard their
    // household is to control.
    expect(stopReasonNote('cost', 'Biscuit')).toBeNull();
    expect(stopReasonNote('too_hard', 'Biscuit')).toBeNull();
    expect(stopReasonNote('vet_advised', 'Biscuit')).toBeNull();
    expect(stopReasonNote('other', 'Biscuit')).toBeNull();
  });
});

// ── W1 (CUL-676 PR-3a): the exact cough line on the completion sheet ─────────
// The render half of the outcome-facts pin: a respiratory delta composes through
// the SAME template as every other symptom — record-form counts, no verdict —
// and the untracked branch withholds the fabricated baseline for it exactly as
// it does for GI signs.
describe('W1 — the cough fact line renders record-form, both tracked states', () => {
  it('tracked: "Cough: 1 before · 2 during." — a count pair, never a verdict', () => {
    const sheet = buildOutcomeSheet({
      facts: facts({
        symptoms: [{ symptomType: 'cough', label: 'Cough', before: 1, during: 2 }],
      }),
      petName: 'Biscuit',
    });
    expect(sheet.factLines).toEqual(['Cough: 1 before · 2 during.']);
  });

  it('untracked before-stretch: the cough line drops its baseline, same as GI signs', () => {
    const sheet = buildOutcomeSheet({
      facts: facts({
        beforeTracked: false,
        symptoms: [{ symptomType: 'cough', label: 'Cough', before: 0, during: 3 }],
      }),
      petName: 'Biscuit',
    });
    expect(sheet.factLines).toEqual(['Cough: 3 during the trial.']);
  });
});
