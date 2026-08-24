import { render } from '@testing-library/react-native';
import { Skeleton, SkeletonCard, SkeletonRow, SkeletonRows } from './Skeleton';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

// Smoke tests — the shimmer is layout-driven (needs an onLayout width jest doesn't
// provide), so there's no meaningful animation state to assert; these just guard the
// render path (incl. the expo-linear-gradient import) against a crash regression.
describe('Skeleton', () => {
  it('renders a placeholder block without crashing', () => {
    expect(render(<Skeleton width={120} height={12} />).toJSON()).toBeTruthy();
  });

  it('SkeletonCard renders the card silhouette', () => {
    expect(render(<SkeletonCard />).toJSON()).toBeTruthy();
  });

  it('SkeletonRow renders the list-row silhouette', () => {
    expect(render(<SkeletonRow />).toJSON()).toBeTruthy();
  });

  // The count is what a loading list actually renders, so it's the one behaviour
  // here worth pinning rather than smoke-testing.
  it('SkeletonRows renders exactly `count` rows', () => {
    const { getByTestId } = render(<SkeletonRows count={5} testID="rows" />);
    expect(getByTestId('rows', { includeHiddenElements: true }).props.children).toHaveLength(5);
  });

  // A loading placeholder is decoration: a screen reader should reach the real rows
  // when they land, never a run of nameless blocks in the meantime. Asserted the way
  // a screen reader sees it — the default query walks the accessibility tree, so a
  // miss here IS the guarantee (and it's why every skeleton assertion in the screen
  // tests has to opt in with includeHiddenElements).
  it('hides the loading rows from assistive tech', () => {
    const { queryByTestId } = render(<SkeletonRows count={3} testID="rows" />);
    expect(queryByTestId('rows')).toBeNull();
  });
});
