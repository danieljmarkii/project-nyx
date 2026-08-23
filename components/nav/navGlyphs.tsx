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

// Foods — the bowl. The mock's SHAPE holds (a straight rim over a half-round body);
// its second path did not, and this is the one place the verbatim rule above is
// knowingly set aside — because the defect is in the drawing's geometry, not its
// intent. The mock put the base line at y=20 against a bowl whose bottom reaches
// y=21: the rim spans 16pt, so `a8 8` is a semicircle and the body descends a full
// 8pt. At the bar's 22pt that line therefore crosses the bowl's INTERIOR and reads
// as a fill level rather than the base it is meant to be.
//
// Re-centred instead: rim 7.5, body bottom 15.5, line clear of it at 17.5, where it
// reads as the mat the bowl stands on. Found by the parallel CUL-599 session
// (PR #701) and ported here verbatim — it is the same correction, and two glyph
// families diverging on the same mark is exactly what the shared wrapper prevents.
// A build draft the Designer confirms at 22pt on device, the standing the
// loose-stool ripple already ships under (B-745).
export function FoodsGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Path d="M4 7.5h16a8 8 0 0 1-16 0Z" />
      <Path d="M8.5 17.5h7" />
    </GlyphSvg>
  );
}
