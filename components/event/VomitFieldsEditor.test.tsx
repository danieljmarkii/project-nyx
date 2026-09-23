import { render, fireEvent, within } from '@testing-library/react-native';
import { VomitFieldsEditor } from './VomitFieldsEditor';
import type { VomitEditableFields } from '../../lib/analysis';
import { commonAncestor, facing, flat, owningTouchable } from '../../testUtils/tree';

// CUL-154 — the owner's correction editor for a vomit read, on the shared chip
// primitives. Two halves, split by required direction (C-18):
//   · GUARDS (red before the convergence): every single-select field is a labelled
//     radio group, Contents is a checkbox group, and two wrapped rows of chips do
//     not share a tap zone.
//   · REFACTOR SAFETY (green before and after): tap-to-clear still clears, and a
//     changed field still reaches Save.

jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

const INITIAL: VomitEditableFields = {
  colour: 'yellow',
  consistency: null,
  contents: ['bile'],
  blood_present: null,
  foreign_material_present: null,
  foreign_material_note: null,
  description: null,
};

function renderEditor(initial: VomitEditableFields = INITIAL) {
  const onSave = jest.fn();
  const utils = render(
    <VomitFieldsEditor initial={initial} saving={false} onSave={onSave} onCancel={() => {}} />,
  );
  return { ...utils, onSave };
}

describe('VomitFieldsEditor', () => {
  it.each(['Colour', 'Consistency', 'Blood', 'Foreign material'])(
    'renders %s as a labelled radio group',
    (field) => {
      const { getByLabelText } = renderEditor();
      const group = getByLabelText(field);
      expect(group.props.accessibilityRole).toBe('radiogroup');
      expect(within(group).getAllByRole('radio').length).toBeGreaterThan(1);
    },
  );

  it('marks the stored single-select value as the selected radio', () => {
    const { getByLabelText } = renderEditor();
    const colour = within(getByLabelText('Colour'));
    expect(colour.getByRole('radio', { name: 'Yellow' }).props.accessibilityState.selected).toBe(true);
    expect(colour.getByRole('radio', { name: 'Green' }).props.accessibilityState.selected).toBe(false);
  });

  it('renders Contents as checkboxes carrying their checked state', () => {
    const { getByLabelText } = renderEditor();
    const contents = within(getByLabelText('Contents'));
    expect(contents.getByRole('checkbox', { name: 'Bile' }).props.accessibilityState.checked).toBe(true);
    expect(contents.getByRole('checkbox', { name: 'Foam' }).props.accessibilityState.checked).toBe(false);
  });

  // C-5: two wrapped rows face each other vertically, each chip reaching its full
  // vertical hitSlop into the gap. Read the RENDERED row gap off the flattened
  // style and the RENDERED reach off the chip, never restated tokens.
  //
  // Found by the chip's own (unique) label rather than the group's, so the pre-fix
  // tree reaches the gap assertion and reds ON it, not on a missing label.
  it.each([
    ['Colour', 'Yellow', 'Green'],
    ['Contents', 'Bile', 'Foam'],
  ])('keeps vertically adjacent chips in %s from sharing a tap zone', (_field, a, b) => {
    const { getByText } = renderEditor();
    const chipA = owningTouchable(getByText(a));
    const chipB = owningTouchable(getByText(b));
    const row = commonAncestor(chipA, chipB);
    const rowGap = flat(row).rowGap ?? flat(row).gap ?? 0;
    // A wrapped chip faces the one below it across the row gap: its bottom reach
    // plus the lower chip's top reach, both off the rendered hitSlop.
    const reach = facing(chipA, 'bottom') + facing(chipB, 'top');
    expect(reach).toBeGreaterThan(0); // non-vacuity: the chips really do reach
    expect(rowGap).toBeGreaterThanOrEqual(reach);
  });

  // The refactor-safety half queries by chip text alone (each label below is unique
  // on this editor), so it runs unchanged against the pre-convergence tree.
  it('re-tapping the selected value clears it to null on Save (tap-to-clear)', () => {
    const { getByText, onSave } = renderEditor();
    fireEvent.press(getByText('Yellow'));
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ ...INITIAL, colour: null });
  });

  it('a new pick and a Contents toggle both reach Save', () => {
    const { getByText, onSave } = renderEditor();
    fireEvent.press(getByText('Foamy'));
    fireEvent.press(getByText('Bile'));
    fireEvent.press(getByText('Foam'));
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ ...INITIAL, consistency: 'foamy', contents: ['foam'] });
  });

  it('clearing the last Contents chip stores null, not an empty list', () => {
    const { getByText, onSave } = renderEditor();
    fireEvent.press(getByText('Bile'));
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ ...INITIAL, contents: null });
  });
});
