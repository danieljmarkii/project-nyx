// InsightCard — the Signal fold (CUL-784, `docs/nyx-signal-fold-requirements.md` §3 / §7 / §9).
//
// What is worth pinning here is the anatomy the ruling bought: the control row is a real
// row of buttons BESIDE the face (not inside it — C-6, asserted by node identity, never by
// `fireEvent.press`), the `Keep it compact` control exists only where a host wired it and
// only for a class this build folds, the two controls and the face never share hit area
// (C-5, asserted off the flattened styles), the Back-because line is heard before the card,
// and nothing animates under reduced motion.

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { LayoutAnimation } from 'react-native';
import { FoldedStrip, InsightCard } from './InsightCard';
import { commonAncestor, facing, flat, owningTouchable } from '../../testUtils/tree';
import * as signalCopy from '../../lib/signalCopy';
import { FOLD_CAPTION, FOLD_CONTROL_LABEL } from '../../lib/signalCopy';
import type {
  CachedFinding,
  IncidentRedFlagFinding,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  StoodDownMarker,
  SymptomChronicityFinding,
} from '../../lib/signal';

const postprandial: PostprandialTimingFinding = {
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 8,
  eligibleCount: 8,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 14,
  feedingFormsInEvidence: [],
  windowDays: 60,
};
const chronicity: SymptomChronicityFinding = {
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 14,
  spanDays: 56,
  activeWeeks: 5,
  symptomDays: 12,
  daysSinceLastEpisode: 3,
  firstOnsetIso: '2026-07-05T00:00:00.000Z',
  tier: 'firm',
  windowDays: 56,
};
const intakeFinding: IntakeDeclineFinding = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 1,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
};
const redFlagFinding: IncidentRedFlagFinding = {
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: '2026-09-01T08:00:00.000Z',
  flaggedIncidentCount: 2,
  windowDays: 14,
};
const stoodDownMarker: StoodDownMarker = {
  type: 'stood_down',
  priorityClass: 'insight',
  symptomType: 'vomit',
  recencyDays: 14,
  tier: 'firm',
  lastEpisodeIso: '2026-08-19T11:00:00.000Z',
  stoodDownAt: '2026-09-03T12:00:00.000Z',
  formerRank: 0,
};
const SENTENCE = 'A sentence about Nyx.';
// A mocked native-driver animation completes on the next animation frame, whatever its
// duration — so one frame is what a "the beat completed" step advances by.
const FRAME_MS = 20;
const benign: CachedFinding = { rank: 1, text: SENTENCE, finding: postprandial };
const safety: CachedFinding = { rank: 0, text: SENTENCE, finding: chronicity };
const intake: CachedFinding = { rank: 0, text: SENTENCE, finding: intakeFinding };
const redFlag: CachedFinding = { rank: 0, text: SENTENCE, finding: redFlagFinding };
const stoodDown: CachedFinding = { rank: 0, text: 'No vomiting logged for Nyx in 14 days.', finding: stoodDownMarker };
// B-514: a local-day fixture is built from local components, never a UTC literal.
const AUG_26_LOCAL_NOON = new Date(2026, 7, 26, 12).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseReducedMotion.mockReturnValue(false);
});

describe('the control row is a sibling of the face (DF-3, C-6)', () => {
  it('the evidence verb is its own button, not the face', () => {
    const { getByText } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    const face = owningTouchable(getByText(SENTENCE));
    const why = owningTouchable(getByText("Why we're showing this"));
    expect(face).not.toBeNull();
    expect(why).not.toBeNull();
    expect(why).not.toBe(face);
  });

  it('`Keep it compact` is its own button beside the evidence verb', () => {
    const { getByText } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    const fold = owningTouchable(getByText(FOLD_CONTROL_LABEL));
    expect(fold).not.toBeNull();
    expect(fold).not.toBe(owningTouchable(getByText("Why we're showing this")));
    expect(fold).not.toBe(owningTouchable(getByText(SENTENCE)));
  });

  it('the evidence control toggles the evidence and reads `Hide details` when open', () => {
    const { getByText, queryByText } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    fireEvent.press(getByText("Why we're showing this"));
    expect(getByText('Hide details')).toBeTruthy();
    fireEvent.press(getByText('Hide details'));
    expect(queryByText('Hide details')).toBeNull();
  });
});

describe('`Keep it compact` — where it renders and what it does (FS-4, the DF-2 class gate)', () => {
  it('renders on a benign card when a host wired onFold, and calls it with the finding once the words have left', () => {
    // CUL-788: the host's state change rides the choreography — it fires when the 180ms
    // leave beat completes (the box closes around the line), not at the press itself.
    jest.useFakeTimers();
    const onFold = jest.fn();
    const { getByText } = render(<InsightCard cached={benign} petName="Nyx" onFold={onFold} />);
    fireEvent.press(getByText(FOLD_CONTROL_LABEL));
    expect(onFold).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(onFold).toHaveBeenCalledTimes(1);
    expect(onFold).toHaveBeenCalledWith(postprandial);
    jest.useRealTimers();
  });

  it('renders on a safety card too (DF-2 — every card folds), and calls onFold with the finding', () => {
    jest.useFakeTimers();
    const onFold = jest.fn();
    const { getByText } = render(<InsightCard cached={safety} petName="Nyx" onFold={onFold} />);
    fireEvent.press(getByText(FOLD_CONTROL_LABEL));
    // CUL-788: identical choreography on every class — the host is told when the words have left.
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(onFold).toHaveBeenCalledWith(chronicity);
    jest.useRealTimers();
    const flag = render(<InsightCard cached={redFlag} petName="Nyx" onFold={onFold} />);
    expect(flag.getByText(FOLD_CONTROL_LABEL)).toBeTruthy();
  });

  it('does NOT render on an intake-decline card — held closed (CUL-785 brief A) until the engine bounds the fold', () => {
    const { queryByText } = render(<InsightCard cached={intake} petName="Nyx" onFold={jest.fn()} />);
    expect(queryByText(FOLD_CONTROL_LABEL)).toBeNull();
  });

  it('does NOT render when no host wired the fold (a non-Home caller)', () => {
    const { queryByText } = render(<InsightCard cached={benign} petName="Nyx" />);
    expect(queryByText(FOLD_CONTROL_LABEL)).toBeNull();
  });

  it('the card tap still only toggles the evidence — it never folds (FS-4)', () => {
    const onFold = jest.fn();
    const { getByTestId, getByText } = render(<InsightCard cached={benign} petName="Nyx" onFold={onFold} />);
    fireEvent.press(getByTestId('insight-face'));
    expect(getByText('Hide details')).toBeTruthy();
    expect(onFold).not.toHaveBeenCalled();
  });

  it('the caption renders beneath the row in the expanded state only, and only on a foldable card', () => {
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    expect(view.queryByText(FOLD_CAPTION)).toBeNull();
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.getByText(FOLD_CAPTION)).toBeTruthy();

    const safe = render(<InsightCard cached={safety} petName="Nyx" onFold={jest.fn()} />);
    fireEvent.press(safe.getByTestId('insight-face'));
    expect(safe.getByText(FOLD_CAPTION)).toBeTruthy();

    const held = render(<InsightCard cached={intake} petName="Nyx" onFold={jest.fn()} />);
    fireEvent.press(held.getByTestId('insight-face'));
    expect(held.queryByText(FOLD_CAPTION)).toBeNull();
  });
});

describe('touch geometry (C-5 — asserted off the flattened style, never off tokens)', () => {
  it('the two controls never share hit area with each other or with the face; each reaches 44pt', () => {
    const { getByText, getByTestId } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    const face = owningTouchable(getByTestId('insight-face'));
    const why = owningTouchable(getByText("Why we're showing this"));
    const fold = owningTouchable(getByText(FOLD_CONTROL_LABEL));
    expect(face && why && fold).toBeTruthy();
    // The control row is whichever element the two controls are siblings in — derived from
    // the tree, never a fixed number of `.parent` hops (testUtils/tree).
    const rowStyle = flat(commonAncestor(why, fold));

    // Horizontal: the rendered gap between the two controls ≥ their facing slops.
    expect(rowStyle.columnGap ?? rowStyle.gap ?? 0).toBeGreaterThanOrEqual(facing(why, 'right') + facing(fold, 'left'));
    // A wrapped row faces vertically — the same bound on rowGap.
    expect(rowStyle.rowGap ?? rowStyle.gap ?? 0).toBeGreaterThanOrEqual(facing(why, 'bottom') + facing(fold, 'top'));
    // Vertical, face ↔ controls: the row's top margin is the gap; the face reaches 0 down.
    expect(facing(face, 'bottom')).toBe(0);
    expect(rowStyle.marginTop ?? 0).toBeGreaterThanOrEqual(facing(face, 'bottom') + facing(why, 'top'));
    expect(rowStyle.marginTop ?? 0).toBeGreaterThanOrEqual(facing(face, 'bottom') + facing(fold, 'top'));
    // The floor: slop up + the box + slop down ≥ 44, for each control.
    for (const c of [why, fold]) {
      const box = flat(c).minHeight ?? 0;
      expect(facing(c, 'top') + box + facing(c, 'bottom')).toBeGreaterThanOrEqual(44);
    }
  });

  it('the face keeps its upward and sideways reach (the 3am rule) and the row its 44pt floor', () => {
    const { getByTestId } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    const face = owningTouchable(getByTestId('insight-face'));
    expect(facing(face, 'top')).toBe(8);
    expect(facing(face, 'left')).toBe(8);
    expect(flat(getByTestId('insight-row')).minHeight).toBe(44);
  });
});

describe('the Back-because line (DF-8 / §7)', () => {
  it('renders once above the sentence and is prefixed to the face’s a11y label', () => {
    const { getByText, getByTestId } = render(
      <InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} backBecause="new_episode" />,
    );
    expect(getByText('Back because a new episode was logged.')).toBeTruthy();
    // Prefixed to the shipped label (a timing card's label carries its receipt sentence too).
    expect(getByTestId('insight-face').props.accessibilityLabel.startsWith(
      `Back because a new episode was logged. ${SENTENCE}`,
    )).toBe(true);
    // Inside the face, so a tap on it is a touch of the card.
    expect(owningTouchable(getByText('Back because a new episode was logged.'))).toBe(
      owningTouchable(getByText(SENTENCE)),
    );
  });

  it('renders nothing and adds nothing to the label when there is no reason', () => {
    const { queryByText, getByTestId } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    expect(queryByText(/^Back because/)).toBeNull();
    const label: string = getByTestId('insight-face').props.accessibilityLabel;
    expect(label.startsWith(SENTENCE)).toBe(true);
    expect(label).not.toMatch(/Back because/);
  });

  it('any touch of the card reports onTouch (the host clears the line on it)', () => {
    const onTouch = jest.fn();
    const { getByTestId, getByText } = render(
      <InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} backBecause="new_week" onTouch={onTouch} />,
    );
    fireEvent.press(getByTestId('insight-face'));
    fireEvent.press(getByText('Hide details'));
    expect(onTouch).toHaveBeenCalledTimes(2);
    expect(onTouch).toHaveBeenCalledWith(postprandial);
  });
});

describe('reduced motion (FS-9)', () => {
  it('the two press paths animate normally', () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    const { getByTestId, getByText } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    fireEvent.press(getByTestId('insight-face'));
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.press(getByText(FOLD_CONTROL_LABEL));
    // The fold's layout config fires when the leave beat completes (CUL-788, §12.1).
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
    jest.useRealTimers();
  });

  it('under reduced motion there is NO LayoutAnimation call on either path', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const spy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    const { getByTestId, getByText } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    fireEvent.press(getByTestId('insight-face'));
    fireEvent.press(getByText(FOLD_CONTROL_LABEL));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a mount with a Back-because line (an automatic re-open) never animates', () => {
    const spy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} backBecause="new_episode" />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('FoldedStrip (§3.1 / §7)', () => {
  it('renders the name line, the compact count line and the chevron — nothing else', () => {
    const { getByText, queryByText } = render(<FoldedStrip cached={benign} onPress={jest.fn()} />);
    expect(getByText('Vomiting soon after eating')).toBeTruthy();
    expect(getByText('8 of 8 timed within 30 min of eating')).toBeTruthy();
    expect(getByText('›')).toBeTruthy();
    expect(queryByText(SENTENCE)).toBeNull();
    expect(queryByText("Why we're showing this")).toBeNull();
    expect(queryByText(FOLD_CONTROL_LABEL)).toBeNull();
  });

  it('is one button: the name and count share the strip’s touchable, and it re-opens on tap', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(<FoldedStrip cached={benign} onPress={onPress} />);
    const strip = owningTouchable(getByTestId('insight-folded-strip'));
    expect(strip).not.toBeNull();
    expect(owningTouchable(getByText('Vomiting soon after eating'))).toBe(strip);
    expect(owningTouchable(getByText('8 of 8 timed within 30 min of eating'))).toBe(strip);
    fireEvent.press(getByText('8 of 8 timed within 30 min of eating'));
    expect(onPress).toHaveBeenCalledWith(postprandial);
  });

  it('speaks name and count as one sentence, is collapsed, and hints the re-open — never "dismissed"', () => {
    const { getByTestId } = render(<FoldedStrip cached={benign} onPress={jest.fn()} />);
    const strip = getByTestId('insight-folded-strip');
    expect(strip.props.accessibilityRole).toBe('button');
    expect(strip.props.accessibilityLabel).toBe('Vomiting soon after eating. 8 of 8 timed within 30 min of eating.');
    expect(strip.props.accessibilityState.expanded).toBe(false);
    expect(strip.props.accessibilityHint).toBe('Opens this insight.');
    expect(`${strip.props.accessibilityLabel} ${strip.props.accessibilityHint}`).not.toMatch(
      /dismiss|acknowledg|read|seen/i,
    );
  });

  it('holds the 44pt floor by minHeight and truncates nothing (no numberOfLines on either line)', () => {
    const { getByTestId, getByText } = render(<FoldedStrip cached={benign} onPress={jest.fn()} />);
    expect(flat(getByTestId('insight-folded-strip')).minHeight).toBe(44);
    expect(getByText('Vomiting soon after eating').props.numberOfLines).toBeUndefined();
    expect(getByText('8 of 8 timed within 30 min of eating').props.numberOfLines).toBeUndefined();
  });

  it('keeps the rail at full opacity on the fold (FS-3) — the row’s rail, beside the strip', () => {
    // CUL-788: the rail belongs to the ROW in both states (one node through the motion), so
    // a folded card's rail is the row's first child, and the strip is its content.
    const { getByTestId } = render(
      <InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} folded onUnfold={jest.fn()} />,
    );
    const row = getByTestId('insight-row');
    const rail = row.children[0] as { props: { style: unknown } };
    const railStyle = flat(rail as never);
    // The shipped rail opacity and width — unchanged, never dimmed, never narrowed.
    expect(railStyle.opacity).toBe(0.85);
    expect(railStyle.width).toBe(3);
    // At rest on a strip the rail is the mock's 16pt tick, centred (§12: "the strip's 16pt").
    expect(railStyle.height).toBe(16);
    expect(railStyle.alignSelf).toBe('center');
    expect(getByTestId('insight-folded-strip')).toBeTruthy();
  });

  it('renders nothing for a type with no strip copy (the stand-down marker is a line, not a card)', () => {
    const { toJSON } = render(<FoldedStrip cached={stoodDown} onPress={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('the unfold animates, except under reduced motion (the choreography is InsightCard.motion.test)', () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    const a = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} folded onUnfold={jest.fn()} />);
    fireEvent.press(a.getByTestId('insight-folded-strip'));
    // The unfold's layout config follows the rail's 80ms lead (CUL-788, §12.2).
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    mockUseReducedMotion.mockReturnValue(true);
    const b = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} folded onUnfold={jest.fn()} />);
    fireEvent.press(b.getByTestId('insight-folded-strip'));
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    jest.useRealTimers();
  });
});

// ── The safety strip (CUL-785, §3.1 / §3.4 / §7 / FS-3) ────────────────────────
describe('FoldedStrip — the safety strip', () => {
  it('renders name, the ask on its own line, the compact count with the last-episode date, the chevron — nothing else', () => {
    const { getByText, queryByText } = render(
      <FoldedStrip cached={safety} onPress={jest.fn()} lastEpisodeIso={AUG_26_LOCAL_NOON} />,
    );
    expect(getByText('Recurring vomiting')).toBeTruthy();
    expect(getByText('Worth a vet visit')).toBeTruthy();
    expect(getByText('14 episodes, 5 of 8 weeks · last Aug 26')).toBeTruthy();
    expect(getByText('›')).toBeTruthy();
    expect(queryByText(SENTENCE)).toBeNull();
    expect(queryByText(FOLD_CONTROL_LABEL)).toBeNull();
    expect(queryByText(/days? (ago|since)/i)).toBeNull();
  });

  it('the ask is its own Text node in plain primary ink at textSM regular, never truncated (FS-11 / S1)', () => {
    const { getByText } = render(<FoldedStrip cached={safety} onPress={jest.fn()} lastEpisodeIso={AUG_26_LOCAL_NOON} />);
    const ask = getByText('Worth a vet visit');
    const name = getByText('Recurring vomiting');
    expect(ask).not.toBe(name);
    expect(ask.props.numberOfLines).toBeUndefined();
    // ThemedText resolves the weight to the Geist face (C-2), so the family is the weight.
    const style = flat(ask) as Record<string, unknown>;
    expect(style.fontSize).toBe(13);
    expect(style.fontFamily).toBe('Geist');
    expect(style.color).toBe('#0A0A0A');
    // The name keeps the medium weight, so the eye reads name → ask → count.
    expect((flat(name) as Record<string, unknown>).fontFamily).toBe('Geist-Medium');
    // No rose text anywhere on the row: the rail is the only warm mark.
    expect(flat(getByText('14 episodes, 5 of 8 weeks · last Aug 26')).color).toBe('#737373');
  });

  it('keeps the rail at full opacity in the safety colour', () => {
    // CUL-788: the rail is the ROW's (one node through the motion), so a folded safety row
    // is read through InsightCard with `folded`; the strip inside it has no rail of its own.
    const { getByTestId } = render(
      <InsightCard cached={safety} petName="Nyx" onFold={jest.fn()} folded onUnfold={jest.fn()} />,
    );
    expect(getByTestId('insight-folded-strip')).toBeTruthy();
    const rail = getByTestId('insight-row').children[0] as { props: { style: unknown } };
    expect(flat(rail as never).opacity).toBe(0.85);
    expect(flat(rail as never).backgroundColor).toBe(flat(render(<InsightCard cached={safety} petName="Nyx" />).getByTestId('insight-row').children[0] as never).backgroundColor);
  });

  it('speaks the ask and the date with the month in full (§7)', () => {
    const { getByTestId } = render(<FoldedStrip cached={safety} onPress={jest.fn()} lastEpisodeIso={AUG_26_LOCAL_NOON} />);
    const strip = getByTestId('insight-folded-strip');
    expect(strip.props.accessibilityLabel).toBe('Recurring vomiting. Worth a vet visit. 14 episodes, 5 of 8 weeks, last August 26.');
    expect(strip.props.accessibilityHint).toBe('Opens this insight.');
    expect(strip.props.accessibilityLabel).not.toMatch(/dismiss|acknowledg|read|seen|resolved|clear/i);
  });

  it('with no date from the record the count stands alone — never an invented day', () => {
    const { getByText, queryByText } = render(<FoldedStrip cached={safety} onPress={jest.fn()} lastEpisodeIso={null} />);
    expect(getByText('14 episodes, 5 of 8 weeks')).toBeTruthy();
    expect(queryByText(/last /)).toBeNull();
  });

  it('the red flag strip carries its own UTC day from the photo record, whatever the context says', () => {
    const { getByText } = render(<FoldedStrip cached={redFlag} onPress={jest.fn()} lastEpisodeIso={AUG_26_LOCAL_NOON} />);
    expect(getByText('Blood in a vomit photo')).toBeTruthy();
    expect(getByText('Call your vet')).toBeTruthy();
    expect(getByText('AI read of 2 logged photos · last Sep 1')).toBeTruthy();
  });

  it('the whole strip is ONE button: the ask line re-opens the card like the name does (C-6)', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(<FoldedStrip cached={safety} onPress={onPress} />);
    const strip = owningTouchable(getByTestId('insight-folded-strip'));
    expect(owningTouchable(getByText('Worth a vet visit'))).toBe(strip);
    fireEvent.press(getByText('Worth a vet visit'));
    expect(onPress).toHaveBeenCalledWith(chronicity);
  });

  it('FS-3, the runtime half: a safety strip that cannot say its ask is not drawn', () => {
    // The build half is the strip copy test; here the copy layer is made to fail so the
    // renderer's refusal is proven, not assumed (C-18: a guard is proven by mutation).
    const spy = jest.spyOn(signalCopy, 'stripAskLine').mockReturnValue(null);
    try {
      const { toJSON } = render(<FoldedStrip cached={safety} onPress={jest.fn()} />);
      expect(toJSON()).toBeNull();
      // A benign strip is untouched by the same failure — it never had an ask.
      expect(render(<FoldedStrip cached={benign} onPress={jest.fn()} />).toJSON()).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
