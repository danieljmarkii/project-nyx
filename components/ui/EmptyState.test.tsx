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
});
