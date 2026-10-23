jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

import { render, fireEvent } from '@testing-library/react-native';
import { theme } from '../../constants/theme';
import {
  IncidentReadCard,
  IncidentReadPending,
  INCIDENT_READ_DISCLAIMER,
  INCIDENT_READ_HIDE_LABEL,
  INCIDENT_READ_PENDING_LABEL,
  RAIL_TICK_HEIGHT,
  RAIL_WIDTH,
} from './IncidentReadCard';

function railStyle(getByTestId: (id: string) => { props: { style: unknown } }) {
  const { StyleSheet } = require('react-native');
  return StyleSheet.flatten(getByTestId('incident-read-rail').props.style);
}

describe('IncidentReadCard — the rail is the severity signal (§5.2, G4)', () => {
  it('an escalation rails in the safety rose and inks its verdict for the rose ground (C-1)', () => {
    const { getByText, getByTestId } = render(
      <IncidentReadCard verdict="worth_a_call" label="Worth a call" readText="Streaks." onHide={() => {}} />,
    );
    expect(railStyle(getByTestId).backgroundColor).toBe(theme.colorEventSymptom);
    const { StyleSheet } = require('react-native');
    // The bright rose is a GLYPH tint: on its own light fill it is ~2.5:1. The label that
    // asks an owner to phone a vet takes the ink (6.68:1, pinned in theme.contrast).
    const verdict = StyleSheet.flatten(getByText('Worth a call').props.style);
    expect(verdict.color).toBe(theme.colorEventSymptomInk);
    expect(verdict.color).not.toBe(theme.colorEventSymptom);
  });

  it('a benign read rails grey — the colour is the ONLY thing that changes', () => {
    const attn = render(
      <IncidentReadCard verdict="worth_a_call" label="Worth a call" readText="x" onHide={() => {}} />,
    );
    const calm = render(
      <IncidentReadCard verdict="monitor" label="Keep an eye out" readText="x" onHide={() => {}} />,
    );
    const { StyleSheet } = require('react-native');
    const a = StyleSheet.flatten(attn.getByTestId('incident-read-rail').props.style);
    const c = StyleSheet.flatten(calm.getByTestId('incident-read-rail').props.style);
    expect(c.backgroundColor).toBe(theme.colorBorderStrong);
    // G4: same width, same shape, same everything but the fill. An escalation arrives no
    // louder — it is not thicker, and there is no glyph or badge to find.
    expect(a.width).toBe(c.width);
    expect(attn.queryByText('!')).toBeNull();
    expect(attn.queryByText('⚠')).toBeNull();
  });

  it('an UNKNOWN verdict rails rose, never grey — absence of a known escalation is not calm', () => {
    // A grey rail is a positive claim that this is not an escalation. A server that gains
    // a fourth recommendation before this build does would otherwise get that claim for
    // free, which is Pattern 1's failure mode wearing a colour. Fail toward the rose: a
    // false alarm at worst, against a missed one.
    const { StyleSheet } = require('react-native');
    const { getByTestId } = render(
      <IncidentReadCard
        verdict={'urgent_now' as never}
        label="Call your vet now"
        readText="x"
        onHide={() => {}}
      />,
    );
    const rail = StyleSheet.flatten(getByTestId('incident-read-rail').props.style);
    expect(rail.backgroundColor).toBe(theme.colorEventSymptom);
    expect(rail.backgroundColor).not.toBe(theme.colorBorderStrong);
  });

  it('never renders a verdict word of its own — the label passes straight through', () => {
    // clinical-guardrails Pattern 1: the enum has no reassuring value, and there is no
    // path through this component that could add one. Handed nonsense, it renders the
    // nonsense rather than "helpfully" mapping the recommendation to words itself.
    const { getByText } = render(
      <IncidentReadCard verdict="monitor" label="ZZ-SENTINEL" readText={null} onHide={() => {}} />,
    );
    expect(getByText('ZZ-SENTINEL')).toBeTruthy();
  });

  it('carries the disclaimer on the card, under the read (§5.2)', () => {
    const { getByText } = render(
      <IncidentReadCard verdict="monitor" label="Keep an eye out" readText="Yellow, foamy." onHide={() => {}} />,
    );
    expect(getByText(INCIDENT_READ_DISCLAIMER)).toBeTruthy();
  });

  it('the hide control says what it does, and the visible text IS the name (C-7)', () => {
    const onHide = jest.fn();
    const { getByText } = render(
      <IncidentReadCard verdict="monitor" label="Keep an eye out" readText="x" onHide={onHide} />,
    );
    const control = getByText(INCIDENT_READ_HIDE_LABEL);
    // Never a label that differs from the visible text; the shipped bare ✕ announced
    // nothing at all, which is what this replaces.
    expect(control.props.accessibilityLabel).toBeUndefined();
    fireEvent.press(control);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('IncidentReadPending (§5.2)', () => {
  it('says it is reading the PHOTO, and stands a 16pt tick of rail beside the words', () => {
    const { getByText, UNSAFE_root } = render(<IncidentReadPending />);
    expect(getByText(INCIDENT_READ_PENDING_LABEL)).toBeTruthy();
    const { StyleSheet, View } = require('react-native');
    const tick = UNSAFE_root
      .findAllByType(View)
      .map((n: { props: { style?: unknown } }) => StyleSheet.flatten(n.props.style) ?? {})
      .find((s: { height?: number }) => s.height === RAIL_TICK_HEIGHT);
    // PR 3 grows this tick into the card's rail, so the read arrives from the mark that
    // was already standing there rather than from nowhere.
    expect(tick).toBeTruthy();
    expect(tick.backgroundColor).toBe(theme.colorBorderStrong);
  });

  // D2-7 (CUL-1068; GA by CUL-1071) — the whorl is gone and the tick itself breathes, in
  // the same slot, only while a read is being PRODUCED.
  describe('the breathing tick (D2-7)', () => {
    const hidden = { includeHiddenElements: true };

    it('a read being produced: the breathing tick, no whorl, the same 3×16 mark', () => {
      const { getByText, queryByTestId, UNSAFE_root } = render(<IncidentReadPending working />);
      expect(getByText(INCIDENT_READ_PENDING_LABEL)).toBeTruthy();
      const { StyleSheet } = require('react-native');
      const tick = queryByTestId('design-v2-tick', hidden);
      expect(tick).toBeTruthy();
      const style = StyleSheet.flatten(tick!.props.style);
      expect(style.width).toBe(RAIL_WIDTH);
      expect(style.height).toBe(RAIL_TICK_HEIGHT);
      // The whorl is gone: nothing in the box is an SVG.
      expect(UNSAFE_root.findAllByType(require('react-native-svg').default)).toHaveLength(0);
    });

    it('a local row being read (not a request): the still tick, and no whorl either', () => {
      const { queryByTestId, UNSAFE_root } = render(<IncidentReadPending />);
      expect(queryByTestId('design-v2-tick', hidden)).toBeNull();
      const { StyleSheet, View } = require('react-native');
      const still = UNSAFE_root
        .findAllByType(View)
        .map((n: { props: { style?: unknown } }) => StyleSheet.flatten(n.props.style) ?? {})
        .find((s: { height?: number }) => s.height === RAIL_TICK_HEIGHT);
      expect(still).toBeTruthy();
      expect(UNSAFE_root.findAllByType(require('react-native-svg').default)).toHaveLength(0);
    });
  });
});

describe('IncidentReadCard — the dated correction (CUL-1406, C-A)', () => {
  const WORDS = "Nyx has been vomiting and hasn't eaten a full meal recently.";
  const correction = { label: 'Corrected Oct 7, 2026', text: 'The words above went further than the record.' };

  it('keeps the stored words untouched and puts the correction under them, as one element', () => {
    const { getByText, getByTestId } = render(
      <IncidentReadCard verdict="worth_a_call" label="Worth a call" readText={WORDS} correction={correction} onHide={() => {}} />,
    );
    const { StyleSheet } = require('react-native');
    // No strikethrough (C-A): the words are drawn exactly as stored.
    expect(StyleSheet.flatten(getByText(WORDS).props.style).textDecorationLine).toBeUndefined();
    const block = getByTestId('incident-read-correction');
    expect(block.props.accessible).toBe(true);
    // No label that differs from the visible text (C-7): the element reads its children.
    expect(block.props.accessibilityLabel).toBeUndefined();
    expect(getByText(correction.label)).toBeTruthy();
    expect(getByText(correction.text)).toBeTruthy();
    // A record fact, never a second alarm: grey, on a rose card too.
    expect(StyleSheet.flatten(block.props.style).borderLeftColor).toBe(theme.colorBorderStrong);
    // The verdict is untouched.
    expect(getByText('Worth a call')).toBeTruthy();
  });

  it('draws nothing without stored words to sit beside', () => {
    const { queryByTestId } = render(
      <IncidentReadCard verdict="worth_a_call" label="Worth a call" readText={null} correction={correction} onHide={() => {}} />,
    );
    expect(queryByTestId('incident-read-correction')).toBeNull();
  });
});

// K2 (CUL-1389), CUL-1515: a calm read that is evidence for a finding Home is tracking.
describe('IncidentReadCard: "Part of a pattern" (K2)', () => {
  const { StyleSheet } = require('react-native');
  const pattern = (onOpen = jest.fn()) => ({
    line: "Home is tracking Nyx's vomiting, and this one is part of it.",
    door: 'See what Home is tracking',
    onOpen,
  });

  it('a quiet read draws the dashed pale rose, the line and the door, and the door opens', () => {
    const onOpen = jest.fn();
    const view = render(
      <IncidentReadCard verdict="monitor" label="Part of a pattern" tone="neutral" pattern={pattern(onOpen)} onHide={() => {}} />,
    );
    const card = StyleSheet.flatten(view.getByTestId('incident-read-card').props.style);
    expect(card.borderStyle).toBe('dashed');
    expect(card.borderColor).toBe(theme.colorEventSymptomBorder);
    // Never a call's fill, never the call's rail.
    expect(card.backgroundColor).not.toBe(theme.colorEventSymptomLight);
    expect(railStyle(view.getByTestId).backgroundColor).toBe(theme.colorEventSymptomBorder);
    expect(railStyle(view.getByTestId).backgroundColor).not.toBe(theme.colorEventSymptom);
    expect(view.getByText("Home is tracking Nyx's vomiting, and this one is part of it.")).toBeTruthy();
    const door = view.getByTestId('incident-read-pattern-door');
    expect(door.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(door.props.style).minHeight).toBeGreaterThanOrEqual(44);
    fireEvent.press(view.getByText('See what Home is tracking'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps the watch-for list under it: the read is not a call on its own', () => {
    const view = render(
      <IncidentReadCard
        verdict="monitor"
        label="Part of a pattern"
        tone="neutral"
        pattern={pattern()}
        watchFor={{ emergency: null, lines: ['Call your vet today if she vomits again.'], clauses: [], ageNote: null }}
      />,
    );
    expect(view.getByTestId('incident-read-watch-for')).toBeTruthy();
  });

  it('a call ignores it: its own ask outranks a pointer to Home', () => {
    const view = render(
      <IncidentReadCard verdict="worth_a_call" label="Call your vet now" tone="call_filled" pattern={pattern()} />,
    );
    expect(view.queryByTestId('incident-read-pattern')).toBeNull();
    expect(railStyle(view.getByTestId).backgroundColor).toBe(theme.colorEventSymptom);
  });

  it('absent, the quiet card is exactly as before', () => {
    const view = render(<IncidentReadCard verdict="monitor" label="Keep an eye out" tone="neutral" />);
    expect(view.queryByTestId('incident-read-pattern')).toBeNull();
    expect(railStyle(view.getByTestId).backgroundColor).toBe(theme.colorBorderStrong);
  });
});

// ── CUL-1912: the event detail round's P3 to P6 ────────────────────────────────────
describe('IncidentReadCard on Home\'s surface (CUL-1912, P3 to P6)', () => {
  const { StyleSheet } = require('react-native');
  const cardStyle = (tone: Parameters<typeof IncidentReadCard>[0]['tone'], verdict = 'monitor') => {
    const { getByTestId } = render(
      <IncidentReadCard verdict={verdict} label="L" tone={tone} readText="x" onHide={() => {}} />,
    );
    return StyleSheet.flatten(getByTestId('incident-read-card').props.style);
  };

  it('P3: every tier keeps a look that is not colour alone', () => {
    const filled = cardStyle('call_filled', 'worth_a_call');
    const outline = cardStyle('call_outline', 'worth_a_call');
    const calm = cardStyle('neutral');
    const muted = cardStyle('muted', 'not_enough_to_say');
    // Call now keeps its fill.
    expect(filled.backgroundColor).toBe(theme.colorEventSymptomLight);
    // Call today: a 2pt outline on white, so in greyscale it is not one hairline from the
    // calm card (the round's first adversarial pass).
    expect(outline.backgroundColor).toBe(theme.colorSurface);
    expect(outline.borderWidth).toBe(2);
    expect(outline.borderColor).toBe(theme.colorEventSymptom);
    // Keep an eye out: Home's soft shadow, no edge.
    expect(calm.shadowOpacity).toBeGreaterThan(0);
    expect(calm.borderWidth).toBeUndefined();
    // Not enough: the dashed edge, no shadow.
    expect(muted.borderStyle).toBe('dashed');
    expect(muted.shadowOpacity).toBeUndefined();
  });

  it('P4: the rail hangs in the gutter, left of the text edge, spanning its track', () => {
    const { getByTestId } = render(<IncidentReadCard verdict="monitor" label="L" readText="x" />);
    const rail = StyleSheet.flatten(getByTestId('incident-read-rail').props.style);
    expect(rail.position).toBe('absolute');
    expect(rail.left).toBeLessThan(0);
    expect([rail.top, rail.bottom]).toEqual([0, 0]);
    // The card's inset is Home's, so the text lands on the record's edge.
    expect(StyleSheet.flatten(getByTestId('incident-read-card').props.style).padding).toBe(theme.space2);
  });

  it('P5: the verdict is one size and weight at every tier, and the heading is inside the card', () => {
    const sizes = (['call_filled', 'call_outline', 'neutral', 'muted'] as const).map((tone) => {
      const verdict = tone.startsWith('call') ? 'worth_a_call' : 'monitor';
      const { getByText } = render(<IncidentReadCard verdict={verdict} label={`V-${tone}`} tone={tone} readText="x" />);
      const s = StyleSheet.flatten(getByText(`V-${tone}`).props.style);
      // ThemedText resolves the weight into the face, so the face is what is compared.
      return `${s.fontSize}/${s.fontFamily}`;
    });
    // G4: no tier arrives larger or harder than another.
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0].startsWith(`${theme.textLG}/`)).toBe(true);
    expect(sizes[0]).toMatch(/SemiBold|Semibold|600/);
    const { getByText } = render(<IncidentReadCard verdict="monitor" label="L" readText="x" />);
    expect(getByText('AI READ').props.accessibilityRole).toBe('header');
  });

  it('P5: a quiet verdict is the secondary grey, Not enough included; a call keeps the ink', () => {
    const quiet = render(<IncidentReadCard verdict="not_enough_to_say" label="Q" tone="muted" readText="x" />);
    expect(StyleSheet.flatten(quiet.getByText('Q').props.style).color).toBe(theme.colorTextSecondary);
    const call = render(<IncidentReadCard verdict="worth_a_call" label="C" tone="call_outline" readText="x" />);
    expect(StyleSheet.flatten(call.getByText('C').props.style).color).toBe(theme.colorEventSymptomInk);
  });

  it('P6: one foot row; Hide carries its 44pt in the box, never a slop (C-5)', () => {
    const onHide = jest.fn();
    const { getByTestId, getByText } = render(
      <IncidentReadCard verdict="worth_a_call" label="C" readText="x" onHide={onHide} />,
    );
    const foot = getByTestId('incident-read-foot');
    expect(StyleSheet.flatten(foot.props.style).flexWrap).toBe('wrap');
    expect(getByText(INCIDENT_READ_DISCLAIMER)).toBeTruthy();
    const hide = getByTestId('incident-read-hide');
    // A slop would reach toward "I've called · Not yet" under a call; a mis-tap there hides one.
    expect(hide.props.hitSlop).toBeUndefined();
    expect(StyleSheet.flatten(hide.props.style).minHeight).toBe(theme.hitTarget);
    fireEvent.press(getByText(INCIDENT_READ_HIDE_LABEL));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('the body reports the rail\'s track height, not the card\'s', () => {
    const onMeasure = jest.fn();
    const { getByTestId } = render(<IncidentReadCard verdict="monitor" label="L" readText="x" onMeasure={onMeasure} />);
    expect(getByTestId('incident-read-card').props.onLayout).toBeUndefined();
    fireEvent(getByTestId('incident-read-body'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
    expect(onMeasure).toHaveBeenCalledWith(120);
  });
});

describe('IncidentReadFrame and the pending wait (CUL-1912)', () => {
  const { StyleSheet } = require('react-native');
  const { IncidentReadFrame } = require('./IncidentReadCard');

  it('a dashed frame leads with the heading and rails grey at full height', () => {
    const { getByText, getByTestId, UNSAFE_root } = render(
      <IncidentReadFrame surface="dashed" testID="f"><></></IncidentReadFrame>,
    );
    expect(getByText('AI READ').props.accessibilityRole).toBe('header');
    expect(StyleSheet.flatten(getByTestId('f').props.style).borderStyle).toBe('dashed');
    const { View } = require('react-native');
    const rail = UNSAFE_root.findAllByType(View)
      .map((n: { props: { style?: unknown } }) => StyleSheet.flatten(n.props.style) ?? {})
      .find((s: { position?: string; bottom?: number }) => s.position === 'absolute' && s.bottom === 0);
    expect(rail.backgroundColor).toBe(theme.colorBorderStrong);
  });

  it('the pending wait sits on the raised surface with its tick at the TOP of the gutter (P4)', () => {
    const { getByTestId, getByText } = render(<IncidentReadPending />);
    expect(getByText('AI READ')).toBeTruthy();
    const frame = StyleSheet.flatten(getByTestId('incident-read-pending').props.style);
    expect(frame.shadowOpacity).toBeGreaterThan(0);
    const { View } = require('react-native');
    const tick = getByTestId('incident-read-pending')
      .findAllByType(View)
      .map((n: { props: { style?: unknown } }) => StyleSheet.flatten(n.props.style) ?? {})
      .find((s: { height?: number }) => s.height === RAIL_TICK_HEIGHT);
    // The arrival seeds the rail from this spot: top of the track, in the gutter.
    expect(tick.top).toBe(0);
    expect(tick.position).toBe('absolute');
  });
});
