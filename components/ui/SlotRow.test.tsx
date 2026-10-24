import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SlotRow } from './SlotRow';
import { theme } from '../../constants/theme';

describe('SlotRow', () => {
  it('is one button at least the touch floor tall, announcing its title and why', () => {
    const onPress = jest.fn();
    const view = render(
      <SlotRow title="Add the ingredients" detail="Lets us read every protein, not just the main one." onPress={onPress} testID="row" />,
    );
    const row = view.getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Add the ingredients. Lets us read every protein, not just the main one.');
    expect(StyleSheet.flatten(row.props.style).minHeight).toBe(theme.hitTarget);
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('takes a trailing mark in place of the chevron once the step is done', () => {
    const view = render(
      <SlotRow title="Add the barcode" onPress={() => {}} trailing={<Text>thumb</Text>} accessibilityLabel="Barcode photo added. Replace it" />,
    );
    expect(view.getByText('thumb')).toBeTruthy();
    expect(view.getByLabelText('Barcode photo added. Replace it')).toBeTruthy();
  });

  it('takes a leading glyph before the title', () => {
    const view = render(<SlotRow title="Attach photo" onPress={() => {}} leading={<Text>glyph</Text>} />);
    expect(view.getByText('glyph')).toBeTruthy();
    expect(view.getByLabelText('Attach photo')).toBeTruthy();
  });
});
