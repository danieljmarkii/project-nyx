import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { HeaderAction } from './HeaderAction';

describe('HeaderAction (CUL-1911)', () => {
  it('a commit speaks the action colour and fires', () => {
    const onPress = jest.fn();
    const { getByText } = render(<HeaderAction label="Save" onPress={onPress} />);
    expect(StyleSheet.flatten(getByText('Save').props.style).color).toBe(colorRoles.action.onLight);
    fireEvent.press(getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled says why in its label (C-7) and does not fire', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <HeaderAction label="Save" onPress={onPress} disabled disabledReason="add a name first" />,
    );
    const node = getByLabelText('Save, add a name first');
    expect(node.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(node);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('working: the tick stands in for the label, and presses are blocked', () => {
    const onPress = jest.fn();
    const { getByTestId, queryByText, getByLabelText } = render(
      <HeaderAction label="Save" onPress={onPress} working testID="save" />,
    );
    expect(getByTestId('save-tick', { includeHiddenElements: true })).toBeTruthy();
    expect(queryByText('Save')).toBeNull();
    fireEvent.press(getByLabelText('Save'));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByLabelText('Save').props.accessibilityState).toMatchObject({ busy: true });
  });

  it('reaches the 44pt floor by its own box', () => {
    const { getByTestId } = render(<HeaderAction label="Cancel" tone="quiet" onPress={jest.fn()} testID="c" />);
    expect(StyleSheet.flatten(getByTestId('c').props.style).minHeight).toBe(theme.hitTarget);
  });
});
