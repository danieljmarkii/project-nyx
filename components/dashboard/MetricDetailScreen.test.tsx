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
    fireEvent.press(getByRole('button', { name: 'Week' }));
    expect(getByText('Calmer than a usual week for Nyx.')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('shows the calibration state for a below-floor range, not a fabricated chart', () => {
    const { getByText, getByRole } = render(
      <MetricDetailScreen title="Vomiting" polarity="adverse" windows={windows} petName="Nyx" calibrationUnit="day" />,
    );
    fireEvent.press(getByRole('button', { name: '3 Months' }));
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
    fireEvent.press(getByRole('button', { name: 'Week' }));
    expect(getByText('No vomiting logged this week.')).toBeTruthy();
  });
});

// CUL-2265: at 320 and the largest text, Week, Month and 3 Months drew over each other.
describe('MetricDetailScreen — the ranges at large text', () => {
  afterEach(() => jest.restoreAllMocks());
  const trackAt = (fontScale: number) => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, fontScale, scale: 2 });
    const { getByRole, getByText, getByTestId } = render(
      <MetricDetailScreen title="Vomiting" polarity="adverse" windows={windows} petName="Nyx" calibrationUnit="day" />,
    );
    const week = getByRole('button', { name: 'Week' });
    const range = (w: string) => getByTestId(`metric-window-${w}`);
    return { track: RN.StyleSheet.flatten(getByTestId('metric-window').props.style), week, range, getByText };
  };

  // CUL-2278: on the shared control, every range holds the 44pt floor with no slop at
  // every size, so no two ranges share a band (C-5); the old 6pt slop on 36pt boxes 3pt
  // apart overlapped at the standard sizes.
  const holdsTheFloorWithoutSlop = (range: (w: string) => { props: { style: unknown; hitSlop?: unknown } }) => {
    for (const w of ['week', 'month', '3month']) {
      expect(RN.StyleSheet.flatten(range(w).props.style as never).minHeight).toBe(44);
      expect(range(w).props.hitSlop).toBeUndefined();
    }
  };

  it('keeps one row, each range at the floor with no slop, at the standard sizes', () => {
    const { track, range } = trackAt(1.353);
    expect(track.flexDirection).toBe('row');
    holdsTheFloorWithoutSlop(range);
  });

  it('stacks the ranges at the accessibility sizes, each at the floor, and each still switches', () => {
    const { track, week, range, getByText } = trackAt(3.571);
    expect(track.flexDirection).toBe('column');
    holdsTheFloorWithoutSlop(range);
    // Sized by its label in the column, never a zero flex basis.
    expect(RN.StyleSheet.flatten(week.props.style).flexBasis).toBe('auto');
    fireEvent.press(week);
    expect(getByText('Calmer than a usual week for Nyx.')).toBeTruthy();
  });
});
