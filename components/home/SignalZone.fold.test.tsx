// The Signal fold (CUL-784, `docs/nyx-signal-fold-requirements.md` §9): the nothing-folded
// surface is pinned as a snapshot. The snapshot below was FIRST written against the shipped
// tree (before the fold primitive existed), so the diff the fold lands is inspectable in the
// snapshot file's history rather than asserted from memory — the byte-identical claim is a
// claim about that diff (the DF-3 control row is the one addition the ruling itself made).

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

import { render } from '@testing-library/react-native';
import { SignalZone } from './SignalZone';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding } from '../../lib/signal';

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
  finding: {
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
  },
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

function live(findings: CachedFinding[]): SignalState {
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
  };
}

describe('SignalZone — the nothing-folded surface is the shipped surface', () => {
  it('safety lead + two benign rows, nothing folded', () => {
    mockUseSignal.mockReturnValue(live([chronicity, postprandial, reflection]));
    expect(render(<SignalZone />).toJSON()).toMatchSnapshot();
  });
});
