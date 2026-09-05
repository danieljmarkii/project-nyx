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
    expect(getByText(' · Yellow, foamy, bile · 4 findings')).toBeTruthy();
    // The facts themselves are gone from the screen…
    expect(queryByText('None visible')).toBeNull();
    expect(queryByText('Colour')).toBeNull();
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
