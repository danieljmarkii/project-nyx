// DayMark against its §05 row (CUL-1064): the date is always rendered text; the count is a
// separate node; a layer off is not "clear" (the line stays); a day ahead is not a
// control; colour is never the only carrier. And the shared face (CUL-1165, History v2
// spec §3.4 / §5.7): the logged line in the glyph teal, the broken line the same colour
// DASHED, the line white on the rose and still broken there, the strip's count-less face.

import { configure, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DAY_MARK_DASH, DayMark, DayMarkFace, DayMarkLine } from './DayMark';
import { theme } from '../../constants/theme';

// The charts' internals are hidden from assistive tech behind ONE spoken label (the
// shipped lane's pattern), so the queries below opt into hidden elements to reach them.
configure({ defaultIncludeHiddenElements: true });

const base = { dayKey: '2026-09-19', dayOfMonth: 19, noun: 'vomiting' };
const flat = (style: unknown): Record<string, unknown> => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('DayMark — the §05 row', () => {
  it('the date is always rendered text, on every coverage', () => {
    for (const coverage of ['logged', 'left_some', 'unlogged', 'ahead'] as const) {
      const { getByTestId } = render(<DayMark {...base} count={0} coverage={coverage} />);
      expect(getByTestId('daymark-date').props.children).toBe(19);
    }
    const { getByTestId } = render(<DayMark {...base} count={2} coverage="logged" />);
    expect(getByTestId('daymark-date').props.children).toBe(19);
  });

  it('the count sits in the corner as its own node, separate from the date', () => {
    const { getByTestId } = render(<DayMark {...base} count={2} coverage="logged" />);
    expect(getByTestId('daymark-count').props.children).toBe(2);
    expect(getByTestId('daymark-count')).not.toBe(getByTestId('daymark-date'));
  });

  it('a zero day carries no count node — the date is the mark', () => {
    const { queryByTestId } = render(<DayMark {...base} count={0} coverage="logged" />);
    expect(queryByTestId('daymark-count')).toBeNull();
  });

  it('a layer OFF is not "clear": the rose and the count go, the line and the date stay', () => {
    const { queryByTestId, getByTestId } = render(<DayMark {...base} count={2} coverage="logged" symptomLayer={false} />);
    expect(queryByTestId('daymark-count')).toBeNull();
    expect(getByTestId('daymark-line-solid')).toBeTruthy();
    expect(getByTestId('daymark-date').props.children).toBe(19);
    expect(flat(getByTestId('daymark').props.style).backgroundColor).not.toBe(theme.colorEventSymptom);
    // And the spoken day says "logged", never "no vomiting" — the layer is off, not the fact.
    expect(getByTestId('daymark').props.accessibilityLabel).toContain('logged');
    expect(getByTestId('daymark').props.accessibilityLabel).not.toContain('no vomiting');
  });

  it('the coverage line: whole when logged, BROKEN for a meal left unfinished, none on an unlogged day', () => {
    expect(render(<DayMark {...base} count={0} coverage="logged" />).getByTestId('daymark-line-solid')).toBeTruthy();
    expect(render(<DayMark {...base} count={0} coverage="left_some" />).getByTestId('daymark-line-broken')).toBeTruthy();
    expect(render(<DayMark {...base} count={0} coverage="unlogged" />).queryByTestId(/daymark-line/)).toBeNull();
    expect(render(<DayMark {...base} count={0} coverage="ahead" />).queryByTestId(/daymark-line/)).toBeNull();
  });

  it('a day ahead is a plain view: no press, no `disabled` claim (C-7)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<DayMark {...base} count={0} coverage="ahead" onPress={onPress} />);
    const node = getByTestId('daymark');
    expect(node.props.accessibilityRole).toBeUndefined();
    expect(node.props.accessibilityState?.disabled).toBeUndefined();
    expect(node.props.disabled).toBeUndefined();
    // Assert the HOST, never press: `fireEvent.press` reaches the composite's `onPress`
    // prop by walking the tree and would pass over a plain View (C-6). A responder host
    // carries `onClick` / `onResponderGrant`; this one carries neither.
    expect(node.props.onClick).toBeUndefined();
    expect(node.props.onResponderGrant).toBeUndefined();
    expect(node.props.onPress).toBeUndefined();
    expect(onPress).not.toHaveBeenCalled();
    expect(node.props.accessibilityLabel).toContain('ahead');
  });

  it('a logged day with a handler is a button that opens the day', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<DayMark {...base} count={1} coverage="logged" onPress={onPress} />);
    const node = getByTestId('daymark');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toContain('opens the day');
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the layers: a medication dot; a photo dot, rose when read as worth a call — and SAID', () => {
    const { getByTestId } = render(<DayMark {...base} count={1} coverage="logged" medication photo="worth_a_call" />);
    expect(getByTestId('daymark-layer-medication')).toBeTruthy();
    const dot = getByTestId('daymark-layer-photo-worth_a_call');
    expect(flat(dot.props.style).backgroundColor).toBe(theme.colorEventSymptomInk);
    const label = getByTestId('daymark').props.accessibilityLabel as string;
    expect(label).toContain('medication');
    expect(label).toContain('read as worth a call');
    const seen = render(<DayMark {...base} count={0} coverage="logged" photo="seen" />);
    expect(flat(seen.getByTestId('daymark-layer-photo-seen').props.style).backgroundColor).not.toBe(theme.colorEventSymptomInk);
    expect(seen.getByTestId('daymark').props.accessibilityLabel).toContain('photographed');
  });

  it('speaks the count, never an all-clear', () => {
    const two = render(<DayMark {...base} count={2} coverage="logged" />);
    expect(two.getByTestId('daymark').props.accessibilityLabel).toContain('vomiting logged 2 times');
    const one = render(<DayMark {...base} count={1} coverage="logged" />);
    expect(one.getByTestId('daymark').props.accessibilityLabel).toContain('vomiting logged 1 time');
    const none = render(<DayMark {...base} count={0} coverage="logged" />);
    const label = none.getByTestId('daymark').props.accessibilityLabel as string;
    expect(label).toContain('logged, no vomiting');
    expect(label).not.toMatch(/clear|fine|good/i);
    const un = render(<DayMark {...base} count={0} coverage="unlogged" />);
    expect(un.getByTestId('daymark').props.accessibilityLabel).toContain('nothing logged');
  });
});

// ── The shared face (CUL-1165; History v2 spec §3.4, §5.7, AC 26) ──────────────────

// react-native-svg's test renderer resolves to native RNSVG* hosts and packs a colour into
// an opaque ARGB int (the WhorlSpinner / CulpritMark tests' helper).
function argbPayload(hex: string): number {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
function hostsOf(node: Json | Json[] | string | null, type: string, out: Json[] = []): Json[] {
  if (node === null || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => hostsOf(n, type, out));
    return out;
  }
  if (node.type === type) out.push(node);
  (node.children ?? []).forEach((c) => hostsOf(c as Json, type, out));
  return out;
}

const faceBase = { dayOfMonth: 19, label: 'Saturday, September 19' };

describe('the line is told apart by SHAPE, not by a paler colour (WBC-1, AC 26)', () => {
  it('a logged day’s line is whole and in the glyph teal, not the retired pale teal', () => {
    const { getByTestId, toJSON } = render(<DayMark {...base} count={0} coverage="logged" />);
    expect(flat(getByTestId('daymark-line-solid').props.style).backgroundColor).toBe(theme.colorAccentGlyph);
    expect(flat(getByTestId('daymark-line-solid').props.style).backgroundColor).not.toBe(theme.colorAccentSoft);
    // Whole: no dash anywhere in the day.
    expect(hostsOf(toJSON() as Json, 'RNSVGLine')).toHaveLength(0);
  });

  it('a meal left unfinished breaks the SAME colour into 3pt dashes with 3pt gaps', () => {
    const { toJSON, getByTestId } = render(<DayMark {...base} count={0} coverage="left_some" />);
    const lines = hostsOf(toJSON() as Json, 'RNSVGLine');
    expect(lines).toHaveLength(1);
    expect(lines[0].props.strokeDasharray).toEqual([3, 3]);
    expect(DAY_MARK_DASH).toEqual([3, 3]);
    expect((lines[0].props.stroke as { payload: number }).payload).toBe(argbPayload(theme.colorAccentGlyph));
    // Not the retired paler "left some" colour.
    expect((lines[0].props.stroke as { payload: number }).payload).not.toBe(argbPayload(theme.colorAccentWashDeep));
    // It sits where the whole line sits, at the box's foot.
    expect(flat(getByTestId('daymark-line-broken').props.style)).toMatchObject({ position: 'absolute', left: '22%', right: '22%', bottom: 4, height: 2 });
    expect(flat(getByTestId('daymark-line-broken').props.style).backgroundColor).toBeUndefined();
  });

  it('on a vomit day the line draws WHITE, and a meal left unfinished still breaks it (§5.7)', () => {
    const whole = render(<DayMark {...base} count={1} coverage="logged" />);
    expect(flat(whole.getByTestId('daymark').props.style).backgroundColor).toBe(theme.colorEventSymptom);
    expect(flat(whole.getByTestId('daymark-line-solid').props.style).backgroundColor).toBe(theme.colorTextOnDark);

    const broken = render(<DayMark {...base} count={1} coverage="left_some" />);
    expect(flat(broken.getByTestId('daymark').props.style).backgroundColor).toBe(theme.colorEventSymptom);
    const dashes = hostsOf(broken.toJSON() as Json, 'RNSVGLine');
    expect(dashes).toHaveLength(1);
    expect(dashes[0].props.strokeDasharray).toEqual([3, 3]);
    expect((dashes[0].props.stroke as { payload: number }).payload).toBe(argbPayload(theme.colorTextOnDark));
    // And the ear hears it too.
    expect(broken.getByTestId('daymark').props.accessibilityLabel).toContain('a meal left unfinished');
  });

  it('the legend’s key IS the mark: DayMarkLine draws the grid’s own stroke', () => {
    const solid = render(<DayMarkLine kind="solid" testID="k" />);
    expect(flat(solid.getByTestId('k').props.style).backgroundColor).toBe(theme.colorAccentGlyph);
    const broken = render(<DayMarkLine kind="broken" testID="k" />);
    const line = hostsOf(broken.toJSON() as Json, 'RNSVGLine')[0];
    expect(line.props.strokeDasharray).toEqual([3, 3]);
    expect((line.props.stroke as { payload: number }).payload).toBe(argbPayload(theme.colorAccentGlyph));
  });
});

describe('DayMarkFace: the drawing History’s week strip shares with the month', () => {
  it('draws the rose without a count: the strip’s variant (H-2)', () => {
    const { getByTestId, queryByTestId } = render(<DayMarkFace {...faceBase} box="rose" line="solid" />);
    expect(flat(getByTestId('daymark').props.style).backgroundColor).toBe(theme.colorEventSymptom);
    expect(queryByTestId('daymark-count')).toBeNull();
    expect(getByTestId('daymark-date').props.children).toBe(19);
  });

  it('a white box with no line: the strip’s "logged, not the filtered kind" and Noticed’s date-only day', () => {
    const { getByTestId, queryByTestId } = render(<DayMarkFace {...faceBase} box="white" line="none" />);
    expect(flat(getByTestId('daymark').props.style).backgroundColor).toBe(theme.colorSurface);
    expect(queryByTestId(/daymark-line/)).toBeNull();
  });

  it('before the record: no box at all, the date faint, and never a control (C-7)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<DayMarkFace {...faceBase} box="none" line="none" onPress={onPress} />);
    const node = getByTestId('daymark');
    const style = flat(node.props.style);
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderColor).toBe('transparent');
    expect(flat(getByTestId('daymark-date').props.style).color).toBe(theme.colorTickIdle);
    expect(node.props.accessibilityRole).toBeUndefined();
    expect(node.props.onClick).toBeUndefined();
    expect(node.props.onResponderGrant).toBeUndefined();
    expect(node.props.accessibilityState?.disabled).toBeUndefined();
  });

  it('speaks exactly the label it is given, with its hint, and is a button only with a handler', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <DayMarkFace {...faceBase} box="grey" line="none" label="Saturday, September 19, nothing logged" accessibilityHint="Shows the day in the list" onPress={onPress} />,
    );
    const node = getByTestId('daymark');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('Saturday, September 19, nothing logged');
    expect(node.props.accessibilityHint).toBe('Shows the day in the list');
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('today’s border and the landed ring draw on the face as they do on the month', () => {
    const today = render(<DayMarkFace {...faceBase} box="white" line="none" today />);
    expect(flat(today.getByTestId('daymark').props.style)).toMatchObject({ borderWidth: 1.5, borderColor: theme.colorTextPrimary });
    const landed = render(<DayMarkFace {...faceBase} box="white" line="solid" selected />);
    expect(flat(landed.getByTestId('daymark').props.style)).toMatchObject({ borderWidth: 2, borderColor: theme.colorAccentInk });
  });
});
