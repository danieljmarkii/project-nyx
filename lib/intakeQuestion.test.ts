// EN-5's question words (Engines v3 PR-30q, CUL-1724; spec §9; ruling sheet §2.7 I2, I3).
// Every instant is built from LOCAL components (C-29), so the words hold in every zone the
// non-UTC job runs.
import {
  answerLabel,
  dayWord,
  hourWord,
  intakeFormsFor,
  intakeOptions,
  intakeQuestionHint,
  intakeQuestionText,
  intakeSinceFor,
  safetyNetDeadline,
  safetyNetLine,
} from './intakeQuestion';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe('which questions a record asks', () => {
  it('a cat: the meal question, or the free-fed one; a trial cat gets the other-food door too', () => {
    expect(intakeFormsFor('cat', false, false)).toEqual(['meal_fed']);
    expect(intakeFormsFor('cat', true, false)).toEqual(['free_fed']);
    expect(intakeFormsFor('cat', false, true)).toEqual(['meal_fed', 'other_food']);
    expect(intakeFormsFor('cat', true, true)).toEqual(['free_fed', 'other_food']);
  });

  it('a dog gets the other-food question, trial or not; species "other" none (T26)', () => {
    expect(intakeFormsFor('dog', false, false)).toEqual(['other_food']);
    expect(intakeFormsFor('dog', true, true)).toEqual(['other_food']);
    expect(intakeFormsFor('other', false, false)).toEqual([]);
    expect(intakeFormsFor(null, false, false)).toEqual([]);
  });
});

describe('the words', () => {
  const now = local(2026, 10, 10, 9);
  const since = iso(local(2026, 10, 9, 18));
  const base = { petName: 'Nyx', sex: 'female' as const, since, nowMs: now };

  it('the meal question names an hour and a day, never "since yesterday"', () => {
    expect(intakeQuestionText('meal_fed', base)).toBe('Has Nyx eaten a meal since 6 PM yesterday?');
    expect(intakeOptions('meal_fed', 'female').map((o) => o.label)).toEqual(['Yes, ate well', 'A little', 'No', 'Not sure']);
    expect(intakeQuestionHint('meal_fed', {})).toBeNull();
  });

  it('the free-fed question, I2: the pronoun follows the recorded sex, unknown reads "they"', () => {
    expect(intakeQuestionText('free_fed', { ...base, petName: 'Pixel' })).toBe('Have you seen Pixel eat since 6 PM yesterday?');
    expect(intakeOptions('free_fed', 'female').map((o) => o.label)).toEqual(['Yes', "No, she wouldn't", "Haven't seen"]);
    expect(intakeOptions('free_fed', 'male')[1].label).toBe("No, he wouldn't");
    expect(intakeOptions('free_fed', 'unknown')[1].label).toBe("No, they wouldn't");
    expect(intakeOptions('free_fed', null)[1].label).toBe("No, they wouldn't");
    expect(intakeQuestionHint('free_fed', {})).toBe('"Haven\'t seen" is a fine answer.');
  });

  it('"A little" is offered on the meal question only (097\'s CHECK, I3)', () => {
    expect(intakeOptions('free_fed', 'female').some((o) => o.answer === 'a_little')).toBe(false);
    expect(intakeOptions('other_food', 'female').some((o) => o.answer === 'a_little')).toBe(false);
    // Both "Not sure" and "Haven't seen" store not_observable, never normal.
    expect(intakeOptions('meal_fed', 'female')[3].answer).toBe('not_observable');
    expect(intakeOptions('free_fed', 'female')[2].answer).toBe('not_observable');
  });

  it('the other-food door: a dog\'s, and a trial pet\'s naming its protein and the possessive', () => {
    expect(intakeQuestionText('other_food', { ...base, petName: 'Mochi', sex: 'male' })).toBe('Could Mochi have eaten something else?');
    expect(intakeQuestionText('other_food', { ...base, onTrial: true, trialProtein: 'rabbit' })).toBe('Could Nyx have eaten something off her rabbit trial?');
    expect(intakeQuestionText('other_food', { ...base, sex: 'unknown', onTrial: true, trialProtein: null })).toBe('Could Nyx have eaten something off their trial?');
    expect(intakeQuestionHint('other_food', { onTrial: false })).toBe('Scraps, something on a walk, the bin.');
    expect(intakeQuestionHint('other_food', { onTrial: true })).toBe("A treat, another pet's food, something on the counter.");
  });

  it('a blank name reads "your pet", never an empty slot', () => {
    expect(intakeQuestionText('meal_fed', { ...base, petName: '  ' })).toBe('Has your pet eaten a meal since 6 PM yesterday?');
  });

  it('no exclamation anywhere (nyx-voice)', () => {
    const all = [
      ...(['meal_fed', 'free_fed', 'other_food'] as const).flatMap((f) => [
        intakeQuestionText(f, base),
        intakeQuestionHint(f, { onTrial: true }) ?? '',
        ...intakeOptions(f, 'female').map((o) => o.label),
      ]),
      safetyNetLine('meal_fed', 'not_observable', iso(now), since, 'Nyx', now) ?? '',
    ];
    expect(all.some((s) => s.includes('!'))).toBe(false);
  });

  it('the fold reads the answer by its form, and an unknown answer by its meaning', () => {
    expect(answerLabel('meal_fed', 'a_little', 'female')).toBe('A little');
    expect(answerLabel('free_fed', 'no', 'male')).toBe("No, he wouldn't");
    expect(answerLabel('free_fed', 'not_observable', 'male')).toBe("Haven't seen");
    expect(answerLabel('other_food', 'a_little', 'male')).toBe('A little');
  });
});

describe('the instants', () => {
  it('since: 24 hours before the vomit, floored to the hour', () => {
    const vomit = local(2026, 10, 10, 18, 42);
    expect(intakeSinceFor(iso(vomit))).toBe(iso(local(2026, 10, 9, 18)));
    expect(intakeSinceFor('not a date')).toBeNull();
  });

  it('day words: today, yesterday, tomorrow, a weekday inside the week, else a date', () => {
    const now = local(2026, 10, 10, 9); // a Saturday
    expect(dayWord(local(2026, 10, 10, 1), now)).toBe('today');
    expect(dayWord(local(2026, 10, 9, 23), now)).toBe('yesterday');
    expect(dayWord(local(2026, 10, 11, 8), now)).toBe('tomorrow');
    expect(dayWord(local(2026, 10, 6, 18), now)).toBe('Tuesday');
    expect(dayWord(local(2026, 10, 3, 18), now)).toBe('Oct 3');
    expect(hourWord(local(2026, 10, 10, 0))).toBe('12 AM');
    expect(hourWord(local(2026, 10, 10, 12))).toBe('12 PM');
  });

  // The question asks from 6 PM the day before a 6 PM vomit; answers come after.
  const SINCE = iso(local(2026, 10, 9, 18));

  it('the safety net names the first 8 AM at least two hours after the answer', () => {
    expect(safetyNetDeadline(iso(local(2026, 10, 10, 1)), SINCE)).toBe(local(2026, 10, 10, 8));
    // 7:59 never reads "by 8 AM today" (B3): one minute is no deadline.
    expect(safetyNetDeadline(iso(local(2026, 10, 10, 7, 59)), SINCE)).toBe(local(2026, 10, 11, 8));
    expect(safetyNetDeadline(iso(local(2026, 10, 10, 21)), SINCE)).toBe(local(2026, 10, 11, 8));
    expect(safetyNetDeadline('nope', SINCE)).toBeNull();
  });

  it('never more than 48 hours of unknown intake from the hour asked about (B3)', () => {
    // Asked from Sun 8 AM; "Not sure" at Mon 8:02 AM: the next 8 AM is Tue 8 AM, exactly 48 h.
    const since = iso(local(2026, 10, 4, 8));
    expect(safetyNetDeadline(iso(local(2026, 10, 5, 8, 2)), since)).toBe(local(2026, 10, 6, 8));
    // "Not sure" at Mon 9 PM: 8 AM Tue is inside 48 h.
    expect(safetyNetDeadline(iso(local(2026, 10, 5, 21)), since)).toBe(local(2026, 10, 6, 8));
    // "Not sure" at Tue 8:02 AM, a day later: the next 8 AM would be 72 h; the cap leaves no
    // lead time, so the line asks for today.
    expect(safetyNetDeadline(iso(local(2026, 10, 6, 8, 2)), since)).toBeNull();
    expect(safetyNetLine('meal_fed', 'not_observable', iso(local(2026, 10, 6, 8, 2)), since, 'Nyx', local(2026, 10, 6, 8, 3))).toBe(
      "If Nyx still isn't eating, call your vet today.",
    );
  });

  it('the safety-net line: on the intake forms\' not_observable only, dated, and today once the hour passes', () => {
    const answered = iso(local(2026, 10, 10, 21));
    const now = local(2026, 10, 10, 21, 5);
    expect(safetyNetLine('meal_fed', 'not_observable', answered, SINCE, 'Nyx', now)).toBe("If Nyx hasn't eaten by 8 AM tomorrow, call your vet.");
    expect(safetyNetLine('free_fed', 'not_observable', answered, SINCE, 'Pixel', now)).toBe("If Pixel hasn't eaten by 8 AM tomorrow, call your vet.");
    // Read after the hour, the line never speaks of a past deadline.
    expect(safetyNetLine('meal_fed', 'not_observable', answered, SINCE, 'Nyx', local(2026, 10, 11, 9))).toBe("If Nyx still isn't eating, call your vet today.");
    for (const a of ['yes', 'a_little', 'no']) expect(safetyNetLine('meal_fed', a, answered, SINCE, 'Nyx', now)).toBeNull();
    expect(safetyNetLine('other_food', 'not_observable', answered, SINCE, 'Nyx', now)).toBeNull();
  });
});
