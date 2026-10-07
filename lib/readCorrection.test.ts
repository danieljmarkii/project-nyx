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
const c = (mealsLogged: number, unrated: number, mostOrAll: number): IntakeCorrection => ({ at: AT, mealsLogged, unrated, mostOrAll });
const cols = (meals: number, unrated: number, most: number) => ({
  intake_correction_at: AT, intake_correction_meals: meals, intake_correction_unrated: unrated, intake_correction_most_or_all: most,
});

describe('intakeCorrectionOf', () => {
  it('reads the four columns', () => {
    expect(intakeCorrectionOf(cols(6, 5, 0))).toEqual(c(6, 5, 0));
  });

  it('is null when the row holds no correction', () => {
    expect(intakeCorrectionOf(null)).toBeNull();
    expect(intakeCorrectionOf({})).toBeNull();
  });

  it('refuses a shape the database CHECK would refuse, rather than word it', () => {
    expect(intakeCorrectionOf(cols(1, 1, 1))).toBeNull(); // unrated + most > meals
    expect(intakeCorrectionOf(cols(-1, 0, 0))).toBeNull();
    expect(intakeCorrectionOf(cols(2, 1.5, 0))).toBeNull();
    expect(intakeCorrectionOf({ ...cols(1, 1, 0), intake_correction_at: 'not a date' })).toBeNull();
    expect(intakeCorrectionOf({ ...cols(1, 1, 0), intake_correction_unrated: null })).toBeNull(); // an 085-only row
  });

  // B1 (adversarial pass on 085): every meal rated, none Most or All. The words were true; a
  // row holding these facts is a writer bug, and it is never worded.
  it('never words a correction where every meal was rated below Most', () => {
    expect(intakeCorrectionOf(cols(3, 0, 0))).toBeNull();
    expect(intakeCorrectionOf(cols(7, 0, 0))).toBeNull();
  });
});

describe('the words (layout C-A, wording ruling (a), 2026-10-07)', () => {
  it('draws the brief\'s frame word for word', () => {
    expect(intakeCorrectionLabel(c(6, 5, 0), 'UTC')).toBe('Corrected Oct 7, 2026');
    expect(intakeCorrectionText(c(6, 5, 0), 'Nyx')).toBe(
      "The words above went further than the record. Of the 6 meals logged for Nyx in the 24 hours before I read this, 5 weren't rated, so the log couldn't say whether Nyx ate a full meal. This correction doesn't change the call to your vet.",
    );
  });

  it.each([
    [0, 0, 0, `${INTAKE_CORRECTION_OPENER} No meals were logged for Nyx in the 24 hours before I read this, so the log couldn't say whether Nyx ate a full meal.`],
    [1, 1, 0, `${INTAKE_CORRECTION_OPENER} The 1 meal logged for Nyx in the 24 hours before I read this wasn't rated, so the log couldn't say whether Nyx ate a full meal.`],
    [4, 4, 0, `${INTAKE_CORRECTION_OPENER} None of the 4 meals logged for Nyx in the 24 hours before I read this was rated, so the log couldn't say whether Nyx ate a full meal.`],
    [3, 1, 0, `${INTAKE_CORRECTION_OPENER} Of the 3 meals logged for Nyx in the 24 hours before I read this, 1 wasn't rated, so the log couldn't say whether Nyx ate a full meal.`],
    [4, 0, 1, 'The meal log now shows 1 meal marked Most or All for Nyx in the 24 hours before I read this.'],
    [5, 2, 2, 'The meal log now shows 2 meals marked Most or All for Nyx in the 24 hours before I read this.'],
  ])('%i meals, %i unrated, %i Most or All', (meals, unrated, most, lead) => {
    expect(intakeCorrectionText(c(meals, unrated, most), 'Nyx')).toBe(`${lead} ${INTAKE_CORRECTION_CLOSER}`);
  });

  it('"went further" is said only where an unrated meal or an empty log carries it (B1)', () => {
    expect(intakeCorrectionText(c(4, 0, 1), 'Nyx')).not.toContain(INTAKE_CORRECTION_OPENER);
    expect(intakeCorrectionText(c(5, 2, 2), 'Nyx')).not.toContain(INTAKE_CORRECTION_OPENER);
  });

  it("dates in the reader's zone: the same instant is Oct 6 in Honolulu", () => {
    expect(intakeCorrectionLabel(c(1, 1, 0), 'Pacific/Honolulu')).toBe('Corrected Oct 6, 2026');
  });

  it('names the pet, and falls back to "your pet" when the name is blank', () => {
    expect(intakeCorrectionText(c(2, 2, 0), '  ')).toContain('logged for your pet in the 24 hours');
    expect(intakeCorrectionText(c(2, 2, 0), null)).toContain('whether your pet ate');
  });

  it('the spoken and relayed form is the label then the body, in reading order', () => {
    expect(intakeCorrectionSentence(c(6, 5, 0), 'Nyx', 'UTC')).toBe(
      `Corrected Oct 7, 2026. ${intakeCorrectionText(c(6, 5, 0), 'Nyx')}`,
    );
  });

  it('voice and safety over every shape: no "!", no reassurance word, never asserts eating, never lowers the call', () => {
    for (let meals = 0; meals <= 8; meals++) {
      for (let unrated = 0; unrated <= meals; unrated++) {
        for (let most = 0; most + unrated <= meals; most++) {
          const corr = intakeCorrectionOf(cols(meals, unrated, most));
          if (!corr) continue;
          const s = intakeCorrectionSentence(corr, 'Nyx', 'UTC');
          expect(s).not.toContain('!');
          expect(s).not.toMatch(REASSURE_VOCAB);
          // "ate" only ever inside "whether Nyx ate": the correction never says the cat ate.
          expect(s.replace(/whether Nyx ate/g, '')).not.toMatch(/\b(ate|eaten|eating)\b/i);
          expect(s).not.toMatch(/\b(no longer|not worth|don't need|no need)\b/i);
          expect(s.endsWith(INTAKE_CORRECTION_CLOSER)).toBe(true);
        }
      }
    }
  });
});
