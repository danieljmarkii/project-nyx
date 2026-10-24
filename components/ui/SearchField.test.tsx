import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { theme } from '../../constants/theme';
import { SearchField } from './SearchField';

describe('SearchField (CUL-1908 F2)', () => {
  it('names itself by what it finds and hands the query back', () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(
      <SearchField value="" onChangeText={onChangeText} placeholder="Search medications" />,
    );
    fireEvent.changeText(getByLabelText('Search medications'), 'maro');
    expect(onChangeText).toHaveBeenCalledWith('maro');
  });

  // The round's §14: a fixed 44pt box clipped the query at the largest text size, so
  // the box holds a floor and grows with its text.
  it('holds the touch floor as a minimum, never a fixed height', () => {
    const { getByLabelText } = render(
      <SearchField value="" onChangeText={jest.fn()} placeholder="Search brand or product" />,
    );
    const box = StyleSheet.flatten(getByLabelText('Search brand or product').parent?.parent?.props.style);
    expect(box.minHeight).toBe(theme.hitTarget);
    expect(box.height).toBeUndefined();
  });
});
