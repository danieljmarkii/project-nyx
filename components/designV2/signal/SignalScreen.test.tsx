// The Signal's own screen and its route (D2-3 · CUL-1065). The model is the REAL builder
// over a production-shaped fixture (C-35) — the mock's Thursday, the rabbit trial, Cerenia
// inside the window, nine photographed episodes — and the loader alone is stubbed, so the
// sections, the words and the order are the shipped ones. The route is rendered both
// ways: flag-off it draws the inline screen and issues no read (the flag-off guard's
// stated async blind spot, paid here); flag-on it mounts the screen for the route's pet.

jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
const mockLoadSignalScreen = jest.fn();
jest.mock('../../../lib/signalScreen', () => {
  const actual = jest.requireActual('../../../lib/signalScreen');
  return { ...actual, loadSignalScreen: (...a: unknown[]) => mockLoadSignalScreen(...a) };
});
const mockReduced = jest.fn(() => false);
jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduced() }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../../hooks/useLastEpisodeDates', () => ({ readLastEpisodeIso: () => '2026-09-17T22:11:00.000Z' }));
const mockWriteFoldEntries = jest.fn(async (..._a: unknown[]) => undefined);
const mockReadFoldEntries = jest.fn(async (..._a: unknown[]) => ({}));
jest.mock('../../../lib/signalFold', () => {
  const actual = jest.requireActual('../../../lib/signalFold');
  return {
    ...actual,
    readFoldEntries: (...a: unknown[]) => mockReadFoldEntries(...a),
    writeFoldEntries: (...a: unknown[]) => mockWriteFoldEntries(...a),
  };
});
jest.mock('../../../lib/storage', () => ({ getSignedUrl: jest.fn(async () => 'https://signed.example/tile.jpg') }));
const mockRouter = { back: jest.fn(), push: jest.fn() };
const mockStackScreen = jest.fn((..._a: unknown[]) => null);
let mockParams: Record<string, string> = {};
// The factory reads the `mock*` bindings LAZILY (jest hoists the mock above the consts).
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockRouter.back(...a), push: (...a: unknown[]) => mockRouter.push(...a) },
  Stack: { Screen: (props: unknown) => mockStackScreen(props) },
  useLocalSearchParams: () => mockParams,
}));
const mockFocus = jest.fn((..._a: unknown[]) => true);
jest.mock('../../../lib/a11yFocus', () => ({ focusAccessibility: (...a: unknown[]) => mockFocus(...a) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
const mockUseDesignV2 = jest.fn(() => false);
jest.mock('../../../hooks/useDesignV2', () => ({ useDesignV2: () => mockUseDesignV2() }));

import { act, configure, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { SignalScreen, KEEP_COMPACT_LABEL, SCRIPT_TITLE, WHY_TITLE } from './SignalScreen';
import { NO_READ_LABEL } from './EpisodeGallery';
import SignalRoute, { OFF_TITLE } from '../../../app/signal/[id]';
import { INCIDENT_REC_LABEL as REC_LABEL } from '../../../lib/incidentReadState';
import { buildSignalScreenModel, type SignalScreenEpisode, type SignalScreenInput } from '../../../lib/signalScreen';
import type { CachedFinding, IntakeDeclineFinding, SymptomChronicityFinding } from '../../../lib/signal';
import { SIGNAL_OPEN_MOTION } from '../../motion/signalOpenMotion';
import { dayKeyFromIndex, localDayIndexOf } from '../../../lib/utils';

const shift = (key: string, d: number) => dayKeyFromIndex((localDayIndexOf(key) as number) + d);
const THURSDAY = '2026-09-17';
const TRIAL_START = '2026-07-25';

const chronicity: SymptomChronicityFinding = {
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 21,
  spanDays: 55,
  activeWeeks: 7,
  symptomDays: 18,
  daysSinceLastEpisode: 0,
  firstOnsetIso: '2026-07-01T00:00:00Z',
  tier: 'firm',
  windowDays: 56,
};
const benign: CachedFinding = {
  rank: 0,
  text: 'Nyx has vomited 21 times in the trial’s 55 days, against 19 in the 55 before.',
  finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 3, direction: 'flat', windowDays: 14 },
};
const safety: CachedFinding = { rank: 0, text: 'Nyx has vomited 21 times across 7 of the last 8 weeks. Worth a vet visit.', finding: chronicity };

function episode(dayKey: string, hour: number, over: Partial<SignalScreenEpisode> = {}): SignalScreenEpisode {
  const [y, m, d] = dayKey.split('-').map(Number);
  return {
    eventId: `ev-${dayKey}-${hour}`,
    occurredAt: new Date(y, m - 1, d, hour, 11).toISOString(),
    dayKey,
    minutesSinceMeal: null,
    photo: null,
    ...over,
  };
}

function input(cached: CachedFinding): SignalScreenInput {
  const episodes: SignalScreenEpisode[] = [];
  for (let i = 0; i < 21; i++) episodes.push(episode(shift(TRIAL_START, (i * 13) % 55), 17, { minutesSinceMeal: i % 3 === 0 ? 3 + i : null }));
  for (let i = 0; i < 19; i++) episodes.push(episode(shift(TRIAL_START, -1 - ((i * 7) % 55)), 9));
  const photographed = episodes.slice(0, 9);
  for (const e of photographed) e.photo = { localUri: null, storagePath: `pet/${e.eventId}/photo.jpg` };
  const loggedDays: string[] = [];
  for (let i = -70; i <= 0; i++) loggedDays.push(shift(THURSDAY, i));
  return {
    cached,
    petName: 'Nyx',
    today: THURSDAY,
    trial: { startDay: TRIAL_START, identity: 'Rabbit trial', dayCounter: 55, targetDays: 56, foodLabel: 'Royal Canin Selected Protein PR' },
    episodes,
    loggedDays,
    recordStart: shift(THURSDAY, -200),
    verdicts: {
      [photographed[0].eventId]: 'monitor',
      [photographed[1].eventId]: 'monitor',
      [photographed[2].eventId]: 'worth_a_call',
      [photographed[3].eventId]: 'not_enough_to_say',
      [photographed[4].eventId]: null,
    },
    doses: ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map((dayKey) => ({ drugLabel: 'Cerenia', dayKey })),
  };
}

const ready = (cached: CachedFinding) => ({ status: 'ready' as const, model: buildSignalScreenModel(input(cached)), petName: 'Nyx' });

/** Every string rendered anywhere in the tree. */
function allText(json: unknown, out: string[] = []): string[] {
  if (json == null) return out;
  if (typeof json === 'string') {
    out.push(json);
    return out;
  }
  if (Array.isArray(json)) {
    for (const c of json) allText(c, out);
    return out;
  }
  const node = json as { children?: unknown };
  allText(node.children, out);
  return out;
}

/** The testIDs in tree order. */
function testIds(json: unknown, out: string[] = []): string[] {
  if (json == null || typeof json !== 'object') return out;
  if (Array.isArray(json)) {
    for (const c of json) testIds(c, out);
    return out;
  }
  const node = json as { props?: { testID?: string }; children?: unknown };
  if (node.props?.testID) out.push(node.props.testID);
  testIds(node.children, out);
  return out;
}

// The charts hide their drawn nodes from assistive tech behind one spoken label; the
// queries here read the drawing (the chart suites' own setting).
configure({ defaultIncludeHiddenElements: true });

beforeEach(() => {
  jest.clearAllMocks();
  mockReduced.mockReturnValue(false);
  mockUseDesignV2.mockReturnValue(false);
  mockParams = {};
});

describe('SignalScreen — the sections, in the ruled order', () => {
  it('title · bars · sentence · compare · lanes · episodes · why · keep it compact', async () => {
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    await waitFor(() => expect(view.getByTestId('signal-screen-body')).toBeTruthy());
    const ids = testIds(view.toJSON());
    const order = [
      'signal-screen-title',
      'signal-section-weekly',
      'signal-section-sentence',
      'signal-section-compare',
      'signal-section-lanes',
      'signal-section-episodes',
      'signal-section-why',
      'signal-section-fold',
    ].map((id) => ids.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(view.queryByTestId('signal-section-script')).toBeNull();
    expect(mockLoadSignalScreen).toHaveBeenCalledWith('pet-1', 'reflection:vomit');
  });

  it('the compare says "logged N of M days" for both windows and adjudicates nothing; the lanes carry the untimed line', async () => {
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    await waitFor(() => expect(view.getByTestId('compare-bars')).toBeTruthy());
    expect(view.getByTestId('compare-coverage-0').props.children).toMatch(/^logged \d+ of 55 days$/);
    expect(view.getByTestId('compare-coverage-1').props.children).toMatch(/^logged \d+ of 55 days$/);
    expect(view.getByTestId('timing-untimed-line').props.children).toMatch(/couldn't be timed against a meal/);
    const text = allText(view.toJSON()).join(' ').toLowerCase();
    expect(text).not.toMatch(/\bfair/);
  });

  it('every photographed episode carries its OWN read in the shipped words; no aggregate verdict anywhere', async () => {
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    await waitFor(() => expect(view.getByTestId('episode-gallery')).toBeTruthy());
    const model = ready(benign).model;
    const tiles = model.episodes?.tiles ?? [];
    expect(tiles).toHaveLength(9);
    for (const tile of tiles) {
      const verdict = view.getByTestId(`episode-verdict-${tile.eventId}`);
      expect(verdict.props.children).toBe(tile.verdict ? REC_LABEL[tile.verdict] : NO_READ_LABEL);
      const door = view.getByTestId(`episode-tile-${tile.eventId}`);
      expect(door.props.accessibilityLabel).toMatch(tile.verdict ? new RegExp(`photographed, read as ${REC_LABEL[tile.verdict]}$`) : /photographed, no read yet$/);
    }
    expect(view.getByTestId('episode-count-line').props.children).toBe(model.episodes?.countLine);
    const text = allText(view.toJSON()).join(' ').toLowerCase();
    expect(text).not.toContain('the other');
    // A tile is a door to its record.
    fireEvent.press(view.getByTestId(`episode-tile-${tiles[0].eventId}`));
    expect(mockRouter.push).toHaveBeenCalledWith(`/event/${tiles[0].eventId}`);
  });

  it('"Why" names Cerenia inside the trial window, and the diet line', async () => {
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    await waitFor(() => expect(view.getByText(WHY_TITLE)).toBeTruthy());
    expect(view.getByText("Cerenia was given Sep 9–12, inside the trial's 55 days.")).toBeTruthy();
    expect(view.getByText('Day 55 of 56 on Royal Canin Selected Protein PR.')).toBeTruthy();
  });

  it('a safety finding gets the screen too, with the phone script after the why', async () => {
    mockLoadSignalScreen.mockResolvedValue(ready(safety));
    const view = render(<SignalScreen petId="pet-1" identity="symptom_chronicity:vomit" />);
    await waitFor(() => expect(view.getByText(SCRIPT_TITLE)).toBeTruthy());
    const ids = testIds(view.toJSON());
    expect(ids.indexOf('signal-section-script')).toBeGreaterThan(ids.indexOf('signal-section-why'));
    expect(ids.indexOf('signal-section-script')).toBeLessThan(ids.indexOf('signal-section-fold'));
    expect(view.getByTestId('signal-screen-title')).toBeTruthy();
  });

  it('VoiceOver focus is asked onto the title when the model arrives (the wiring; the focus itself is the device pass)', async () => {
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    expect(mockFocus).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByTestId('signal-screen-title')).toBeTruthy());
    await waitFor(() => expect(mockFocus).toHaveBeenCalledTimes(1));
    // The node handed over is the title's — a mounted host node, not null.
    expect(mockFocus.mock.calls[0][0]).toBeTruthy();
    expect(view.getByTestId('signal-screen-title').props.accessibilityRole).toBe('header');
  });

  it('the opening: the landing is armed once on arrival; reduced motion arms nothing', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    await waitFor(() => expect(view.getByTestId('signal-section-sentence')).toBeTruthy());
    // The landing's two values: delay 200 over the fold's 300 (a bar's own stagger can also
    // reach 200ms, at the fold's 420 — told apart by the duration).
    const isLanding = (c: unknown[]) => {
      const o = c[1] as { delay?: number; duration?: number };
      return o.delay === SIGNAL_OPEN_MOTION.landDelayMs && o.duration === SIGNAL_OPEN_MOTION.landMs;
    };
    const landing = timing.mock.calls.filter(isLanding);
    expect(landing).toHaveLength(2);
    view.unmount();
    timing.mockClear();
    mockReduced.mockReturnValue(true);
    const still = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    await waitFor(() => expect(still.getByTestId('signal-section-sentence')).toBeTruthy());
    expect(timing.mock.calls.filter(isLanding)).toHaveLength(0);
    timing.mockRestore();
  });

  it('"Keep it compact on Home" writes the same fold entry Home writes, for the route’s pet, then goes back', async () => {
    mockLoadSignalScreen.mockResolvedValue(ready(safety));
    const view = render(<SignalScreen petId="pet-1" identity="symptom_chronicity:vomit" />);
    await waitFor(() => expect(view.getByText(KEEP_COMPACT_LABEL)).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId('signal-keep-compact'));
    });
    await waitFor(() => expect(mockWriteFoldEntries).toHaveBeenCalledTimes(1));
    const [petId, entries] = mockWriteFoldEntries.mock.calls[0] as unknown as [string, Record<string, { state: string; fingerprint: Record<string, unknown> }>];
    expect(petId).toBe('pet-1');
    expect(entries['symptom_chronicity:vomit'].state).toBe('folded');
    // The standing safety type carries the record's witness (CUL-785).
    expect(entries['symptom_chronicity:vomit'].fingerprint['record.lastEpisodeIso']).toBe('2026-09-17T22:11:00.000Z');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('the missing state names the route’s pet, never the active one (C-9)', async () => {
    mockLoadSignalScreen.mockResolvedValue({ status: 'missing', petName: 'Nyx' });
    const view = render(<SignalScreen petId="pet-1" identity="reflection:vomit" />);
    await waitFor(() => expect(view.getByTestId('signal-screen-missing')).toBeTruthy());
    expect(view.getByText("This signal isn't in Nyx's picture any more.")).toBeTruthy();
  });

  it('an intake decline: title + sentence + why + script, no charts, no gallery, no fold control', async () => {
    const intake: IntakeDeclineFinding = { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 3, refusedFoodLabel: null, ratedMealsConsidered: 9 };
    mockLoadSignalScreen.mockResolvedValue(ready({ rank: 0, text: 'Nyx has eaten less than usual for 3 days. Call your vet today.', finding: intake }));
    const view = render(<SignalScreen petId="pet-1" identity="intake_decline" />);
    await waitFor(() => expect(view.getByTestId('signal-screen-body')).toBeTruthy());
    expect(view.queryByTestId('signal-section-weekly')).toBeNull();
    expect(view.queryByTestId('signal-section-compare')).toBeNull();
    expect(view.queryByTestId('signal-section-lanes')).toBeNull();
    expect(view.queryByTestId('signal-section-episodes')).toBeNull();
    expect(view.getByTestId('signal-section-why')).toBeTruthy();
    expect(view.getByTestId('signal-section-script')).toBeTruthy();
    expect(view.queryByTestId('signal-section-fold')).toBeNull();
  });
});

describe('the route, app/signal/[id]', () => {
  it('flag-off: the inline screen, no namespace node, and NO read is issued (the guard’s async half)', () => {
    mockParams = { id: 'reflection:vomit', pet: 'pet-1' };
    mockUseDesignV2.mockReturnValue(false);
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalRoute />);
    expect(view.getByTestId('signal-route-off')).toBeTruthy();
    expect(view.getByText(OFF_TITLE)).toBeTruthy();
    expect(view.queryByTestId('signal-screen')).toBeNull();
    expect(mockLoadSignalScreen).not.toHaveBeenCalled();
  });

  it('flag-on: mounts the screen for the route’s pet and identity, and rises with the fold’s physics', async () => {
    mockParams = { id: 'reflection:vomit', pet: 'pet-1' };
    mockUseDesignV2.mockReturnValue(true);
    mockLoadSignalScreen.mockResolvedValue(ready(benign));
    const view = render(<SignalRoute />);
    await waitFor(() => expect(view.getByTestId('signal-screen-body')).toBeTruthy());
    expect(mockLoadSignalScreen).toHaveBeenCalledWith('pet-1', 'reflection:vomit');
    const options = (mockStackScreen.mock.calls[0][0] as unknown as { options: Record<string, unknown> }).options;
    expect(options.animation).toBe('slide_from_bottom');
    expect(options.animationDuration).toBe(SIGNAL_OPEN_MOTION.riseMs);
    expect(options.gestureEnabled).toBe(true);
  });

  it('flag-on with a malformed link falls to the inline screen; reduced motion turns the transition off', () => {
    mockParams = { id: 'reflection:vomit' };
    mockUseDesignV2.mockReturnValue(true);
    mockReduced.mockReturnValue(true);
    const view = render(<SignalRoute />);
    expect(view.getByTestId('signal-route-off')).toBeTruthy();
    expect(mockLoadSignalScreen).not.toHaveBeenCalled();
    const options = (mockStackScreen.mock.calls[0][0] as unknown as { options: Record<string, unknown> }).options;
    expect(options.animation).toBe('none');
  });
});
