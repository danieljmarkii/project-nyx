// B-745 PR 3 — the one-surface confirm. This pins the two ruled ACs:
//   AC-CHIP  — the Saw it / Found it chips never wrap/squeeze/truncate; the pair
//              drops to its own row on narrow widths. The layout-less test asserts
//              the structural CONTRACT that guarantees both states (numberOfLines=1
//              + flexShrink:0 on the chips, flexWrap on the row); the visual check at
//              320pt + max accessibility font is QA spine #3 (on-device).
//   AC-FOUND — the window state set: witnessed / open-ended / bounded, each writing
//              exactly the right occurred_at_confidence + bounds, and the pill wording
//              at History parity.

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockInsert = jest.fn().mockResolvedValue({
  eventId: 'e1', occurredAtIso: '2026-08-13T17:33:00.000Z', now: '2026-08-13T17:33:00.000Z',
});
jest.mock('../../lib/simpleEvent', () => ({
  insertSimpleEvent: (...a: unknown[]) => mockInsert(...a),
}));

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SimpleEventConfirm } from './SimpleEventConfirm';
import { formatTime } from '../../lib/utils';

function renderConfirm(type: any = 'vomit') {
  const onBack = jest.fn();
  const onLogged = jest.fn();
  const onDraftChange = jest.fn();
  const utils = render(
    <SimpleEventConfirm
      type={type} petId="p1" petName="Nyx"
      onBack={onBack} onLogged={onLogged} onDraftChange={onDraftChange}
    />,
  );
  return { ...utils, onBack, onLogged, onDraftChange };
}

/** The most recent draft the confirm reported up (CUL-612). */
function latestDraft(onDraftChange: jest.Mock) {
  return onDraftChange.mock.calls[onDraftChange.mock.calls.length - 1][0];
}

beforeEach(() => { jest.clearAllMocks(); });

describe('SimpleEventConfirm — header + default (witnessed) state', () => {
  it('names the record "{Type} — {Pet}" and defaults to a witnessed pill', () => {
    const { getByText } = renderConfirm('vomit');
    expect(getByText('Vomit — Nyx')).toBeTruthy();
    // The pill IS the save: "Vomit · today at {time}".
    expect(getByText(/^Vomit · today at /)).toBeTruthy();
  });

  it('Other reads "Other — Nyx"', () => {
    const { getByText } = renderConfirm('other');
    expect(getByText('Other — Nyx')).toBeTruthy();
  });
});

describe('AC-CHIP — the chips never wrap/squeeze/truncate', () => {
  it('renders both chip labels in full', () => {
    const { getByText } = renderConfirm();
    expect(getByText('Saw it')).toBeTruthy();
    expect(getByText('Found it')).toBeTruthy();
  });

  it('each chip label is single-line (numberOfLines=1)', () => {
    const { getByText } = renderConfirm();
    expect(getByText('Saw it').props.numberOfLines).toBe(1);
    expect(getByText('Found it').props.numberOfLines).toBe(1);
  });

  it('each chip and the chip pair are flexShrink:0 (never squeezed)', () => {
    const { getByTestId } = renderConfirm();
    expect(StyleSheet.flatten(getByTestId('chip-saw').props.style).flexShrink).toBe(0);
    expect(StyleSheet.flatten(getByTestId('chip-found').props.style).flexShrink).toBe(0);
    expect(StyleSheet.flatten(getByTestId('confirm-chip-pair').props.style).flexShrink).toBe(0);
  });

  it('the time row wraps, so the chip pair drops to its own line when tight', () => {
    const { getByTestId } = renderConfirm();
    expect(StyleSheet.flatten(getByTestId('confirm-time-row').props.style).flexWrap).toBe('wrap');
  });
});

describe('AC-FOUND — witnessed / open-ended / bounded', () => {
  it('witnessed (default) → Log it writes confidence witnessed, no bounds', async () => {
    const { getByText, onLogged } = renderConfirm('vomit');
    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const arg = mockInsert.mock.calls[0][0];
    expect(arg).toMatchObject({ eventType: 'vomit', petId: 'p1', confidence: 'witnessed', earliest: null, latest: null });
    expect(onLogged).toHaveBeenCalledWith({ eventId: 'e1', occurredAtIso: '2026-08-13T17:33:00.000Z' });
  });

  it('Found it → open-ended window: pill reads "found by …", writes window w/ latest only', async () => {
    const { getByText } = renderConfirm('vomit');
    fireEvent.press(getByText('Found it'));
    // Pill + row shift to the History-parity open-ended wording — NOT "since this morning".
    expect(getByText(/^Vomit · found by /)).toBeTruthy();
    expect(getByText(/^Found by /)).toBeTruthy();

    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const arg = mockInsert.mock.calls[0][0];
    expect(arg.confidence).toBe('window');
    expect(arg.earliest).toBeNull();          // open-ended: no fabricated lower bound
    expect(arg.latest).toBeInstanceOf(Date);
  });

  it('Found it → Adjust window → Between: pill reads "between … and …", writes both edges', async () => {
    const { getByText, getByTestId } = renderConfirm('diarrhea');
    fireEvent.press(getByText('Found it'));
    fireEvent.press(getByTestId('confirm-time-main')); // opens the window editor
    fireEvent.press(getByText('Between two times'));    // seeds earliest = latest − 2h

    expect(getByText(/^Loose stool · between /)).toBeTruthy();

    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const arg = mockInsert.mock.calls[0][0];
    expect(arg.confidence).toBe('window');
    expect(arg.earliest).toBeInstanceOf(Date);
    expect(arg.latest).toBeInstanceOf(Date);
    expect(arg.earliest.getTime()).toBeLessThanOrEqual(arg.latest.getTime());
  });

  it('the window editor opens inside the confirm (no navigation) with both modes', () => {
    const { getByText, getByTestId, queryByText } = renderConfirm();
    expect(queryByText('Between two times')).toBeNull(); // collapsed by default
    fireEvent.press(getByText('Found it'));
    fireEvent.press(getByTestId('confirm-time-main'));
    expect(getByText('Sometime before')).toBeTruthy();
    expect(getByText('Between two times')).toBeTruthy();
  });
});

describe('SimpleEventConfirm — photo copy (clinical-guardrails)', () => {
  it('promises a read only for the types that actually get one (vomit)', () => {
    const { getByText } = renderConfirm('vomit');
    expect(getByText('Optional — I can read it for signs')).toBeTruthy();
  });

  it('does NOT promise a read for a type with no analyze function (itch)', () => {
    const { getByText, queryByText } = renderConfirm('itch');
    expect(queryByText('Optional — I can read it for signs')).toBeNull();
    expect(getByText('Optional')).toBeTruthy();
  });
});

describe('SimpleEventConfirm — double-submit guard', () => {
  it('a second Log it tap does not write twice', async () => {
    const { getByText } = renderConfirm('vomit');
    const pill = getByText('Log it');
    fireEvent.press(pill);
    fireEvent.press(pill);
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});


// ── What the discard guard is told (CUL-612 · §5) ────────────────────────────
//
// The guard itself is EventTypeSheet's; the predicate and copy are
// lib/discardGuard.test.ts's. This block owns the DERIVATION — and the derivation
// is the half a hand-set flag would get wrong. `timeTouched` is computed against
// the values the sheet opened with rather than set at each of the six sites that
// can move the time, so the cases below are what that buys.
describe('SimpleEventConfirm — the draft it reports up', () => {
  it('opens CLEAN — the defaults are the app\u2019s claim, not the owner\u2019s work', () => {
    const { onDraftChange } = renderConfirm();
    expect(latestDraft(onDraftChange)).toEqual({
      hasPhoto: false, timeTouched: false, hasNote: false,
    });
  });

  it('a typed note is work; whitespace is not', () => {
    const { getByPlaceholderText, onDraftChange } = renderConfirm();
    const input = getByPlaceholderText('Add a note (optional)');
    fireEvent.changeText(input, '   ');
    expect(latestDraft(onDraftChange).hasNote).toBe(false);
    fireEvent.changeText(input, 'threw up on the rug');
    expect(latestDraft(onDraftChange).hasNote).toBe(true);
  });

  it('switching to "Found it" counts — it changes the confidence that gets written', () => {
    const { getByText, onDraftChange } = renderConfirm();
    fireEvent.press(getByText('Found it'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(true);
  });

  it('adjusting the window to two bounds counts', () => {
    const { getByText, onDraftChange } = renderConfirm('diarrhea');
    fireEvent.press(getByText('Found it'));
    fireEvent.press(getByText('Adjust window'));
    fireEvent.press(getByText('Between two times'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(true);
  });

  it('merely OPENING the window editor does NOT count — looking is not editing', () => {
    // A guard here would put a dialog in front of an owner who expanded a
    // disclosure and changed nothing.
    const { getByText, onDraftChange } = renderConfirm();
    fireEvent.press(getByText('Found it'));
    const beforeOpen = latestDraft(onDraftChange).timeTouched;
    fireEvent.press(getByText('Adjust window'));
    // "Found it" already made it dirty; what this pins is that opening the editor
    // adds nothing of its own on the witnessed path.
    expect(beforeOpen).toBe(true);

    const fresh = renderConfirm();
    fireEvent.press(fresh.getByTestId('confirm-time-main')); // opens the point picker
    expect(latestDraft(fresh.onDraftChange).timeTouched).toBe(false);
  });

  it('returning to the opening state clears it — re-confirming a default is not work', () => {
    const { getByText, onDraftChange } = renderConfirm();
    fireEvent.press(getByText('Found it'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(true);
    fireEvent.press(getByText('Saw it'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(false);
  });
});
