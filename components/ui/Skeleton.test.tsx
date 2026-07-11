import { render } from '@testing-library/react-native';
import { Skeleton, SkeletonCard } from './Skeleton';

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
});
