// The Signal fold on the zone (CUL-784, `docs/nyx-signal-fold-requirements.md` §5 / §6 / §9).
//
// The store runs FOR REAL here (the AsyncStorage jest mock underneath), so what is
// exercised is the whole path an owner exercises: the strip at rank, persistence across a
// mount (the relaunch), the record re-opening a fold with its reason, release on absence,
// a pet switch reading the other pet's own entries, and the composition rules — order is
// rank, `isLead` never moves, an all-folded zone is label + strips + doorway.
//
// The snapshot at the bottom was FIRST written against the tree as shipped (commit
// 01f3075), then updated when the DF-3 control row landed; the diff between the two is in
// this file's history and is the whole byte-level change to the nothing-folded surface.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({
  useSignal: () => mockUseSignal(),
}));
jest.mock('../../hooks/useWatchingRows', () => ({
  useWatchingRows: () => [],
}));
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../lib/signalArrival', () => ({
  hasPlayedArrival: async () => true,
  markArrivalPlayed: async () => {},
}));
jest.mock('../../lib/haptics', () => ({ insightArrival: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SignalZone } from './SignalZone';
import { facing, flat, owningTouchable } from '../../testUtils/tree';
import { usePetStore } from '../../store/petStore';
import {
  foldFingerprint,
  foldIdentity,
  foldedEntry,
  readFoldEntries,
  writeFoldEntries,
} from '../../lib/signalFold';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding, PostprandialTimingFinding } from '../../lib/signal';

const postprandialFinding: PostprandialTimingFinding = {
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 8,
  eligibleCount: 8,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 14,
  feedingFormsInEvidence: ['dry meal'],
  windowDays: 60,
};

const chronicity: CachedFinding = {
  rank: 0,
  text: "We've logged vomiting for Nyx across 5 of the last 8 weeks — 14 episodes since July.",
  finding: {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    episodeCount: 14,
    spanDays: 56,
    activeWeeks: 5,
    symptomDays: 12,
    daysSinceLastEpisode: 3,
    firstOnsetIso: '2026-07-05T12:00:00.000Z',
    tier: 'firm',
    windowDays: 56,
  },
};

const postprandial: CachedFinding = {
  rank: 1,
  text: '8 of the 8 vomiting episodes we could time for Nyx happened within 30 minutes of eating.',
  finding: postprandialFinding,
};

const reflection: CachedFinding = {
  rank: 2,
  text: 'Nyx had 2 vomiting episodes this week, down from 5 last week.',
  finding: {
    type: 'reflection',
    priorityClass: 'insight',
    symptomType: 'vomit',
    currentCount: 2,
    priorCount: 5,
    direction: 'improving',
    windowDays: 14,
  },
};

const STRIP_NAME = 'Vomiting soon after eating';
const NOW = '2026-09-03T12:00:00.000Z';
const KEY = foldIdentity(postprandialFinding);

function live(findings: CachedFinding[], over: Partial<SignalState> = {}): SignalState {
  return {
    petId: 'pet-1',
    findings,
    coverage: [],
    displayState: 'live',
    signalText: null,
    petName: 'Nyx',
    isLoading: false,
    dayNumber: 60,
    eventCount: 140,
    acknowledging: false,
    answered: true,
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  usePetStore.setState({
    pets: [
      { id: 'pet-1', name: 'Nyx' },
      { id: 'pet-2', name: 'Pixel' },
    ] as never,
  });
});

describe('SignalZone — the nothing-folded surface is the shipped surface', () => {
  it('safety lead + two benign rows, nothing folded', async () => {
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    expect(view.toJSON()).toMatchSnapshot();
    // The fold read settles to the same tree.
    await act(async () => {});
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(view.getAllByTestId('insight-face')).toHaveLength(3);
  });

  it('the visible strings are the shipped strings plus the two control verbs (and no fold control on the safety card)', async () => {
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await act(async () => {});
    expect(view.getAllByText("Why we're showing this")).toHaveLength(3);
    // Two benign cards fold; the safety card does not on this build.
    expect(view.getAllByText('Keep it compact')).toHaveLength(2);
    expect(view.getByText(chronicity.text)).toBeTruthy();
    expect(view.getByText(postprandial.text)).toBeTruthy();
    expect(view.getByText(reflection.text)).toBeTruthy();
  });

  it('a read that has not answered folds nothing, releases nothing and writes nothing (C-12)', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity], { answered: false }));
    const view = render(<SignalZone />);
    await act(async () => {});
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    // The postprandial key is ABSENT from this (unanswered) set — a reconcile would have
    // deleted it. It is still there.
    expect(await readFoldEntries('pet-1')).toHaveProperty(KEY);
  });
});

describe('SignalZone — the fold, end to end', () => {
  it('`Keep it compact` folds the card to its strip in place; focus lands on the strip (C-6); the entry persists', async () => {
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await act(async () => {});
    // The postprandial card's own control — the first `Keep it compact` in rank order.
    fireEvent.press(view.getAllByText('Keep it compact')[0]);
    const strip = await view.findByTestId('insight-folded-strip');
    expect(view.queryByText(postprandial.text)).toBeNull();
    // The name line is INSIDE the strip's touchable — the control that unmounted is replaced
    // by the row that took its place.
    expect(owningTouchable(view.getByText(STRIP_NAME))).toBe(owningTouchable(strip));
    // Persisted, so a relaunch reads it back.
    await waitFor(async () => expect(await readFoldEntries('pet-1')).toHaveProperty(KEY));
    expect((await readFoldEntries('pet-1'))?.[KEY]?.state).toBe('folded');
  });

  it('a strip stays at its rank between the same rows; a fold changes height, never position', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    // Read the stack's rows in tree order: safety face, the strip's row, reflection face.
    // CUL-788: a folded finding is still an `insight-row` (one row, one rail); the strip is
    // that row's content.
    const rows = view.getAllByTestId('insight-row');
    expect(rows).toHaveLength(3);
    const holdsStrip = (row: (typeof rows)[number]) => row.findAllByProps({ testID: 'insight-folded-strip' }).length > 0;
    expect(rows.map(holdsStrip)).toEqual([false, true, false]);
    expect(view.getByText(chronicity.text)).toBeTruthy();
    expect(view.getByText(reflection.text)).toBeTruthy();
    expect(view.queryByText(postprandial.text)).toBeNull();
  });

  it('tapping the strip re-opens to the FACE (not the expanded state) and clears the entry', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    fireEvent.press(await view.findByTestId('insight-folded-strip'));
    expect(view.getByText(postprandial.text)).toBeTruthy();
    expect(view.queryByText('Hide details')).toBeNull();
    await waitFor(async () => expect(await readFoldEntries('pet-1')).not.toHaveProperty(KEY));
  });

  it('the lead canvas is never inherited: rank 0 folded ⇒ no card wears it (DF-7)', async () => {
    const leadBenign: CachedFinding = { ...postprandial, rank: 0 };
    const second: CachedFinding = { ...reflection, rank: 1 };
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([leadBenign, second]));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    const sentence = view.getByText(reflection.text);
    // The Newsreader canvas is the lead's alone (ThemedText resolves the body face to Geist).
    expect(flat(sentence).fontFamily).not.toBe('Newsreader');
    expect(flat(sentence).fontSize).not.toBe(26);
  });

  it('all cards folded ⇒ the label, the strips, the doorway — nothing else, no zone line', async () => {
    const a: CachedFinding = { ...postprandial, rank: 0 };
    const b: CachedFinding = { ...reflection, rank: 1 };
    await writeFoldEntries('pet-1', {
      [KEY]: foldedEntry(postprandialFinding, NOW),
      [foldIdentity(b.finding)]: foldedEntry(b.finding, NOW),
    });
    mockUseSignal.mockReturnValue(live([a, b]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getAllByTestId('insight-folded-strip')).toHaveLength(2));
    expect(view.queryByTestId('insight-face')).toBeNull();
    expect(view.getByText('Signal')).toBeTruthy();
    expect(view.getByText(/See all of Nyx's patterns/)).toBeTruthy();
    expect(view.queryByText(/nothing new/i)).toBeNull();
  });

  it('the record re-opens a fold with its reason; the Back-because line clears on touch', async () => {
    // Folded at 8 timed episodes; the regen now says 9 — a new episode.
    const stored = foldedEntry({ ...postprandialFinding, rapidCount: 7, eligibleCount: 7 }, NOW);
    await writeFoldEntries('pet-1', { [KEY]: stored });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    const line = await view.findByText('Back because a new episode was logged.');
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(view.getByText(postprandial.text)).toBeTruthy();
    await waitFor(async () => expect((await readFoldEntries('pet-1'))?.[KEY]?.state).toBe('reopened'));
    // The owner touches the card: the line goes, the entry goes.
    fireEvent.press(owningTouchable(line) as never);
    expect(view.queryByText('Back because a new episode was logged.')).toBeNull();
    await waitFor(async () => expect(await readFoldEntries('pet-1')).not.toHaveProperty(KEY));
  });

  it('the regen alone (same payload) never re-opens', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    // A fresh array with byte-identical content — the daily regen.
    mockUseSignal.mockReturnValue(live([chronicity, { ...postprandial }, reflection]));
    view.rerender(<SignalZone />);
    await act(async () => {});
    expect(view.getByTestId('insight-folded-strip')).toBeTruthy();
    expect(view.queryByText(/^Back because/)).toBeNull();
  });

  it('a count aging DOWN keeps the strip (the window moved, not the pet)', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    const aged: CachedFinding = { ...postprandial, finding: { ...postprandialFinding, rapidCount: 6, eligibleCount: 6 } };
    mockUseSignal.mockReturnValue(live([chronicity, aged, reflection]));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    expect(view.getByText('6 of 6 timed within 30 min of eating')).toBeTruthy();
  });

  it('a fold whose finding is ABSENT from the answered set is released (deleted)', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, reflection]));
    render(<SignalZone />);
    await waitFor(async () => expect(await readFoldEntries('pet-1')).not.toHaveProperty(KEY));
  });

  it('a pet switch reads the other pet’s own entries, never the previous pet’s', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection], { petId: 'pet-2', petName: 'Pixel' }));
    view.rerender(<SignalZone />);
    // Pet 2 has nothing folded — the card renders open at once, and stays open once its read lands.
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    await act(async () => {});
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    view.rerender(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    // And pet 1's entry is untouched by the visit.
    expect(await readFoldEntries('pet-1')).toHaveProperty(KEY);
  });

  it('a safety card never renders a strip on this build, even with a stored entry', async () => {
    await writeFoldEntries('pet-1', {
      [foldIdentity(chronicity.finding)]: { state: 'folded', fingerprint: foldFingerprint(chronicity.finding), foldedAtIso: NOW },
    });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial]));
    const view = render(<SignalZone />);
    await act(async () => {});
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(view.getByText(chronicity.text)).toBeTruthy();
  });
});

describe('SignalZone — the control row never reaches across the hairline (C-5)', () => {
  it('a control’s downward reach and the next face’s upward reach fit inside the row paddings + the divider', async () => {
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await act(async () => {});
    const rows = view.getAllByTestId('insight-row');
    const faces = view.getAllByTestId('insight-face');
    const controls = view.getAllByTestId('insight-evidence-control');
    for (let i = 0; i + 1 < rows.length; i++) {
      const above = flat(rows[i]);
      const below = flat(rows[i + 1]);
      const separation = (above.paddingVertical ?? 0) + 1 /* the hairline */ + (below.paddingVertical ?? 0);
      expect(separation).toBeGreaterThanOrEqual(
        facing(owningTouchable(controls[i]), 'bottom') + facing(owningTouchable(faces[i + 1]), 'top'),
      );
    }
  });

  it('a strip’s upward reach and the control above it fit the same way', async () => {
    await writeFoldEntries('pet-1', { [KEY]: foldedEntry(postprandialFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    const strip = await view.findByTestId('insight-folded-strip');
    const lead = flat(view.getAllByTestId('insight-row')[0]);
    const control = owningTouchable(view.getAllByTestId('insight-evidence-control')[0]);
    const separation = (lead.paddingVertical ?? 0) + 1 + (flat(strip).paddingVertical ?? 0);
    expect(separation).toBeGreaterThanOrEqual(facing(control, 'bottom') + facing(strip, 'top'));
  });
});
