import {
  intakeCorrectionOf,
  intakeCorrectionLabel,
  intakeCorrectionText,
  intakeCorrectionSentence,
  INTAKE_CORRECTION_OPENER,
  INTAKE_CORRECTION_CLOSER,
  type IntakeCorrection,
} from './readCorrection';

// The same vocabulary analyze-vomit's Pattern 8 test refuses in a read (index.test.ts): a
// correction sits beside an escalation and must never read as an all-clear.
const REASSURE_VOCAB =
  /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i;

const AT = '2026-10-07T01:03:48.816+00:00';
const c = (mealsLogged: number, mostOrAll: number): IntakeCorrection => ({ at: AT, mealsLogged, mostOrAll });

describe('intakeCorrectionOf', () => {
  it('reads the three columns', () => {
    expect(
      intakeCorrectionOf({ intake_correction_at: AT, intake_correction_meals: 6, intake_correction_most_or_all: 0 }),
    ).toEqual(c(6, 0));
  });

  it('is null when the row holds no correction', () => {
    expect(intakeCorrectionOf(null)).toBeNull();
    expect(intakeCorrectionOf({})).toBeNull();
    expect(
      intakeCorrectionOf({ intake_correction_at: null, intake_correction_meals: null, intake_correction_most_or_all: null }),
    ).toBeNull();
  });

  it('refuses a shape the database CHECK would refuse, rather than word it', () => {
    expect(intakeCorrectionOf({ intake_correction_at: AT, intake_correction_meals: 1, intake_correction_most_or_all: 2 })).toBeNull();
    expect(intakeCorrectionOf({ intake_correction_at: AT, intake_correction_meals: -1, intake_correction_most_or_all: 0 })).toBeNull();
    expect(intakeCorrectionOf({ intake_correction_at: 'not a date', intake_correction_meals: 1, intake_correction_most_or_all: 0 })).toBeNull();
    expect(intakeCorrectionOf({ intake_correction_at: AT, intake_correction_meals: 1.5, intake_correction_most_or_all: 0 })).toBeNull();
  });
});

describe('the words (C-A, PM-ruled 2026-10-07)', () => {
  it('draws the mocked frame word for word', () => {
    expect(intakeCorrectionLabel(c(6, 0), 'UTC')).toBe('Corrected Oct 7, 2026');
    expect(intakeCorrectionText(c(6, 0), 'Nyx')).toBe(
      'The words above went further than the record. That day, the meal log held 6 meals for Nyx in the 24 hours before this vomit, and none was marked Most or All. This correction doesn\'t change the call to your vet.',
    );
  });

  it.each([
    [0, 0, 'That day, the meal log held no meals for Nyx in the 24 hours before this vomit.'],
    [1, 0, "That day, the meal log held 1 meal for Nyx in the 24 hours before this vomit, and it wasn't marked Most or All."],
    [1, 1, 'That day, the meal log held 1 meal for Nyx in the 24 hours before this vomit, and it was marked Most or All.'],
    [3, 1, 'That day, the meal log held 3 meals for Nyx in the 24 hours before this vomit, and 1 was marked Most or All.'],
    [4, 2, 'That day, the meal log held 4 meals for Nyx in the 24 hours before this vomit, and 2 were marked Most or All.'],
  ])('%i meals, %i Most or All', (meals, most, clause) => {
    expect(intakeCorrectionText(c(meals, most), 'Nyx')).toBe(`${INTAKE_CORRECTION_OPENER} ${clause} ${INTAKE_CORRECTION_CLOSER}`);
  });

  it('dates in the reader\'s zone: the same instant is Oct 6 in Honolulu', () => {
    expect(intakeCorrectionLabel(c(1, 0), 'Pacific/Honolulu')).toBe('Corrected Oct 6, 2026');
  });

  it('names the pet, and falls back to "your pet" when the name is blank', () => {
    expect(intakeCorrectionText(c(2, 0), '  ')).toContain('for your pet in the 24 hours');
    expect(intakeCorrectionText(c(2, 0), null)).toContain('for your pet in the 24 hours');
  });

  it('the spoken and relayed form is the label then the body, in reading order', () => {
    expect(intakeCorrectionSentence(c(6, 0), 'Nyx', 'UTC')).toBe(
      `Corrected Oct 7, 2026. ${intakeCorrectionText(c(6, 0), 'Nyx')}`,
    );
  });

  it('voice and safety: no "!", no reassurance word, never says whether the pet ate, never lowers the call', () => {
    for (let meals = 0; meals <= 9; meals++) {
      for (let most = 0; most <= meals; most++) {
        const s = intakeCorrectionSentence(c(meals, most), 'Nyx', 'UTC');
        expect(s).not.toContain('!');
        expect(s).not.toMatch(REASSURE_VOCAB);
        expect(s).not.toMatch(/\b(ate|eaten|eating|hasn't eaten|didn't eat)\b/i);
        expect(s).not.toMatch(/\b(no longer|not worth|don't need|no need)\b/i);
        expect(s.endsWith(INTAKE_CORRECTION_CLOSER)).toBe(true);
      }
    }
  });
});
