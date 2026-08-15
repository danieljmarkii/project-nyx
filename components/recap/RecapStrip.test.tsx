// RecapStrip (DR-1 §2.5/§2.6) — the flat night doorway for the trial + med strips.
// Assertions: it renders title + fact and fires onPress; a withholding fact reads in
// the night symptom rose (never a cheery line); a null fact (collapsed course) is
// omitted.
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { UtensilsCrossed } from 'lucide-react-native';
import { RecapStrip } from './RecapStrip';
import { theme } from '../../constants/theme';

describe('RecapStrip', () => {
  it('renders title + fact and doors on press', () => {
    const onPress = jest.fn();
    const { getByText, getByRole } = render(
      <RecapStrip
        glyph={UtensilsCrossed}
        tint={theme.colorAccent}
        title="Whitefish trial"
        fact="Day 12 of 28 · 2 trial-diet meals logged today"
        onPress={onPress}
      />,
    );
    expect(getByText('Whitefish trial')).toBeTruthy();
    expect(getByText('Day 12 of 28 · 2 trial-diet meals logged today')).toBeTruthy();
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reads a withholding fact in the night symptom rose', () => {
    const { getByText } = render(
      <RecapStrip
        glyph={UtensilsCrossed}
        tint={theme.colorEventMedicationOnNight}
        title="Metronidazole"
        fact="Yesterday’s dose refused"
        isConcern
        onPress={jest.fn()}
      />,
    );
    const style = StyleSheet.flatten(getByText('Yesterday’s dose refused').props.style);
    expect(style.color).toBe(theme.colorEventSymptomOnNight);
  });

  it('omits the fact line when null (a collapsed course carries it in the header)', () => {
    const { queryByText, getByText } = render(
      <RecapStrip
        glyph={UtensilsCrossed}
        tint={theme.colorAccent}
        title="Amoxicillin · 2 doses logged today"
        fact={null}
        onPress={jest.fn()}
      />,
    );
    expect(getByText('Amoxicillin · 2 doses logged today')).toBeTruthy();
    expect(queryByText('undefined')).toBeNull();
  });
});
