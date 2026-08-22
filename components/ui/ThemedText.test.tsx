import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemedText, resolveThemedTextStyle, fontFamilyForWeight } from './ThemedText';
import { theme } from '../../constants/theme';

// The whole point of the primitive is that a style sheet keeps saying
// `fontWeight: theme.weightMedium` and the matching FAMILY resolves — RN does not
// synthesize weights for custom fonts, so a wrong family is a silently wrong render
// (400 everywhere) rather than a crash. These assert the mapping, not the pixels.

const styleOf = (element: React.ReactElement) =>
  StyleSheet.flatten(render(element).getByText('Nyx').props.style) as Record<string, unknown>;

describe('fontFamilyForWeight', () => {
  it('maps the three weight tokens to the three loaded faces', () => {
    expect(fontFamilyForWeight(theme.weightRegular)).toBe(theme.fontBody);
    expect(fontFamilyForWeight(theme.weightMedium)).toBe(theme.fontBodyMedium);
    expect(fontFamilyForWeight(theme.weightSemibold)).toBe(theme.fontBodySemibold);
  });

  it('maps the legacy compatibility tokens too', () => {
    expect(fontFamilyForWeight(theme.fontWeightRegular)).toBe(theme.fontBody);
    expect(fontFamilyForWeight(theme.fontWeightMedium)).toBe(theme.fontBodyMedium);
  });

  it('degrades an unloaded heavy weight to the heaviest loaded face, never to regular', () => {
    expect(fontFamilyForWeight('bold')).toBe(theme.fontBodySemibold);
    expect(fontFamilyForWeight('700')).toBe(theme.fontBodySemibold);
    expect(fontFamilyForWeight('900')).toBe(theme.fontBodySemibold);
  });

  it('falls back to the regular face for no weight and for lighter-than-regular', () => {
    expect(fontFamilyForWeight(undefined)).toBe(theme.fontBody);
    expect(fontFamilyForWeight('normal')).toBe(theme.fontBody);
    expect(fontFamilyForWeight('300')).toBe(theme.fontBody);
  });
});

describe('resolveThemedTextStyle', () => {
  it('drops the weight once the family carries it (no Android faux-bold on a bold face)', () => {
    const resolved = StyleSheet.flatten(
      resolveThemedTextStyle({ fontWeight: theme.weightSemibold, fontSize: theme.textMD })
    );
    expect(resolved.fontFamily).toBe(theme.fontBodySemibold);
    expect(resolved.fontWeight).toBeUndefined();
    expect(resolved.fontSize).toBe(theme.textMD);
  });

  it('leaves an explicit family untouched — this is how Newsreader survives a sweep', () => {
    const display = { fontFamily: theme.fontDisplay, fontWeight: theme.weightRegular };
    const resolved = StyleSheet.flatten(resolveThemedTextStyle(display));
    expect(resolved.fontFamily).toBe(theme.fontDisplay);
    expect(resolved.fontWeight).toBe(theme.weightRegular);
  });

  it('flattens an array and honours the last-wins override', () => {
    const resolved = StyleSheet.flatten(
      resolveThemedTextStyle([{ fontWeight: theme.weightRegular }, { fontWeight: theme.weightSemibold }])
    );
    expect(resolved.fontFamily).toBe(theme.fontBodySemibold);
  });

  it('handles a conditional [base, false] array without crashing', () => {
    const resolved = StyleSheet.flatten(
      resolveThemedTextStyle([{ fontWeight: theme.weightMedium }, false])
    );
    expect(resolved.fontFamily).toBe(theme.fontBodyMedium);
  });
});

describe('ThemedText', () => {
  it('renders Geist with no style at all — a bare sweep swap already gets the body face', () => {
    expect(styleOf(<ThemedText>Nyx</ThemedText>).fontFamily).toBe(theme.fontBody);
  });

  it('renders the medium face for a weightMedium style sheet', () => {
    const styles = StyleSheet.create({ label: { fontWeight: theme.weightMedium } });
    expect(styleOf(<ThemedText style={styles.label}>Nyx</ThemedText>).fontFamily).toBe(
      theme.fontBodyMedium
    );
  });

  it('passes every other prop through — it is a drop-in for <Text>', () => {
    const { getByText } = render(
      <ThemedText numberOfLines={2} accessibilityRole="header" testID="t">
        Nyx
      </ThemedText>
    );
    expect(getByText('Nyx').props.numberOfLines).toBe(2);
    expect(getByText('Nyx').props.accessibilityRole).toBe('header');
  });
});
