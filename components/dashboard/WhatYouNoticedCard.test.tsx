// The *What you noticed* card's RENDER (CUL-874 / N-5).
//
// The model's correctness is `lib/lookPatterns.test.ts`'s. What is only testable here is
// what the renderer can get wrong on its own: a weight applied to the wrong row, a
// sub-line dropped, a number invented, or the L-17 disclosure rendered apart from the
// fraction it corrects.

import { render, fireEvent } from '@testing-library/react-native';
import { WhatYouNoticedCard, noticedRowValue } from './WhatYouNoticedCard';
import { LOOK_PAIRING_DISCLOSURE } from '../../lib/lookPairing';
import {
  NOTICED_ABSENCE_GROUP,
  NOTICED_CARD_LABEL,
  NOTICED_POSITIVE_GROUP,
  type NoticedCardModel,
  type NoticedRow,
} from '../../lib/lookPatterns';

function row(over: Partial<NoticedRow> & Pick<NoticedRow, 'key' | 'weight' | 'label' | 'days'>): NoticedRow {
  return { denominator: 24, detail: [], ...over };
}

function model(over: Partial<NoticedCardModel> = {}): NoticedCardModel {
  return {
    coverageLine: 'Counted across the 24 of the last 28 days you answered.',
    rows: [],
    withheldLine: null,
    withheldSpanLine: null,
    calibrationLine: null,
    multiSelectNote: null,
    empty: false,
    pairing: null,
    wordDaysInWindow: new Map(),
    ...over,
  };
}

const FULL = model({
  rows: [
    row({ key: 'subdued', weight: 'symptom', label: 'Off', days: 3, detail: ['first Sep 3 · 4 weeks before: 0 of 22'] }),
    row({
      key: 'lip_licking',
      weight: 'symptom',
      label: 'Lip-licking',
      days: 3,
      detail: [
        `on 2 of the 3 vomit days you answered · and on 1 of the 21 other days you answered · 1 vomit day not answered.\n${LOOK_PAIRING_DISCLOSURE}`,
      ],
    }),
    row({ key: 'nothing_unusual', weight: 'absence', label: 'Nothing unusual', days: 19 }),
    row({ key: 'played', weight: 'positive', label: 'Played', days: 12 }),
  ],
});

describe('the card', () => {
  it('renders the label, the denominator line and every row', () => {
    const { getByText } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    getByText(NOTICED_CARD_LABEL);
    getByText('Counted across the 24 of the last 28 days you answered.');
    getByText('Off');
    getByText('Lip-licking');
    getByText('Nothing unusual');
    getByText('Played');
  });

  it('groups the absence and the positives under their own labels, and the symptoms under none', () => {
    const { getByText, queryAllByText } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    getByText(NOTICED_ABSENCE_GROUP);
    getByText(NOTICED_POSITIVE_GROUP);
    // A symptom row leads the card with no label above it — the three weights carry the
    // semantics, and a "Symptoms" heading would make the absence label read as a peer.
    expect(queryAllByText(/^Symptom/)).toHaveLength(0);
  });

  it('puts the unit word on the first row of each GROUP (C-3 — where the reader meets the claim)', () => {
    const { getByText } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    getByText('3 of 24 days');
    // The SECOND symptom row drops it — the reader is still inside the same group.
    getByText('3 of 24');
  });

  it('renders every sub-line of a row, in order', () => {
    const { getByText } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    getByText('first Sep 3 · 4 weeks before: 0 of 22');
  });

  it('opens its door on press', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<WhatYouNoticedCard model={FULL} onPress={onPress} />);
    fireEvent.press(getByTestId('what-you-noticed-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('L-17 — the renderer cannot split the pairing', () => {
  it('the fraction and the disclosure are ONE text node', () => {
    // The attack this test exists for: a render path that shows the fraction and drops
    // the sentence is the uncorrected comparison the brief was raised to stop. They are
    // one string with a newline, so there is no node holding only the fraction.
    const { getByText, queryByText } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    const whole = FULL.rows[1].detail[0];
    getByText(whole);
    expect(queryByText(whole.split('\n')[0])).toBeNull();
    expect(queryByText(LOOK_PAIRING_DISCLOSURE)).toBeNull();
  });
});

describe('the withheld state', () => {
  const WITHHELD = model({
    coverageLine: null,
    rows: [
      row({
        key: 'subdued',
        weight: 'symptom',
        label: 'Off',
        days: 3,
        denominator: null,
        detail: ['first marked Sep 2, 2026'],
      }),
    ],
    withheldLine:
      'While Mochi’s eating needs attention, her quiet-day counts aren’t shown — a run of ordinary days isn’t a sign she is well. Her looks are on the report, beside her meals.',
    withheldSpanLine: 'The counts below are from the last 28 days.',
  });

  it('renders the sentence and no denominator line', () => {
    const { getByTestId, queryByTestId } = render(<WhatYouNoticedCard model={WITHHELD} onPress={jest.fn()} />);
    getByTestId('noticed-withheld');
    expect(queryByTestId('noticed-coverage')).toBeNull();
  });

  it('the sentence LEADS the card — the explanation never sits below what it explains', () => {
    // It used to render after the rows: an owner met *Off · 3 days* with nothing above
    // it, tried to parse a count in a shape she has never seen here, and only then found
    // out why. The card's own a11y rule (the denominator is announced before the counts)
    // is as true of the sentence that stands in for it.
    const { getByTestId, UNSAFE_root } = render(<WhatYouNoticedCard model={WITHHELD} onPress={jest.fn()} />);
    const texts: string[] = [];
    const walk = (node: { children?: unknown[] }) => {
      for (const child of node.children ?? []) {
        if (typeof child === 'string') texts.push(child);
        else walk(child as { children?: unknown[] });
      }
    };
    walk(UNSAFE_root as unknown as { children?: unknown[] });
    const joined = texts.join(' ');
    expect(joined.indexOf('quiet-day counts')).toBeLessThan(joined.indexOf('Off'));
    getByTestId('noticed-withheld-span');
    const label = getByTestId('what-you-noticed-card').props.accessibilityLabel as string;
    expect(label.indexOf('quiet-day counts')).toBeLessThan(label.indexOf('Off, 3 days'));
  });

  it('renders a BARE count with its noun — the renderer never invents a denominator', () => {
    const { getByText, queryByText } = render(<WhatYouNoticedCard model={WITHHELD} onPress={jest.fn()} />);
    getByText('3 days');
    expect(queryByText(/of 2[0-9]/)).toBeNull();
  });

  it('keeps the symptom row and its first date', () => {
    const { getByText } = render(<WhatYouNoticedCard model={WITHHELD} onPress={jest.fn()} />);
    getByText('Off');
    getByText('first marked Sep 2, 2026');
  });
});

describe('the multi-select clause', () => {
  it('renders as its own quiet line when the model carries it', () => {
    const { getByTestId } = render(
      <WhatYouNoticedCard
        model={model({ ...FULL, multiSelectNote: 'A day can carry more than one word, so these counts don’t add up to the days.' })}
        onPress={jest.fn()}
      />,
    );
    getByTestId('noticed-multiselect');
  });

  it('is absent when the model withholds it', () => {
    const { queryByTestId } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    expect(queryByTestId('noticed-multiselect')).toBeNull();
  });
});

describe('the group labels reach a screen reader', () => {
  it('announces "Marked — the owner’s claim" and "Activity", not just the rows', () => {
    // "The label is half the honesty of the row", and without this it reached only a
    // sighted reader (the product read).
    const { getByTestId } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    const label = getByTestId('what-you-noticed-card').props.accessibilityLabel as string;
    expect(label).toContain(NOTICED_ABSENCE_GROUP);
    expect(label).toContain(NOTICED_POSITIVE_GROUP);
    expect(label.indexOf(NOTICED_ABSENCE_GROUP)).toBeLessThan(label.indexOf('Nothing unusual, 19 of 24'));
  });
});

describe('the unit word is re-stated at the head of each group', () => {
  it('a group label resets the reading context, so the noun does not have to travel it', () => {
    const { getByText } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    getByText('3 of 24 days'); // the first symptom row
    getByText('19 of 24 days'); // the absence row, first under its own label
    getByText('12 of 24 days'); // the first activity row
  });
});

describe('the empty state', () => {
  it('is one calibration line and nothing else', () => {
    const EMPTY = model({
      coverageLine: 'Counted across the 3 of the last 28 days you answered.',
      rows: [],
      empty: true,
      calibrationLine: 'Looks build up over time · 3 days answered so far.',
    });
    const { getByTestId, queryByText } = render(<WhatYouNoticedCard model={EMPTY} onPress={jest.fn()} />);
    getByTestId('noticed-calibration');
    expect(queryByText(NOTICED_ABSENCE_GROUP)).toBeNull();
    expect(queryByText(NOTICED_POSITIVE_GROUP)).toBeNull();
  });
});

describe('accessibility', () => {
  it('announces the denominator BEFORE the counts, and the whole card as one sentence', () => {
    const { getByTestId } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    const label = getByTestId('what-you-noticed-card').props.accessibilityLabel as string;
    expect(label.indexOf('Counted across')).toBeLessThan(label.indexOf('Off, 3 of 24 days'));
    expect(label).toContain('Nothing unusual, 19 of 24');
  });

  it('includes the L-17 disclosure in the announcement — it is not a visual nicety', () => {
    const { getByTestId } = render(<WhatYouNoticedCard model={FULL} onPress={jest.fn()} />);
    expect(getByTestId('what-you-noticed-card').props.accessibilityLabel).toContain(
      LOOK_PAIRING_DISCLOSURE,
    );
  });

  it('announces the withheld sentence in full', () => {
    const WITHHELD = model({ coverageLine: null, withheldLine: 'While Mochi’s eating needs attention, her quiet-day counts aren’t shown.' });
    const { getByTestId } = render(<WhatYouNoticedCard model={WITHHELD} onPress={jest.fn()} />);
    expect(getByTestId('what-you-noticed-card').props.accessibilityLabel).toContain(
      'quiet-day counts aren’t shown',
    );
  });
});

describe('noticedRowValue', () => {
  it('drops the "of M" entirely at a null denominator, keeping the noun', () => {
    expect(noticedRowValue(row({ key: 'x', weight: 'symptom', label: 'X', days: 3, denominator: null }), false)).toBe('3 days');
    expect(noticedRowValue(row({ key: 'x', weight: 'symptom', label: 'X', days: 1, denominator: null }), false)).toBe('1 day');
  });

  it('singularises a one-day first row', () => {
    expect(noticedRowValue(row({ key: 'x', weight: 'symptom', label: 'X', days: 1 }), true)).toBe('1 of 24 day');
  });
});
