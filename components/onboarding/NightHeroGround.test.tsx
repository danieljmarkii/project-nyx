import { render } from '@testing-library/react-native';
import { NightHeroGround } from './NightHeroGround';
import { theme } from '../../constants/theme';

// The starfield + aurora ground (B-284 PR N2b, spec §4). These pin the two things
// the direction is specific about: exactly 12 stars full-bleed (the PM-locked
// count within the 10–14 band) over the colorBrandNight field with the three
// aurora radials, and that the ground is non-interactive so the hero's CTAs
// beneath it stay tappable.
//
// react-native-svg resolves to native RNSVG* host components and packs colour
// props into an opaque {type, payload} ARGB int — argbPayload() reproduces that
// packing so a fill assertion compares against the real theme hex.

function argbPayload(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

function findByType(node: any, type: string): any[] {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }
    if (n.type === type) out.push(n);
    (n.children ?? []).forEach(visit);
  };
  visit(node);
  return out;
}

describe('NightHeroGround', () => {
  it('renders exactly 12 stars over the night field with three aurora radials', () => {
    const tree = render(<NightHeroGround />).toJSON();
    // 12 stars (Circle) — the PM-locked count within the §4 10–14 band.
    expect(findByType(tree, 'RNSVGCircle')).toHaveLength(12);
    // Two aurora radials + the restrained teal near the dot = 3 gradients.
    expect(findByType(tree, 'RNSVGRadialGradient')).toHaveLength(3);
    // A single base night rect in colorBrandNight.
    const rects = findByType(tree, 'RNSVGRect');
    expect(rects).toHaveLength(1);
    expect(rects[0].props.fill?.payload).toBe(argbPayload(theme.colorBrandNight));
  });

  it('is non-interactive so the hero CTAs beneath stay tappable', () => {
    const tree = render(<NightHeroGround />).toJSON() as any;
    expect(tree.props.pointerEvents).toBe('none');
  });
});
