import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SegmentedControl } from './SegmentedControl';
import { theme } from '../../constants/theme';

type Mode = 'saw' | 'found';
const OPTIONS = [
  { value: 'saw' as const, label: 'Saw it happen' },
  { value: 'found' as const, label: 'Found it' },
];

function flat(node: { props: { style: unknown } }): Record<string, unknown> {
  return (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
}

describe('SegmentedControl', () => {
  it('reports the tapped segment', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SegmentedControl<Mode> options={OPTIONS} value="saw" onChange={onChange} testID="seg" />,
    );
    fireEvent.press(getByTestId('seg-found'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('found');
  });

  it('marks only the selected segment, in its state and its paint', () => {
    const { getByTestId } = render(
      <SegmentedControl<Mode> options={OPTIONS} value="found" onChange={() => {}} testID="seg" />,
    );
    expect(getByTestId('seg-found').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByTestId('seg-saw').props.accessibilityState).toMatchObject({ selected: false });
    expect(flat(getByTestId('seg-found')).backgroundColor).toBe(theme.colorSurface);
    expect(flat(getByTestId('seg-saw')).backgroundColor).toBeUndefined();
  });

  // An unanswered record selects nothing rather than a default the owner never picked.
  it('selects no segment when the value is null', () => {
    const { getByTestId } = render(
      <SegmentedControl<Mode> options={OPTIONS} value={null} onChange={() => {}} testID="seg" />,
    );
    for (const id of ['seg-saw', 'seg-found']) {
      expect(getByTestId(id).props.accessibilityState).toMatchObject({ selected: false });
    }
  });

  // C-5: flush siblings at the floor carry no slop, so neighbours never share a band.
  it('holds each segment at the 44pt floor with no hitSlop', () => {
    const { getByTestId } = render(
      <SegmentedControl<Mode> options={OPTIONS} value="saw" onChange={() => {}} testID="seg" />,
    );
    for (const id of ['seg-saw', 'seg-found']) {
      expect(flat(getByTestId(id)).minHeight).toBe(theme.hitTarget);
      expect(getByTestId(id).props.hitSlop).toBeUndefined();
    }
  });

  it('announces the visible word unless an option names a fuller one', () => {
    const { getByTestId } = render(
      <SegmentedControl<Mode>
        options={[OPTIONS[0], { ...OPTIONS[1], accessibilityLabel: 'Found it afterwards' }]}
        value="saw"
        onChange={() => {}}
        testID="seg"
      />,
    );
    expect(getByTestId('seg-saw').props.accessibilityLabel).toBeUndefined();
    expect(getByTestId('seg-found').props.accessibilityLabel).toBe('Found it afterwards');
    expect(getByTestId('seg-saw').props.accessibilityRole).toBe('button');
  });
});
