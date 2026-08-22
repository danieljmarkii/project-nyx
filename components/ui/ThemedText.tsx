import { Text, TextStyle, StyleProp, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

/**
 * ThemedText — the app's body-text primitive (B-061 / CUL-364, spec §7).
 *
 * Why this exists: React Native does NOT synthesize weights for custom fonts, so
 * `fontWeight: '500'` on the loaded `Geist` face renders at 400. Each weight is
 * registered as its own family (`lib/fonts.ts`), which means every Geist call site
 * would otherwise have to spell BOTH the weight token and the matching family —
 * two facts that must agree, in ~39 files. This component derives the second from
 * the first, so a style sheet keeps saying `fontWeight: theme.weightMedium` and the
 * right face resolves.
 *
 * Deliberately NOT a default-`Text` override (D9, the no-magic rule): a raw `<Text>`
 * still renders the system face. The migration is a visible, per-file swap, and a
 * reader of any style sheet can see why the text looks the way it does.
 */

/**
 * The weight → family map. Only three faces are loaded, so anything heavier than
 * semibold resolves to the heaviest one we have rather than silently falling back
 * to regular (which is what an unmapped family would render). No call site uses
 * `'700'`/`'bold'` today — the branch is there so a future one degrades sensibly.
 */
export function fontFamilyForWeight(weight: TextStyle['fontWeight']): string {
  switch (String(weight)) {
    case '500':
      return theme.fontBodyMedium;
    case '600':
    case '700':
    case '800':
    case '900':
    case 'bold':
      return theme.fontBodySemibold;
    default:
      // '400' | 'normal' | lighter | undefined — the regular face.
      return theme.fontBody;
  }
}

/**
 * Resolves a caller's style into one carrying an explicit Geist family.
 *
 * Two rules, both load-bearing:
 *  1. An explicit `fontFamily` wins and the style passes through untouched — that
 *     is how the display face (Newsreader, the AI Signal headline) survives a sweep.
 *  2. When we DO set the family from the weight, the `fontWeight` is dropped. The
 *     weight is expressed by the family; leaving the numeric weight behind lets
 *     Android synthesize a faux-bold on top of an already-bold face (on iOS it is
 *     merely inert). The rendered weight is unchanged either way.
 */
export function resolveThemedTextStyle(style?: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (flat?.fontFamily) return style;

  const { fontWeight, ...rest } = flat ?? {};
  return { ...rest, fontFamily: fontFamilyForWeight(fontWeight) };
}

// ComponentPropsWithRef, not ComponentProps: React 19 passes `ref` to a function
// component as an ordinary prop (no `forwardRef` — deprecated), so the spread below
// already attaches it to the underlying Text at runtime. RN's `TextProps` alone does
// not declare `ref`, though, so the plain ComponentProps form type-errors at any call
// site that passes one while working perfectly. Verified both halves rather than
// assumed — a primitive five sweeps build on should not have a docstring its types
// contradict.
export type ThemedTextProps = React.ComponentPropsWithRef<typeof Text>;

/**
 * Drop-in replacement for `<Text>`. Every other prop — `numberOfLines`,
 * `accessibilityRole`, `onPress`, `ref` — passes straight through.
 *
 * Known limit, by design: family resolution is per-component, not inherited. Every
 * ThemedText injects an explicit `fontFamily` — including a bare one with no style at
 * all — so nesting ThemedText inside ThemedText for inline emphasis breaks RN's native
 * text-style cascade EVERY time, not just when the child is unstyled. Two ways out,
 * both fine: give the nested span the weight it should render, or nest a raw `<Text>`,
 * which inherits the ancestor ThemedText's resolved family through the native cascade.
 */
export function ThemedText({ style, ...rest }: ThemedTextProps) {
  return <Text {...rest} style={resolveThemedTextStyle(style)} />;
}
