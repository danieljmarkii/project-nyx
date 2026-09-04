// The Signal fold on the zone (CUL-784, `docs/nyx-signal-fold-requirements.md` §5 / §6 / §9).
//
// The store runs FOR REAL here (the AsyncStorage jest mock underneath), so what is
// exercised is the whole path an owner exercises: the strip at rank, persistence across a
// mount (the relaunch), the record re-opening a fold with its reason, release on absence,
// a pet switch reading the other pet's own entries, and the composition rules — order is
// rank, `isLead` never moves, an all-folded zone is label + strips + doorway.
//
// The snapshot at the bottom was FIRST written against the tree as shipped (commit
// 01f3075), then updated when the DF-3 control row landed, then again for CUL-785 when the
// safety card gained the same `Keep it compact` control (DF-2 — one added node, 54 lines,
// nothing else); each diff is in this file's history and together they are the whole
// byte-level change to the nothing-folded surface.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
// CUL-785: the last-episode date read (useLastEpisodeDates, §3.4) — the pet's local record,
// keyed by symptom type. Empty unless a test sets a row.
let mockLastEpisodeByType: Record<string, string | null> = {};
let mockDbThrows = false;
jest.mock('../../lib/db', () => ({
  getDb: () => ({
    getAllSync: (_sql: string, params: unknown[]) => {
      if (mockDbThrows) throw new Error('db closed');
      return [{ last: mockLastEpisodeByType[String(params[1])] ?? null }];
    },
  }),
}));

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
import type {
  CachedFinding,
  IncidentRedFlagFinding,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  StoodDownMarker,
  SymptomChronicityFinding,
} from '../../lib/signal';

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

const chronicityFinding: SymptomChronicityFinding = {
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
};
const chronicity: CachedFinding = {
  rank: 0,
  text: "We've logged vomiting for Nyx across 5 of the last 8 weeks — 14 episodes since July.",
  finding: chronicityFinding,
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
const intake: CachedFinding = { rank: 0, text: 'Nyx has eaten less than usual today — worth keeping an eye on.', finding: intakeFinding };
const redFlagFinding: IncidentRedFlagFinding = {
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: '2026-09-01T08:00:00.000Z',
  flaggedIncidentCount: 2,
  windowDays: 14,
};
const redFlag: CachedFinding = { rank: 0, text: "Photos you logged of Nyx's vomiting have shown possible blood.", finding: redFlagFinding };
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
const stoodDown: CachedFinding = { rank: 0, text: 'No vomiting logged for Nyx in 14 days — this card has stood down.', finding: stoodDownMarker };
const CKEY = foldIdentity(chronicityFinding);
// B-514: local-day fixtures from local components.
const AUG_26_LOCAL_NOON = new Date(2026, 7, 26, 12).toISOString();

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
    expiresAt: null,
    answered: true,
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockLastEpisodeByType = {};
  mockDbThrows = false;
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

  it('the visible strings are the shipped strings plus the two control verbs on every card, the safety card included (DF-2)', async () => {
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await act(async () => {});
    expect(view.getAllByText("Why we're showing this")).toHaveLength(3);
    expect(view.getAllByText('Keep it compact')).toHaveLength(3);
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
    // The postprandial card's own control — the SECOND `Keep it compact` in rank order (the
    // safety card above it folds too since CUL-785).
    fireEvent.press(view.getAllByText('Keep it compact')[1]);
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
    // Read the stack's rows in tree order: safety face, strip, reflection face.
    const rows = [
      ...view.getAllByTestId(/^insight-(row|folded-strip)$/),
    ];
    expect(rows.map((r) => r.props.testID)).toEqual(['insight-row', 'insight-folded-strip', 'insight-row']);
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

  it('an intake-decline card never renders a strip or a control on this build, even with a stored entry (CUL-785 brief A)', async () => {
    await writeFoldEntries('pet-1', {
      [foldIdentity(intakeFinding)]: { state: 'folded', fingerprint: foldFingerprint(intakeFinding), foldedAtIso: NOW },
    });
    mockUseSignal.mockReturnValue(live([intake, { ...postprandial, rank: 1 }]));
    const view = render(<SignalZone />);
    await act(async () => {});
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(view.getByText(intake.text)).toBeTruthy();
    // Only the benign card offers the control.
    expect(view.getAllByText('Keep it compact')).toHaveLength(1);
  });
});

// ── The safety strips (CUL-785, fold spec §3.1 / §3.4 / §5.3 / §6 / §9) ─────────
describe('SignalZone — the standing safety strip', () => {
  it('`Keep it compact` on the chronicity card folds it to a strip AT RANK 0, above every benign card, with rail + ask + count + date', async () => {
    mockLastEpisodeByType = { vomit: AUG_26_LOCAL_NOON };
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    const view = render(<SignalZone />);
    await act(async () => {});
    // The safety card's own control is the first in rank order.
    fireEvent.press(view.getAllByText('Keep it compact')[0]);
    const strip = await view.findByTestId('insight-folded-strip');
    expect(view.queryByText(chronicity.text)).toBeNull();
    expect(view.getByText('Recurring vomiting')).toBeTruthy();
    expect(view.getByText('Worth a vet visit')).toBeTruthy();
    expect(view.getByText('14 episodes, 5 of 8 weeks · last Aug 26')).toBeTruthy();
    expect(owningTouchable(view.getByText('Worth a vet visit'))).toBe(owningTouchable(strip));
    // Position is rank: the strip is the FIRST row; both benign faces sit beneath it (FS-5).
    const rows = view.getAllByTestId(/^insight-(row|folded-strip)$/);
    expect(rows.map((r) => r.props.testID)).toEqual(['insight-folded-strip', 'insight-row', 'insight-row']);
    // And no benign card inherited the Newsreader canvas (DF-7).
    for (const t of [postprandial.text, reflection.text]) {
      expect(flat(view.getByText(t)).fontFamily).not.toBe('Newsreader');
    }
    await waitFor(async () => expect((await readFoldEntries('pet-1'))?.[CKEY]?.state).toBe('folded'));
  });

  it('the strip is heard as name, ask, count, date — with the month in full (§7)', async () => {
    mockLastEpisodeByType = { vomit: AUG_26_LOCAL_NOON };
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial]));
    const view = render(<SignalZone />);
    const strip = await view.findByTestId('insight-folded-strip');
    expect(strip.props.accessibilityLabel).toBe('Recurring vomiting. Worth a vet visit. 14 episodes, 5 of 8 weeks, last August 26.');
  });

  it('the date is the RECORD’s, not the engine’s: a newer local episode prints even before the regen moves the finding', async () => {
    // The finding says 3 days since the last episode; the record has one from this morning.
    const thisMorning = new Date(2026, 8, 4, 7, 30).toISOString();
    mockLastEpisodeByType = { vomit: thisMorning };
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial]));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    expect(view.getByText('14 episodes, 5 of 8 weeks · last Sep 4')).toBeTruthy();
  });

  it('the RECORD wins over the engine fallback when both answer (§3.4: source of truth is the local record)', async () => {
    const thisMorning = new Date(2026, 8, 4, 7, 30).toISOString();
    mockLastEpisodeByType = { vomit: thisMorning };
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    // The expiry would derive Sep 1 (3 days before Sep 4 noon); the record says Sep 4.
    const expiresAt = new Date(2026, 8, 5, 12).toISOString();
    mockUseSignal.mockReturnValue(live([chronicity, postprandial], { expiresAt }));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    expect(view.getByText('14 episodes, 5 of 8 weeks · last Sep 4')).toBeTruthy();
    expect(view.queryByText(/last Sep 1/)).toBeNull();
  });

  it('when the record cannot be read, chronicity falls back to the engine’s recency off the cache expiry (§3.4)', async () => {
    mockDbThrows = true;
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    // The row expires Sep 5 local noon ⇒ generated Sep 4 noon ⇒ last episode 3 days before: Sep 1.
    const expiresAt = new Date(2026, 8, 5, 12).toISOString();
    mockUseSignal.mockReturnValue(live([chronicity, postprandial], { expiresAt }));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    expect(view.getByText('14 episodes, 5 of 8 weeks · last Sep 1')).toBeTruthy();
  });

  it('with neither the record nor an expiry, the count stands alone — no invented date', async () => {
    mockDbThrows = true;
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial], { expiresAt: null }));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    expect(view.getByText('14 episodes, 5 of 8 weeks')).toBeTruthy();
    expect(view.queryByText(/last /)).toBeNull();
  });

  it('a NEW episode of the same symptom re-opens the safety strip with its reason; a window aging down does not', async () => {
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    // The regen after the owner logged this morning: net-zero count (one aged out), a newer last episode.
    const netZero: CachedFinding = { ...chronicity, finding: { ...chronicityFinding, daysSinceLastEpisode: 0 } };
    mockUseSignal.mockReturnValue(live([netZero, postprandial]));
    const view = render(<SignalZone />);
    await view.findByText('Back because a new episode was logged.');
    expect(view.getByText(chronicity.text)).toBeTruthy();
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();

    // A separate mount: the count fell because the window slid — the strip stays.
    await AsyncStorage.clear();
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    const aged: CachedFinding = { ...chronicity, finding: { ...chronicityFinding, episodeCount: 11, activeWeeks: 4, daysSinceLastEpisode: 9 } };
    mockUseSignal.mockReturnValue(live([aged, postprandial]));
    const again = render(<SignalZone />);
    await again.findByTestId('insight-folded-strip');
    expect(again.getByText('11 episodes, 4 of 8 weeks')).toBeTruthy();
    expect(again.queryByText(/^Back because/)).toBeNull();
  });

  it('the vet ask changing (a tier flip) re-opens the strip with the ask line’s reason', async () => {
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry({ ...chronicityFinding, tier: 'standard' }, NOW) });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial]));
    const view = render(<SignalZone />);
    await view.findByText('Back because the vet ask changed.');
  });

  it('improving-then-relapsing: a folded course that stands down is released, and its re-fire renders as a full card', async () => {
    await writeFoldEntries('pet-1', { [CKEY]: foldedEntry(chronicityFinding, NOW) });
    // The course goes quiet: the stand-down line takes the slot, the strip is gone.
    mockUseSignal.mockReturnValue(live([{ ...postprandial, rank: 0 }, { ...stoodDown, rank: 1 }]));
    const view = render(<SignalZone />);
    await act(async () => {});
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(view.getByText(stoodDown.text)).toBeTruthy();
    await waitFor(async () => expect(await readFoldEntries('pet-1')).not.toHaveProperty(CKEY));
    // The relapse: chronicity re-fires with a SMALLER count than on the fold day — open, no strip,
    // and no Back-because (there is no memory to be back from).
    const relapse: CachedFinding = { ...chronicity, finding: { ...chronicityFinding, episodeCount: 9, activeWeeks: 3, daysSinceLastEpisode: 0 } };
    mockUseSignal.mockReturnValue(live([relapse, { ...postprandial, rank: 1 }]));
    view.rerender(<SignalZone />);
    await act(async () => {});
    expect(view.getByText(chronicity.text)).toBeTruthy();
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(view.queryByText(/^Back because/)).toBeNull();
  });

  it('all cards folded, the safety strip included: label, strips, doorway — nothing else, the ask still on screen', async () => {
    await writeFoldEntries('pet-1', {
      [CKEY]: foldedEntry(chronicityFinding, NOW),
      [KEY]: foldedEntry(postprandialFinding, NOW),
    });
    mockUseSignal.mockReturnValue(live([chronicity, postprandial]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getAllByTestId('insight-folded-strip')).toHaveLength(2));
    expect(view.queryByTestId('insight-face')).toBeNull();
    expect(view.getByText('Worth a vet visit')).toBeTruthy();
    expect(view.getByText(/See all of Nyx's patterns/)).toBeTruthy();
    expect(view.queryByText(/nothing new|all clear/i)).toBeNull();
  });
});

describe('SignalZone — the acute red-flag strip', () => {
  const RKEY = foldIdentity(redFlagFinding);

  it('folds to a strip that keeps `Call your vet` and the photo record’s day', async () => {
    mockUseSignal.mockReturnValue(live([redFlag, { ...postprandial, rank: 1 }]));
    const view = render(<SignalZone />);
    await act(async () => {});
    fireEvent.press(view.getAllByText('Keep it compact')[0]);
    await view.findByTestId('insight-folded-strip');
    expect(view.getByText('Blood in a vomit photo')).toBeTruthy();
    expect(view.getByText('Call your vet')).toBeTruthy();
    expect(view.getByText('AI read of 2 logged photos · last Sep 1')).toBeTruthy();
  });

  it('a NEWER flagged photo re-opens it the next regen; the same photo re-cached does not', async () => {
    await writeFoldEntries('pet-1', { [RKEY]: foldedEntry(redFlagFinding, NOW) });
    mockUseSignal.mockReturnValue(live([redFlag, { ...postprandial, rank: 1 }]));
    const view = render(<SignalZone />);
    await view.findByTestId('insight-folded-strip');
    expect(view.queryByText(/^Back because/)).toBeNull();
    const newer: CachedFinding = { ...redFlag, finding: { ...redFlagFinding, mostRecentFlaggedIso: '2026-09-03T08:00:00.000Z', flaggedIncidentCount: 3 } };
    mockUseSignal.mockReturnValue(live([newer, { ...postprandial, rank: 1 }]));
    view.rerender(<SignalZone />);
    await view.findByText('Back because the photo record changed.');
    expect(view.getByText(redFlag.text)).toBeTruthy();
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
