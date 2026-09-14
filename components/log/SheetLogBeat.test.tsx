// The in-sheet completion beat — the R2 register (`docs/nyx-app-polish-requirements.md`
// §5). CUL-614 gave it a sentence worth testing; CUL-964 gave it the way back the R1
// named card has carried since CUL-612, and moved its clock and its haptic into
// `momentStore` to get there.
//
// WHAT THIS SUITE IS NOW ABOUT. Until CUL-964 this beat was the ONE completion surface
// that did not go through the register, so the two rules the store enforces centrally —
// the §5.6 tone split and §5's sentence rule — were re-implemented here and this file
// existed to keep the second copy honest. That copy is gone: the store owns the tone
// split again, and the assertion below is the inverse of the one it replaces (the beat
// must NOT fire its own, or every symptom log buzzes twice). What is left here is what
// this component genuinely owns: that Undo is on screen for every tone, that it reaches
// the ONE shared reversal, that the dwell it no longer owns still stops under a finger,
// and that a record carrying something unrepeatable is named before it is destroyed.
//
// The store is REAL here, deliberately — the point of the change is that the beat and
// the register agree, and a mocked store cannot fail that way. Only the store's own
// boundaries are mocked, exactly as `store/momentStore.test.ts` mocks them: the verbs
// (this suite is about WHICH moment fires; `lib/haptics.test.ts` owns verb→pattern) and
// the reversal (`lib/undoLog` pulls in `lib/sync` → `lib/supabase`, which throws at
// import time without env; `lib/undoLog.test.ts` owns what the reversal writes).
jest.mock('../../lib/haptics', () => ({
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  selectChip: jest.fn(),
  destructiveConfirm: jest.fn(),
}));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn(async () => {}) }));
// `lib/completionCard` (the removal line + the gate's copy) reaches `lib/weight`, which
// imports the client and throws at import time without env — the same stub the named
// card's suite uses, for the same reason: nothing here talks to the network.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/trialContaminant', () => ({
  forgetFlaggedFoodInTrial: jest.fn(async () => {}),
}));
jest.mock('../../store/eventStore', () => ({
  useEventStore: { getState: () => ({ removeFromToday: jest.fn() }) },
}));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));

import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { commitRoutine, commitSymptom, destructiveConfirm } from '../../lib/haptics';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMomentStore, SHEET_BEAT_DWELL_MS, REMOVED_DURATION_MS } from '../../store/momentStore';
import type { MomentTone, SheetBeatPayload } from '../../store/momentStore';
import { SheetLogBeat } from './SheetLogBeat';

const mockedReducedMotion = useReducedMotion as jest.Mock;
const UNDO_LABEL = 'Undo — remove this log';
const SENTENCE = 'Vomit · found by 5:33 PM';

/** Put a beat on the register the way the sheet does, then render the component that
 *  paints it. One helper so no test can accidentally render a beat the store never
 *  took — which is the one state this component treats as "the register is done". */
function showAndRender(
  over: Partial<Omit<SheetBeatPayload, 'kind'>> = {},
  props: { tone?: MomentTone; title?: string; petName?: string; onDone?: (removed: boolean) => void } = {},
) {
  const payload = {
    tone: (props.tone ?? 'calm') as MomentTone,
    eventId: 'e1',
    occurredAt: '2026-09-14T17:33:00.000Z',
    ...over,
  };
  act(() => { useMomentStore.getState().showSheetBeat(payload); });
  return render(
    <SheetLogBeat
      tone={props.tone ?? 'calm'}
      title={props.title ?? SENTENCE}
      petName={props.petName ?? 'Nyx'}
      eventId={payload.eventId}
      onDone={props.onDone ?? jest.fn()}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedReducedMotion.mockReturnValue(false);
  act(() => { useMomentStore.getState().hide(); });
  useMomentStore.setState({ visible: false, payload: null, removed: false });
});

afterEach(() => {
  // Clears the register's live timers — the removal dwell is armed for real here.
  act(() => { useMomentStore.getState().hide(); });
});

describe('the tone split now belongs to the register (§5.6)', () => {
  it('a SYMPTOM commit takes the single soft tap, and the beat does not fire a second one', () => {
    // The load-bearing half twice over. A 2am vomit log is acknowledged, never
    // congratulated — the same reasoning that withholds the gold glow from the 'calm'
    // beat. And `toHaveBeenCalledTimes(1)` is the de-duplication proof: this component
    // used to play the split itself in a mount effect, so a restored copy would buzz
    // twice for one commit and reads here as 2, not as a silent duplication.
    showAndRender({}, { tone: 'calm' });
    expect(commitSymptom).toHaveBeenCalledTimes(1);
    expect(commitRoutine).not.toHaveBeenCalled();
  });

  it('a routine commit takes the success pattern, once', () => {
    showAndRender({ tone: 'celebrate' }, { tone: 'celebrate' });
    expect(commitRoutine).toHaveBeenCalledTimes(1);
    expect(commitSymptom).not.toHaveBeenCalled();
  });

  it('still fires under Reduce Motion — touch is not motion', () => {
    // An owner who turned off animation did not ask to stop being told their log
    // landed, and under Reduce Motion the beat has no spring to announce itself with,
    // so the haptic carries MORE of the confirmation there, not less. It survives the
    // move because the register fires at reveal and has never known about motion.
    mockedReducedMotion.mockReturnValue(true);
    showAndRender({}, { tone: 'calm' });
    expect(commitSymptom).toHaveBeenCalledTimes(1);
  });
});

describe('what the beat says (§5 sentence rule + nyx-voice)', () => {
  it('speaks the record it was given, and names the pet it landed on', () => {
    const { getByText } = showAndRender();
    expect(getByText(SENTENCE)).toBeTruthy();
    expect(getByText('Saved to Nyx’s record')).toBeTruthy();
  });

  it('announces both lines to a screen reader as one polite live region', () => {
    const { getByLabelText } = showAndRender(
      { tone: 'celebrate' },
      { tone: 'celebrate', title: 'Weight · 12.4 lbs' },
    );
    expect(getByLabelText('Weight · 12.4 lbs. Saved to Nyx’s record')).toBeTruthy();
  });
});

describe('Undo (CUL-964 — the R1 rule, inherited)', () => {
  it.each<MomentTone>(['calm', 'celebrate'])(
    'renders on the %s tone — unconditionally, as on the named card',
    (tone) => {
      // The house rule verbatim: an affordance that disappears on the records that
      // need it most is not a safety net. There is no gate on this control, and this
      // is the test that would fail if one were added for the "quiet" tone.
      const { getByLabelText } = showAndRender({ tone }, { tone });
      expect(getByLabelText(UNDO_LABEL)).toBeTruthy();
    },
  );

  it('reaches the ONE shared reversal, exactly once, for the row on screen', async () => {
    const { getByLabelText } = showAndRender();
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    // C-20: `reverseLoggedEvent`, never `softDeleteEvent`. Asserting the ARGUMENT as
    // well as the count, because the id is what the register checks its own payload
    // against — a beat that removed some other row would satisfy a bare count.
    expect(reverseLoggedEvent).toHaveBeenCalledTimes(1);
    expect(reverseLoggedEvent).toHaveBeenCalledWith('e1', undefined);
    // The rigid tap fires on the confirm, and the confirm here IS the tap (§5.6).
    expect(destructiveConfirm).toHaveBeenCalledTimes(1);
  });

  it('a second tap racing the first does not issue a second delete', async () => {
    const { getByLabelText } = showAndRender();
    await act(async () => {
      fireEvent.press(getByLabelText(UNDO_LABEL));
      fireEvent.press(getByLabelText(UNDO_LABEL));
    });
    expect(reverseLoggedEvent).toHaveBeenCalledTimes(1);
  });

  it('swaps to the quiet removal line, and the control goes ABSENT', async () => {
    const { getByLabelText, queryByLabelText, getByText, queryByText } = showAndRender();
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    expect(getByText('Removed')).toBeTruthy();
    expect(getByText('Taken out of Nyx’s record')).toBeTruthy();
    expect(queryByText(SENTENCE)).toBeNull();
    // Absent, not disabled: a live "Undo" beside the word "Removed" offers to reverse
    // a row that is no longer in the record (C-7).
    expect(queryByLabelText(UNDO_LABEL)).toBeNull();
  });

  it('a beat the register has already replaced removes nothing', async () => {
    // The staleness guard as the STORE enforces it: `undo()` is handed the id this
    // beat rendered, and refuses once that is no longer the payload on screen.
    const { getByLabelText } = showAndRender();
    act(() => {
      useMomentStore.getState().showSheetBeat({
        tone: 'calm', eventId: 'e2', occurredAt: '2026-09-14T18:00:00.000Z',
      });
    });
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    expect(reverseLoggedEvent).not.toHaveBeenCalled();
  });

  it('never says "Removed" about a row that is still in the record', async () => {
    // The staleness guard from THIS component's side, and the half the store cannot
    // cover. `removed` is a flag on the register, not on a payload, so a beat that
    // read it without checking WHOSE removal it describes would paint the removal
    // line over a log that is still saved — "the one unrecoverable lie this surface
    // can tell", in the named card's words, and it would then report that reversal to
    // its host and swallow a landing the owner was owed.
    //
    // Unreachable through the sheet today (it is modal, one commit at a time), which
    // is exactly why it is asserted against the register's contract rather than
    // through the host: `present()` swaps the payload IN PLACE, and this component is
    // written to that contract.
    const onDone = jest.fn();
    const { getByText, queryByText } = showAndRender({}, { onDone });
    act(() => {
      useMomentStore.getState().showSheetBeat({
        tone: 'calm', eventId: 'e2', occurredAt: '2026-09-14T18:00:00.000Z',
      });
    });
    await act(async () => { await useMomentStore.getState().undo('e2'); });
    expect(queryByText('Removed')).toBeNull();
    expect(getByText(SENTENCE)).toBeTruthy();
    expect(onDone).toHaveBeenLastCalledWith(false);
  });
});

describe('the confirm gate — what this removal takes with it (CUL-645 / CUL-869)', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => { alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
  afterEach(() => { alertSpy.mockRestore(); });

  /** Run the dialog's destructive button, the way the owner would. */
  async function confirmRemove() {
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const remove = buttons.find((b) => b.text === 'Remove');
    await act(async () => { remove?.onPress?.(); });
  }

  it('a bare record is removed on the one tap — the tap IS the confirm', async () => {
    const { getByLabelText } = showAndRender();
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(reverseLoggedEvent).toHaveBeenCalledTimes(1);
  });

  it('a PHOTOGRAPHED record asks first, and names the photo', async () => {
    const { getByLabelText } = showAndRender({ hasAttachment: true });
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    // Nothing is destroyed before the answer — the whole point of the gate.
    expect(reverseLoggedEvent).not.toHaveBeenCalled();
    expect(alertSpy.mock.calls[0][0]).toBe('Remove this log?');
    expect(alertSpy.mock.calls[0][1]).toBe('The photo you attached will be removed with it.');
    await confirmRemove();
    expect(reverseLoggedEvent).toHaveBeenCalledTimes(1);
  });

  it('a record carrying BOTH a photo and a note names both', async () => {
    // Composed, never branched: the sheet confirm is the one path that can produce
    // both, and a body that silently dropped one is the defect the gate exists for.
    const { getByLabelText } = showAndRender({ hasAttachment: true, hasNote: true });
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    expect(alertSpy.mock.calls[0][1]).toBe(
      'The photo you attached and the note you wrote will be removed with it.',
    );
  });

  it('a NOTE alone asks too — the sentence she typed is not recreatable either', async () => {
    const { getByLabelText } = showAndRender({ hasNote: true });
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    expect(alertSpy.mock.calls[0][1]).toBe('The note you wrote will be removed with it.');
  });

  it('holds the beat open across the dialog, even though the finger has lifted', () => {
    // THE SEAM. The root pause is wired to touch, so the owner's finger lifts the
    // instant the dialog appears. A bare touch-end release would hand back a full 5s
    // window and the beat would dismiss out from under a dialog the owner is still
    // reading — `undo()` then refuses on `!visible` and the log survives a removal
    // they authorised, which is the failure the gate's pause exists to prevent.
    //
    // Driven as the real gesture: touch-start, press, touch-end, then WAIT. Pressing
    // without the surrounding touch events would test a beat nobody touched.
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      const { getByLabelText } = showAndRender({ hasAttachment: true }, { onDone });
      const undoControl = getByLabelText(UNDO_LABEL);
      fireEvent(undoControl, 'touchStart');
      fireEvent.press(undoControl);
      fireEvent(undoControl, 'touchEnd');
      act(() => { jest.advanceTimersByTime(20000 - 1000); });
      expect(onDone).not.toHaveBeenCalled();
      // And the confirm still lands — not an 'ignored' against a beat that left.
      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      act(() => { buttons.find((b) => b.text === 'Remove')?.onPress?.(); });
      expect(reverseLoggedEvent).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('“Keep it” destroys nothing and hands the beat’s clock back', async () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      const { getByLabelText } = showAndRender({ hasAttachment: true }, { onDone });
      const undoControl = getByLabelText(UNDO_LABEL);
      fireEvent(undoControl, 'touchStart');
      fireEvent.press(undoControl);
      fireEvent(undoControl, 'touchEnd');
      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      act(() => { buttons.find((b) => b.text === 'Keep it')?.onPress?.(); });
      expect(reverseLoggedEvent).not.toHaveBeenCalled();
      // The gate paused the dwell; cancelling must re-arm it, or the beat sits on the
      // owner's screen until the pause ceiling gives up ~20s later.
      act(() => { jest.advanceTimersByTime(6000); });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a touch AFTER cancelling still releases — the gate flag does not stick', () => {
    // The other half of the conditional release, and the one a "Keep it" test alone
    // cannot see: cancelling re-arms the clock directly, so a stale flag is invisible
    // until the NEXT gesture, where it swallows the release and strands the beat on
    // the owner's screen until the pause ceiling gives up 20s later.
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      const { getByLabelText } = showAndRender({ hasAttachment: true }, { onDone });
      const undoControl = getByLabelText(UNDO_LABEL);
      fireEvent.press(undoControl);
      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      act(() => { buttons.find((b) => b.text === 'Keep it')?.onPress?.(); });
      // A second, ordinary gesture on the beat — read it, lift, let it go.
      fireEvent(undoControl, 'touchStart');
      act(() => { jest.advanceTimersByTime(1000); });
      fireEvent(undoControl, 'touchEnd');
      act(() => { jest.advanceTimersByTime(6000); });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the dwell — the register owns the clock, the beat only reports the end', () => {
  it('calls onDone once, after the sentence has been readable, with removed=false', () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      showAndRender({}, { onDone });
      // 1400ms was the pre-CUL-614 dwell, sized for the single word "Logged". A
      // sentence needs longer, so the beat must NOT have closed by then.
      act(() => { jest.advanceTimersByTime(1400); });
      expect(onDone).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(SHEET_BEAT_DWELL_MS - 1400 + 50); });
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledWith(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('PAUSES while the owner is touching it, and resets on release (§5 Dwell)', () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      const { getByLabelText } = showAndRender({}, { onDone });
      // Fired on the CONTROL, not on the root: the wiring under test is that a touch
      // anywhere inside the beat reaches the root's handler, which is what covers the
      // reading pause with a finger resting on it rather than only a deliberate press.
      fireEvent(getByLabelText(UNDO_LABEL), 'touchStart');
      act(() => { jest.advanceTimersByTime(SHEET_BEAT_DWELL_MS + 500); });
      expect(onDone).not.toHaveBeenCalled();
      fireEvent(getByLabelText(UNDO_LABEL), 'touchEnd');
      // The release hands back a full interactive window, not the scraps of the one
      // the gesture interrupted — the store's reset floor, inherited.
      act(() => { jest.advanceTimersByTime(SHEET_BEAT_DWELL_MS + 100); });
      expect(onDone).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(5000); });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports removed=true after an Undo, so the host does not push to a removed record', async () => {
    // G5 (CUL-802): a screen never shows a row that is no longer in the record. The
    // host lands a photographed vomit on its own record after the beat, and this flag
    // is the only thing standing between a reversal and that push.
    const onDone = jest.fn();
    const { getByLabelText } = showAndRender({ hasAttachment: false }, { onDone });
    await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { useMomentStore.getState().hide(); });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('holds the removal line for its own shorter dwell before ending the beat', async () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      const { getByLabelText, getByText } = showAndRender({}, { onDone });
      // `await act` rather than advancing the clock: the reversal is a promise, not a
      // timer, and the removal line only lands once it resolves.
      await act(async () => { fireEvent.press(getByLabelText(UNDO_LABEL)); });
      expect(getByText('Removed')).toBeTruthy();
      act(() => { jest.advanceTimersByTime(REMOVED_DURATION_MS - 100); });
      expect(onDone).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(200); });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
