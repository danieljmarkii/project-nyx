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
import { localDayIndexOf } from '../../lib/utils';
import type { DietTrialStatus } from '../../hooks/useDietTrial';
import type { TrialFactsState } from '../../hooks/useTrialFacts';

type ReactTestInstance = ReturnType<typeof render>['UNSAFE_root'];

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

let mockLastFocus: (() => void) | null = null;
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
    // The arrival focus runs once; a later focus re-reads (the Pet tab's rule). The latest
    // callback is kept so a test can deliver a second focus.
    useFocusEffect: (cb: () => void) => {
      mockLastFocus = cb;
      ReactActual.useEffect(() => cb(), [cb]);
    },
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
// TS-9: the Signal door's gate and read. Design v2 defaults OFF, so every case above the
// Signal door block renders the screen as it was before the door existed.
const mockDesignV2 = jest.fn(() => false);
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => mockDesignV2() }));
const mockReadSignalCache = jest.fn(async (_petId: string): Promise<unknown> => null);
jest.mock('../../lib/signal', () => ({
  ...jest.requireActual('../../lib/signal'),
  readSignalCache: (petId: string) => mockReadSignalCache(petId),
}));
const mockFocus = jest.fn();
jest.mock('../../lib/a11yFocus', () => ({ focusAccessibility: (...a: unknown[]) => mockFocus(...a) }));

// Two pets, Biscuit active; the route names Mochi (C-9).
const PETS = [
  { id: 'pet-1', name: 'Biscuit', species: 'dog' },
  { id: 'pet-2', name: 'Mochi', species: 'dog' },
];
const mockSelectPet = jest.fn();
let mockPets = PETS;
// CUL-1336: whether the pet list has answered, apart from what it holds.
let mockPetsLoaded = true;
jest.mock('../../store/petStore', () => {
  const actual = jest.requireActual('../../store/petStore');
  const state = () => ({
    pets: mockPets,
    petsLoaded: mockPetsLoaded,
    activePet: mockPets[0] ?? null,
    selectPet: mockSelectPet,
  });
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
const mockFactsReload = jest.fn();
const mockUseTrialFacts = jest.fn((_petId: string | null) => ({ ...mockFacts, reload: mockFactsReload }));
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

import TrialRoute, { BAD_LINK_BODY, OFF_BODY, OFF_TITLE } from '../../app/trial/[pet]';
import { SIGNAL_OPEN_MOTION } from '../motion/signalOpenMotion';
import { useSyncStore } from '../../store/syncStore';

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
  trialDayNumber: 10, trialCount: 3, trialLastEpisodeDayIndex: localDayIndexOf(keyDaysAgo(1)),
  baselineCount: 11, trialLoggedDays: 10, baselineLoggedDays: 30, baselineWindowDays: 49,
  densityComparable: true,
};

const REFUSAL = { refusedFeedings: 4, ratedFeedings: 5, days: 2, population: 'trial_diet' as const };

beforeEach(() => {
  mockParams = { pet: 'pet-2' };
  mockPets = PETS;
  mockPetsLoaded = true;
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

  it('a malformed link answers with the small screen and reads nothing, and says the link is the problem', async () => {
    mockParams = {};
    const view = await renderRoute();
    expect(view.getByTestId('trial-route-off')).toBeTruthy();
    expect(view.getByText(BAD_LINK_BODY)).toBeTruthy();
    expect(view.queryByText(OFF_BODY)).toBeNull();
    expect(mockUseDietTrial).not.toHaveBeenCalled();
  });

  it('coming back to the screen re-reads the trial; arriving does not read twice', async () => {
    await renderRoute();
    expect(mockReload).not.toHaveBeenCalled();
    act(() => mockLastFocus!());
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  // CUL-1336: back from `/trial-foods`, the ledger's facts re-read with the card, or the
  // card's new coverage sits beside a grid from before the edit (and the S3 check drops it).
  it('coming back re-reads the ledger’s facts too; arriving does not', async () => {
    await renderRoute();
    expect(mockFactsReload).not.toHaveBeenCalled();
    act(() => mockLastFocus!());
    expect(mockFactsReload).toHaveBeenCalledTimes(1);
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
  });

  it('a pet that is not the active one opens ITS report, not the active pet’s (CUL-1334)', async () => {
    // Biscuit is active; the route names Mochi. The door is drawn, and it names Mochi.
    const view = await renderRoute();
    fireEvent.press(view.getByTestId('trial-door-report'));
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual([
      { pathname: '/report', params: { pet: 'pet-2' } },
    ]);
  });

  it('the completed card’s Open vet report opens the route pet’s report too (CUL-1334)', async () => {
    const ended = running(
      { trial: { ...running({}, 60, 56).trial!, status: 'completed', endedAt: keyDaysAgo(4) } },
      60,
      56,
    );
    mockTrial = { input: ended, status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    // S8: the action IS the report's door, so there is no second one beside it.
    expect(view.queryByTestId('trial-door-report')).toBeNull();
    fireEvent.press(view.getByTestId('trial-action-open_report'));
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual([
      { pathname: '/report', params: { pet: 'pet-2' } },
    ]);
  });

  it('the active pet’s screen carries the report door and Get ready, keyed by its booking', async () => {
    mockParams = { pet: 'pet-1' };
    mockTrial = { input: running({ petName: 'Biscuit' }), status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    fireEvent.press(view.getByTestId('trial-door-get-ready'));
    fireEvent.press(view.getByTestId('trial-door-report'));
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual([
      { pathname: '/rundown', params: { appointmentId: 'appt-1' } },
      { pathname: '/report', params: { pet: 'pet-1' } },
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

  // CUL-1336: an account with no active pets holds `[]`, the same as a cold start. The
  // list's own answered flag tells them apart.
  it('an account with no pets, once the list has answered, is "not in your account", never a skeleton', async () => {
    mockPets = [];
    mockTrial = { input: null, status: 'no_pet', inputIsForPet: false };
    const view = await renderRoute();
    expect(view.getByText('This pet isn’t in your account any more.')).toBeTruthy();
    expect(view.queryByTestId('trial-screen-loading', { includeHiddenElements: true })).toBeNull();
  });

  it('an empty list that has not answered yet is still loading', async () => {
    mockPets = [];
    mockPetsLoaded = false;
    mockTrial = { input: null, status: 'no_pet', inputIsForPet: false };
    const view = await renderRoute();
    expect(view.getByTestId('trial-screen-loading', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText('This pet isn’t in your account any more.')).toBeNull();
  });

  it('a ledger read that failed says so where the ledger would be, and retries that read', async () => {
    mockFacts = { status: 'unreadable' };
    const view = await renderRoute();
    const box = view.getByTestId('trial-ledger-unreadable');
    expect(within(box).getByText('I couldn’t pull Mochi’s week-by-week record just now.')).toBeTruthy();
    // Inside the record card, with the card's facts still drawn below it.
    expect(within(view.getByTestId('trial-record-card')).getByTestId('trial-ledger-unreadable')).toBeTruthy();
    fireEvent.press(within(box).getByRole('button', { name: 'Try again' }));
    expect(mockFactsReload).toHaveBeenCalledTimes(1);
    // The trial read answered; only the ledger's is retried.
    expect(mockReload).not.toHaveBeenCalled();
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
    const order = [
      'trial-screen-title', 'trial-safety', 'trial-for-the-call', 'trial-door-report', 'trial-action-trial_manage',
    ];
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

  it('carries For the call inside the safety block, under the register (§3.3, TS-7)', async () => {
    mockParams = { pet: 'pet-1' };
    mockTrial = {
      input: running({ petName: 'Biscuit', trialDietRefusal: REFUSAL, trialResponse: VOMITING }),
      status: 'loaded',
      inputIsForPet: true,
    };
    const view = await renderRoute();
    // Inside the one accessible element, so VoiceOver reads the fact, the ask and the call
    // facts together.
    const call = within(view.getByTestId('trial-safety')).getByTestId('trial-for-the-call');
    expect(within(call).getByText('For the call')).toBeTruthy();
    const lines = within(call).getAllByTestId('trial-for-the-call-line').map((n) => n.props.children);
    expect(lines[0]).toBe('Offered: Royal Canin Rabbit');
    expect(lines[1]).toBe('Day 10 of the trial');
    expect(lines[2]).toMatch(/^Vomiting logged: 3 in the trial's 10 days, the last on [A-Z][a-z]{2} \d{1,2}(, \d{4})?$/);
    expect(lines).toHaveLength(3);
    expect(within(call).getByTestId('trial-for-the-call-swap').props.children).toBe(
      'Veterinary diets are usually guaranteed, so the clinic can swap this one if Biscuit isn’t eating it.',
    );
  });

  it('draws no For the call on an intake decline (refusal face only, PM 2026-09-27)', async () => {
    mockParams = { pet: 'pet-1' };
    mockTrial = {
      input: running({
        petName: 'Biscuit',
        trialDietRefusal: REFUSAL,
        intakeDeclineHeadline: 'Biscuit has left most of his food for 3 days.',
      }),
      status: 'loaded',
      inputIsForPet: true,
    };
    const view = await renderRoute();
    expect(view.getByTestId('trial-safety')).toBeTruthy();
    expect(view.queryByTestId('trial-for-the-call')).toBeNull();
  });
});

describe('an intake decline (§3.2, CUL-1339 #2)', () => {
  it('draws the safety block first, then the doors, then Manage the trial', async () => {
    mockParams = { pet: 'pet-1' };
    mockTrial = {
      input: running({ petName: 'Biscuit', intakeDeclineHeadline: 'Biscuit has eaten less than usual for 2 days.' }),
      status: 'loaded',
      inputIsForPet: true,
    };
    const view = await renderRoute();
    const order = ['trial-screen-title', 'trial-safety', 'trial-door-report', 'trial-manage'];
    const all: ReactTestInstance[] = view.UNSAFE_root.findAll(
      (n: ReactTestInstance) => typeof n.props.testID === 'string' && typeof n.type !== 'string',
    );
    const ids: string[] = all.map((n) => n.props.testID as string);
    const seen = ids.filter((id, i) => ids.indexOf(id) === i);
    const positions = order.map((id) => seen.indexOf(id));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(within(view.getByTestId('trial-safety')).getAllByTestId('trial-safety-line')[0].props.children).toBe(
      'Biscuit has eaten less than usual for 2 days.',
    );
    expect(view.queryByTestId('trial-ledger')).toBeNull();
    expect(view.queryByTestId('trial-action-trial_stopped_early')).toBeNull();
    // It opens the same two-row door (change the window · replace the trial), nothing else.
    expect(lastSheetsProps!.lifecycle.manageVisible).toBe(false);
    fireEvent.press(view.getByTestId('trial-manage'));
    expect(lastSheetsProps!.lifecycle.manageVisible).toBe(true);
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

// ── §3.7 (TS-9): the door to the Signal's trial finding ─────────────────────────

describe('the Signal door (TS-9)', () => {
  const trialFinding = (dir: 'fewer_during_trial' | 'more_during_trial') => ({
    type: 'trial_response',
    priorityClass: 'insight',
    trialDayNumber: 10,
    targetDurationDays: 56,
    trialLoggedDays: 10,
    baselineLoggedDays: 30,
    baselineWindowDays: 49,
    pooledTrialCount: 3,
    pooledBaselineCount: 11,
    rapid: { trial: 1, baseline: 4 },
    long: { trial: 0, baseline: 0 },
    rapidWindowMinutes: 30,
    longGapHours: 6,
    treatShare: { trial: null, baseline: null },
    mealsPerDay: { trial: null, baseline: null },
    comparisonDirection: dir,
    trialWindowDays: 10,
  });
  const cacheWith = (dir: 'fewer_during_trial' | 'more_during_trial') => ({
    signalText: null,
    isBuilding: false,
    findings: [{ rank: 0, text: 'sentence', finding: trialFinding(dir) }],
    coverage: [],
    generatedAt: null,
    expiresAt: '2099-01-01T00:00:00Z',
  });

  beforeEach(() => {
    mockReadSignalCache.mockImplementation(async () => cacheWith('fewer_during_trial'));
  });

  it('Design v2 off: no door, and the Signal cache is never read, over a cache that would answer', async () => {
    mockTrial = { input: running({ trialResponse: VOMITING }), status: 'loaded', inputIsForPet: true };
    const off = await renderRoute();
    expect(off.getByTestId('trial-record-card')).toBeTruthy();
    expect(off.queryByTestId('trial-door-signal')).toBeNull();
    expect(mockReadSignalCache).not.toHaveBeenCalled();
    // …and it would have answered: the same fixture with the gate on draws the door.
    mockDesignV2.mockReturnValue(true);
    const on = await renderRoute();
    expect(on.getByTestId('trial-door-signal')).toBeTruthy();
    mockDesignV2.mockReturnValue(false);
  });

  it('Design v2 on: the door names the Signal screen, sits under the facts card, and pushes the route’s pet once', async () => {
    mockDesignV2.mockReturnValue(true);
    mockTrial = { input: running({ trialResponse: VOMITING }), status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    expect(mockReadSignalCache.mock.calls.every(([id]) => id === 'pet-2')).toBe(true);
    const row = view.getByTestId('trial-door-signal');
    expect(row.props.accessibilityLabel).toBe('Diet trial, day 10 of 56, Vomiting, from the Signal');
    expect(within(row).getByText('Vomiting, from the Signal')).toBeTruthy();
    // Directly after the facts card, before the exposures door (§3.7).
    const ids = view.queryAllByTestId(/^trial-/).map((n) => String(n.props.testID));
    const seq = ids.filter((id, i) => ids.indexOf(id) === i);
    expect(seq.indexOf('trial-door-signal')).toBeGreaterThan(seq.indexOf('trial-record-card'));
    expect(seq.indexOf('trial-door-signal')).toBeLessThan(seq.indexOf('trial-door-exposures'));
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/signal/trial_response?pet=pet-2');
    mockDesignV2.mockReturnValue(false);
  });

  it('a falling pair over a refusing pet has no door (Home draws no card); a rising one keeps it on the safety face', async () => {
    mockDesignV2.mockReturnValue(true);
    mockTrial = {
      input: running({ petName: 'Biscuit', trialDietRefusal: REFUSAL, trialResponse: VOMITING }),
      status: 'loaded',
      inputIsForPet: true,
    };
    const falling = await renderRoute();
    expect(falling.getByTestId('trial-safety')).toBeTruthy();
    expect(falling.queryByTestId('trial-door-signal')).toBeNull();
    expect(mockReadSignalCache).toHaveBeenCalled();

    mockReadSignalCache.mockImplementation(async () => cacheWith('more_during_trial'));
    const rising = await renderRoute();
    expect(rising.getByTestId('trial-safety')).toBeTruthy();
    expect(rising.getByTestId('trial-door-signal')).toBeTruthy();
    mockDesignV2.mockReturnValue(false);
  });

  // The adversarial pass's counterexample: a regen that flips the pair's direction while this
  // screen is open must move the door with Home, which re-reads on the signal tick.
  it('a regen that lands while the screen is open re-reads: a door Home drops goes, one it adds comes', async () => {
    mockDesignV2.mockReturnValue(true);
    mockTrial = {
      input: running({ petName: 'Biscuit', trialDietRefusal: REFUSAL, trialResponse: VOMITING }),
      status: 'loaded',
      inputIsForPet: true,
    };
    mockReadSignalCache.mockImplementation(async () => cacheWith('more_during_trial'));
    const view = await renderRoute();
    expect(view.getByTestId('trial-door-signal')).toBeTruthy();

    mockReadSignalCache.mockImplementation(async () => cacheWith('fewer_during_trial'));
    await act(async () => {
      useSyncStore.getState().bumpSignalTick();
    });
    expect(view.queryByTestId('trial-door-signal')).toBeNull();

    mockReadSignalCache.mockImplementation(async () => cacheWith('more_during_trial'));
    await act(async () => {
      useSyncStore.getState().bumpSignalTick();
    });
    expect(view.getByTestId('trial-door-signal')).toBeTruthy();
    mockDesignV2.mockReturnValue(false);
  });

  it('a failed cache read draws no door and leaves the screen whole', async () => {
    mockDesignV2.mockReturnValue(true);
    mockReadSignalCache.mockImplementation(async () => {
      throw new Error('offline');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockTrial = { input: running({ trialResponse: VOMITING }), status: 'loaded', inputIsForPet: true };
    const view = await renderRoute();
    expect(view.queryByTestId('trial-door-signal')).toBeNull();
    expect(view.getByTestId('trial-vomiting')).toBeTruthy();
    warn.mockRestore();
    mockDesignV2.mockReturnValue(false);
  });
});
