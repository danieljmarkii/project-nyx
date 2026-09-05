import { render, fireEvent } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';
import {
  ObservationGrid,
  ObservationRow,
  OBSERVATIONS_HEADING,
  OBSERVATION_FOLD_LABEL,
  OBSERVATION_FOLD_HINT,
} from './ObservationGrid';

const ROWS: ObservationRow[] = [
  { key: 'colour', label: 'Colour', value: 'Yellow', edited: false },
  { key: 'consistency', label: 'Consistency', value: 'Foamy', edited: false },
  { key: 'contents', label: 'Contents', value: 'Bile', edited: false },
  { key: 'blood_present', label: 'Blood', value: 'None visible', edited: false },
];

function grid(props: Partial<React.ComponentProps<typeof ObservationGrid>> = {}) {
  return render(
    <ObservationGrid rows={ROWS} folded={false} onToggleFold={() => {}} {...props} />,
  );
}

describe('ObservationGrid — expanded (§5.3)', () => {
  it('renders every finding as a label/value pair, label uppercased by STYLE not by string', () => {
    const { getByText } = grid();
    for (const r of ROWS) {
      // The clinical vocabulary is what a test queries; the casing is presentation.
      expect(getByText(r.label)).toBeTruthy();
      expect(getByText(r.value)).toBeTruthy();
    }
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(getByText('Colour').props.style).textTransform).toBe('uppercase');
  });

  it('marks an owner-edited row and carries the one calm provenance line', () => {
    const { getAllByText, getByText } = grid({
      rows: [{ ...ROWS[0], edited: true }],
      editedAtLabel: 'Edited Sep 3',
    });
    expect(getAllByText('Edited')).toHaveLength(1);
    expect(getByText('Edited Sep 3')).toBeTruthy();
  });

  it('offers the fold, with a hint that does NOT promise the Signal fold’s return', () => {
    const { getByText } = grid();
    const control = getByText(OBSERVATION_FOLD_LABEL);
    expect(control).toBeTruthy();
    // This fold has no material-change rule: nothing but the owner's tap re-opens it, so
    // a hint borrowed from the Signal ("it comes back on its own") would be a promise the
    // surface cannot keep.
    expect(OBSERVATION_FOLD_HINT).not.toMatch(/on its own/i);
  });

  it('does NOT offer the fold while the editor is open, or with nothing to fold to', () => {
    expect(grid({ editor: <RNText>editor</RNText> }).queryByText(OBSERVATION_FOLD_LABEL)).toBeNull();
    expect(grid({ rows: [] }).queryByText(OBSERVATION_FOLD_LABEL)).toBeNull();
  });

  it('an editor open replaces the grid but keeps the block’s heading', () => {
    const { getByText, queryByText } = grid({ editor: <RNText>editor</RNText> });
    expect(getByText('editor')).toBeTruthy();
    expect(getByText(OBSERVATIONS_HEADING)).toBeTruthy();
    expect(queryByText('Yellow')).toBeNull();
  });
});

describe('ObservationGrid — folded (§5.3)', () => {
  it('names some values, counts them all, and keeps the block’s heading on the strip', () => {
    const { getByText, queryByText } = grid({ folded: true });
    expect(getByText(OBSERVATIONS_HEADING)).toBeTruthy();
    expect(getByText(' · Yellow, foamy, bile')).toBeTruthy();
    expect(getByText(' · 4 findings')).toBeTruthy();
    // The facts themselves are gone from the screen…
    expect(queryByText('None visible')).toBeNull();
    expect(queryByText('Colour')).toBeNull();
  });

  it('the COUNT is pinned against truncation and the named values are what yield (C-8)', () => {
    // The count is what makes naming three of four rows honest rather than silently
    // partial (C-3). Clip it and the strip stops admitting it is a summary — so the
    // heading and the count are `flexShrink: 0` + `maxWidth` (the AC-CHIP composition)
    // and exactly one node carries `numberOfLines`.
    const { StyleSheet } = require('react-native');
    const { getByText } = grid({
      folded: true,
      rows: ROWS.map((r, i) => ({ ...r, value: `${r.value} a very long finding value ${i}` })),
    });
    const count = getByText(/findings$/);
    const named = getByText(/very long finding value/);
    const heading = getByText(OBSERVATIONS_HEADING);

    expect(count.props.numberOfLines).toBeUndefined();
    expect(heading.props.numberOfLines).toBeUndefined();
    expect(named.props.numberOfLines).toBe(1);

    for (const pinned of [count, heading]) {
      const st = StyleSheet.flatten(pinned.props.style);
      expect(st.flexShrink).toBe(0);
      // Without the max-width a pinned node overflows instead of ellipsing when it alone
      // overruns its line (C-8's AC-CHIP note).
      expect(st.maxWidth).toBe('100%');
    }
    expect(StyleSheet.flatten(named.props.style).flexShrink).toBe(1);
  });

  it('the strip is the way back — one tap re-opens it', () => {
    const onToggleFold = jest.fn();
    const { getByText } = grid({ folded: true, onToggleFold });
    fireEvent.press(getByText(OBSERVATIONS_HEADING));
    expect(onToggleFold).toHaveBeenCalledTimes(1);
    expect(onToggleFold).toHaveBeenCalledWith(false);
  });

  it('folding is a request, never a local decision — the control reports up', () => {
    // The host owns the state (and its persistence); this component never folds itself,
    // so a re-render of the section cannot silently drop what the owner opened.
    const onToggleFold = jest.fn();
    const { getByText } = grid({ folded: false, onToggleFold });
    fireEvent.press(getByText(OBSERVATION_FOLD_LABEL));
    expect(onToggleFold).toHaveBeenCalledWith(true);
    // Still expanded: nothing moved until the host says so.
    expect(getByText('Yellow')).toBeTruthy();
  });

  it('a fold with an editor open is ignored — the owner’s edit is never hidden under them', () => {
    const { getByText } = grid({ folded: true, editor: <RNText>editor</RNText> });
    expect(getByText('editor')).toBeTruthy();
  });

  it('the description and the Edit affordance go with the grid, not around it', () => {
    const open = grid({ description: 'Right after the 7pm meal.', onEdit: () => {} });
    expect(open.getByText('Right after the 7pm meal.')).toBeTruthy();
    expect(open.getByText('Edit')).toBeTruthy();
    const shut = grid({ folded: true, description: 'Right after the 7pm meal.', onEdit: () => {} });
    expect(shut.queryByText('Right after the 7pm meal.')).toBeNull();
    expect(shut.queryByText('Edit')).toBeNull();
  });
});
