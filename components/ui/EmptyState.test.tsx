import { ScrollView } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title always', () => {
    const { getByText } = render(<EmptyState title="Nothing logged yet" />);
    expect(getByText('Nothing logged yet')).toBeTruthy();
  });

  it('renders the body only when given', () => {
    const { queryByText, rerender } = render(<EmptyState title="Title" />);
    expect(queryByText('A forward-looking line')).toBeNull();

    rerender(<EmptyState title="Title" body="A forward-looking line" />);
    expect(queryByText('A forward-looking line')).toBeTruthy();
  });

  it('renders no action affordance when none is given', () => {
    const { queryByRole } = render(<EmptyState title="Title" body="Body" />);
    expect(queryByRole('button')).toBeNull();
  });

  it('fires the action onPress when the action is tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <EmptyState title="Couldn't load" action={{ label: 'Try again', onPress }} />,
    );
    fireEvent.press(getByText('Try again'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // CUL-2244: a centred block taller than its space climbed over the header at AX5. The
  // full-screen form scrolls instead; the inset form, inside a list already, does not.
  it('scrolls the fill form and leaves the inset form a plain block', () => {
    const fill = render(<EmptyState title="Title" align="fill" testID="empty" />);
    expect(fill.getByTestId('empty').type).toBe('RCTScrollView');
    expect(fill.UNSAFE_queryAllByType(ScrollView)).toHaveLength(1);
    const inset = render(<EmptyState title="Title" testID="empty" />);
    expect(inset.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  });
});
