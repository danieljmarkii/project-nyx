import { ComponentType, ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../../constants/theme';

// The first three glyphs of the Culprit event-icon family (B-745 PR 1). These
// replace the weakest Lucide literal matches — Droplet (vomit), Circle (formed
// stool), Droplets (loose stool) — with drawn marks that actually name their
// subject, the "clinical credibility" win the design-system README's iconography
// gap called for. B-746 commissions the remaining six; until then the family and
// the Lucide substitutes co-exist behind the ONE render path (EventIcon), which is
// why these conform to the Lucide component interface (size/color/strokeWidth) and
// are registered in EVENT_TYPES exactly like a Lucide icon — the map stays the
// single point of change.
//
// House line style (design principles §Iconography, matched to the round-4 mock):
// a 24×24 viewBox, no fill, 1.75px stroke, round caps + joins — single-sourced in
// GlyphSvg below so every family glyph (these three and B-746's six) is drawn the
// same way. Drawn at the 24px master; EventIcon renders them at 16/20/24. Per B-410
// the home-screen widget does NOT adopt these — it runs its own inlined abstract
// geometry in a bare JSC context with no imports, so a react-native-svg component
// could never reach it anyway.

export type EventGlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

// The shared glyph interface: any component that takes the icon-kit's three props.
// Both a Lucide icon and the customs below satisfy it, so EVENT_TYPES.icon can hold
// either and iconForType/EventIcon stay type-safe without an `as` cast (CLAUDE.md
// "no magic"): the map is still the single point of change.
export type EventGlyph = ComponentType<EventGlyphProps>;

// The house wrapper: the 24×24 viewBox + no-fill + 1.75-stroke + round-cap/join line
// style, in exactly one place. Every family glyph is `<GlyphSvg {...props}>` around
// its paths, so the line rule can't drift glyph-to-glyph. Defaults live here (color =
// the icon rule's secondary tint, EventIcon's own default) so a bare render is sane;
// every in-app call goes through EventIcon, which always passes an explicit trio.
function GlyphSvg({
  size = 24,
  color = theme.colorTextSecondary,
  strokeWidth = 1.75,
  children,
}: EventGlyphProps & { children: ReactNode }) {
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

// The formed-stool pile, verbatim from the round-4 mock. Shared by both stool
// glyphs so the loose sibling's body is EXACTLY the formed one (the "same language"
// point, G1a) and can never drift from the mock-verified anchor — loose only adds a
// runny ripple beneath it.
const STOOL_PILE_PATH =
  'M12 3c2 .7 2.9 2.4 2.2 4.1c1.8.2 3.1 1.5 3.1 3.1c0 .8-.3 1.6-.9 2.1c1.5.4 2.6 1.6 2.6 3.1c0 1.9-1.7 3.4-3.9 3.4H8.9c-2.2 0-3.9-1.5-3.9-3.4c0-1.5 1.1-2.7 2.6-3.1c-.6-.5-.9-1.3-.9-2.1c0-1.6 1.3-2.9 3.1-3.1C9.1 5.4 10 3.7 12 3Z';

// Vomit — the splat (G1b: V1, PM call over the team's V2 spew lean). A soft blob
// with two flecks; the flecks are `v.01` dots (the Lucide dot idiom — a zero-length
// round-capped stroke renders as a point), so they hold at the 16px row size.
export function VomitGlyph(props: EventGlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Path d="M12 5c1 0 1.6.9 2.4 1.2.9.3 2-.2 2.6.5.6.7.1 1.7.5 2.6.4.9 1.5 1.3 1.5 2.2 0 .9-1.1 1.4-1.4 2.2-.3.9.3 1.9-.4 2.6-.7.7-1.7.3-2.6.6-.8.3-1.4 1.1-2.4 1.1s-1.6-.8-2.4-1.1c-.9-.3-2 .1-2.6-.6-.7-.7-.1-1.7-.4-2.6-.3-.8-1.4-1.3-1.4-2.2 0-.9 1.1-1.3 1.5-2.2.4-.9-.1-1.9.5-2.6.6-.7 1.7-.2 2.6-.5.8-.3 1.4-1.2 2.4-1.2Z" />
      <Path d="M20.5 4.5v.01" />
      <Path d="M4 4.8v.01" />
    </GlyphSvg>
  );
}

// Stool (formed) — the swirl (G1a: the line-drawn pile; CircleDot rejected). The GI
// family's anchor; the loose sibling below shares this exact body.
export function StoolFormedGlyph(props: EventGlyphProps) {
  return (
    <GlyphSvg {...props}>
      <Path d={STOOL_PILE_PATH} />
    </GlyphSvg>
  );
}

// Loose stool — the swirl's sibling, "drawn in the same pass, same language" (G1a).
// It reuses the formed pile's body VERBATIM (the shared STOOL_PILE_PATH) and adds a
// short liquid ripple beneath it, so the pair reads as one family: formed sits on a
// flat base; loose melts into a runny line. Not in the mock (the strip drew only the
// two anchors), so the ripple is a build draft the Designer confirms at 24px on
// device — deliberately a ripple, not drips, to avoid a rain-cloud read.
export function StoolLooseGlyph(props: EventGlyphProps) {
  return (
    <GlyphSvg {...props}>
      {/* The formed pile, unchanged — the sibling shares the anchor's exact body. */}
      <Path d={STOOL_PILE_PATH} />
      {/* The runny ripple — a small two-hump liquid line just under the pile's base. */}
      <Path d="M7.5 20.5c1 .8 1.9 .8 2.9 0c1-.8 1.9-.8 2.9 0c1 .8 1.6 .7 2.2 .2" />
    </GlyphSvg>
  );
}
