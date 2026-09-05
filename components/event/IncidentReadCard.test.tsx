import { render, fireEvent } from '@testing-library/react-native';
import { theme } from '../../constants/theme';
import {
  IncidentReadCard,
  IncidentReadPending,
  INCIDENT_READ_DISCLAIMER,
  INCIDENT_READ_HIDE_LABEL,
  INCIDENT_READ_PENDING_LABEL,
  RAIL_TICK_HEIGHT,
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
  it('says it is reading the PHOTO, and stands a 16pt tick of rail beside the whorl', () => {
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
});
