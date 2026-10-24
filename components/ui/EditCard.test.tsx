// CUL-1909 — the editor's label/value row. The whole row is the button (C-6), and a row
// with nothing to open is not a button at all (C-7): it draws no › and claims no role.
import { fireEvent, render } from '@testing-library/react-native';
import { owningTouchable } from '../../testUtils/tree';
import { EditBlock, EditCard, EditRow } from './EditCard';

describe('EditRow', () => {
  it('the label and the value share one button, which opens what the row names', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <EditCard><EditRow first label="When" value="Tue, Oct 21, 2:14 AM" onPress={onPress} /></EditCard>,
    );
    const onLabel = owningTouchable(getByText('When'));
    expect(onLabel).not.toBeNull();
    expect(onLabel).toBe(owningTouchable(getByText('Tue, Oct 21, 2:14 AM')));
    expect(getByTestId('door-mark', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(getByText('When'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('one stop for a screen reader, the detail included', () => {
    const { getByLabelText } = render(
      <EditRow label="Food" value="Pate" detail="Fancy Feast · Wet" onPress={jest.fn()} />,
    );
    expect(getByLabelText('Food, Pate, Fancy Feast · Wet').props.accessibilityRole).toBe('button');
  });

  it('a row with nothing to open draws no › and is no button', () => {
    const { getByText, queryByTestId } = render(<EditRow label="Photo" value="Couldn’t check" />);
    expect(owningTouchable(getByText('Photo'))).toBeNull();
    expect(queryByTestId('door-mark', { includeHiddenElements: true })).toBeNull();
  });
});

describe('EditBlock', () => {
  it('labels the control under it', () => {
    const { getByText } = render(<EditBlock label="How you know"><EditRow label="x" value="y" /></EditBlock>);
    expect(getByText('How you know')).toBeTruthy();
  });
});
