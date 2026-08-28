import { StyleSheet } from 'react-native';
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

  // ── CUL-657 — the same defect one level up, on the worse control. ──
  // The two segments are flex:1, minHeight-44 siblings sitting FLUSH inside an
  // overflow-hidden bordered box. Each carried hitSlop 8, so their expanded
  // rectangles shared a 16pt band centred on the divider — dead centre of the
  // widget, where a thumb lands on a two-option control — and a tap there
  // resolved by z-order, not intent. Unlike the radio rows there is no gap to
  // spend here, so every point of slop reached into the neighbour.
  //
  // This is the top-level witnessed-vs-discovered classifier: the wrong segment
  // files a witnessed event as a discovery window or the reverse (B-448), and
  // the vet report prints the difference.
  describe('the Saw it / Found it segments claim no reach into each other', () => {
    it('neither segment carries hitSlop', () => {
      const { getByText } = setup({ mode: 'saw' });

      for (const label of ['Saw it happen', 'Found it']) {
        const seg = owningTouchable(getByText(label));
        expect(seg).not.toBeNull();
        expect(seg.props.hitSlop).toBeUndefined();
      }
    });

    // Pins the geometry the rule above rests on. The segments are flush by
    // design (a shared border, not a gap), which is what makes ANY slop here an
    // overlap rather than a spend of empty space — the CLAUDE.md CUL-612 test is
    // `gap >= facing(a) + facing(b)`, and this row's gap is zero. If a later
    // redesign puts real space between them, that is the moment to re-derive
    // this rule rather than inherit it.
    it('the segments are flush — there is no gap for slop to spend', () => {
      const { getByText } = setup({ mode: 'saw' });
      const row = commonAncestor(
        owningTouchable(getByText('Saw it happen')),
        owningTouchable(getByText('Found it')),
      );
      expect(row).not.toBeNull();

      const flat = (StyleSheet.flatten(row.props?.style) ?? {}) as Record<string, number | undefined>;
      expect(flat.gap ?? 0).toBe(0);
      expect(flat.columnGap ?? 0).toBe(0);
    });

    it('each segment selects its own mode', () => {
      const saw = setup({ mode: 'found' });
      fireEvent.press(saw.getByText('Saw it happen'));
      expect(saw.props.onModeChange).toHaveBeenCalledWith('saw');

      const found = setup({ mode: 'saw' });
      fireEvent.press(found.getByText('Found it'));
      expect(found.props.onModeChange).toHaveBeenCalledWith('found');
    });
  });
});

// The nearest ancestor that contains BOTH nodes — i.e. the row the two segments
// are siblings in, whichever intermediate composites the tree happens to have.
// Derived from the tree rather than reached by a fixed number of `.parent` hops,
// so it does not quietly start measuring some other element after a refactor.
function commonAncestor(a: any, b: any): any {
  const chain = new Set<any>();
  for (let n = a; n; n = n.parent) chain.add(n);
  for (let n = b; n; n = n.parent) if (chain.has(n)) return n;
  return null;
}
