jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));

import { render } from '@testing-library/react-native';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders the chart wrapper with 2 or more points', () => {
    const { getByTestId } = render(<Sparkline data={[1, 2, 3]} tone="concern" />);
    expect(getByTestId('sparkline')).toBeTruthy();
  });

  it('renders nothing with fewer than 2 points (never a fabricated flat line)', () => {
    expect(render(<Sparkline data={[1]} />).queryByTestId('sparkline')).toBeNull();
    expect(render(<Sparkline data={[]} />).queryByTestId('sparkline')).toBeNull();
  });
});
