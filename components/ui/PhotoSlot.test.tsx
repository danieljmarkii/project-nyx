import { fireEvent, render } from '@testing-library/react-native';
import { PhotoSlot } from './PhotoSlot';

const base = {
  petName: 'Biscuit', initials: 'BI', photoUri: null, photoAttempt: 0, onPhotoError: jest.fn(), saving: false,
};

describe('PhotoSlot (CUL-1911)', () => {
  it('with no photo on record the slot is the ask, and names the pet', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(<PhotoSlot {...base} hasPhoto={false} onPress={onPress} />);
    expect(getByText('Add photo')).toBeTruthy();
    fireEvent.press(getByLabelText('Add a photo of Biscuit'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('with a photo whose link failed, the initials stand in and it is still the pet\'s photo', () => {
    const { getByLabelText, getByText, queryByText } = render(<PhotoSlot {...base} hasPhoto onPress={jest.fn()} />);
    expect(getByLabelText('Biscuit’s photo').props.accessibilityHint).toBe('Opens the photo options');
    expect(getByText('BI')).toBeTruthy();
    expect(queryByText('Add photo')).toBeNull();
  });

  it('while saving: the tick on the scrim, and presses blocked', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByTestId } = render(<PhotoSlot {...base} hasPhoto saving onPress={onPress} />);
    expect(getByTestId('photo-saving-tick', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(getByLabelText('Biscuit’s photo'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
