import { render, fireEvent } from '@testing-library/react-native';

// The sheet's module graph reaches lib/storage → lib/supabase, which fails fast on
// missing env at import time. This sheet touches neither at runtime — stub it so
// the import resolves (the shipped convention across the app's component tests).
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
// SheetShell reads useSafeAreaInsets, which needs a provider jest-expo doesn't
// stand up — stub it (the DayEventsSheet test pattern).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { DocumentKindSheet, NameDocumentSheet } from './VetDocumentMetaSheets';
import { VET_DOCUMENT_KIND_LABELS } from '../../lib/vetDocumentLibrary';

// The kind sheet writes on a chip tap, so a second tap while the first write is in
// flight would queue a duplicate write. That re-entrancy used to be closed by a
// hand-rolled `saving` guard in the caller; it now rides ChipGroup's `disabled`,
// threaded here as `busy` (B-555). The primitives are unit-tested — this asserts
// the PROP is actually wired through, so dropping `busy` from the caller (or
// `disabled={busy}` from the ChipGroup) fails red instead of silently reopening
// the double-write hole.
describe('DocumentKindSheet — busy wiring', () => {
  const OTHER = 'other' as const;
  const LAB_LABEL = VET_DOCUMENT_KIND_LABELS.lab_result;

  it('selects a kind on tap when not busy', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <DocumentKindSheet visible current={OTHER} onCancel={() => {}} onSelect={onSelect} />,
    );
    fireEvent.press(getByText(LAB_LABEL));
    expect(onSelect).toHaveBeenCalledWith('lab_result');
  });

  it('fires nothing on tap while busy', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <DocumentKindSheet visible current={OTHER} onCancel={() => {}} onSelect={onSelect} busy />,
    );
    fireEvent.press(getByText(LAB_LABEL));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// B-588 — the sheet must say WHICH document is being named. Two untitled PDFs from
// one portal produce a byte-identical sheet; the filename B-546 put on the library
// row is the disambiguator, and this sheet was the one surface that withheld it.
describe('NameDocumentSheet — the which-document identifier', () => {
  it('shows the filename when one is passed', () => {
    const { getByText } = render(
      <NameDocumentSheet
        visible
        initialTitle="Document — Jul 14"
        untitled
        fileLabel="CBC-Pixel-2026-07-14.pdf"
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(getByText('CBC-Pixel-2026-07-14.pdf')).toBeTruthy();
  });

  it('shows no identifier when the document arrived without a filename', () => {
    // A camera capture (fileLabel null) is told apart by its thumbnail on the row,
    // so the sheet stays exactly as it was — no empty tag.
    const { queryByText } = render(
      <NameDocumentSheet
        visible
        initialTitle="Document — Jul 14"
        untitled
        fileLabel={null}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    // The default title still shows only as the field placeholder, never as a
    // rendered identifier tag.
    expect(queryByText('CBC-Pixel-2026-07-14.pdf')).toBeNull();
  });
});
