import { render } from '@testing-library/react-native';
import { NightMoment } from './NightMoment';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

describe('NightMoment', () => {
  it('renders its lower-third copy while visible (§9 title + subtitle)', () => {
    const { getByText } = render(
      <NightMoment visible title="Catching up on Nyx’s history…" subtitle="This only takes a moment." />,
    );
    expect(getByText('Catching up on Nyx’s history…')).toBeTruthy();
    expect(getByText('This only takes a moment.')).toBeTruthy();
  });

  it('renders nothing when it has never been shown (no leftover night takeover)', () => {
    const { toJSON } = render(<NightMoment visible={false} title="x" subtitle="y" />);
    expect(toJSON()).toBeNull();
  });
});
