// CUL-1123 — the first frame. The defect was never in a motion module: every one of them
// honours `reducedMotion`. It was in the VALUE they were handed on their first render,
// which was always `false` whatever the OS said, because the hook asked the OS after
// mount. And the tests could not see it, because they mocked the hook to `true` from the
// first render, a state production never produced (C-35).
//
// So nothing here mocks the hook. The OS read is staged by hand, the real store answers
// it, and a real consumer (a chart's draw in, the Signal route's transition) renders
// through the real hook. The issue's own test is the first one: the chart mounts while
// the setting is still unknown, the OS then answers "reduced", and no animation may
// have started at any point.
import { Animated, AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { WeeklyBars } from '../components/charts/WeeklyBars';
import { weeklyBuckets } from '../lib/chartModels';
import {
  __resetReducedMotionForTest,
  startReducedMotionRead,
  useReducedMotionStore,
} from '../store/reducedMotionStore';

// The app is foregrounded: this suite isolates the one variable it is about.
jest.mock('./useAppActive', () => ({ useAppActive: () => true }));

// The Signal route, reduced to what its transition depends on: the options it hands the
// stack. Flag-off (`useDesignV2` false) so the route draws its small inline screen and
// reads nothing, since the transition is decided by the route itself either way.
const mockScreenOptions: { animation?: string }[] = [];
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'finding-1', pet: 'pet-1' }),
  Stack: {
    Screen: ({ options }: { options: { animation?: string } }) => {
      mockScreenOptions.push(options);
      return null;
    },
  },
}));
jest.mock('./useDesignV2', () => ({ useDesignV2: () => false }));
// The redesign's namespace is never drawn flag-off; stubbed so its read graph (which
// reaches lib/supabase's import-time env guard) is not loaded at all.
jest.mock('../components/designV2/signal/SignalScreen', () => ({ SignalScreen: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import SignalRoute from '../app/signal/[id]';

// 2026-09-20 is a Sunday; today is that Tuesday.
const model = weeklyBuckets({
  episodeDays: ['2026-09-06', '2026-09-08', '2026-09-21'],
  loggedDays: ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-20', '2026-09-22'],
  weeksEnding: '2026-09-22',
  today: '2026-09-22',
  weeks: 3,
});

/** The OS read, answered by hand. */
function stageOsRead() {
  let answer: (enabled: boolean) => void = () => {};
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(() => new Promise<boolean>((resolve) => { answer = resolve; }));
  return {
    answer: async (enabled: boolean) => {
      await act(async () => {
        answer(enabled);
      });
    },
  };
}

/** Production after the root gate: the OS has answered before anything renders. */
function knownBeforeFirstRender(reduceMotion: boolean) {
  useReducedMotionStore.setState({ reduceMotion, gateOpen: true });
}

let parallel: jest.SpyInstance;
let timing: jest.SpyInstance;

beforeEach(() => {
  __resetReducedMotionForTest();
  mockScreenOptions.length = 0;
  parallel = jest.spyOn(Animated, 'parallel');
  timing = jest.spyOn(Animated, 'timing');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a chart that mounts before the OS has answered (the issue\'s test)', () => {
  it('the answer is "reduced": no animation ever started, and the bars stand at full height', async () => {
    const os = stageOsRead();
    startReducedMotionRead();
    const view = render(<WeeklyBars model={model} noun="vomiting" drawIn identity="sep" />);
    expect(timing).not.toHaveBeenCalled();
    await os.answer(true);
    expect(timing).not.toHaveBeenCalled();
    expect(parallel).not.toHaveBeenCalled();
    // The static frame is the END state, not a missing chart: every bar at its full scale.
    // (The chart's marks sit behind its one spoken label, hidden from assistive tech.)
    const bar = view.getByTestId('weekly-bar-0', { includeHiddenElements: true });
    const style = StyleSheet.flatten(bar.props.style) as { transform?: { scaleY?: number }[] };
    expect(style.transform?.[0]?.scaleY).toBe(1);
  });

  it('the answer is "motion on": the chart the owner is already reading does not start drawing late', async () => {
    // Only reachable when the root gate gave up waiting (a bridge that never answered):
    // the chart painted still, and a draw starting under the reader's eyes afterwards
    // would be the redraw `useDrawIn` exists to prevent.
    const os = stageOsRead();
    startReducedMotionRead();
    render(<WeeklyBars model={model} noun="vomiting" drawIn identity="sep" />);
    await os.answer(false);
    expect(timing).not.toHaveBeenCalled();
  });
});

describe('a chart that mounts after the OS has answered (production, behind the root gate)', () => {
  it('reduced: the static frame from the first render', () => {
    knownBeforeFirstRender(true);
    render(<WeeklyBars model={model} noun="vomiting" drawIn identity="sep" />);
    expect(timing).not.toHaveBeenCalled();
  });

  it('motion on: it draws in on its first render (so the still default costs nothing here)', () => {
    knownBeforeFirstRender(false);
    render(<WeeklyBars model={model} noun="vomiting" drawIn identity="sep" />);
    expect(parallel).toHaveBeenCalled();
    expect(timing).toHaveBeenCalled();
  });
});

describe('the Signal route\'s transition', () => {
  // The push is decided on the route's first render; a correction a commit later can
  // only change the pop. So the first options the stack receives are the ones that count.
  it('reduced, known before the first render: no animation on the push', () => {
    knownBeforeFirstRender(true);
    render(<SignalRoute />);
    expect(mockScreenOptions[0]?.animation).toBe('none');
  });

  it('motion on: the rise', () => {
    knownBeforeFirstRender(false);
    render(<SignalRoute />);
    expect(mockScreenOptions[0]?.animation).toBe('slide_from_bottom');
  });

  it('still unknown: no animation, never a slide that would have to be taken back', () => {
    render(<SignalRoute />);
    expect(mockScreenOptions[0]?.animation).toBe('none');
  });
});
