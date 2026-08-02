import { render, fireEvent } from '@testing-library/react-native';

// AddDocumentSheet's module graph reaches lib/vetDocumentCapture → lib/storage →
// lib/supabase, which fails fast on missing env at import time. This sheet touches
// none of it at runtime — stub it (the VetDocumentMetaSheets test convention).
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
// SheetShell reads useSafeAreaInsets, which needs a provider jest-expo doesn't
// stand up — stub it (the shipped convention across these component tests).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { AddDocumentSheet } from './AddDocumentSheet';
import { FILES_UNAVAILABLE_SUBTITLE } from '../../lib/vetDocumentCapture';

// B-548 — the Files row must tell the truth BEFORE the tap. On a binary without
// expo-document-picker the row renders disabled with an honest subtitle instead of
// letting the owner tap into a "PDFs need an app update" alert they can't act on
// from TestFlight. Camera and Photos never depend on that module, so they stay live.

const CAMERA_LABEL = 'Take photos. Snap each page — they stay together as one document';
const FILES_LIVE_SUB = 'PDFs from email or a clinic portal';

describe('AddDocumentSheet — Files-row capability state (B-548)', () => {
  it('renders the Files row live and tappable by default', () => {
    const onPick = jest.fn();
    const { getByText, getByLabelText } = render(
      <AddDocumentSheet visible petName="Pixel" onCancel={() => {}} onPick={onPick} />,
    );
    expect(getByText(FILES_LIVE_SUB)).toBeTruthy();
    fireEvent.press(getByLabelText(`Browse Files. ${FILES_LIVE_SUB}`));
    expect(onPick).toHaveBeenCalledWith('files');
  });

  it('renders the Files row disabled with an honest subtitle when unavailable', () => {
    const onPick = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <AddDocumentSheet
        visible
        petName="Pixel"
        filesAvailable={false}
        onCancel={() => {}}
        onPick={onPick}
      />,
    );
    expect(getByText(FILES_UNAVAILABLE_SUBTITLE)).toBeTruthy();
    // The confident live subtitle is gone — the row no longer promises what it
    // can't deliver.
    expect(queryByText(FILES_LIVE_SUB)).toBeNull();
    fireEvent.press(getByLabelText(`Browse Files. ${FILES_UNAVAILABLE_SUBTITLE}`));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('keeps camera live even when Files is unavailable', () => {
    const onPick = jest.fn();
    const { getByLabelText } = render(
      <AddDocumentSheet
        visible
        petName="Pixel"
        filesAvailable={false}
        onCancel={() => {}}
        onPick={onPick}
      />,
    );
    fireEvent.press(getByLabelText(CAMERA_LABEL));
    expect(onPick).toHaveBeenCalledWith('camera');
  });
});
