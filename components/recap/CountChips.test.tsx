// CountChips (DR-1 §2.3 — C2). Assertions: it paints the pure DayCountChip models,
// a symptom chip carries the rose tone, and an empty set renders nothing.
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CountChips } from './CountChips';
import { theme } from '../../constants/theme';
import type { DayCountChip } from '../../lib/daySummary';

describe('CountChips', () => {
  it('renders each chip’s label', () => {
    const chips: DayCountChip[] = [
      { key: 'vomit', label: '1 vomit', tone: 'symptom' },
      { key: 'meal', label: '2 meals', tone: 'neutral' },
    ];
    const { getByText } = render(<CountChips chips={chips} />);
    // The count is bolded and the noun muted (two Text spans) — match the noun fragment.
    expect(getByText('vomit', { exact: false })).toBeTruthy();
    expect(getByText('meals', { exact: false })).toBeTruthy();
  });

  it('tones a symptom chip’s count in the night rose', () => {
    const { getByText } = render(
      <CountChips chips={[{ key: 'vomit', label: '1 vomit', tone: 'symptom' }]} />,
    );
    const style = StyleSheet.flatten(getByText('1').props.style);
    expect(style.color).toBe(theme.colorEventSymptomOnNight);
  });

  it('renders nothing when there are no chips', () => {
    const { toJSON } = render(<CountChips chips={[]} />);
    expect(toJSON()).toBeNull();
  });
});
