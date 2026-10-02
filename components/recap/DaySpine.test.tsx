// DaySpine (DR-1 §2.4) — the timeline-as-list. Assertions: every node is a doorway
// that routes on press, the fact-only sub-line renders, the B-568 wet/dry format tag
// renders (and is suppressed when the mapper returns null), and the screen-reader label
// reads in visual order (title · detail · format-tag … sub-line … time).
import { fireEvent, render } from '@testing-library/react-native';
import { Dimensions, PixelRatio, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { DaySpine, RAIL_W, SpineRowFrame, TIME_W, timeColumnText } from './DaySpine';
import type { DaySummaryRow } from '../../lib/daySummary';

function row(over: Partial<DaySummaryRow> & { id: string; category: DaySummaryRow['category'] }): DaySummaryRow {
  return {
    eventType: over.category === 'symptom' ? 'vomit' : 'meal',
    title: 'Event',
    detail: null,
    formatTag: null,
    time: '9:00 AM',
    timeMs: 0,
    subline: null,
    ...over,
  } as DaySummaryRow;
}

describe('DaySpine', () => {
  it('routes to the tapped row’s event', () => {
    const onPressRow = jest.fn();
    const rows = [
      row({ id: 'a', category: 'meal', title: 'Whitefish', detail: 'all eaten', time: '7:42 AM' }),
      row({ id: 'b', category: 'symptom', title: 'Vomit', time: '9:15 AM' }),
    ];
    const { getAllByRole } = render(<DaySpine rows={rows} onPressRow={onPressRow} />);
    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(2);
    fireEvent.press(buttons[1]);
    expect(onPressRow).toHaveBeenCalledWith('b');
  });

  it('renders the fact-only sub-line when present', () => {
    const { getByText } = render(
      <DaySpine rows={[row({ id: 'a', category: 'meal', title: 'Whitefish', subline: 'Trial diet' })]} onPressRow={jest.fn()} />,
    );
    expect(getByText('Trial diet')).toBeTruthy();
  });

  it('reads a screen-reader label in visual order', () => {
    const { getByLabelText } = render(
      <DaySpine
        rows={[row({ id: 'a', category: 'meal', title: 'Whitefish', detail: 'all eaten', time: '7:42 AM', subline: 'Trial diet' })]}
        onPressRow={jest.fn()}
      />,
    );
    expect(getByLabelText('Whitefish, all eaten, Trial diet, 7:42 AM. Opens details')).toBeTruthy();
  });

  it('renders the wet/dry format tag as a sibling of the title (B-568 parity)', () => {
    // Two rows of the SAME prescription line stocked in both formats — the case the tag
    // exists for. Without it both rows read "Hill's z/d · all eaten" and are identical.
    const { getByText } = render(
      <DaySpine
        rows={[
          row({ id: 'a', category: 'meal', title: "Hill's z/d", detail: 'all eaten', formatTag: 'WET' }),
          row({ id: 'b', category: 'meal', title: "Hill's z/d", detail: 'all eaten', formatTag: 'DRY' }),
        ]}
        onPressRow={jest.fn()}
      />,
    );
    expect(getByText('WET')).toBeTruthy();
    expect(getByText('DRY')).toBeTruthy();
  });

  it('renders no format tag when the mapper suppresses it (null)', () => {
    // A suppressed tag (unspecified format, or a treat-format treat that would merely
    // echo its own label) is null on the row — the spine renders nothing, never an
    // empty tracked-caps element.
    const { queryByText } = render(
      <DaySpine rows={[row({ id: 'a', category: 'meal', title: 'Treat', formatTag: null })]} onPressRow={jest.fn()} />,
    );
    expect(queryByText('TREAT')).toBeNull();
  });

  it('reads the format tag into the screen-reader label in visual order', () => {
    const { getByLabelText } = render(
      <DaySpine
        rows={[row({ id: 'a', category: 'meal', title: "Hill's z/d", detail: 'all eaten', formatTag: 'DRY', time: '7:42 AM', subline: 'Trial diet' })]}
        onPressRow={jest.fn()}
      />,
    );
    // title, detail, tag (lowercased so it speaks as a word), sub-line, time.
    expect(getByLabelText("Hill's z/d, all eaten, dry, Trial diet, 7:42 AM. Opens details")).toBeTruthy();
  });
});

// ── The time column wraps, never truncates (History v2, HV-1 / CUL-1158; AC 19) ──────
// The frame is the one row chrome Home, History and the Daily Recap share, so this is
// where the wrapping contract is pinned: a range breaks after its dash, a clock time
// never breaks inside itself, and nothing between the time and the row can cut it.

const NB = '\u00A0';
/** Compare drawn text RAW: the default normalizer folds a no-break space into a space,
 *  which would pass the unshaped string too. */
const RAW = { normalizer: (s: string) => s };

describe('timeColumnText — where the time may break', () => {
  const CASES: [string, string][] = [
    ['09:15 AM', `09:15${NB}AM`],
    // A run within one half of the day: one break, after the dash.
    ['12:41 – 05:07 PM', `12:41${NB}– 05:07${NB}PM`],
    // A run across noon: each time whole, the dash glued to the first.
    ['11:30 AM – 01:05 PM', `11:30${NB}AM${NB}– 01:05${NB}PM`],
    ['~12:41 PM', `~12:41${NB}PM`],
    // A found time keeps its break after "by": the whole string is wider than the column.
    ['by 07:02 AM', `by 07:02${NB}AM`],
    // A window's own unspaced dash is already a break-after point (UAX #14, class BA).
    ['06:00 AM–07:00 AM', `06:00${NB}AM–07:00${NB}AM`],
    ['21:15 – 22:30', `21:15${NB}– 22:30`],
    ['9:15 a.m.', `9:15${NB}a.m.`],
    // The platform's own narrow no-break space (ICU 72+) is already unbreakable.
    ['9:15\u202FAM', '9:15\u202FAM'],
    ['11:30\u202FAM – 01:05\u202FPM', `11:30\u202FAM${NB}– 01:05\u202FPM`],
  ];

  it.each(CASES)('%j is drawn as %j', (input, drawn) => {
    expect(timeColumnText(input)).toBe(drawn);
  });

  it('only ever swaps a space for a no-break space — the text says what it said', () => {
    for (const [input] of CASES) expect(timeColumnText(input).replace(/\u00A0/g, ' ')).toBe(input);
  });

  it('a range keeps exactly one break opportunity between its two times: after the dash', () => {
    expect(timeColumnText('12:41 – 05:07 PM').split(' ')).toEqual([`12:41${NB}–`, `05:07${NB}PM`]);
    expect(timeColumnText('11:30 AM – 01:05 PM').split(' ')).toEqual([`11:30${NB}AM${NB}–`, `01:05${NB}PM`]);
  });
});

describe('SpineRowFrame — no line cap, no scale cap, no height that could cut the time', () => {
  const RANGE = '12:41 – 05:07 PM';

  afterEach(() => jest.restoreAllMocks());

  // A structural stand-in for react-test-renderer's instance (the
  // NamedCompletionCard.test.tsx convention: its types are not a dependency here).
  type TestNode = { props: { style?: unknown }; parent: TestNode | null };
  const flat = (style: unknown): ViewStyle & TextStyle =>
    (StyleSheet.flatten(style as StyleProp<ViewStyle & TextStyle>) ?? {}) as ViewStyle & TextStyle;

  /** The host view the frame's row is, found by walking up from the time. */
  function rowOf(time: TestNode): TestNode {
    let node: TestNode | null = time.parent;
    while (node && flat(node.props.style).minHeight == null) node = node.parent;
    if (!node) throw new Error('the frame row was not found above the time');
    return node;
  }

  // The frame reads no font scale, so one tree must hold at the default text size and
  // at the largest iOS offers (AX5, ~3.57× in React Native). What makes "never
  // truncates" true at every size is structural, so it is asserted at both scales: a
  // future cap that switched on above some scale would red the large case. The actual
  // line breaks are the device pass's to see (the QA script's largest-size step).
  it.each([1, 3.571])('at font scale %s', (scale) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(scale);
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: scale });
    const t = render(
      <SpineRowFrame ground="day" category="meal" isFirst isLast={false} time={RANGE}>
        <Text>Meal</Text>
      </SpineRowFrame>,
    );

    const time = t.getByText(timeColumnText(RANGE), RAW);
    expect(time.props.numberOfLines).toBeUndefined();
    expect(time.props.ellipsizeMode).toBeUndefined();
    expect(time.props.adjustsFontSizeToFit).toBeUndefined();
    expect(time.props.allowFontScaling).not.toBe(false);
    expect(time.props.maxFontSizeMultiplier).toBeUndefined();

    // A fixed column (the rail lines up row to row), free to grow downward.
    const own = flat(time.props.style);
    expect(own.width).toBe(TIME_W);
    expect(own.height).toBeUndefined();
    expect(own.maxHeight).toBeUndefined();

    // Nothing between the time and the row clips, and the row holds a FLOOR, not a height.
    const row = rowOf(time);
    for (let n: TestNode | null = time.parent; n && n !== row.parent; n = n.parent) {
      const s = flat(n.props.style);
      expect(s.height).toBeUndefined();
      expect(s.maxHeight).toBeUndefined();
      expect(s.overflow).not.toBe('hidden');
    }
    expect(flat(row.props.style).minHeight).toBe(44);
  });

  it('the recap draws the shaped time and still speaks the plain one', () => {
    const { getByText, getByLabelText } = render(
      <DaySpine rows={[row({ id: 'a', category: 'meal', title: '3 meals', time: RANGE })]} onPressRow={jest.fn()} />,
    );
    expect(getByText(`12:41${NB}– 05:07${NB}PM`, RAW)).toBeTruthy();
    expect(getByLabelText(`3 meals, ${RANGE}. Opens details`)).toBeTruthy();
  });

  it('the column widths are exported, so an inset under the time and the rail is derived, never retyped', () => {
    // The opened run's members indent by exactly these (components/dayRow/SpineNodeRow).
    // 60, not the mock's 56 (PM, 2026-09-25, CUL-1183): the widest first line a run can
    // put in the column, "11:30 AM –", is 58.7pt of Geist at 11pt.
    expect([TIME_W, RAIL_W]).toEqual([60, 18]);
  });
});

// ── The tag under the time (History v2 HV-6 / CUL-1163; §3.6: "a found time reads by
// 7:02 AM with FOUND under it; an estimated time carries ESTIMATED") ────────────────
describe('SpineRowFrame with a time tag — the tag rides the column under the same rules (AC 19)', () => {
  type TestNode = { props: { style?: unknown }; parent: TestNode | null };
  const flat = (style: unknown): ViewStyle & TextStyle =>
    (StyleSheet.flatten(style as StyleProp<ViewStyle & TextStyle>) ?? {}) as ViewStyle & TextStyle;
  afterEach(() => jest.restoreAllMocks());

  it.each([1, 3.571])('at font scale %s: neither the time nor its tag is capped, cut or clipped', (scale) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(scale);
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: scale });
    const t = render(
      <SpineRowFrame ground="day" category="symptom" isFirst isLast={false} time="by 07:02 AM" timeTag="found">
        <Text>Vomit</Text>
      </SpineRowFrame>,
    );
    const time = t.getByText(timeColumnText('by 07:02 AM'), RAW) as unknown as TestNode & { props: Record<string, unknown> };
    const tag = t.getByText('found', RAW) as unknown as TestNode & { props: Record<string, unknown> };
    for (const text of [time, tag]) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
      expect(text.props.adjustsFontSizeToFit).toBeUndefined();
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    }
    // Both sit in ONE column of the time's fixed width, which holds no height.
    const columnOf = (n: TestNode): TestNode => {
      let at: TestNode | null = n.parent;
      while (at && flat(at.props.style).width !== TIME_W) at = at.parent;
      if (!at) throw new Error('the time column was not found above the text');
      return at;
    };
    const column = columnOf(time);
    expect(columnOf(tag) === column).toBe(true);
    for (let n: TestNode | null = column; n; n = n.parent) {
      const s = flat(n.props.style);
      expect(s.height).toBeUndefined();
      expect(s.maxHeight).toBeUndefined();
      expect(s.overflow).not.toBe('hidden');
      if (s.minHeight != null) break;
    }
    expect(flat(tag.props.style).textTransform).toBe('uppercase');
  });

  it('without a tag the column is exactly what it was: one text, no wrapper', () => {
    const t = render(
      <SpineRowFrame ground="day" category="meal" isFirst isLast={false} time="09:15 AM">
        <Text>Meal</Text>
      </SpineRowFrame>,
    );
    const time = t.getByText(timeColumnText('09:15 AM'), RAW) as unknown as { props: { style?: unknown } };
    expect(flat(time.props.style).width).toBe(TIME_W);
  });
});
