import { ComponentType, ReactNode } from 'react';
import Svg from 'react-native-svg';
import { theme } from '../../constants/theme';

// The house line, in exactly one place (B-745 PR 1; extracted here for CUL-599).
//
// It started life private to components/event/eventGlyphs.tsx, which was right while
// the only drawn marks were event glyphs. The tab bar's three nav glyphs (house /
// clock / bowl, spec §1) are drawn on the SAME line, so the wrapper stops being
// event-specific the moment they exist — and the wrapper's whole point is that the
// line rule can't drift glyph-to-glyph. It lives here now; eventGlyphs re-exports it
// so no existing call site changes.
//
// House line style (design principles §Iconography, matched to the round-4 event mock
// and round 1 §01 of the app-polish mock): a 24×24 viewBox, no fill, 1.75px stroke,
// round caps + joins. Every family glyph is `<GlyphSvg {...props}>` around its paths.

export type GlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

// The shared glyph interface: any component that takes the icon-kit's three props.
// Both a Lucide icon and the drawn customs satisfy it, so a map holding either stays
// type-safe without an `as` cast (CLAUDE.md "no magic").
export type Glyph = ComponentType<GlyphProps>;

// Defaults live here (color = the icon rule's secondary tint) so a bare render is
// sane; every in-app call passes an explicit trio.
export function GlyphSvg({
  size = 24,
  color = theme.colorTextSecondary,
  strokeWidth = 1.75,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}
