import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import {
  AdherenceChipRow,
  CHIP_HITSLOP,
  CHIP_MIN_HEIGHT,
  CHIP_COLUMN_GAP,
  CHIP_ROW_GAP,
} from './AdherenceChipRow';

const TAP_TARGET_FLOOR = 44; // iOS HIG

type Node = { type: unknown; props: Record<string, any>; parent: Node | null };

// The chips carry no accessibilityLabel — the label text IS the accessible name
// — so reach the touchable by walking up from the label, as FilterChip.test does.
function chipHost(getByText: (t: string) => unknown, label: string): Node {
  let node = getByText(label) as Node | null;
  while (node) {
    if (typeof node.type === 'string' && node.props.accessible) return node;
    node = node.parent;
  }
  throw new Error(`no accessible touchable found for chip "${label}"`);
}

describe('AdherenceChipRow', () => {
  it('reports the tapped adherence state', () => {
    const onChange = jest.fn();
    const { getByText } = render(<AdherenceChipRow value="given" onChange={onChange} />);
    fireEvent.press(getByText('Refused'));
    expect(onChange).toHaveBeenCalledWith('refused');
  });

  it('renders nothing read-only with no value, and one static chip with one', () => {
    const { toJSON } = render(<AdherenceChipRow value={null} />);
    expect(toJSON()).toBeNull();

    const { getByText, queryByText } = render(<AdherenceChipRow value="partial" />);
    expect(getByText('Partial')).toBeTruthy();
    expect(queryByText('Given')).toBeNull();
  });

  // ── CUL-579 / CUL-612: the tap target, asserted rather than eyeballed. ──
  // These chips are the sole surface for resolving an in-doubt dose on the
  // medication completion card, so both halves matter: enough reach to hit, and
  // no shared reach that lands the tap on the neighbour.
  describe('tap targets', () => {
    // The two assertions below reason about the CONSTANTS. That is only worth
    // anything if the component actually applies them, so this closes the loop
    // on the rendered node: a correct constant sitting unused is the same
    // 32pt chip with extra confidence attached.
    it('applies the pinned height and the split gaps to what it renders', () => {
      const { getByText } = render(<AdherenceChipRow value="given" onChange={() => {}} />);
      const chip = StyleSheet.flatten(chipHost(getByText, 'Given').props.style);
      expect(chip.minHeight).toBe(CHIP_MIN_HEIGHT);

      // The wrapping row: the nearest HOST ancestor above the chip (the chip's
      // immediate parents are composite elements, which carry no style).
      let n: any = chipHost(getByText, 'Given').parent;
      while (n && typeof n.type !== 'string') n = n.parent;
      const row = StyleSheet.flatten(n.props.style);
      expect(row.columnGap).toBe(CHIP_COLUMN_GAP);
      expect(row.rowGap).toBe(CHIP_ROW_GAP);
      expect(row.gap).toBeUndefined(); // a single `gap` would re-couple the two
    });

    it('every editable chip carries the vertical slop', () => {
      const { getByText } = render(<AdherenceChipRow value="given" onChange={() => {}} />);
      for (const label of ['Given', 'Partial', 'Missed', 'Refused']) {
        expect(chipHost(getByText, label).props.hitSlop).toEqual(CHIP_HITSLOP);
      }
    });

    // The first draft of this test modelled the pill's height from its fontSize
    // and got 37 — it forgot the borders and used the glyph size where the line
    // box belongs. That is the reason CHIP_MIN_HEIGHT is pinned in the component
    // rather than inferred here: a tap-target floor resting on a font metric no
    // test can compute is a floor nobody is actually holding.
    it('the pinned box plus the slop reaches the 44pt floor', () => {
      expect(CHIP_MIN_HEIGHT).toBeLessThan(TAP_TARGET_FLOOR); // the defect being fixed
      expect(CHIP_MIN_HEIGHT + CHIP_HITSLOP.top + CHIP_HITSLOP.bottom)
        .toBeGreaterThanOrEqual(TAP_TARGET_FLOOR);
    });

    // Horizontal neighbours (Missed | Refused) are 6pt apart. Any horizontal slop
    // at all would have both reach into that gap and the boundary tap would
    // resolve by z-order — a pet-driven refusal recorded as an owner-driven miss.
    it('claims no horizontal reach, so the column gap is never shared', () => {
      const slop = CHIP_HITSLOP as { left?: number; right?: number };
      expect(slop.left ?? 0).toBe(0);
      expect(slop.right ?? 0).toBe(0);
      expect(CHIP_COLUMN_GAP).toBeGreaterThan(0);
    });

    // The row wraps, so two LINES of chips are vertical neighbours — and vertical
    // is exactly where the slop lives. The row gap has to clear both sides' reach.
    it('the row gap clears two wrapped lines of vertical slop', () => {
      expect(CHIP_ROW_GAP).toBeGreaterThanOrEqual(CHIP_HITSLOP.bottom + CHIP_HITSLOP.top);
    });
  });
});
