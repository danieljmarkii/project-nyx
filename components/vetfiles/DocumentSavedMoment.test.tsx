import { render } from '@testing-library/react-native';

// useSafeAreaInsets needs a provider jest-expo doesn't stand up — stub it (the
// shipped convention across these component tests).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { DocumentSavedMoment } from './DocumentSavedMoment';
import type { SavedMomentCopy } from '../../lib/vetDocumentCapture';

// B-589 — the saved moment shows one cover card, so "Name it" here could only ever
// name that cover group. When one capture filed several documents the card reads
// "2 documents" while the Name sheet title reads "Name THIS document", and an owner
// who names it has silently named one of them. So the button is offered only for a
// single document; a multi-document save defers naming to the library rows.

const baseCopy: SavedMomentCopy = {
  headline: 'Saved to Pixel’s Vet Files',
  offlineLine: 'On this phone now — backs up when you’re online',
  cardTitle: 'Document — Jul 26',
  cardSub: null,
  multiDocument: false,
};

describe('DocumentSavedMoment — the Name-it gate (B-589)', () => {
  it('offers "Name it" for a single saved document, with no name-later cue', () => {
    const { getByText, queryByText } = render(
      <DocumentSavedMoment copy={baseCopy} onName={() => {}} onDone={() => {}} />,
    );
    expect(getByText('Name it')).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
    // The single-doc path teaches naming via the button, so it needs no text cue.
    expect(queryByText('You can name each one later.')).toBeNull();
  });

  it('drops "Name it" for a multi-document save but points forward to naming', () => {
    const { queryByText, getByText } = render(
      <DocumentSavedMoment
        copy={{ ...baseCopy, cardSub: '2 documents', multiDocument: true }}
        onName={() => {}}
        onDone={() => {}}
      />,
    );
    expect(queryByText('Name it')).toBeNull();
    expect(getByText('Done')).toBeTruthy();
    // The forward-looking cue that keeps the multi-doc saver from being told nothing
    // about naming (Principle 5, pm-feature-review).
    expect(getByText('You can name each one later.')).toBeTruthy();
  });

  it('keeps "Name it" for one multi-PAGE document — it is still one nameable document', () => {
    const { getByText } = render(
      <DocumentSavedMoment
        copy={{ ...baseCopy, cardSub: '3 pages', multiDocument: false }}
        onName={() => {}}
        onDone={() => {}}
      />,
    );
    expect(getByText('Name it')).toBeTruthy();
  });
});
