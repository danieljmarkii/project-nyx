// The trial's own screen and its route (TS-4 · CUL-1300; spec §2, §4, §6, §11 TS-4).
//
// The model's rules are asserted in `lib/trialScreenModel.test.ts` over the real loaders.
// This suite pins what only the screen can get wrong: the gate (flag-off answers with no
// namespace node and NO READ, over hooks that would answer if called — the async half the
// flag-off guard states it cannot see, C-41), which pet every read and door takes (C-9),
// the order a safety face is drawn in, the rise, the focus, the hit areas and the hand-off.

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { TrialCardInput } from '../../lib/dietTrialCard';
import { buildTrialContext } from '../../lib/dietTrial';
import type { TrialAllowedSet } from '../../lib/trialAllowedSet';
import type { DietTrialStatus } from '../../hooks/useDietTrial';
import type { TrialFactsState } from '../../hooks/useTrialFacts';

type ReactTestInstance = ReturnType<typeof render>['UNSAFE_root'];

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
const mockStackScreen = jest.fn((_props: { options: Record<string, unknown> }) => null);
jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  return {
    router: {
      push: (...a: unknown[]) => mockPush(...a),
      replace: (...a: unknown[]) => mockReplace(...a),
      back: (...a: unknown[]) => mockBack(...a),
    },
    useLocalSearchParams: () => mockParams,
    // The arrival focus runs once; a later focus re-reads (the Pet tab's rule).
    useFocusEffect: (cb: () => void) => ReactActual.useEffect(() => cb(), [cb]),
    Stack: { Screen: (props: { options: Record<string, unknown> }) => mockStackScreen(props) },
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const mockLive = jest.fn(() => true);
jest.mock('../../hooks/useTrialScreen', () => ({ useTrialScreen: () => mockLive() }));
const mockReduced = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduced() }));
const mockFocus = jest.fn();
jest.mock('../../lib/a11yFocus', () => ({ focusAccessibility: (...a: unknown[]) => mockFocus(...a) }));

// Two pets, Biscuit active; the route names Mochi (C-9).
const PETS = [
  { id: 'pet-1', name: 'Biscuit', species: 'dog' },
  { id: 'pet-2', name: 'Mochi', species: 'dog' },
];
const mockSelectPet = jest.fn();
let mockPets = PETS;
jest.mock('../../store/petStore', () => {
  const actual = jest.requireActual('../../store/petStore');
  const state = () => ({ pets: mockPets, activePet: mockPets[0] ?? null, selectPet: mockSelectPet });
  const hook = (sel: (s: ReturnType<typeof state>) => unknown) => sel(state());
  return { ...actual, usePetStore: Object.assign(hook, { getState: state }) };
});

// The reads, each ANSWERING — so an absence proves a gate, not a quiet fixture.
let mockTrial: { input: TrialCardInput | null; status: DietTrialStatus; inputIsForPet: boolean };
const mockReload = jest.fn();
const mockUseDietTrial = jest.fn((_petId: string | null) => ({
  ...mockTrial,
  isLoading: mockTrial.status === 'loading',
  reload: mockReload,
}));
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: (petId: string | null) => mockUseDietTrial(petId),
}));
let mockFacts: TrialFactsState = { status: 'ready', facts: null };
const mockUseTrialFacts = jest.fn((_petId: string | null) => mockFacts);
jest.mock('../../hooks/useTrialFacts', () => ({
  useTrialFacts: (petId: string | null) => mockUseTrialFacts(petId),
}));
let mockSet: TrialAllowedSet = { status: 'unknown' };
const mockUseTrialAllowedSet = jest.fn((_petId: string | null) => mockSet);
jest.mock('../../hooks/useTrialAllowedSet', () => ({
  useTrialAllowedSet: (petId: string | null) => mockUseTrialAllowedSet(petId),
}));
const mockReadVetVisitsHome = jest.fn(async (_petId: string) => ({
  next: { id: 'appt-1', when: 'Thursday · 9:20 am' },
}));
jest.mock('../../lib/vetVisits', () => ({
  readVetVisitsHome: (petId: string) => mockReadVetVisitsHome(petId),
}));
const mockExtendTrial = jest.fn(async () => undefined);
jest.mock('../../lib/dietTrialSetup', () => ({
  ...jest.requireActual('../../lib/dietTrialSetup'),
  extendTrial: (...a: unknown[]) => mockExtendTrial(...(a as [])),
  changeTrialWindow: jest.fn(),
}));
// The sheets are TS-3's and tested there; stubbed so this suite can drive the hand-off.
let lastSheetsProps: { onReplaceTrial: () => void; lifecycle: { manageVisible: boolean } } | null = null;
jest.mock('../trial/TrialLifecycleSheets', () => ({
  TrialLifecycleSheets: (props: { onReplaceTrial: () => void; lifecycle: { manageVisible: boolean } }) => {
    lastSheetsProps = props;
    return null;
  },
}));

import TrialRoute, { OFF_TITLE } from '../../app/trial/[pet]';
import { SIGNAL_OPEN_MOTION } from '../motion/signalOpenMotion';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = Date.now();
function keyDaysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function running(over: Partial<TrialCardInput> = {}, dayCounter = 10, target = 56): TrialCardInput {
  return {
    trial: {
      id: 't-1',
      status: 'active',
      startedAt: keyDaysAgo(dayCounter - 1),
      targetDurationDays: target,
      foodLabel: 'Royal Canin Rabbit',
    },
    nowMs: NOW,
    petName: 'Mochi',
    species: 'dog',
    coverage: { daysLogged: dayCounter, daysElapsed: dayCounter },
    exposures: { totalFeedings: 20, offDiet: 1, mayStateRecordClean: false, mostRecent: null },
    otherPetNames: [],
    ...over,
  };
}

const FOODS = [
  {
    foodItemId: 'f-1', foodKey: null, label: 'Royal Canin Rabbit', role: 'primary_diet',
    allowedFrom: keyDaysAgo(9), allowedUntil: null, primaryProtein: null, proteins: [],
  },
];
const READY_SET = {
  status: 'ready',
  trial: { id: 't-1', startedAt: keyDaysAgo(9), targetDurationDays: 56, endedAt: null, targetProtein: null },
  ctx: buildTrialContext({ id: 't-1', startedAt: keyDaysAgo(9), endedAt: null, targetDurationDays: 56 }, FOODS as never),
  foods: FOODS,
} as unknown as TrialAllowedSet;

const VOMITING = {
  trialDayNumber: 10, trialCount: 3, baselineCount: 11, trialLoggedDays: 10,
  baselineLoggedDays: 30, baselineWindowDays: 49, densityComparable: true,
};

const REFUSAL = { refusedFeedings: 4, ratedFeedings: 5, days: 2, population: 'trial_diet' as const };

beforeEach(() => {
  mockParams = { pet: 'pet-2' };
  mockPets = PETS;
  mockLive.mockReturnValue(true);
  mockReduced.mockReturnValue(false);
  mockTrial = { input: running(), status: 'loaded', inputIsForPet: true };
  mockFacts = { status: 'ready', facts: null };
  mockSet = { status: 'unknown' };
  lastSheetsProps = null;
});
afterEach(() => jest.clearAllMocks());

async function renderRoute() {
  const view = render(<TrialRoute />);
  // Let the appointment read settle.
  await act(async () => {});
  return view;
}

function stackOptions(): Record<string, unknown> {
  return (mockStackScreen.mock.calls.at(-1)![0] as { options: Record<string, unknown> }).options;
}

// ── The route: the gate and the rise ────────────────────────────────────────

describe('the route, app/trial/[pet]', () => {
  it('flag-off: the small screen, no namespace node, and NO read is issued over reads that would answer', async () => {
    mockLive.mockReturnValue(false);
    mockSet = READY_SET;
    const view = await renderRoute();
    expect(view.getByTestId('trial-route-off')).toBeTruthy();
    expect(view.getByText(OFF_TITLE)).toBeTruthy();
    expect(view.queryByTestId('trial-screen')).toBeNull();
    expect(mockUseDietTrial).not.toHaveBeenCalled();
    expect(mockUseTrialFacts).not.toHaveBeenCalled();
    expect(mockUseTrialAllowedSet).not.toHaveBeenCalled();
    expect(mockReadVetVisitsHome).not.toHaveBeenCalled();
    // …and the reads really would have answered: the same fixture flag-on draws a trial.
    mockLive.mockReturnValue(true);
    const on = await renderRoute();
    expect(on.getByTestId('trial-screen-title')).toBeTruthy();
    expect(mockUseDietTrial).toHaveBeenCalled();
    expect(mockReadVetVisitsHome).toHaveBeenCalled();
  });

  it('flag-off, the door goes to the Pet tab’s trial card', async () => {
    mockLive.mockReturnValue(false);
    const view = await renderRoute();
    fireEvent.press(view.getByTestId('trial-route-off-action'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname: '/(tabs)/profile', params: { focus: 'trial' } });
  });

  it('a malformed link answers with the small screen and reads nothing', async () => {
    mockParams = {};
    const view = await renderRoute();
    expect(view.getByTestId('trial-route-off')).toBeTruthy();
    expect(mockUseDietTrial).not.toHaveBeenCalled();
  });

  it('rises with the Signal screen’s physics; reduced motion turns the transition off', async () => {
    await renderRoute();
    expect(stackOptions()).toMatchObject({
      animation: 'slide_from_bottom',
      animationDuration: SIGNAL_OPEN_MOTION.riseMs,
      gestureEnabled: true,
    });
    mockReduced.mockReturnValue(true);
    await renderRoute();
    expect(stackOptions().animation).toBe('none');
  });
});

// ── S1: the pet comes from the route ─────────────────────────────────────────

describe('the route’s pet (S1, C-9)', () => {
  it('reads and names the route’s pet while another is active, and never switches the active pet', async () => {
    mockSet = READY_SET;
    const view = await renderRoute();
    for (const hook of [mockUseDietTrial, mockUseTrialFacts, mockUseTrialAllowedSet]) {
      expect(hook.mock.calls.every(([id]) => id === 'pet-2')).toBe(true);
    }
    expect(mockReadVetVisitsHome).toHaveBeenCalledWith('pet-2');
    expect(view.getByText('What Mochi can eat')).toBeTruthy();
    expect(mockSelectPet).not.toHaveBeenCalled();
    // Its doors take the route's pet too.
    fireEvent.press(view.getByTestId('trial-door-allowed-foods'));
    fireEvent.press(view.getByTestId('trial-door-exposures'));
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual([
      { pathname: '/trial-foods', params: { pet: 'pet-2' } },
      { pathname: '/trial-exposures', params: { pet: 'pet-2' } },
    ]);
    // /report reads the active pet, so from Mochi's screen there is no door to it (CUL-1334).
    expect(view.queryByTestId('trial-door-report')).toBeNull();
  });

  it('the active pet’s screen carries the report door and Get ready, keyed by its booking', async () => {
    mockParams = { pet: 'pet-1' };
    mockTrial = { input: running({ petName: 'Biscuit' }), status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    fireEvent.press(view.getByTestId('trial-door-get-ready'));
    fireEvent.press(view.getByTestId('trial-door-report'));
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual([
      { pathname: '/rundown', params: { appointmentId: 'appt-1' } },
      '/report',
    ]);
  });
});

// ── §4, S9: the answers that are not a trial ─────────────────────────────────

describe('loading, unreadable, no trial, unknown pet (S9)', () => {
  it('loading draws a skeleton and never the no-trial copy', async () => {
    mockTrial = { input: { ...running(), trial: null }, status: 'loading', inputIsForPet: false };
    const view = await renderRoute();
    // Hidden from assistive tech (a skeleton says nothing), so the query must look for it.
    expect(view.getByTestId('trial-screen-loading', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText(/isn’t on a diet trial/)).toBeNull();
  });

  it('unreadable says so and retries', async () => {
    mockTrial = { input: null, status: 'unreadable', inputIsForPet: false };
    const view = await renderRoute();
    expect(view.getByText('I couldn’t pull Mochi’s trial just now.')).toBeTruthy();
    fireEvent.press(view.getByTestId('trial-screen-unreadable-action'));
    expect(mockReload).toHaveBeenCalled();
  });

  it('no trial names the pet and opens the Pet tab on that pet', async () => {
    mockTrial = { input: { ...running(), trial: null }, status: 'loaded', inputIsForPet: true };
    mockFacts = { status: 'no_trial' };
    const view = await renderRoute();
    expect(view.getByText('Mochi isn’t on a diet trial right now.')).toBeTruthy();
    fireEvent.press(view.getByTestId('trial-screen-no-trial-action'));
    expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname: '/(tabs)/profile', params: { pet: 'pet-2' } });
  });

  it('an unknown pet echoes no id and goes Home', async () => {
    mockParams = { pet: 'pet-gone' };
    mockTrial = { input: null, status: 'no_pet', inputIsForPet: false };
    const view = await renderRoute();
    expect(view.getByText('This pet isn’t in your account any more.')).toBeTruthy();
    expect(view.queryByText(/pet-gone/)).toBeNull();
    fireEvent.press(view.getByTestId('trial-screen-unknown-pet-action'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});

// ── §3: the running trial ───────────────────────────────────────────────────

describe('a running trial', () => {
  it('titles with the strip’s header, lands VoiceOver there, and keeps the vomiting line inside the facts with no heading', async () => {
    mockTrial = { input: running({ trialResponse: VOMITING }), status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    expect(within(view.getByTestId('trial-screen-title')).getByText('Diet trial · day 10 of 56')).toBeTruthy();
    expect(mockFocus).toHaveBeenCalled();
    const card = view.getByTestId('trial-record-card');
    expect(within(card).getByTestId('trial-vomiting').props.children).toBe(
      "Vomiting: 3 in the trial's 10 days · 11 in the 49 days before, a longer stretch.",
    );
    expect(within(card).getByTestId('trial-qualifier')).toBeTruthy();
    expect(view.queryByText(/^Vomiting$/)).toBeNull();
    expect(view.getByTestId('trial-manage')).toBeTruthy();
  });

  it('every door row is a button at least 44pt tall (C-5)', async () => {
    mockParams = { pet: 'pet-1' };
    mockSet = READY_SET;
    mockTrial = { input: running({ petName: 'Biscuit' }), status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    const doors = [
      'trial-door-allowed-foods', 'trial-door-exposures', 'trial-door-get-ready', 'trial-door-report', 'trial-manage',
    ];
    for (const id of doors) {
      const node = view.getByTestId(id);
      expect(node.props.accessibilityRole).toBe('button');
      expect(StyleSheet.flatten(node.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('Manage the trial opens the lifecycle’s door; Replace hands off to the Pet tab once, for this pet', async () => {
    const view = await renderRoute();
    expect(lastSheetsProps!.lifecycle.manageVisible).toBe(false);
    fireEvent.press(view.getByTestId('trial-manage'));
    expect(lastSheetsProps!.lifecycle.manageVisible).toBe(true);
    act(() => lastSheetsProps!.onReplaceTrial());
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({
      pathname: '/(tabs)/profile',
      params: { pet: 'pet-2', open: 'start_trial' },
    });
    expect(mockSelectPet).not.toHaveBeenCalled();
  });
});

describe('a trial refusal (§3.2, S4)', () => {
  it('draws the safety block first, then the doors, then only the card’s own action', async () => {
    mockParams = { pet: 'pet-1' };
    mockTrial = {
      input: running({ petName: 'Biscuit', trialDietRefusal: REFUSAL, trialResponse: VOMITING }),
      status: 'loaded',
      inputIsForPet: true,
    };
    const view = await renderRoute();
    const order = ['trial-screen-title', 'trial-safety', 'trial-door-report', 'trial-action-trial_manage'];
    // Document order of every composite carrying a testID, first appearance each.
    const all: ReactTestInstance[] = view.UNSAFE_root.findAll(
      (n: ReactTestInstance) => typeof n.props.testID === 'string' && typeof n.type !== 'string',
    );
    const ids: string[] = all.map((n) => n.props.testID as string);
    const seen = ids.filter((id, i) => ids.indexOf(id) === i);
    const positions = order.map((id) => seen.indexOf(id));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    expect(within(view.getByTestId('trial-safety')).getAllByTestId('trial-safety-line')[0].props.children).toBe(
      '4 feedings of the 5 trial-diet feedings you’ve rated were left unfinished, across 2 days.',
    );
    expect(view.queryByTestId('trial-ledger')).toBeNull();
    expect(view.queryByTestId('trial-action-trial_stopped_early')).toBeNull();
    expect(view.queryByTestId('trial-action-trial_extend')).toBeNull();
    expect(view.queryByTestId('trial-manage')).toBeNull();
    expect(view.queryByTestId('trial-vomiting')).toBeNull();
    expect(view.queryByText(/^Meals logged on/)).toBeNull();
  });
});

describe('the milestone (§3.9)', () => {
  it('draws the three choices inline; Keep going writes once through the shared host', async () => {
    mockTrial = { input: running({}, 56, 56), status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    expect(view.getByTestId('trial-headline').props.children).toBe('Day 56 of 56 — the window you set is done.');
    const decision = view.getByTestId('trial-decision');
    expect(within(decision).getByText('Keep going — 4 more weeks')).toBeTruthy();
    expect(within(decision).getByText('This trial is done')).toBeTruthy();
    expect(within(decision).getByText('Stopped early')).toBeTruthy();
    expect(view.queryByTestId('trial-ledger')).toBeNull();
    expect(view.queryByText(/^Meals logged on/)).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('trial-action-trial_extend'));
    });
    expect(mockExtendTrial).toHaveBeenCalledTimes(1);
    expect(mockExtendTrial.mock.calls[0]).toEqual([
      expect.objectContaining({ trialId: 't-1' }),
    ]);
  });
});
