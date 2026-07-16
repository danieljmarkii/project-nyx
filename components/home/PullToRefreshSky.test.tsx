import { render } from '@testing-library/react-native';
import { PullToRefreshSky } from './PullToRefreshSky';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

describe('PullToRefreshSky', () => {
  it('shows the §9 line while a refresh is active', () => {
    const { getByText } = render(<PullToRefreshSky active />);
    // The band is a11y-hidden (decorative — the RefreshControl announces refresh state),
    // so include hidden elements to assert the copy is present.
    expect(getByText(/Checking for anything new/, { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders nothing at rest (the band only appears during a pull-refresh)', () => {
    const { toJSON } = render(<PullToRefreshSky active={false} />);
    expect(toJSON()).toBeNull();
  });
});
