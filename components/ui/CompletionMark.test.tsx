import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CompletionMark, MARK_SIZE } from './CompletionMark';

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
});
