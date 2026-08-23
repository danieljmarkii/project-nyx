import { Circle, Path } from 'react-native-svg';
import { GlyphSvg, type GlyphProps } from '../glyphs/GlyphSvg';

// The tab-bar glyph family (CUL-599 / spec §1 DP-1). Three marks, drawn on the same
// house line as the event family (components/event/eventGlyphs.tsx) through the
// shared GlyphSvg wrapper — the bar joins the icon language the event glyphs are
// moving to rather than starting a second one.
//
// The paths are VERBATIM from the design authority: app-polish mock round 1 §01
// option B, unchanged through round 2 §01's converged frame. Do not redraw them
// here — a change to the drawing is a mock round, not an edit.
//
// There is no Pet glyph: D1 ruled the Pet tab IS the pet (PetAvatar + the pet's
// name), so round 1's fourth glyph — the option-B paw — was never built.

// Home — the house. Pitched roof, flat eaves, a door.
export function HomeGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Path d="M4 11 12 4l8 7v9h-5v-5h-6v5H4z" />
    </GlyphSvg>
  );
}

// History — the clock. The record read backwards in time; pairs with the History
// tab's own time-ordered list.
export function HistoryGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 8v4l2.5 2" />
    </GlyphSvg>
  );
}

// Foods — the bowl. A shallow dish on a base; the mock's `transform` is baked into
// the coordinates instead (a transform attribute on <Path> is honoured by
// react-native-svg, but inlining it keeps the family's paths readable as plain
// geometry, the way every event glyph already is).
export function FoodsGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Path d="M4 13h16a8 8 0 0 1-16 0z" />
      <Path d="M9 20h6" />
    </GlyphSvg>
  );
}
