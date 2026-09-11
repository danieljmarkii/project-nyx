// *What you noticed* — the Patterns card model (CUL-874 / N-5), §7 and §6.
//
// Anchored to `Date.now()` and built from LOCAL day components (C-29 / CUL-831): the
// 28-day window is rolling and judged against the real clock, and the CI matrix runs this
// at UTC+14 / +12:45 / −10.

jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(), syncPendingLooks: jest.fn() }));
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));

import {
  buildNoticedCard,
  noticedCalibrationLine,
  noticedCoverageLine,
  noticedWithheldLine,
  noticedWordOrder,
  NOTICED_ABSENCE_GROUP,
  NOTICED_ABSENCE_LABEL,
  NOTICED_CARD_HREF,
  NOTICED_CARD_LABEL,
  NOTICED_POSITIVE_GROUP,
} from './lookPatterns';
import { LOOK_COVERAGE_FLOOR_DAYS, LOOK_COVERAGE_WINDOW_DAYS } from './lookCoverage';
import { LOOK_PAIRING_DISCLOSURE } from './lookPairing';
import { LOOK_OPENING_CHIP_KEY, LOOK_WORDS, LOOK_VOCAB_VERSION } from '../constants/lookWords';
import { localDayIndex, dayKeyFromIndex } from './utils';
import type { LookDayRow } from './lookDayCounts';

const NOW = Date.now();
const TODAY = localDayIndex(NOW);

function day(daysAgo: number): string {
  return dayKeyFromIndex(TODAY - daysAgo);
}

function look(daysAgo: number, words: string[] = [], over: Partial<LookDayRow> = {}): LookDayRow {
  return {
    eventId: `e-${daysAgo}-${words.join('_')}`,
    localDay: day(daysAgo),
    createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
    vocabVersion: LOOK_VOCAB_VERSION,
    ...over,
  };
}

const MOCHI = {
  petName: 'Mochi',
  pet: { species: 'cat' as const, sex: 'female' as const },
  nowMs: NOW,
  withheld: false,
  vomitLocalDays: [] as string[],
};

/** `n` consecutive answered days ending today, each carrying `words(daysAgo)`. */
function days(n: number, words: (daysAgo: number) => string[] = () => []): LookDayRow[] {
  return Array.from({ length: n }, (_, i) => look(i, words(i)));
}

describe('the denominator line (§7)', () => {
  it('is the first line, spoken as the ACT, and names the window', () => {
    const card = buildNoticedCard(days(24), MOCHI);
    expect(card.coverageLine).toBe('Counted across the 24 of the last 28 days you answered.');
  });

  it('prints at EVERY coverage, saturation included — unlike Home’s footer (§7 vs T-16)', () => {
    const full = buildNoticedCard(days(LOOK_COVERAGE_WINDOW_DAYS), MOCHI);
    expect(full.coverageLine).toBe(
      noticedCoverageLine(LOOK_COVERAGE_WINDOW_DAYS, LOOK_COVERAGE_WINDOW_DAYS),
    );
    const thin = buildNoticedCard(days(3), MOCHI);
    expect(thin.coverageLine).toBe(noticedCoverageLine(3, LOOK_COVERAGE_WINDOW_DAYS));
  });

  it('never states the un-answered count as a failure', () => {
    const card = buildNoticedCard(days(20), MOCHI);
    expect(card.coverageLine).not.toMatch(/missed|not looked|skipped|8 of/i);
  });

  it('counts DAYS, not looks — five looks in one day is one answered day', () => {
    const burst = Array.from({ length: 5 }, (_, n) =>
      look(0, ['subdued'], { eventId: `b-${n}`, createdAt: new Date(NOW + n * 1000).toISOString() }),
    );
    expect(buildNoticedCard(burst, MOCHI).coverageLine).toBe(
      noticedCoverageLine(1, LOOK_COVERAGE_WINDOW_DAYS),
    );
  });

  it('ignores a row outside the window — the window indexes, the total is its own (C-3)', () => {
    const card = buildNoticedCard([...days(20), look(40), look(90)], MOCHI);
    expect(card.coverageLine).toBe(noticedCoverageLine(20, LOOK_COVERAGE_WINDOW_DAYS));
  });
});

describe('the rows — three weights, a fixed order (§7)', () => {
  const record = [
    ...days(24, (d) => {
      if (d < 3) return ['subdued', 'played'];
      if (d < 5) return ['lip_licking'];
      if (d < 12) return ['played'];
      return [];
    }),
  ];
  const card = buildNoticedCard(record, MOCHI);

  it('symptom-class rows lead, in the vocabulary’s own order', () => {
    const symptomRows = card.rows.filter((r) => r.weight === 'symptom').map((r) => r.key);
    expect(symptomRows).toEqual(['subdued', 'lip_licking']);
    const order = noticedWordOrder('cat');
    expect(order.indexOf('subdued')).toBeLessThan(order.indexOf('lip_licking'));
  });

  it('then the absence, then the positives — never interleaved', () => {
    expect(card.rows.map((r) => r.weight)).toEqual(['symptom', 'symptom', 'absence', 'positive']);
  });

  it('each row is a label, a count and its denominator — nothing that reads as a verdict', () => {
    for (const row of card.rows) {
      expect(typeof row.label).toBe('string');
      expect(Number.isInteger(row.days)).toBe(true);
      expect(row.denominator).toBe(24);
      expect(row.days).toBeGreaterThan(0);
    }
  });

  it('the observed absence is the DAY’S classification — a quiet look on an Off day is not an absence day', () => {
    // T-14 / C-4: a *nothing unusual* at 7 AM and an *Off* at 6 PM is an OFF day.
    const mixed = [
      ...days(20),
      look(0, [], { eventId: 'am', createdAt: new Date(NOW).toISOString() }),
      look(0, ['subdued'], { eventId: 'pm', createdAt: new Date(NOW + 1000).toISOString() }),
    ];
    const c = buildNoticedCard(mixed, MOCHI);
    const absence = c.rows.find((r) => r.weight === 'absence');
    expect(absence?.days).toBe(19); // today is an Off day, not an absence day
  });

  it('a row with a zero count does not render at all', () => {
    const c = buildNoticedCard(days(20, () => []), MOCHI);
    expect(c.rows.every((r) => r.days > 0)).toBe(true);
    expect(c.rows.some((r) => r.key === 'subdued')).toBe(false);
  });

  it('the opening chip leads the symptom rows — it is the chief complaint', () => {
    const c = buildNoticedCard(
      days(20, (d) => (d < 2 ? [LOOK_OPENING_CHIP_KEY, 'lip_licking'] : [])),
      MOCHI,
    );
    expect(c.rows.map((r) => r.key).slice(0, 2)).toEqual([LOOK_OPENING_CHIP_KEY, 'lip_licking']);
  });

  it('a word this build cannot name is dropped, never rendered as a raw key', () => {
    const c = buildNoticedCard(days(20, (d) => (d < 2 ? ['a_word_from_the_future'] : [])), MOCHI);
    expect(c.rows.some((r) => r.key === 'a_word_from_the_future')).toBe(false);
  });
});

describe('§6.6 vs §7’s frame — what the floor holds back', () => {
  it('a RISING symptom count renders BELOW the floor, with its denominator', () => {
    // The absolute rule: "not by the density rule and NOT BY THE FLOOR."
    const c = buildNoticedCard(days(7, (d) => (d < 4 ? ['subdued'] : [])), MOCHI);
    const off = c.rows.find((r) => r.key === 'subdued');
    expect(off).toMatchObject({ days: 4, denominator: 7, weight: 'symptom' });
  });

  it('the ABSENCE and the POSITIVES are held below the floor — the reassuring half', () => {
    const c = buildNoticedCard(days(7, (d) => (d < 4 ? ['subdued'] : ['played'])), MOCHI);
    expect(c.rows.some((r) => r.weight === 'absence')).toBe(false);
    expect(c.rows.some((r) => r.weight === 'positive')).toBe(false);
  });

  it('both return at the floor exactly', () => {
    const c = buildNoticedCard(
      days(LOOK_COVERAGE_FLOOR_DAYS, (d) => (d < 2 ? ['played'] : [])),
      MOCHI,
    );
    expect(c.rows.some((r) => r.weight === 'absence')).toBe(true);
    expect(c.rows.some((r) => r.weight === 'positive')).toBe(true);
  });

  it('a thin ALL-QUIET record is §7’s drawn empty state — the calibration line alone', () => {
    const c = buildNoticedCard(days(3), MOCHI);
    expect(c.rows).toEqual([]);
    expect(c.empty).toBe(true);
    expect(c.calibrationLine).toBe('Looks build up over time · 3 days answered so far.');
  });

  it('a thin record WITH a concern is not empty, and still carries no all-clear', () => {
    const c = buildNoticedCard(days(3, (d) => (d === 0 ? ['subdued'] : [])), MOCHI);
    expect(c.empty).toBe(false);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]).toMatchObject({ key: 'subdued', days: 1, denominator: 3 });
    expect(c.rows.some((r) => r.weight === 'absence')).toBe(false);
  });

  it('the calibration line states what the record HAS, never what is missing', () => {
    expect(noticedCalibrationLine(3)).not.toMatch(/more|need|to go|remaining|left|of 14|of 28/i);
    expect(noticedCalibrationLine(1)).toContain('1 day answered');
  });

  it('the calibration line also appears when a comparison is waiting on §6.5’s floor', () => {
    // 24 answered days this month, nothing at all the month before: the pair cannot be
    // made, and §7 says that is a calibration line rather than a silence.
    const c = buildNoticedCard(days(24, (d) => (d < 3 ? ['subdued'] : [])), MOCHI);
    expect(c.calibrationLine).toBe('Looks build up over time · 24 days answered so far.');
    expect(c.rows.find((r) => r.key === 'subdued')?.detail.join(' ')).not.toContain('4 weeks before');
  });

  it('and is absent once every comparison can be made', () => {
    const record = [
      ...days(24, (d) => (d < 3 ? ['subdued'] : [])),
      ...Array.from({ length: 24 }, (_, i) => look(28 + i)),
    ];
    const c = buildNoticedCard(record, MOCHI);
    expect(c.calibrationLine).toBeNull();
    expect(c.rows.find((r) => r.key === 'subdued')?.detail.join(' ')).toContain('4 weeks before: 0 of 24');
  });
});

describe('the first date on a symptom row (§6.9, C-19)', () => {
  it('is bare inside the window — the window is the band', () => {
    const c = buildNoticedCard(days(24, (d) => (d < 3 ? ['subdued'] : [])), MOCHI);
    const detail = c.rows.find((r) => r.key === 'subdued')?.detail[0] ?? '';
    expect(detail).toMatch(/^first \w+ \d+/);
    expect(detail).not.toMatch(/\d{4}/); // no year inside the band
  });

  it('is YEAR-STAMPED outside it — a date that predates the claim sits in no band', () => {
    const record = [...days(24, (d) => (d < 3 ? ['subdued'] : [])), look(300, ['subdued'])];
    const detail = buildNoticedCard(record, MOCHI).rows.find((r) => r.key === 'subdued')?.detail[0] ?? '';
    expect(detail).toMatch(/first \w+ \d+, \d{4}/);
  });

  it('never sits beside an absence count (§6.9)', () => {
    const c = buildNoticedCard(days(24, (d) => (d < 3 ? ['subdued'] : [])), MOCHI);
    const absence = c.rows.find((r) => r.weight === 'absence');
    expect(absence?.detail).toEqual([]);
  });
});

describe('the activity positives (§6.6 gap 10)', () => {
  const record = [
    ...days(24, (d) => (d < 12 ? ['played'] : [])),
    ...Array.from({ length: 24 }, (_, i) => look(28 + i, i < 2 ? ['played'] : [])),
  ];
  const card = buildNoticedCard(record, MOCHI);

  it('render as the current-window count only — never a two-half pair', () => {
    const played = card.rows.find((r) => r.key === 'played');
    expect(played).toMatchObject({ weight: 'positive', days: 12, denominator: 24 });
    expect(played?.detail).toEqual([]);
  });

  it('carry no first date either — a wellness onset is not a receipt (T-18)', () => {
    expect(card.rows.find((r) => r.key === 'played')?.detail).toEqual([]);
  });
});

describe('the card’s one pairing (§6.11, L-17)', () => {
  const vomitDays = [day(1), day(2), day(3)];
  const record = days(24, (d) => {
    if (d >= 1 && d <= 2) return ['lip_licking'];
    if (d === 10) return ['lip_licking'];
    return [];
  });
  const card = buildNoticedCard(record, { ...MOCHI, vomitLocalDays: vomitDays });

  it('hangs under the row that earned it, and nowhere else', () => {
    const withPairing = card.rows.filter((r) => r.detail.some((l) => l.includes(LOOK_PAIRING_DISCLOSURE)));
    expect(withPairing).toHaveLength(1);
    expect(withPairing[0].key).toBe('lip_licking');
  });

  it('carries its disclosure — the fraction never appears without it', () => {
    const line = card.rows.flatMap((r) => r.detail).find((l) => l.includes('vomit days you answered'));
    expect(line).toContain(LOOK_PAIRING_DISCLOSURE);
  });

  it('the model exposes exactly one, so "at most one per card" is testable without parsing', () => {
    expect(card.pairing?.word).toBe('lip_licking');
  });

  it('is absent with no vomit days at all', () => {
    expect(buildNoticedCard(record, MOCHI).pairing).toBeNull();
  });
});

describe('the withheld state (item 12, T-20)', () => {
  const record = days(24, (d) => {
    if (d < 3) return ['subdued'];
    if (d < 6) return ['played'];
    return [];
  });
  const card = buildNoticedCard(record, { ...MOCHI, withheld: true, vomitLocalDays: [day(1), day(2), day(3)] });

  it('withholds the denominator line — the number Home refuses is not one tap away', () => {
    expect(card.coverageLine).toBeNull();
  });

  it('replaces the absence and positive rows with ONE sentence saying what and why', () => {
    expect(card.rows.every((r) => r.weight === 'symptom')).toBe(true);
    expect(card.withheldLine).toBe(
      'While Mochi’s eating needs attention, her quiet-day counts aren’t shown — ' +
        'a run of ordinary days isn’t a sign she is well. ' +
        'Her looks are on the report, beside her meals.',
    );
  });

  it('keeps the symptom rows — they can only ever RAISE', () => {
    expect(card.rows.map((r) => r.key)).toEqual(['subdued']);
    expect(card.rows[0].days).toBe(3);
  });

  it('but drops their DENOMINATOR — a bare count reconstructs nothing', () => {
    expect(card.rows[0].denominator).toBeNull();
  });

  it('no number anywhere on the card reconstructs the answered-day total', () => {
    const printed = [
      card.coverageLine,
      card.calibrationLine,
      card.withheldLine,
      ...card.rows.flatMap((r) => [String(r.days), r.denominator === null ? '' : String(r.denominator), ...r.detail]),
    ]
      .filter(Boolean)
      .join(' ');
    expect(printed).not.toContain('24');
  });

  it('drops the calibration line too — it prints an answered-day count', () => {
    expect(buildNoticedCard(days(3, (d) => (d === 0 ? ['subdued'] : [])), { ...MOCHI, withheld: true })
      .calibrationLine).toBeNull();
  });

  it('drops the pairing — its two denominators SUM to the refused number', () => {
    expect(card.pairing).toBeNull();
    expect(card.rows.flatMap((r) => r.detail).join(' ')).not.toContain('vomit days you answered');
  });

  it('drops the comparison pair as well', () => {
    const long = [...record, ...Array.from({ length: 24 }, (_, i) => look(28 + i, i < 8 ? ['subdued'] : []))];
    const c = buildNoticedCard(long, { ...MOCHI, withheld: true });
    expect(c.rows.flatMap((r) => r.detail).join(' ')).not.toContain('4 weeks before');
  });

  it('keeps the first date, year-stamped — the card prints no window to bound it', () => {
    expect(card.rows[0].detail[0]).toMatch(/^first marked \w+ \d+, \d{4}$/);
  });

  it('inflects for a male pet and for one whose sex nobody recorded', () => {
    expect(noticedWithheldLine('Rex', 'male')).toContain('his quiet-day counts');
    expect(noticedWithheldLine('Rex', 'male')).toContain('a sign he is well');
    expect(noticedWithheldLine('Pip', 'unknown')).toContain('their quiet-day counts');
    expect(noticedWithheldLine('Pip', 'unknown')).toContain('a sign they is well');
  });

  it('an all-quiet withheld record renders the sentence and nothing else', () => {
    const c = buildNoticedCard(days(24), { ...MOCHI, withheld: true });
    expect(c.rows).toEqual([]);
    expect(c.withheldLine).not.toBeNull();
    expect(c.coverageLine).toBeNull();
  });
});

describe('§7’s Never list — the greyscale test, enforced on the model', () => {
  const record = [
    ...days(24, (d) => (d < 6 ? ['subdued', 'played'] : [])),
    ...Array.from({ length: 24 }, (_, i) => look(28 + i, i < 1 ? ['subdued'] : [])),
  ];
  const card = buildNoticedCard(record, { ...MOCHI, vomitLocalDays: [day(1), day(2), day(3)] });

  it('prints no average, slope, score, percentage, streak or "usual"', () => {
    const everything = [
      card.coverageLine,
      card.calibrationLine,
      card.withheldLine,
      ...card.rows.flatMap((r) => [r.label, ...r.detail]),
    ]
      .filter(Boolean)
      .join(' ');
    // `\busual\b` rather than a bare `usual`: the absence row's label IS the owner's own
    // chip word, *Nothing unusual*, and a rule that forbids her word is a rule about the
    // wrong thing. What §7 bars is the app narrating a "usual" STATE of its own.
    expect(everything).not.toMatch(
      /%|\baverage\b|\bmedian\b|\bscore\b|\btrend\b|\bstreak\b|in a row|\busual\b|\bnormal\b|\bhealthy\b|\bfine\b|\bgood\b|improv|\bworse\b/i,
    );
  });

  it('every row carries a numerator and (open state) a denominator — never a bare number', () => {
    for (const row of card.rows) {
      expect(row.denominator).toBe(24);
    }
  });

  it('is pure — it never mutates the record it is handed', () => {
    const before = JSON.stringify(record);
    buildNoticedCard(record, MOCHI);
    expect(JSON.stringify(record)).toBe(before);
  });
});

describe('the card’s labels and door', () => {
  it('the label is the name L-11 ruled', () => {
    expect(NOTICED_CARD_LABEL).toBe('What you noticed');
  });

  it('the absence group names it as the OWNER’S CLAIM, never as an observation', () => {
    expect(NOTICED_ABSENCE_GROUP).toBe('Marked — the owner’s claim');
    expect(NOTICED_ABSENCE_LABEL).toBe('Nothing unusual');
  });

  it('the activity group is a noun, not a rule', () => {
    expect(NOTICED_POSITIVE_GROUP).toBe('Activity');
    expect(NOTICED_POSITIVE_GROUP).not.toMatch(/never|pair|ink/i);
  });

  it('the door lands on the record filtered to looks, not on an unbuilt detail', () => {
    expect(NOTICED_CARD_HREF).toBe('/history?type=check_in');
  });

  it('no owner-facing string on this card carries an exclamation mark (nyx-voice)', () => {
    const c = buildNoticedCard(days(24, (d) => (d < 3 ? ['subdued'] : [])), MOCHI);
    const strings = [
      NOTICED_CARD_LABEL, NOTICED_ABSENCE_GROUP, NOTICED_ABSENCE_LABEL, NOTICED_POSITIVE_GROUP,
      c.coverageLine, c.calibrationLine, noticedWithheldLine('Mochi', 'female'),
      ...c.rows.flatMap((r) => [r.label, ...r.detail]),
    ].filter(Boolean);
    for (const s of strings) expect(s).not.toContain('!');
  });
});

describe('the row order is the vocabulary’s, not a copy of it', () => {
  it.each(['cat', 'dog'] as const)('%s — every grid word appears exactly once, after the opening chip', (species) => {
    const order = noticedWordOrder(species);
    expect(order[0]).toBe(LOOK_OPENING_CHIP_KEY);
    expect(order.slice(1)).toEqual(LOOK_WORDS[species].map((w) => w.key));
    expect(new Set(order).size).toBe(order.length);
  });

  it('a species with no vocabulary yields the opening chip alone — never a defaulted list', () => {
    expect(noticedWordOrder(null)).toEqual([LOOK_OPENING_CHIP_KEY]);
  });
});
