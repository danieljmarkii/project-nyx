import { render, fireEvent } from '@testing-library/react-native';
import { TimeConfidenceField } from './TimeConfidenceField';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

// Local components (B-514): the day boundary is local midnight, and nothing here
// asks a local-day question — but a UTC literal would still be a different
// wall-clock time per runner, and these assertions read the rendered stamp.
const POINT = new Date(2026, 6, 24, 17, 33);
const LATEST = new Date(2026, 6, 24, 20, 0);

function setup(over: Partial<React.ComponentProps<typeof TimeConfidenceField>> = {}) {
  const props = {
    mode: 'found' as const,
    onModeChange: jest.fn(),
    point: POINT,
    pointSource: 'now' as const,
    onPointChange: jest.fn(),
    foundMode: 'before' as const,
    onFoundModeChange: jest.fn(),
    estimatedAt: POINT,
    onEstimatedChange: jest.fn(),
    earliest: null,
    latest: LATEST,
    onEarliestChange: jest.fn(),
    onLatestChange: jest.fn(),
    ...over,
  };
  return { ...render(<TimeConfidenceField {...props} />), props };
}

// Resolve the touchable that actually OWNS a node — the nearest ancestor host
// element with responder handlers — or null if the node sits in no button at all.
//
// This walk, rather than fireEvent.press, is what discriminates here. RTL's
// `press` does not simply bubble: given a node with no handler above it, it can
// still reach one by descending from an enclosing COMPOSITE element. Pressing
// this file's inert label therefore fired the value's touchable, and the first
// draft of these tests passed unchanged against the pre-fix tree — green over
// the exact defect they exist for (the CUL-613 lesson, met the hard way). Node
// identity cannot be reached that way: two texts share a button only if they
// really are inside one.
function owningTouchable(node: any): any {
  let n = node;
  while (n) {
    if (n.props?.accessible && typeof n.props?.onStartShouldSetResponder === 'function') return n;
    n = n.parent;
  }
  return null;
}

describe('TimeConfidenceField', () => {
  // ── CUL-579 — the defect this file exists for. ──
  // Each row rendered a 44pt-tall box in which only the value `Text` responded:
  // the LABEL half — visually the more button-like of the two, since it names
  // what the row is for — was inert. An owner reaching for "Found it by" got
  // nothing, on the control whose whole job is recording how well a time is known.
  describe('the whole row is the button', () => {
    it.each([
      ['before' as const, 'Found it by', 'picker-latest'],
      ['around' as const, 'Around', 'picker-estimated'],
    ])('%s: the label and the value are one button, which opens the picker', (foundMode, label, picker) => {
      const { getByText, queryByTestId } = setup({ foundMode });

      const onLabel = owningTouchable(getByText(label));
      expect(onLabel).not.toBeNull();               // the label was in no button at all
      expect(onLabel).toBe(owningTouchable(getByText(/·/)));  // ...and it is the value's button

      expect(queryByTestId(picker)).toBeNull();
      fireEvent.press(getByText(label));
      expect(queryByTestId(picker)).not.toBeNull();
    });

    // "Between two times" is the pair that matters most: two bounds of ONE window,
    // 8pt apart. Each row must be its own button — one row reaching the other
    // would silently move the wrong edge of a window the vet report prints.
    it('between: each bound is its own button, opening its own picker', () => {
      const { getByText, queryByTestId } = setup({ foundMode: 'between' });

      const from = owningTouchable(getByText('From'));
      const to = owningTouchable(getByText('To'));
      expect(from).not.toBeNull();
      expect(to).not.toBeNull();
      expect(from).not.toBe(to);

      fireEvent.press(getByText('From'));
      expect(queryByTestId('picker-earliest')).not.toBeNull();
      expect(queryByTestId('picker-latest')).toBeNull();

      fireEvent.press(getByText('To'));
      expect(queryByTestId('picker-latest')).not.toBeNull();
      expect(queryByTestId('picker-earliest')).toBeNull();
    });

    it('announces the row as one button naming both its label and its value', () => {
      const { getByLabelText } = setup({ foundMode: 'before' });
      // Screen-reader users had two adjacent texts here and no button at all.
      expect(getByLabelText(/^Found it by, /)).toBeTruthy();
    });
  });

  // The three radio rows are already at the 44pt floor, so the hitSlop they used
  // to carry bought no reach — it only pushed 8pt into the 8pt gap between them,
  // from both sides, letting a boundary tap resolve to the neighbouring
  // confidence class by z-order (CUL-612). Asserting its ABSENCE, because the
  // instinct on reading "44pt floor" is to add it back.
  //
  // Scoped to the radio rows on purpose: the segmented control above them still
  // carries hitSlop 8 on two FLUSH siblings, which is the same defect one level
  // up and is deliberately NOT fixed here — see the note on CUL-579.
  it('selects the found-mode a radio row names, claiming no reach into its neighbours', () => {
    const { getByText, props } = setup({ foundMode: 'before' });

    fireEvent.press(getByText('Around a time'));
    expect(props.onFoundModeChange).toHaveBeenCalledWith('around');

    for (const label of ['Sometime before', 'Around a time', 'Between two times']) {
      const row = owningTouchable(getByText(label));
      expect(row).not.toBeNull();
      expect(row.props.hitSlop).toBeUndefined();
    }
  });
});
