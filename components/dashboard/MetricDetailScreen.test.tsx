jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render, fireEvent } from '@testing-library/react-native';
import { MetricDetailScreen, type MetricDetailWindowData } from './MetricDetailScreen';
import type { AnalyticsWindow } from '../../lib/analytics';
import { notEnoughData } from '../../lib/analytics';
import { selectCardState } from '../../lib/dashboardCards';

// The module object itself, so a spy reaches the component's own read (a namespace import is a copy).
const RN = require('react-native') as typeof import('react-native');

const windows: Record<AnalyticsWindow, MetricDetailWindowData> = {
  week: {
    value: '2',
    series: [0, 1, 0, 1],
    established: true,
    delta: -1,
    deltaLabel: '1 fewer than last week',
    baselineRead: 'Calmer than a usual week for Nyx.',
  },
  month: {
    value: '9',
    series: [1, 2, 1, 3, 2],
    established: true,
    delta: 3,
    deltaLabel: '3 more than last month',
    baselineRead: 'A little busier than a usual month for Nyx.',
  },
  '3month': {
    value: '20',
    series: [],
    established: false,
    baselineRead: '',
    state: selectCardState(notEnoughData(2, 4)),
  },
};

describe('MetricDetailScreen', () => {
  it('leads with the active window’s "vs your baseline" read and big number (Month default)', () => {
    const { getByText } = render(
      <MetricDetailScreen title="Vomiting" polarity="adverse" windows={windows} petName="Nyx" calibrationUnit="day" />,
    );
    expect(getByText('A little busier than a usual month for Nyx.')).toBeTruthy();
    expect(getByText('9')).toBeTruthy();
  });

  it('switches the metric when another range is selected', () => {
    const { getByText, getByRole } = render(
      <MetricDetailScreen title="Vomiting" polarity="adverse" windows={windows} petName="Nyx" calibrationUnit="day" />,
    );
    fireEvent.press(getByRole('tab', { name: 'Week' }));
    expect(getByText('Calmer than a usual week for Nyx.')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('shows the calibration state for a below-floor range, not a fabricated chart', () => {
    const { getByText, getByRole } = render(
      <MetricDetailScreen title="Vomiting" polarity="adverse" windows={windows} petName="Nyx" calibrationUnit="day" />,
    );
    fireEvent.press(getByRole('tab', { name: '3 Months' }));
    expect(getByText("Still learning Nyx's baseline — 2 more days to log.")).toBeTruthy();
  });

  it('renders a warm empty state for a zero-event window (not a fabricated chart)', () => {
    const emptyWindows: Record<AnalyticsWindow, MetricDetailWindowData> = {
      ...windows,
      week: {
        value: '0',
        series: [],
        established: false,
        baselineRead: '',
        emptyMessage: 'No vomiting logged this week.',
        state: { kind: 'empty' },
      },
    };
    const { getByText, getByRole } = render(
      <MetricDetailScreen title="Vomiting" polarity="adverse" windows={emptyWindows} petName="Nyx" calibrationUnit="day" />,
    );
    fireEvent.press(getByRole('tab', { name: 'Week' }));
    expect(getByText('No vomiting logged this week.')).toBeTruthy();
  });
});

// CUL-2265: at 320 and the largest text, Week, Month and 3 Months drew over each other.
describe('MetricDetailScreen — the ranges at large text', () => {
  afterEach(() => jest.restoreAllMocks());
  const trackAt = (fontScale: number) => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, fontScale, scale: 2 });
    const { getByRole, getByText } = render(
      <MetricDetailScreen title="Vomiting" polarity="adverse" windows={windows} petName="Nyx" calibrationUnit="day" />,
    );
    const week = getByRole('tab', { name: 'Week' });
    let track = week.parent;
    while (track && track.props.accessibilityRole !== 'tablist') track = track.parent;
    return { track: RN.StyleSheet.flatten(track?.props.style), week, getByText };
  };

  it('keeps one row, with its slop, at the standard sizes', () => {
    const { track, week } = trackAt(1.353);
    expect(track.flexDirection).toBe('row');
    expect(week.props.hitSlop).toBe(6);
  });

  it('stacks the ranges, without slop, at the accessibility sizes, and each still switches', () => {
    const { track, week, getByText } = trackAt(3.571);
    expect(track.flexDirection).toBe('column');
    expect(week.props.hitSlop).toBeUndefined();
    // With no slop, each range holds the 44pt floor itself.
    expect(RN.StyleSheet.flatten(week.props.style).minHeight).toBe(44);
    fireEvent.press(week);
    expect(getByText('Calmer than a usual week for Nyx.')).toBeTruthy();
  });
});
