import { render } from '@testing-library/react-native';
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
