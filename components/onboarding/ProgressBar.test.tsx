import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ProgressBar } from './ProgressBar';
import { theme } from '../../constants/theme';

function bgColor(node: { props: { style: unknown } }): string | undefined {
  const flat = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
  return flat.backgroundColor as string | undefined;
}

describe('ProgressBar', () => {
  it('renders one segment per step', () => {
    const { getAllByTestId } = render(<ProgressBar current={2} total={5} />);
    expect(getAllByTestId(/^progress-segment-/)).toHaveLength(5);
  });

  it('fills segments up to the current step and leaves the rest empty', () => {
    const { getByTestId } = render(<ProgressBar current={2} total={5} />);
    // Steps 1–2 reached → segments 0,1 accent-filled; 2,3,4 border-empty.
    expect(bgColor(getByTestId('progress-segment-0'))).toBe(theme.colorAccent);
    expect(bgColor(getByTestId('progress-segment-1'))).toBe(theme.colorAccent);
    expect(bgColor(getByTestId('progress-segment-2'))).toBe(theme.colorBorder);
    expect(bgColor(getByTestId('progress-segment-3'))).toBe(theme.colorBorder);
    expect(bgColor(getByTestId('progress-segment-4'))).toBe(theme.colorBorder);
  });

  it('exposes step position to a screen reader', () => {
    const { getByLabelText } = render(<ProgressBar current={3} total={5} />);
    const bar = getByLabelText('Step 3 of 5');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 3 });
  });

  it('clamps an over-range current so it never over-fills', () => {
    const { getAllByTestId, getByLabelText } = render(<ProgressBar current={9} total={5} />);
    const filled = getAllByTestId(/^progress-segment-/).filter(
      (n) => bgColor(n) === theme.colorAccent,
    );
    expect(filled).toHaveLength(5);
    expect(getByLabelText('Step 5 of 5')).toBeTruthy();
  });

  it('renders no segments (but stays labelled) for a non-positive total', () => {
    const { queryAllByTestId, getByLabelText } = render(<ProgressBar current={0} total={0} />);
    expect(queryAllByTestId(/^progress-segment-/)).toHaveLength(0);
    expect(getByLabelText('Step 0 of 0')).toBeTruthy();
  });
});
