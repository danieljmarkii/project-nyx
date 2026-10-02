// The three silhouettes are each ONE hidden accessibility unit with nothing that
// animates (D2-7 / CUL-1068): Principle 5 says a wait is the screen's shape, and the
// one-loop guard says the shape never moves. The report's line is the one thing an
// owner is meant to read.
import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { EVENT_SILHOUETTE_TEST_ID, EventSilhouette } from './EventSilhouette';
import { HOME_SILHOUETTE_TEST_ID, HomeSilhouette } from './HomeSilhouette';
import { REPORT_SILHOUETTE_TEST_ID, REPORT_WAIT_SUBTITLE, ReportSilhouette, reportWaitTitle } from './ReportSilhouette';

jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

const hidden = { includeHiddenElements: true };

describe('the silhouettes', () => {
  it.each([
    ['Home', HOME_SILHOUETTE_TEST_ID, () => <HomeSilhouette topInset={47} tabBarHeight={83} />],
    ['Event', EVENT_SILHOUETTE_TEST_ID, () => <EventSilhouette />],
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
});
