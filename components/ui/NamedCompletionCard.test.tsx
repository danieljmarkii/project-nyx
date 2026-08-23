// CUL-606 — the R1 named card, rendered.
//
// The lib layer owns the DECISIONS (which sentence, which time-edit shape):
// lib/completionCard.test.ts. The store owns the hand-off and the tone→haptic
// routing: store/momentStore.test.ts. What only a rendered card can answer, and
// what this suite owns:
//   • the sentence actually reaches the screen — the retired takeover's failure
//     was that it KNEW what it had saved and printed "Logged" anyway, so an
//     assertion that the words appear is the regression guard for the whole PR;
//   • the calm tone draws no gold — the visual half of "never celebrate a
//     worrying event", which no store test can see;
//   • Change time is withheld on a bounded window rather than rendered as a
//     control that cannot express the record;
//   • the ground is a DIM that takes no touches — Home stays live for the dwell;
//   • the card names the RECORD's pet, not a since-switched active one.

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/db', () => ({
  updateEvent: jest.fn().mockResolvedValue(undefined),
  // Default 'exif' so the provenance-preservation assertions below are meaningful:
  // a stub returning 'manual' would pass whether or not the card preserves it.
  getEventSource: jest.fn().mockResolvedValue('exif'),
}));
jest.mock('../../lib/sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingWeightChecks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../../lib/haptics', () => ({
  commitRoutine: jest.fn(), commitSymptom: jest.fn(), selectChip: jest.fn(),
  destructiveConfirm: jest.fn(),
}));

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { NamedCompletionCard } from './NamedCompletionCard';
import { useMomentStore } from '../../store/momentStore';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';
import { formatTime } from '../../lib/utils';
import { updateEvent, getEventSource } from '../../lib/db';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { Alert } from 'react-native';

// Minimal structural stand-in for react-test-renderer's ReactTestInstance:
// @types/react-test-renderer is not a dependency here, and three style predicates
// do not justify adding one. findAll's parameter is bivariant, so a narrower
// shape is accepted.
type StyledNode = { props: { style?: unknown; pointerEvents?: string } };

type NamedOver = Partial<Parameters<ReturnType<typeof useMomentStore.getState>['showNamed']>[0]>;

// Local components (B-514): the sentence's day phrase reads LOCAL midnight, so a
// UTC literal would make "today" a statement about the runner's clock.
const OCCURRED = new Date(2026, 5, 7, 17, 33);

function seed(over: NamedOver = {}, activePetId = 'p1') {
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Biscuit' }, { id: 'p2', name: 'Mochi' }] as never,
    activePet: { id: activePetId, name: activePetId === 'p1' ? 'Biscuit' : 'Mochi' } as never,
  });
  act(() => {
    useMomentStore.getState().showNamed({
      tone: 'calm',
      eventId: 'e1',
      petId: 'p1',
      occurredAt: OCCURRED.toISOString(),
      record: { kind: 'event', typeLabel: 'Vomit', confidence: 'witnessed', earliest: null, latest: null },
      ...over,
    });
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  // Pin "now" to the fixture's own local day. Fake timers leave the system clock
  // at the real date, which would make the sentence's day phrase ("today") a
  // statement about when the suite happens to run. Local components, not a UTC
  // literal, for the B-514 reason in the OCCURRED comment above.
  jest.setSystemTime(new Date(2026, 5, 7, 18, 0));
  jest.clearAllMocks();
  useMomentStore.getState().hide();
  useMomentStore.setState({ payload: null, removed: false });
  (reverseLoggedEvent as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => { useMomentStore.getState().hide(); });
  jest.useRealTimers();
});

describe('NamedCompletionCard — what it says', () => {
  it('renders nothing until a named payload arrives', () => {
    const { toJSON } = render(<NamedCompletionCard />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing for a meal payload (the cards never cross)', () => {
    const { toJSON } = render(<NamedCompletionCard />);
    act(() => {
      useMomentStore.getState().showMeal({
        eventId: 'm1', petId: 'p1', occurredAt: OCCURRED.toISOString(),
        foodType: 'meal', intakeRating: null,
      });
    });
    expect(toJSON()).toBeNull();
  });

  // THE REGRESSION GUARD FOR THIS PR. The takeover printed "Logged" over a record
  // that named itself.
  it('speaks the record’s sentence, never a bare "Logged"', () => {
    const view = render(<NamedCompletionCard />);
    seed();
    view.getByText(`Vomit · today at ${formatTime(OCCURRED)}`);
    expect(view.queryByText('Logged')).toBeNull();
  });

  it('renders the open-ended window as "found by", not a point', () => {
    const view = render(<NamedCompletionCard />);
    seed({
      record: {
        kind: 'event', typeLabel: 'Vomit', confidence: 'window',
        earliest: null, latest: OCCURRED.toISOString(),
      },
    });
    view.getByText(`Vomit · found by ${formatTime(OCCURRED)}`);
  });

  it('names the weight value the owner just typed', () => {
    const view = render(<NamedCompletionCard />);
    seed({ record: { kind: 'weight', weightKg: 5.62 } });
    view.getByText('Weight · 12.4 lbs');
  });

  it('says where the record went, naming the pet', () => {
    const view = render(<NamedCompletionCard />);
    seed();
    view.getByText('Saved to Biscuit’s record');
  });

  // The multi-pet queue-then-switch guard: the write landed on p1, so the card
  // must say Biscuit even though Mochi is now the active pet. A clinical
  // confirmation naming the wrong animal is worse than one naming none.
  it('names the RECORD’s pet, not a since-switched active pet', () => {
    const view = render(<NamedCompletionCard />);
    seed({}, 'p2');
    view.getByText('Saved to Biscuit’s record');
    expect(view.queryByText('Saved to Mochi’s record')).toBeNull();
  });
});

describe('NamedCompletionCard — tone', () => {
  function badgeStyles(view: ReturnType<typeof render>) {
    // The mark's container is the only view carrying the confirm-ring border.
    const all = view.UNSAFE_root.findAll((n: StyledNode) => {
      const s = StyleSheet.flatten(n.props?.style) as { borderColor?: string } | undefined;
      return s?.borderColor === theme.colorMomentConfirm;
    });
    return StyleSheet.flatten(all[0].props.style) as { shadowColor?: string };
  }

  // The visual half of the rule the haptic layer enforces with its soft tap: we
  // acknowledge a 2am vomit, we never congratulate it.
  it('a CALM commit draws no gold halo', () => {
    const view = render(<NamedCompletionCard />);
    seed({ tone: 'calm' });
    expect(badgeStyles(view).shadowColor).toBeUndefined();
  });

  it('a CELEBRATE commit draws the warm-gold halo', () => {
    const view = render(<NamedCompletionCard />);
    seed({ tone: 'celebrate' });
    expect(badgeStyles(view).shadowColor).toBe(theme.colorMomentGlow);
  });

  // A weight check is neutral clinical data — never a celebration of the number.
  it('a weight check carries no gold', () => {
    const view = render(<NamedCompletionCard />);
    seed({ tone: 'calm', record: { kind: 'weight', weightKg: 5.62 } });
    expect(badgeStyles(view).shadowColor).toBeUndefined();
  });
});

describe('NamedCompletionCard — the ground', () => {
  // The trade that buys the 5s dwell: the dim is decoration, so ignoring the card
  // costs the owner nothing. A blocking 5s scrim would be worse than the 1.4s
  // flash it replaced.
  it('dims with a scrim that never takes a touch', () => {
    const view = render(<NamedCompletionCard />);
    seed();
    const scrims = view.UNSAFE_root.findAll((n: StyledNode) => {
      const s = StyleSheet.flatten(n.props?.style) as { backgroundColor?: string } | undefined;
      return s?.backgroundColor === theme.colorScrim;
    });
    expect(scrims.length).toBeGreaterThan(0);
    expect(scrims[0].props.pointerEvents).toBe('none');
  });

  // No white surface anywhere: the takeover's defining failure was a solid-white
  // full screen in a dark bedroom.
  it('paints no white ground', () => {
    const view = render(<NamedCompletionCard />);
    seed();
    const white = view.UNSAFE_root.findAll((n: StyledNode) => {
      const s = StyleSheet.flatten(n.props?.style) as { backgroundColor?: string } | undefined;
      return s?.backgroundColor === theme.colorSurface;
    });
    expect(white).toHaveLength(0);
  });
});

describe('NamedCompletionCard — Change time', () => {
  // The weight card names the VALUE and no time, so a picker would edit a field
  // the owner can see neither before nor after — and a back-date desyncs the
  // pets.weight_kg snapshot. The takeover offered no time edit at all, so this
  // withholds nothing anyone had.
  it('withholds Change time on a weight check', () => {
    const view = render(<NamedCompletionCard />);
    seed({ record: { kind: 'weight', weightKg: 5.62 } });
    expect(view.queryByLabelText('Change time of this log')).toBeNull();
  });

  it('offers Change time on a witnessed record', () => {
    const view = render(<NamedCompletionCard />);
    seed();
    view.getByLabelText('Change time of this log');
  });

  // Withheld, not broken: one datetime control cannot express two bounds, and
  // every single-value reading would discard or invent an edge.
  it('withholds Change time on a BOUNDED window', () => {
    const view = render(<NamedCompletionCard />);
    seed({
      record: {
        kind: 'event', typeLabel: 'Loose stool', confidence: 'window',
        earliest: new Date(2026, 5, 7, 14, 0).toISOString(),
        latest: OCCURRED.toISOString(),
      },
    });
    expect(view.queryByLabelText('Change time of this log')).toBeNull();
  });

  it('offers Change time on an open-ended window', () => {
    const view = render(<NamedCompletionCard />);
    seed({
      record: {
        kind: 'event', typeLabel: 'Vomit', confidence: 'window',
        earliest: null, latest: OCCURRED.toISOString(),
      },
    });
    view.getByLabelText('Change time of this log');
  });

  // THE ADVERSARIAL-REVIEWER'S COUNTEREXAMPLE, at the surface the owner touches.
  // On a "found by" record the value written is the DISCOVERY bound, so a sheet
  // asking "When did this happen?" invites an answer about occurrence and stores
  // it as discovery — destroying the found-at time, narrowing the window, and
  // moving occurred_at earlier toward the preceding meal. The confidence class
  // never changes, which is why every class-based guard missed it.
  it('asks about DISCOVERY, not occurrence, on a found-by record', () => {
    const view = render(<NamedCompletionCard />);
    seed({
      record: {
        kind: 'event', typeLabel: 'Vomit', confidence: 'window',
        earliest: null, latest: OCCURRED.toISOString(),
      },
    });
    fireEvent.press(view.getByLabelText('Change time of this log'));
    view.getByText('When did you find it?');
    expect(view.queryByText('When did this happen?')).toBeNull();
  });

  it('asks about occurrence on a witnessed record', () => {
    const view = render(<NamedCompletionCard />);
    seed();
    fireEvent.press(view.getByLabelText('Change time of this log'));
    view.getByText('When did this happen?');
  });

  // A peek-and-save (Save is live with nothing scrubbed) must not restate the
  // provenance of a symptom logged from a photo — the card's own rule against
  // restating fields it was not told about, applied to occurred_at_source.
  it('preserves EXIF provenance when the time did not change', async () => {
    const view = render(<NamedCompletionCard />);
    seed();
    fireEvent.press(view.getByLabelText('Change time of this log'));
    await act(async () => { fireEvent.press(view.getByText('Save')); });
    expect(getEventSource).toHaveBeenCalledWith('e1');
    expect((updateEvent as jest.Mock).mock.calls[0][1].occurred_at_source).toBe('exif');
  });

  // The over-claim guard, end to end through the component: a witnessed row's
  // time edit must reach updateEvent with NO confidence key, so the three B-010
  // columns keep exactly what is stored (B-448).
  it('a witnessed time edit writes no confidence at all', async () => {
    const view = render(<NamedCompletionCard />);
    seed();
    fireEvent.press(view.getByLabelText('Change time of this log'));
    await act(async () => { fireEvent.press(view.getByText('Save')); });
    const fields = (updateEvent as jest.Mock).mock.calls[0][1];
    expect(fields).not.toHaveProperty('confidence');
    expect(fields.occurred_at).toBe(OCCURRED.toISOString());
  });

  // The other half of the provenance rule: an actual correction DOES claim
  // 'manual', so preserving 'exif' above is a peek rule, not a refusal to update.
  it('stamps manual once the time actually moves', async () => {
    const view = render(<NamedCompletionCard />);
    seed();
    fireEvent.press(view.getByLabelText('Change time of this log'));
    const moved = new Date(2026, 5, 7, 16, 5);
    await act(async () => {
      fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, moved);
    });
    await act(async () => { fireEvent.press(view.getByText('Save')); });
    const fields = (updateEvent as jest.Mock).mock.calls[0][1];
    expect(fields.occurred_at).toBe(moved.toISOString());
    expect(fields.occurred_at_source).toBe('manual');
  });

  // The /log flow writes an owner-typed note on both of this card's paths, and
  // updateEvent used to write `notes` unconditionally — so a Change time tap
  // would have silently deleted what the owner typed thirty seconds earlier.
  // The edit must name the time and nothing else.
  it('a time edit never restates notes or severity', async () => {
    const view = render(<NamedCompletionCard />);
    seed();
    fireEvent.press(view.getByLabelText('Change time of this log'));
    await act(async () => { fireEvent.press(view.getByText('Save')); });
    const fields = (updateEvent as jest.Mock).mock.calls[0][1];
    expect(fields).not.toHaveProperty('notes');
    expect(fields).not.toHaveProperty('severity');
  });

  // ...and a "found by" edit DOES restate the window, moving the discovery bound
  // with the point so the row cannot end up self-contradictory.
  it('a found-by time edit moves the window with the point', async () => {
    const view = render(<NamedCompletionCard />);
    seed({
      record: {
        kind: 'event', typeLabel: 'Vomit', confidence: 'window',
        earliest: null, latest: OCCURRED.toISOString(),
      },
    });
    fireEvent.press(view.getByLabelText('Change time of this log'));
    await act(async () => { fireEvent.press(view.getByText('Save')); });
    const fields = (updateEvent as jest.Mock).mock.calls[0][1];
    expect(fields.confidence).toEqual({
      value: 'window', earliest: null, latest: fields.occurred_at,
    });
  });
});


// ── Undo (CUL-612 · §5) ──────────────────────────────────────────────────────
//
// momentStore.test.ts owns the reversal's mechanics. What only a rendered card
// can answer, and what this block owns: that the control is REACHABLE on every
// record, that the removal line replaces the card rather than sitting beside a
// live control, and that a failure never shows a reversal that did not happen.
describe('NamedCompletionCard — Undo', () => {
  async function pressUndo(view: ReturnType<typeof render>) {
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this log')); });
  }

  it('removes the just-written event and swaps the card to its removal line', async () => {
    const view = render(<NamedCompletionCard />);
    seed();
    await pressUndo(view);
    expect(reverseLoggedEvent).toHaveBeenCalledWith('e1');
    view.getByText('Removed');
    view.getByText('Taken out of Biscuit’s record');
  });

  // The important half of the layout rule. Change time is WITHHELD on a weight and
  // on a two-sided window (one datetime control cannot express two bounds), and
  // those are precisely the records with no other in-place way back. An affordance
  // that disappears on the records that need it most is not a safety net.
  it('renders on a weight check, where Change time deliberately does not', () => {
    const view = render(<NamedCompletionCard />);
    seed({ record: { kind: 'weight', weightKg: 5.6 } });
    view.getByLabelText('Undo — remove this log');
    expect(view.queryByLabelText('Change time of this log')).toBeNull();
  });

  it('renders on a two-sided window, where Change time deliberately does not', () => {
    const view = render(<NamedCompletionCard />);
    seed({
      record: {
        kind: 'event', typeLabel: 'Loose stool', confidence: 'window',
        earliest: new Date(2026, 5, 7, 14, 0).toISOString(),
        latest: OCCURRED.toISOString(),
      },
    });
    view.getByLabelText('Undo — remove this log');
    expect(view.queryByLabelText('Change time of this log')).toBeNull();
  });

  it('the removal line REPLACES the card — no mark, no controls left over', async () => {
    const view = render(<NamedCompletionCard />);
    seed();
    await pressUndo(view);
    // A "Change time" beside the word "Removed" would offer to edit a row that is
    // no longer in the record; an Undo would offer to remove it twice.
    expect(view.queryByLabelText('Change time of this log')).toBeNull();
    expect(view.queryByLabelText('Undo — remove this log')).toBeNull();
    // And the sentence is gone with them — the card is now about the reversal.
    expect(view.queryByText(`Vomit · today at ${formatTime(OCCURRED)}`)).toBeNull();
    expect(view.queryByText('Saved to Biscuit’s record')).toBeNull();
  });

  it('names the RECORD’s pet, not a since-switched active one', async () => {
    const view = render(<NamedCompletionCard />);
    seed({}, 'p2'); // logged for Biscuit (p1) while Mochi (p2) is active
    await pressUndo(view);
    view.getByText('Taken out of Biscuit’s record');
  });

  it('announces the reversal politely — its only confirmation for a screen reader', async () => {
    const view = render(<NamedCompletionCard />);
    seed();
    await pressUndo(view);
    const node = view.getByLabelText('Removed. Taken out of Biscuit’s record');
    expect(node.props.accessibilityLiveRegion).toBe('polite');
  });

  it('on a FAILED write, keeps the card intact and says so', async () => {
    // The one unrecoverable lie this surface could tell: the word "Removed" over a
    // row that is still in the record.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (reverseLoggedEvent as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    const view = render(<NamedCompletionCard />);
    seed();
    await pressUndo(view);
    expect(view.queryByText('Removed')).toBeNull();
    view.getByText(`Vomit · today at ${formatTime(OCCURRED)}`);
    // And the message names the other way in — the row is still there to remove.
    expect(alert.mock.calls[0][0]).toBe('Could not remove that log');
    expect(alert.mock.calls[0][1]).toContain('History');
    alert.mockRestore();
  });

  it('stays SILENT on a no-op tap — an error for a tap that did nothing wrong teaches distrust', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = render(<NamedCompletionCard />);
    seed();
    await pressUndo(view);
    // Second press lands on the removal line, where the control is already gone —
    // drive the store directly to prove the 'ignored' path never alerts.
    await act(async () => { await useMomentStore.getState().undo('e1'); });
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});


// The touch-target rule (CUL-612). Undo has no confirming dialog — the tap IS the
// destructive confirm — so a mistouch aimed at Change time must not be able to
// resolve to it. Found by code review: symmetric hitSlop wide enough to be
// comfortable reached across the 8pt gap from both sides, and the winner was
// z-order. Asserted structurally rather than left to a device pass, because an
// overlap is invisible in a screenshot.
describe('NamedCompletionCard — the action pair cannot overlap', () => {
  it('each control yields the edge that faces its neighbour', () => {
    const view = render(<NamedCompletionCard />);
    seed();
    const undo = view.getByLabelText('Undo — remove this log').props.hitSlop;
    const change = view.getByLabelText('Change time of this log').props.hitSlop;
    // Half the 8pt gap each: they meet at the midpoint and never cross.
    expect(undo.right + change.left).toBeLessThanOrEqual(theme.space1);
    // …while keeping the outward and vertical reach that carries the 44pt floor
    // alongside minHeight.
    expect(undo.left).toBeGreaterThanOrEqual(12);
    expect(change.right).toBeGreaterThanOrEqual(12);
    expect(undo.top).toBeGreaterThanOrEqual(12);
    expect(change.bottom).toBeGreaterThanOrEqual(12);
  });
});
