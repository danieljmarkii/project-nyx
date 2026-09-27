// CUL-1223 (BRK-12) — Home's chart draws in, once, on the FACT (C-30).
//
//   • a returning device: the chart draws on its first mount;
//   • a cold start: the chart holds its static frame under the silhouette and draws once,
//     on the handoff — never unseen, never twice;
//   • a sync tick re-reads the finding without unmounting the chart, so it never redraws
//     under the owner's eyes (and never flashes a skeleton);
//   • the flight's clone is its own mount and is staged with the STATIC chart.
//
// `WeeklyBars` is recorded rather than rendered: the question is what the card hands it and
// how many times it is mounted, not how it draws (that is `drawInMotion.test.ts`'s).

jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: () => true }));
const mockLoadSignalLead = jest.fn();
jest.mock('../../../lib/signalLead', () => ({
  loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a),
  loadSignalRowTrial: async () => null,
}));
jest.mock('../../../lib/measureNode', () => ({
  measureNodeInWindow: (_node: unknown, cb: (r: unknown) => void) => cb({ x: 67, y: 300, width: 278, height: 130 }),
}));
const mockBarsProps: { drawIn?: boolean; identity?: string }[] = [];
let mockBarsMounts = 0;
jest.mock('../../charts/WeeklyBars', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    WeeklyBars: (props: { drawIn?: boolean; identity?: string }) => {
      React.useEffect(() => {
        mockBarsMounts += 1;
      }, []);
      mockBarsProps.push({ drawIn: props.drawIn, identity: props.identity });
      return React.createElement(View, { testID: 'weekly-bars-stub' });
    },
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { isValidElement } from 'react';
import { SignalLeadCard } from './SignalLeadCard';
import { useSyncStore } from '../../../store/syncStore';
import { abortFlight, getFlightState } from '../../motion/flightMotion';
import type { CachedFinding } from '../../../lib/signal';
import { signalWeeks, weekLine } from '../../../lib/signalWindows';
import { toLocalDayKey } from '../../../lib/utils';

const reflection: CachedFinding = {
  rank: 0,
  text: 'Nyx vomited 2 times this week, 5 the week before.',
  finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 5, direction: 'improving', windowDays: 14 },
};

function leadModel() {
  const today = toLocalDayKey(new Date());
  const weekly = signalWeeks({ finding: reflection.finding, today, trial: null, episodeDays: [today], loggedDays: [today] });
  return { title: 'Vomiting, the last 2 weeks', weekly, line: weekLine(weekly), lineWithheld: null, noun: 'vomiting', trial: null };
}

const card = () => (
  <SignalLeadCard cached={reflection} petId="pet-1" onOpen={jest.fn()} withholdFallingVomit={false} generatedAt={null} />
);
const last = () => mockBarsProps[mockBarsProps.length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  mockBarsProps.length = 0;
  mockBarsMounts = 0;
  abortFlight();
  useSyncStore.setState({ coldStartHydrating: false, coldStartHandoff: 0 });
  mockLoadSignalLead.mockResolvedValue(leadModel());
});
afterEach(() => abortFlight());

describe('the lead chart’s draw in (CUL-1223, BRK-12)', () => {
  it('a returning device: the chart draws on its first mount', async () => {
    const view = render(card());
    await waitFor(() => expect(view.getByTestId('weekly-bars-stub')).toBeTruthy());
    expect(last().drawIn).toBe(true);
  });

  it('a cold start: held under the silhouette, armed once by the handoff', async () => {
    useSyncStore.setState({ coldStartHydrating: true, coldStartHandoff: 0 });
    const view = render(card());
    await waitFor(() => expect(view.getByTestId('weekly-bars-stub')).toBeTruthy());
    expect(last().drawIn).toBe(false);
    // The silhouette's edge: hydration ends one render before the handoff is bumped. The
    // chart still holds — otherwise it would start a draw and restart it a frame later.
    act(() => useSyncStore.setState({ coldStartHydrating: false }));
    expect(last().drawIn).toBe(false);
    act(() => useSyncStore.getState().bumpColdStartHandoff());
    expect(last().drawIn).toBe(true);
    const armedIdentity = last().identity;
    // A later render keeps the same identity: one draw.
    act(() => useSyncStore.getState().bumpHydrationTick());
    await waitFor(() => expect(mockLoadSignalLead).toHaveBeenCalledTimes(2));
    expect(last().identity).toBe(armedIdentity);
    expect(last().drawIn).toBe(true);
  });

  it('a sync tick re-reads without unmounting the chart — no skeleton, no second draw', async () => {
    const view = render(card());
    await waitFor(() => expect(view.getByTestId('weekly-bars-stub')).toBeTruthy());
    expect(mockBarsMounts).toBe(1);
    let resolve: (m: ReturnType<typeof leadModel>) => void = () => {};
    mockLoadSignalLead.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    act(() => useSyncStore.getState().bumpHydrationTick());
    // While the re-read is in flight the chart stays up.
    expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
    expect(view.getByTestId('weekly-bars-stub')).toBeTruthy();
    await act(async () => resolve(leadModel()));
    expect(mockBarsMounts).toBe(1);
  });

  it('the flight’s clone is staged with the static chart, so it never draws in', async () => {
    const view = render(card());
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    fireEvent.press(view.getByTestId('signal-lead-face'));
    const element = getFlightState().flight?.element;
    expect(isValidElement(element)).toBe(true);
    expect((element as { props: { drawIn?: boolean } }).props.drawIn).toBeFalsy();
  });
});
