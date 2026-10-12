import { act, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { COMPLETION_GROUND, CompletionMark, MARK_SIZE } from './CompletionMark';

type StyledNode = { props: { style?: unknown } };

// CUL-1691 — the grain was an iOS layer shadow traced off thin strokes. The mark must
// never carry one again: the warmth is a drawn node, present only when asked for.
describe('CompletionMark', () => {
  const shadowed = (view: ReturnType<typeof render>) =>
    view.UNSAFE_root.findAll((n: StyledNode) => {
      const s = StyleSheet.flatten(n.props?.style as never) as { shadowColor?: string } | undefined;
      return s?.shadowColor !== undefined;
    });

  it('draws the halo on a celebrate beat and no layer shadow anywhere', () => {
    const view = render(<CompletionMark halo />);
    view.getByTestId('completion-mark-halo');
    view.getByTestId('completion-mark-disc');
    expect(shadowed(view)).toHaveLength(0);
  });

  it('draws the disc alone on a calm beat', () => {
    const view = render(<CompletionMark halo={false} />);
    expect(view.queryByTestId('completion-mark-halo')).toBeNull();
    view.getByTestId('completion-mark-disc');
    expect(shadowed(view)).toHaveLength(0);
  });

  // The meal card measures this slot as the FAB flight's landing target; the halo
  // paints outside it, so the halo must never grow the box.
  it('keeps the slot at the old badge size with the halo on', () => {
    const view = render(<CompletionMark halo />);
    const disc = view.getByTestId('completion-mark-disc');
    expect(disc.props.width ?? MARK_SIZE).toBe(MARK_SIZE);
    expect(MARK_SIZE).toBe(32);
  });

  // CUL-1691 PR 1 (spec §1 Rules): the check is knocked out in the CARD'S ground, read
  // off the shared constant the cards paint with, never a hardcoded colour; the disc
  // is the glyph teal.
  it('knocks the check out in the card ground on a teal disc', () => {
    const view = render(<CompletionMark halo />);
    expect(COMPLETION_GROUND).toBe(theme.colorSurface);
    // The composite elements, not the native hosts (which hold processed colours).
    const checks = view.UNSAFE_root.findAll(
      (n: { props: { testID?: unknown; stroke?: unknown } }) =>
        n.props?.testID === 'completion-mark-check' && typeof n.props?.stroke === 'string',
    );
    expect(checks.length).toBeGreaterThan(0);
    for (const c of checks) expect(c.props.stroke).toBe(COMPLETION_GROUND);
    const discs = view.UNSAFE_root.findAll(
      (n: { props: { fill?: unknown; r?: unknown } }) => n.props?.r === 16 && typeof n.props?.fill === 'string',
    );
    expect(discs.length).toBeGreaterThan(0);
    for (const d of discs) expect(d.props.fill).toBe(theme.colorAccentGlyph);
  });

  // The 2pt white gap (D2): the gold stays transparent out to r18 of the halo's r26.
  it('starts the gold after a 2pt gap', () => {
    const view = render(<CompletionMark halo />);
    type Stop = { offset: number; opacity: number };
    const stops: Stop[] = view.UNSAFE_root
      .findAll((n: { props: { offset?: unknown; stopOpacity?: unknown } }) => n.props?.offset !== undefined && n.props?.stopOpacity !== undefined)
      .map((n: { props: { offset?: unknown; stopOpacity?: unknown } }) => ({ offset: Number(n.props.offset), opacity: Number(n.props.stopOpacity) }));
    const unique = stops.filter((s: Stop, i: number) => stops.findIndex((t: Stop) => t.offset === s.offset && t.opacity === s.opacity) === i);
    expect(unique).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 0.692, opacity: 0 },
      { offset: 0.7, opacity: 0.34 },
      { offset: 1, opacity: 0 },
    ]);
    expect(Math.round(0.692 * 26 * 10) / 10).toBe(18);
  });
});

// CUL-1691 PR 2 (spec §2.5, §3 item 2) — the mark splits into halo / disc / check-window
// layers inside the unchanged 32pt box. With no clock it draws every layer at rest, so a
// card that has not adopted the motion is drawn as before.
describe('CompletionMark — the layers', () => {
  const { Animated } = jest.requireActual<typeof import('react-native')>('react-native');
  const { COMPLETION_MOTION } = jest.requireActual<typeof import('../motion/completionMotion')>('../motion/completionMotion');
  type Node = ReturnType<typeof render>['UNSAFE_root'];
  /** The transform as written on the composite (the host holds resolved numbers). */
  const isNode = (v: unknown) => typeof (v as { __getValue?: unknown })?.__getValue === 'function';
  const transformOf = (host: Node): Record<string, unknown>[] => {
    // Prefer the composite's transform, which holds the live nodes; the host's holds the
    // numbers it last rendered. Stop at the next testID: that is another layer.
    let n: Node | null = host;
    let fallback: Record<string, unknown>[] = [];
    while (n) {
      const flat = StyleSheet.flatten(n.props?.style as never) as { transform?: Record<string, unknown>[] } | undefined;
      if (flat?.transform) {
        if (flat.transform.some((t) => Object.values(t).some(isNode))) return flat.transform;
        if (fallback.length === 0) fallback = flat.transform;
      }
      n = n.parent;
      if (n && n.props?.testID && n.props.testID !== host.props.testID) break;
    }
    return fallback;
  };
  const value = (node: unknown): number => (isNode(node) ? (node as { __getValue(): number }).__getValue() : Number(node));

  function motion(write: number) {
    return {
      disc: new Animated.Value(1),
      write: new Animated.Value(write),
      halo: new Animated.Value(1),
      layers: new Animated.Value(1),
    };
  }

  it('at rest (no clock): the layers carry no transform, and no cover sits over the check', () => {
    for (const reveal of ['window', 'cover'] as const) {
      const view = render(<CompletionMark halo reveal={reveal} />);
      expect(transformOf(view.getByTestId('completion-mark-disc-layer'))).toEqual([]);
      expect(view.queryByTestId('completion-mark-check-cover')).toBeNull();
      view.getByTestId('completion-mark-check');
      view.unmount();
    }
  });

  it('the window: the outer and inner slides come off one value and cancel, so the check never moves', () => {
    const m = motion(0);
    const view = render(<CompletionMark halo motion={m} reveal="window" />);
    const outer = view.getByTestId('completion-mark-check-window');
    const tx = (host: Node) => transformOf(host).find((t) => 'translateX' in t)!.translateX;
    const inner = view.getByTestId('completion-mark-check-window-inner');
    for (const w of [0, 0.25, 0.5, 1]) {
      act(() => m.write.setValue(w));
      const o = value(tx(outer));
      const i = value(tx(inner));
      expect(o + i).toBeCloseTo(0, 6);
      expect(o).toBeCloseTo((w - 1) * COMPLETION_MOTION.checkBox.w, 6);
    }
  });

  it('the cover: a teal patch shrinking about the check’s right edge as it is written', () => {
    const m = motion(0);
    const view = render(<CompletionMark halo motion={m} reveal="cover" />);
    const cover = view.getByTestId('completion-mark-check-cover');
    const flat = StyleSheet.flatten(cover.props.style) as { transformOrigin?: string; backgroundColor?: string };
    expect(flat.transformOrigin).toBe('right');
    const sx = transformOf(cover).find((t) => 'scaleX' in t)!.scaleX;
    expect(value(sx)).toBe(1);
    act(() => m.write.setValue(1));
    expect(value(sx)).toBe(0);
  });

  // The 2pt gap holds on every frame: the gold fades, it never grows.
  it('the halo is opacity only, at scale 1', () => {
    const view = render(<CompletionMark halo motion={motion(1)} />);
    const layer = view.getByTestId('completion-mark-halo-layer');
    expect(transformOf(layer)).toEqual([]);
  });

  it('the disc layer scales, never the SVG', () => {
    const m = motion(1);
    m.disc.setValue(0.6);
    const view = render(<CompletionMark halo={false} motion={m} />);
    const scale = transformOf(view.getByTestId('completion-mark-disc-layer')).find((t) => 'scale' in t)!.scale;
    expect(value(scale)).toBe(0.6);
    expect(view.getByTestId('completion-mark-disc').props.transform).toBeUndefined();
  });
});
