import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { PickerRow } from './PickerRow';

describe('PickerRow (CUL-1911)', () => {
  it('shows the value, and one stop says the field, the value and the verb', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(
      <PickerRow label="Breed" value="Beagle" placeholder="Select breed" actionLabel="Change" onPress={onPress} />,
    );
    expect(getByText('Breed')).toBeTruthy();
    fireEvent.press(getByLabelText('Breed, Beagle. Change'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the placeholder in the tertiary ink when nothing is chosen', () => {
    const { getByText } = render(
      <PickerRow label="Date of birth" value={null} placeholder="Not set" actionLabel="Change" onPress={jest.fn()} />,
    );
    expect(StyleSheet.flatten(getByText('Not set').props.style).color).toBe(theme.colorTextTertiary);
  });

  it('holds TextField\'s floor by construction', () => {
    const { getByTestId } = render(
      <PickerRow label="Breed" value={null} placeholder="Select breed" actionLabel="Change" onPress={jest.fn()} testID="row" />,
    );
    expect(StyleSheet.flatten(getByTestId('row').props.style).minHeight).toBe(theme.space5);
  });
});
