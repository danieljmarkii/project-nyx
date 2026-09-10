// The Noticed card's copy and its two shared predicates (CUL-871 / N-4a).
//
// Pure, so the voice pass and the T-9 nudge logic are checkable without rendering — and
// so the ONE gate the card and TodayZone both read (`lookCardLive`) is asserted where it
// lives rather than twice, once per surface.

import {
  LOOK_ABSENCE_CHIP,
  LOOK_FEWER_WORDS,
  LOOK_HINT,
  LOOK_MORE_WORDS,
  lookCardLive,
  lookDoneSummary,
  lookFirstLookLine,
  lookFoldedAsk,
  lookOpeningChipUnfoldLine,
  lookQuestion,
  todayGeneralNudge,
  todayMealNudge,
  todayNudgeKind,
} from './lookCard';
import { emptyDraft, toggleAbsence, toggleWordInDraft } from './lookSelection';

const MOCHI = { species: 'dog', sex: 'male' as const };

describe('the question', () => {
  it('names the pet and HER OWN usual, and never a time of day (R9)', () => {
    expect(lookQuestion('Mochi', 'male')).toBe(
      'How does Mochi seem right now, compared with his usual?',
    );
    expect(lookQuestion('Pixel', 'female')).toContain('her usual');
    expect(lookQuestion('Bean', 'unknown')).toContain('their usual');
    // The whole point of R9: the same string at 7 AM and 9 PM.
    expect(lookQuestion('Mochi', 'male')).not.toMatch(/morning|evening|today/i);
  });

  it('folds to one line once the day holds a look, still about NOW', () => {
    expect(lookFoldedAsk('Mochi')).toBe('How does Mochi seem now?');
  });
});

describe('the day-one line', () => {
  it('says the usual is the owner’s to know, in her pet’s own pronoun', () => {
    expect(lookFirstLookLine('male')).toBe(
      'The first look. His usual is yours to know, not the app’s.',
    );
    expect(lookFirstLookLine('female')).toContain('Her usual');
    expect(lookFirstLookLine('unknown')).toContain('Their usual');
  });
});

describe('the opening chip’s unfold line quotes the chip, in all three forms (E-15)', () => {
  it.each([
    ['male', 'not himself'],
    ['female', 'not herself'],
    ['unknown', 'not themself'],
  ] as const)('%s → %s', (sex, phrase) => {
    expect(lookOpeningChipUnfoldLine(sex)).toContain(phrase);
  });
});

describe('the Done bar’s sentence', () => {
  it('names the pet and the record, through the one resolver', () => {
    let draft = toggleWordInDraft(emptyDraft(), 'subdued');
    draft = toggleWordInDraft(draft, 'walk_refused');
    expect(lookDoneSummary('Mochi', draft, MOCHI)).toBe('Mochi · off, didn’t want the walk');
  });

  it('speaks the observed-absence row in its own phrase, never as an empty answer', () => {
    expect(lookDoneSummary('Mochi', toggleAbsence(emptyDraft()), MOCHI)).toBe(
      'Mochi · nothing unusual',
    );
  });

  it('is null when nothing is chosen — the bar does not render half a sentence', () => {
    expect(lookDoneSummary('Mochi', emptyDraft(), MOCHI)).toBeNull();
  });

  it('drops the opening chip once a word follows it (§3.1a)', () => {
    let draft = toggleWordInDraft(emptyDraft(), 'not_herself');
    expect(lookDoneSummary('Mochi', draft, MOCHI)).toBe('Mochi · not himself');
    draft = toggleWordInDraft(draft, 'subdued');
    // The chief complaint is not a second observation once she has named one.
    expect(lookDoneSummary('Mochi', draft, MOCHI)).toBe('Mochi · off');
  });
});

describe('the live gate — one predicate, two surfaces', () => {
  it('needs eligibility AND opt-in AND a species with a vocabulary', () => {
    expect(lookCardLive({ eligible: true, optedIn: true, species: 'cat' })).toBe(true);
    expect(lookCardLive({ eligible: true, optedIn: true, species: 'dog' })).toBe(true);
    expect(lookCardLive({ eligible: false, optedIn: true, species: 'cat' })).toBe(false);
    expect(lookCardLive({ eligible: true, optedIn: false, species: 'cat' })).toBe(false);
  });

  it('is FALSE for a pet of species other — the PM’s CUL-864 ruling, in code', () => {
    expect(lookCardLive({ eligible: true, optedIn: true, species: 'other' })).toBe(false);
    expect(lookCardLive({ eligible: true, optedIn: true, species: null })).toBe(false);
    expect(lookCardLive({ eligible: true, optedIn: true, species: undefined })).toBe(false);
  });
});

describe('the Today nudge (T-9 / E-8)', () => {
  it('is silent when the day holds anything but a look', () => {
    expect(
      todayNudgeKind({ hasNonLookEvents: true, lookLive: true, hasLookToday: true }),
    ).toBe('none');
  });

  it('OFF THE FLAG is exactly today’s behaviour — the shipped nudge on an empty day', () => {
    expect(
      todayNudgeKind({ hasNonLookEvents: false, lookLive: false, hasLookToday: false }),
    ).toBe('general');
    expect(todayGeneralNudge('Mochi')).toBe("Nothing logged yet — how's Mochi doing?");
  });

  it('YIELDS to the card while the question is unanswered — the app asks once', () => {
    expect(
      todayNudgeKind({ hasNonLookEvents: false, lookLive: true, hasLookToday: false }),
    ).toBe('none');
  });

  it('RETURNS after a look, pointed at the bowl rather than claiming an empty day', () => {
    expect(
      todayNudgeKind({ hasNonLookEvents: false, lookLive: true, hasLookToday: true }),
    ).toBe('meal');
    const line = todayMealNudge('Mochi');
    expect(line).toBe('No meals logged yet — did Mochi eat?');
    // The E-8 rule, stated as an assertion: never "Nothing logged yet" beside a
    // logged look.
    expect(line).not.toContain('Nothing logged');
  });
});

describe('the resting copy', () => {
  const STRINGS = [LOOK_ABSENCE_CHIP, LOOK_HINT, LOOK_MORE_WORDS, LOOK_FEWER_WORDS];
  it.each(STRINGS)('%s — no exclamation, no verdict vocabulary', (line) => {
    expect(line).not.toContain('!');
    expect(line).not.toMatch(/\b(good|bad|great|fine|healthy|score)\b/i);
  });

  it('says both things an owner cannot guess about the chips', () => {
    expect(LOOK_HINT).toContain('Tap what you saw');
    expect(LOOK_HINT).toContain('more than one can be true');
  });

  it('gives the caret to what opens in place and the chevron to what goes somewhere', () => {
    expect(LOOK_MORE_WORDS.endsWith('›')).toBe(true);
    expect(LOOK_FEWER_WORDS.startsWith('‹')).toBe(true);
  });
});
