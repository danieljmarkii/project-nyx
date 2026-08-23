import { ComponentType, ReactNode } from 'react';
import Svg from 'react-native-svg';
import { theme } from '../../constants/theme';

// The Culprit house line, in exactly one place.
//
// Two glyph families are drawn on it: the event-icon family (components/event/
// eventGlyphs.tsx — B-745's splat/swirl, B-746's remaining six) and the tab-bar
// family (components/nav/navGlyphs.tsx — CUL-599's house/clock/bowl). They live in
// different folders because they answer to different maps (EVENT_TYPES vs. the tab
// routes), but they are one drawn language, so the line rule cannot live inside
// either one of them: this wrapper was private to eventGlyphs.tsx until the tab bar
// needed it, and a second copy is how two families quietly stop matching.
//
// House line style (design principles §Iconography, matched to the round-4 event
// mock and the app-polish round-1 §01 bar mock): a 24×24 viewBox, no fill, 1.75px
// stroke, round caps + joins. Every family glyph is `<GlyphSvg {...props}>` around
// its paths. Drawn at the 24px master; rendered at 16/20/22/24.

export type GlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

// The shared glyph interface: any component that takes the icon-kit's three props.
// A Lucide icon and a drawn family glyph both satisfy it, which is what lets a map
// hold either without an `as` cast (CLAUDE.md "no magic").
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
