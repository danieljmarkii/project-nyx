import { render, fireEvent } from '@testing-library/react-native';
import { NumberField } from './NumberField';

describe('NumberField (CUL-1908 F2)', () => {
  it('takes the number, shows its unit, and announces a real name', () => {
    const onChangeText = jest.fn();
    const { getByLabelText, getByText } = render(
      <NumberField value="42.6" onChangeText={onChangeText} unit="lbs" accessibilityLabel="Weight in pounds" />,
    );
    expect(getByText('lbs')).toBeTruthy();
    fireEvent.changeText(getByLabelText('Weight in pounds'), '43');
    expect(onChangeText).toHaveBeenCalledWith('43');
  });

  it('draws the caption only when there is one', () => {
    const { queryByText, rerender } = render(
      <NumberField value="" onChangeText={jest.fn()} unit="lbs" accessibilityLabel="Weight in pounds" />,
    );
    expect(queryByText(/Last weighed/)).toBeNull();
    rerender(
      <NumberField
        value="42.6"
        onChangeText={jest.fn()}
        unit="lbs"
        accessibilityLabel="Weight in pounds"
        caption="Last weighed Oct 2: 42.6 lbs"
      />,
    );
    expect(queryByText('Last weighed Oct 2: 42.6 lbs')).toBeTruthy();
  });
});
