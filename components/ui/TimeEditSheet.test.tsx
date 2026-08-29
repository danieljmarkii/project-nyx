// The shared "Change time" sheet (CUL-606, adopted by both completion cards in
// CUL-621). It shipped with no suite of its own — fine while it had one caller
// and its behaviour was asserted through NamedCompletionCard, not fine now that
// all three completion surfaces route through it.
//
// What this suite owns is the two details the extraction's header comment calls
// load-bearing, because both are invisible in a diff and neither is asserted
// anywhere else:
//   • the empty-onPress Pressable wrapping the sheet — without it a tap on the
//     title or the whitespace falls through to the absolute-positioned backdrop
//     and silently dismisses the picker mid-edit;
//   • maximumDate pinned at MOUNT rather than read from a live clock — a "now"
//     that advances while the wheel is open lets a scrub land in the future.
//
// What it deliberately does NOT claim: jest cannot reproduce the z-order touch
// fall-through the first bullet describes. It can only hold that the sheet
// carries its own responder, which is the structural precondition. The tap
// itself stays a device-pass check.

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { TimeEditSheet } from './TimeEditSheet';

const VALUE = new Date(2026, 5, 7, 14, 0);

// Walk UP from a node to the nearest host element that owns a press responder.
// Identity cannot be reached by descent, so this discriminates where a synthetic
// press does not (CLAUDE.md § fireEvent.press cannot prove a region is tappable).
// The action row's REAL gap, read off the rendered tree. Comparing against a
// `theme.space3` written into the test would pass forever after someone narrowed
// the actual style — the assertion has to be about what renders, not about a token
// the test and the component happen to agree on today.
function actionRowGap(button: { parent: unknown; props?: Record<string, unknown> } | null) {
  let n = button as { parent: unknown; props?: Record<string, unknown> } | null;
  while (n) {
    const style = StyleSheet.flatten(n.props?.style as never) as { gap?: number; flexDirection?: string } | undefined;
    if (style && typeof style.gap === 'number' && style.flexDirection === 'row') return style.gap;
    n = n.parent as typeof n;
  }
  return null;
}

function nearestResponder(node: { parent: unknown; props?: Record<string, unknown> } | null) {
  let n = node as { parent: unknown; props?: Record<string, unknown> } | null;
  while (n) {
    if (n.props && typeof n.props.onStartShouldSetResponder === 'function') return n;
    n = n.parent as typeof n;
  }
  return null;
}

function setup(over: Partial<React.ComponentProps<typeof TimeEditSheet>> = {}) {
  const onCancel = jest.fn();
  const onSave = jest.fn();
  const view = render(
    <TimeEditSheet value={VALUE} title="When did this happen?" onCancel={onCancel} onSave={onSave} {...over} />,
  );
  return { view, onCancel, onSave };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 5, 7, 14, 30));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TimeEditSheet', () => {
  it('asks the caller’s question — the title is never decoration', () => {
    // Required rather than defaulted (CUL-606's adversarial finding): a sheet that
    // asks about occurrence over a discovery bound corrupts the record silently.
    const { view } = setup({ title: 'When did you find it?' });
    view.getByText('When did you find it?');
  });

  it('hands back the scrubbed draft on Save', () => {
    const { view, onSave, onCancel } = setup();
    const moved = new Date(2026, 5, 7, 9, 30);
    fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, moved);
    fireEvent.press(view.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(moved);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('hands back nothing on Cancel, however much was scrubbed', () => {
    // The draft is the sheet's own, deliberately: the caller's authoritative time
    // is never mutated by opening and abandoning the picker.
    const { view, onSave, onCancel } = setup();
    fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, new Date(2026, 5, 7, 9, 30));
    fireEvent.press(view.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the sheet’s content sits inside its OWN press responder', () => {
    // Written as an ancestor walk, not as a fireEvent.press, and the difference is
    // the whole test: the first draft pressed the title and asserted onCancel was
    // not called, which passed just as happily with the Pressable deleted — an
    // inert label calls nothing either way (CUL-613's "green from birth"). What
    // actually discriminates is whether a responder EXISTS above the title to
    // capture the tap, so the walk stops at the nearest one and fails on null.
    const { view, onCancel } = setup();
    const captor = nearestResponder(view.getByText('When did this happen?'));
    expect(captor).not.toBeNull();
    // And the captor is inert by design — it swallows the tap rather than
    // routing it anywhere, which is exactly what "does not dismiss" means here.
    fireEvent.press(captor as never);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('pins maximumDate to the moment it opened, not a live clock', () => {
    // The sheet stays mounted while the owner scrubs. If maximumDate re-read the
    // clock on every render, a wheel held open past the minute would accept a
    // time the app then stores as a future event.
    const { view } = setup();
    const atMount = view.UNSAFE_getByType('DateTimePicker' as never).props.maximumDate as Date;
    expect(atMount.getTime()).toBe(new Date(2026, 5, 7, 14, 30).getTime());

    jest.setSystemTime(new Date(2026, 5, 7, 15, 30));
    view.rerender(
      <TimeEditSheet value={VALUE} title="When did this happen?" saving onCancel={jest.fn()} onSave={jest.fn()} />,
    );
    const afterAnHour = view.UNSAFE_getByType('DateTimePicker' as never).props.maximumDate as Date;
    expect(afterAnHour.getTime()).toBe(atMount.getTime());
  });

  it('disables Save while a write is in flight', () => {
    const { view } = setup({ saving: true });
    expect(view.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
  });
});

// The touch-target rule (CUL-612), asserted here rather than on each of the three
// cards that now render this sheet — Cancel and Save are siblings in a row, and a
// mistouch near the boundary between them resolves by z-order, not by intent. The
// stakes are lower than the named card's Undo/Change-time pair (neither of these is
// destructive), but an overlap is invisible in a screenshot either way.
describe('TimeEditSheet — Cancel and Save cannot overlap', () => {
  it('the row’s gap covers both controls’ facing hitSlop', () => {
    const { view } = setup();
    const cancelBtn = view.getByRole('button', { name: 'Cancel' });
    const cancel = cancelBtn.props.hitSlop;
    const save = view.getByRole('button', { name: 'Save' }).props.hitSlop;
    const gap = actionRowGap(cancelBtn);
    expect(gap).not.toBeNull();
    // Symmetric slop is fine HERE only because the gap pays for it: the two
    // expanded rectangles meet exactly at the midpoint of space3 and never cross.
    // Narrow that gap and this fails, which is the point — the arithmetic stops
    // being true silently.
    expect(cancel + save).toBeLessThanOrEqual(gap as number);
    // …and each keeps enough outward reach to carry the 44pt floor alongside the
    // btn's minHeight, which is pinned explicitly so the floor rests on no
    // rendered font metric jest cannot compute.
    expect(cancel).toBeGreaterThanOrEqual(12);
    expect(save).toBeGreaterThanOrEqual(12);
  });
});
