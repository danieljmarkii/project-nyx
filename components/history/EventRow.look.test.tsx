// CUL-869 / N-3 — the look's History row.
//
// The degradation contract's §5.1 row 8 is the frame: a `check_in` on a CURRENT
// build must never read as the generic "Event" fallback, and it must never read as
// the absence when the app cannot actually say what was noticed.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// EventRow → lib/weight → lib/supabase, which fails fast at import when the env is
// unset. The row renders no weight here; the stub exists to satisfy the graph.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

jest.mock('../../store/petStore', () => {
  const pets = [
    { id: 'pet-dog', name: 'Mochi', species: 'dog', sex: 'male' },
    { id: 'pet-cat', name: 'Pixel', species: 'cat', sex: 'female' },
  ];
  const state = { pets, activePet: pets[1] }; // the CAT is active, deliberately
  return {
    usePetStore: Object.assign(
      (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
      { getState: () => state },
    ),
  };
});

import { render } from '@testing-library/react-native';
import { EventRow } from './EventRow';
import { wordsToLocalText } from '../../lib/lookWordsCodec';
import type { NyxEvent } from '../../store/eventStore';

const noop = () => {};

/** §5.4 — "the hour prints on every row". Written loosely on purpose: whether ICU
 *  zero-pads the hour is the environment's business, and this suite runs under three
 *  non-UTC zones in CI. The date half is stable because the fixture builds a LOCAL
 *  instant and the row formats it locally. */
const HOUR_PRINTS = /Jun 12,\s*0?7:12/;

function row(over: Partial<NyxEvent> = {}): NyxEvent {
  return {
    id: 'evt-1',
    pet_id: 'pet-dog',
    event_type: 'check_in',
    occurred_at: new Date(2026, 5, 12, 7, 12).toISOString(),
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: '',
    updated_at: '',
    look_outcome: 'observed',
    look_words: wordsToLocalText(['subdued', 'walk_refused']),
    look_note: null,
    ...over,
  } as NyxEvent;
}

function draw(event: NyxEvent, expanded = false) {
  return render(
    <EventRow
      event={event}
      isExpanded={expanded}
      onToggle={noop}
      onOpen={noop}
      onEdit={noop}
      onDelete={noop}
    />,
  );
}

describe('the observed look', () => {
  it('reads Noticed · the words · the hour', () => {
    const { getByText } = draw(row());
    expect(getByText('Noticed')).toBeTruthy();
    expect(getByText('off, didn’t want the walk')).toBeTruthy();
    expect(getByText(HOUR_PRINTS)).toBeTruthy();
  });

  it('never reads as the generic "Event" fallback (§5.1 row 8)', () => {
    // The degradation contract's other side: an OLD build renders "Event" over a
    // check_in, and that is acceptable. A current one doing it is the defect.
    const { queryByText } = draw(row());
    expect(queryByText('Event')).toBeNull();
  });

  it('resolves against the ROW’s pet, not the active one (C-9)', () => {
    // The cat is active in this harness. `walk_refused` is a dog word; if the row
    // resolved against `activePet` the gloss and the summary would come from the cat
    // list — and `subdued` would carry the cat's copy.
    const { getByText } = draw(row({ pet_id: 'pet-dog' }));
    expect(getByText('off, didn’t want the walk')).toBeTruthy();
  });

  it('names the opening chip in the row pet’s own form', () => {
    const { getByText } = draw(row({ look_words: wordsToLocalText(['not_herself']) }));
    expect(getByText('not himself')).toBeTruthy();   // pet-dog is male
  });
});

describe('the absence look', () => {
  it('reads "nothing unusual" — the owner’s mark, never a verdict', () => {
    const { getByText, queryByText } = draw(
      row({ look_outcome: 'nothing_unusual', look_words: wordsToLocalText([]) }),
    );
    expect(getByText('nothing unusual')).toBeTruthy();
    expect(queryByText(/good|fine|well|clear|healthy/i)).toBeNull();
  });
});

describe('the note marker', () => {
  it('shows ❞ beside the hour when a note exists, and announces it in words', () => {
    const { getByText, getByLabelText } = draw(row({ look_note: 'he hung back at the corner' }));
    expect(getByText('❞')).toBeTruthy();
    // The glyph is not a word; without this label a screen reader announces "right
    // double quotation mark", which says nothing about the record (C-8).
    expect(getByLabelText('Has a note')).toBeTruthy();
  });

  it('shows no marker when there is no note', () => {
    expect(draw(row()).queryByText('❞')).toBeNull();
  });

  it('an empty-string note is not a note', () => {
    expect(draw(row({ look_note: '   ' })).queryByText('❞')).toBeNull();
  });

  it('expanded, the row shows the CHILD’s note — the parent’s is NULL by CHECK', () => {
    const { getByText } = draw(row({ look_note: 'he hung back at the corner' }), true);
    expect(getByText('he hung back at the corner')).toBeTruthy();
  });
});

describe('a look this build cannot describe', () => {
  it('with no child row: the act and the hour, and NOT the absence', () => {
    const { getByText, queryByText } = draw(row({ look_outcome: null, look_words: null }));
    expect(getByText('Noticed')).toBeTruthy();
    expect(queryByText('nothing unusual')).toBeNull();
    expect(getByText(HOUR_PRINTS)).toBeTruthy();
  });

  it('with only unnameable words: the act and the hour, and NOT the absence', () => {
    const { getByText, queryByText } = draw(row({ look_words: wordsToLocalText(['from_vocab_v2']) }));
    expect(getByText('Noticed')).toBeTruthy();
    expect(queryByText('nothing unusual')).toBeNull();
  });
});

describe('every other row is untouched', () => {
  it('a vomit renders no look line and no marker', () => {
    const { getByText, queryByText } = draw(
      row({ event_type: 'vomit', look_outcome: null, look_words: null }),
    );
    expect(getByText('Vomit')).toBeTruthy();
    expect(queryByText('❞')).toBeNull();
    expect(queryByText('off, didn’t want the walk')).toBeNull();
  });

  it('a non-look row expanded still shows the PARENT’s note', () => {
    const { getByText } = draw(
      row({ event_type: 'vomit', notes: 'on the rug', look_outcome: null, look_words: null }),
      true,
    );
    expect(getByText('on the rug')).toBeTruthy();
  });
});

// ── The flag-off AC, proven rather than asserted ─────────────────────────────
//
// Noticed ships dark behind `daily_look`, so on the shipped binary no look rows
// exist and every History row is one of the existing types. "No byte change to the
// shipped surfaces" is therefore a claim about the RENDER TREE of those rows — and
// it is a claim worth testing, because the obvious way to place the ❞ marker (wrap
// the timestamp in a flex row) changes the tree of every event in the app to draw
// the same pixels. That version passed every test above.
describe('a row with no note renders the tree it rendered before this change', () => {
  const types = ['vomit', 'meal', 'medication', 'weight_check', 'other'] as const;

  it.each(types)('%s: no extra wrapper around the timestamp', (event_type) => {
    const tree = JSON.stringify(
      draw(row({ event_type, look_outcome: null, look_words: null })).toJSON(),
    );
    // The marker's row is the only structure this PR adds to a shipped row, and its
    // fingerprint is the gap it introduces. Absent means the timestamp is still the
    // bare Text it always was, directly inside the time column.
    expect(tree).not.toContain('"gap":2');
    expect(tree).not.toContain('❞');
  });

  it('and a LOOK with no note renders that same untouched shape', () => {
    // The gate is the NOTE, not the type: a look without one earns no marker, so it
    // must not pay for the wrapper either.
    const tree = JSON.stringify(draw(row()).toJSON());
    expect(tree).not.toContain('❞');
  });

  it('while a note-bearing row DOES get it — the assertion above is not vacuous', () => {
    const tree = JSON.stringify(draw(row({ look_note: 'he hung back' })).toJSON());
    expect(tree).toContain('❞');
    expect(tree).toContain('"gap":2');
  });
});
