import { Circle, Path } from 'react-native-svg';
import { GlyphSvg, type Glyph, type GlyphProps } from '../ui/GlyphSvg';

// The tab bar's three nav glyphs (CUL-599, spec §1 / mock round 1 §01 option B).
//
// Drawn on the same house line as the event family (the shared `GlyphSvg` wrapper:
// 24×24 viewBox, no fill, 1.75 stroke, round caps + joins), so the bar joins the icon
// language CUL-493 is commissioning rather than pre-empting it. The Pet tab has no
// glyph on purpose — D1 ruled it IS the pet (PetAvatar + name), so only three exist.
//
// Paths are the mock's, re-centred in the 24 box: the mock drew the bowl with a
// `transform="translate(0 2)"`, which is fine in HTML but leaves the glyph sitting
// low against its siblings once every tab shares one 26pt icon row.

export type TabGlyph = Glyph;

// Home — the house. Verbatim from the mock: roof, walls, and the door as a notch in
// the bottom edge, all one closed path.
export function HomeGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Path d="M4 11 12 4l8 7v9h-5v-5h-6v5H4z" />
    </GlyphSvg>
  );
}

// History — the clock. Verbatim from the mock: the dial plus a single hand pair.
export function HistoryGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 8v4l2.5 2" />
    </GlyphSvg>
  );
}

// Foods — the bowl. The mock's shape (a straight rim over a half-round body) held up;
// its SECOND path did not. In the mock that line sat at y=20 against a bowl whose
// bottom reached y=21, so at the bar's 22pt it crossed the bowl's interior and read as
// a fill line rather than the base it was meant to be. Here the bowl is re-centred
// (rim 7.5, body bottom 15.5) and the line moved clear of it at 17.5, where it reads
// as the mat the bowl stands on. Deliberately a build draft the Designer confirms at
// 22pt on device — the same standing the loose-stool ripple ships under (B-745).
export function FoodsGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Path d="M4 7.5h16a8 8 0 0 1-16 0Z" />
      <Path d="M8.5 17.5h7" />
    </GlyphSvg>
  );
}
