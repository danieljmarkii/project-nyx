// The three silhouettes are each ONE hidden accessibility unit with nothing that
// animates (D2-7 / CUL-1068): Principle 5 says a wait is the screen's shape, and the
// one-loop guard says the shape never moves. The report's line is the one thing an
// owner is meant to read.
import { render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { EVENT_SILHOUETTE_TEST_ID, EventSilhouette } from './EventSilhouette';
import { HOME_SILHOUETTE_TEST_ID, HomeSilhouette } from './HomeSilhouette';
import { PICKER_SILHOUETTE_TEST_ID, PickerSilhouette } from './PickerSilhouette';
import { Rows } from './Silhouette';
import { CAPTURE_SILHOUETTE_TEST_ID, CaptureSilhouette } from './CaptureSilhouette';
import { SIGNAL_SILHOUETTE_TEST_ID, SignalSilhouette } from './SignalSilhouette';
import { REPORT_SILHOUETTE_TEST_ID, REPORT_WAIT_SUBTITLE, ReportSilhouette, reportWaitTitle } from './ReportSilhouette';

jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

const hidden = { includeHiddenElements: true };

describe('the silhouettes', () => {
  it.each([
    ['Home', HOME_SILHOUETTE_TEST_ID, () => <HomeSilhouette topInset={47} tabBarHeight={83} />],
    ['Event', EVENT_SILHOUETTE_TEST_ID, () => <EventSilhouette />],
    // CUL-1075: the Signal screen's own shape, whole and its lower half, and the list rows.
    ['Signal', SIGNAL_SILHOUETTE_TEST_ID, () => <SignalSilhouette />],
    ['Signal (below the flight)', SIGNAL_SILHOUETTE_TEST_ID, () => <SignalSilhouette withHead={false} />],
    // CUL-2168: the food and medication pickers' tile shape.
    ['Picker', PICKER_SILHOUETTE_TEST_ID, () => <PickerSilhouette />],
    ['Rows', 'rows-silhouette', () => <Rows count={3} testID="rows-silhouette" />],
    // CUL-1910: food capture's lower half, under the owner's photo and the read card.
    ['Capture (below the read card)', CAPTURE_SILHOUETTE_TEST_ID, () => <CaptureSilhouette working={false} withHead={false} />],
  ])('%s: hidden from assistive tech as one unit, and starts no animation', (_n, id, make) => {
    const loop = jest.spyOn(Animated, 'loop');
    const timing = jest.spyOn(Animated, 'timing');
    const { queryByTestId, getByTestId } = render(make());
    expect(queryByTestId(id)).toBeNull();
    const frame = getByTestId(id, hidden);
    expect(frame.props.accessibilityElementsHidden).toBe(true);
    expect(frame.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(loop).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('the report: the line is spoken, the document’s blocks are not, the tick breathes only while working', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const { getByText, queryByTestId, getByTestId, rerender } = render(<ReportSilhouette petName="Mochi" working />);
    expect(getByText('Writing Mochi’s report…')).toBeTruthy();
    expect(getByText(REPORT_WAIT_SUBTITLE)).toBeTruthy();
    expect(queryByTestId(REPORT_SILHOUETTE_TEST_ID)).toBeNull();
    expect(getByTestId(REPORT_SILHOUETTE_TEST_ID, hidden)).toBeTruthy();
    expect(getByTestId('design-v2-tick', hidden)).toBeTruthy();
    expect(loop).toHaveBeenCalledTimes(1);
    rerender(<ReportSilhouette petName="Mochi" working={false} />);
    expect(queryByTestId('design-v2-tick', hidden)).toBeNull();
    jest.restoreAllMocks();
  });

  it('the report’s title names the pet, and falls back without one', () => {
    expect(reportWaitTitle('Mochi')).toBe('Writing Mochi’s report…');
    expect(reportWaitTitle(null)).toBe('Writing the report…');
    expect(reportWaitTitle('')).toBe('Writing the report…');
  });

  it('capture: the request is named and spoken, the blocks are not, the tick breathes only while working', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const { getByText, queryByTestId, getByTestId, rerender } = render(<CaptureSilhouette working />);
    expect(getByText('Reading the label…')).toBeTruthy();
    expect(queryByTestId(CAPTURE_SILHOUETTE_TEST_ID)).toBeNull();
    expect(getByTestId(CAPTURE_SILHOUETTE_TEST_ID, hidden)).toBeTruthy();
    expect(getByTestId('design-v2-tick', hidden)).toBeTruthy();
    expect(loop).toHaveBeenCalledTimes(1);
    rerender(<CaptureSilhouette working={false} />);
    expect(queryByTestId('design-v2-tick', hidden)).toBeNull();
    jest.restoreAllMocks();
  });
});

// CUL-2267 — Home's shape draws the bar where the app does: the rail at regular, the bottom
// bar on a phone, never both.
describe('Home’s silhouette and the tab bar’s side', () => {
  // The frame is hidden from assistive tech, so the queries must look past that.
  const HIDDEN = { includeHiddenElements: true };
  it('a phone draws the bottom bar and no rail', () => {
    const view = render(<HomeSilhouette topInset={47} tabBarHeight={83} />);
    expect(view.queryByTestId('home-silhouette-bar', HIDDEN)).not.toBeNull();
    expect(view.queryByTestId('home-silhouette-rail', HIDDEN)).toBeNull();
  });

  it('at regular the rail stands down the right edge, at its width, and no bottom bar', () => {
    const view = render(<HomeSilhouette topInset={24} tabBarHeight={83} rail={{ width: 80, safeRight: 0, tabHeight: 65 }} />);
    expect(view.queryByTestId('home-silhouette-bar', HIDDEN)).toBeNull();
    const rail = view.getByTestId('home-silhouette-rail', HIDDEN);
    expect(StyleSheet.flatten(rail.props.style)).toEqual(expect.objectContaining({ width: 80, paddingTop: 24 + 16 }));
  });
});
