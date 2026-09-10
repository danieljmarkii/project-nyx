// The intake sheet's copy (CUL-870 / N-3b; spec §3.1a, §4.5).
//
// The strings are here rather than in the component test because two of them are
// FINDINGS — the round-4 product read: "the intake sheet named a food, not a meal, and
// never said that closing saved nothing" — and a finding that is fixed only in a
// rendered tree is a finding one refactor from coming back.

import {
  INTAKE_SHEET_CARD_KEPT,
  INTAKE_SHEET_CHANGE_FOOD,
  INTAKE_SHEET_BACK,
  INTAKE_SHEET_FOOD_STEP_TITLE,
  INTAKE_SHEET_NEW_MEAL,
  INTAKE_SHEET_NOTHING_SAVED,
  intakeSheetFoodLine,
  intakeSheetFoodStepLine,
  intakeSheetQuestion,
  intakeSheetTitle,
} from './intakeSheet';
import { formatTime } from './utils';

const ALL: string[] = [
  INTAKE_SHEET_CARD_KEPT,
  INTAKE_SHEET_CHANGE_FOOD,
  INTAKE_SHEET_BACK,
  INTAKE_SHEET_FOOD_STEP_TITLE,
  INTAKE_SHEET_NEW_MEAL,
  INTAKE_SHEET_NOTHING_SAVED,
  intakeSheetTitle(new Date()),
  intakeSheetFoodLine('Royal Canin HP', 'trial_diet', 'male'),
  intakeSheetFoodLine('Royal Canin HP', 'recent_meal', 'female'),
  intakeSheetQuestion('Mochi'),
  intakeSheetFoodStepLine('Mochi'),
];

describe('which meal this is', () => {
  it('says NOW in the first line, and says it is a new one', () => {
    // The door sits on a card about right now, so an owner could reasonably read the
    // sheet as amending the breakfast she logged at seven. Both halves are needed: the
    // title carries the hour, the line under it rules out the edit reading.
    const at = new Date();
    expect(intakeSheetTitle(at)).toBe(`Meal · ${formatTime(at)}, now`);
    expect(INTAKE_SHEET_NEW_MEAL).toContain('new meal');
  });

  it('takes the instant it displays, rather than reading a clock of its own', () => {
    // C-10 — a displayed timestamp is a promise. The parameter is what lets the sheet
    // write the same instant it announced.
    const a = new Date(Date.now() - 45 * 60 * 1000);
    const b = new Date();
    expect(intakeSheetTitle(a)).not.toBe(intakeSheetTitle(b));
  });
});

describe('the food line', () => {
  it('names the trial diet AS the trial diet', () => {
    // §4.5's contamination case is only avoidable if the owner can see what she would
    // be changing away from.
    expect(intakeSheetFoodLine('Royal Canin HP', 'trial_diet', 'male')).toBe(
      'Royal Canin HP · the trial diet',
    );
  });

  it('otherwise says why this food is showing, in the pet’s own possessive', () => {
    expect(intakeSheetFoodLine('Lily’s Kitchen', 'recent_meal', 'female')).toBe(
      'Lily’s Kitchen · her most recent food',
    );
    expect(intakeSheetFoodLine('Lily’s Kitchen', 'recent_meal', 'unknown')).toBe(
      'Lily’s Kitchen · their most recent food',
    );
  });

  it('never calls a trial food "most recent" — the two readings are different claims', () => {
    expect(intakeSheetFoodLine('X', 'trial_diet', 'male')).not.toContain('most recent');
  });
});

describe('the question', () => {
  it('names the pet and asks what she DID', () => {
    expect(intakeSheetQuestion('Pixel')).toBe('How much did Pixel eat?');
  });
});

describe('nyx-voice and clinical-guardrails', () => {
  it('never says "picky", or reads a refusal as a preference', () => {
    // Intake is not preference — the safety invariant, checked on the surface most
    // likely to be tempted by it, since the owner arrived here to report a refusal.
    for (const s of ALL) {
      expect(s.toLowerCase()).not.toMatch(/picky|fussy|prefer|likes|fancy|doesn’t like|choosy/);
    }
  });

  it('carries no exclamation marks and no cheer', () => {
    for (const s of ALL) {
      expect(s).not.toContain('!');
      expect(s.toLowerCase()).not.toMatch(/great|nice work|well done|thanks/);
    }
  });

  it('never says "your pet" while a name is available (Pattern 1)', () => {
    expect(intakeSheetQuestion('Mochi')).not.toContain('your pet');
    expect(intakeSheetFoodStepLine('Mochi')).not.toContain('your pet');
  });
});

describe('what closing costs', () => {
  it('says nothing is saved BEFORE she picks — there is no second confirm to find it at', () => {
    expect(INTAKE_SHEET_NOTHING_SAVED).toBe('Nothing is saved until you pick how much.');
  });

  it('the way back NAMES ITS DESTINATION, and implies nothing is pending', () => {
    // The mock's own label for this sheet (`isRouter ? '‹ Back to Noticed' : 'Close'`).
    // She came from the Noticed card mid-answer; where the tap goes is the whole
    // content of the question. "Cancel" would imply there is something to cancel.
    expect(INTAKE_SHEET_BACK).toBe('‹ Back to Noticed');
    expect(INTAKE_SHEET_BACK.toLowerCase()).not.toContain('cancel');
    expect(INTAKE_SHEET_BACK.toLowerCase()).not.toContain('discard');
  });

  it('promises the Noticed card’s words are kept, without claiming the meal was', () => {
    expect(INTAKE_SHEET_CARD_KEPT).toContain('Home');
    expect(INTAKE_SHEET_CARD_KEPT.toLowerCase()).not.toMatch(/saved|logged|recorded/);
  });
});
