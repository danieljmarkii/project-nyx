import { render, fireEvent, within } from '@testing-library/react-native';
import { StoolFieldsEditor } from './StoolFieldsEditor';
import type { StoolEditableFields } from '../../lib/analysis';
import { commonAncestor, facing, flat, owningTouchable } from '../../testUtils/tree';

// CUL-154 — the owner's correction editor for a stool read, on the shared chip
// primitives (sibling of VomitFieldsEditor.test.tsx). GUARDS red before the
// convergence: labelled radio groups, a checkbox Contents group, and no shared tap
// zone between wrapped rows. REFACTOR SAFETY green before and after: tap-to-clear,
// and the blood rule that a move away from "Present" drops the blood type.

jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

const INITIAL: StoolEditableFields = {
  stool_consistency: 'type_1_hard_lumps',
  stool_colour: null,
  stool_content: ['grass'],
  stool_blood_present: 'yes',
  stool_blood_type: 'fresh_red',
  stool_mucus_present: null,
  foreign_material_present: null,
  foreign_material_note: null,
  description: null,
};

function renderEditor(initial: StoolEditableFields = INITIAL) {
  const onSave = jest.fn();
  const utils = render(
    <StoolFieldsEditor initial={initial} saving={false} onSave={onSave} onCancel={() => {}} />,
  );
  return { ...utils, onSave };
}

describe('StoolFieldsEditor', () => {
  it.each(['Consistency', 'Colour', 'Blood', 'Kind of blood', 'Mucus', 'Foreign material'])(
    'renders %s as a labelled radio group',
    (field) => {
      const { getByLabelText } = renderEditor();
      const group = getByLabelText(field);
      expect(group.props.accessibilityRole).toBe('radiogroup');
      expect(within(group).getAllByRole('radio').length).toBeGreaterThan(1);
    },
  );

  it('marks the stored value as the selected radio, scoped to its own field', () => {
    const { getByLabelText } = renderEditor();
    // "Present" is a label in both Blood and Mucus — the group scope is what tells
    // them apart, for a screen reader as much as for this test.
    expect(within(getByLabelText('Blood')).getByRole('radio', { name: 'Present' }).props.accessibilityState.selected).toBe(true);
    expect(within(getByLabelText('Mucus')).getByRole('radio', { name: 'Present' }).props.accessibilityState.selected).toBe(false);
  });

  it('renders Contents as checkboxes carrying their checked state', () => {
    const { getByLabelText } = renderEditor();
    const contents = within(getByLabelText('Contents'));
    expect(contents.getByRole('checkbox', { name: 'Grass' }).props.accessibilityState.checked).toBe(true);
    expect(contents.getByRole('checkbox', { name: 'Hair' }).props.accessibilityState.checked).toBe(false);
  });

  // C-5 — the rendered row gap against the rendered vertical reach, the row found
  // as the two chips' common ancestor (unique chip labels, so the pre-fix tree reds
  // on the gap, not on a missing group label).
  it.each([
    ['Consistency', 'Hard lumps', 'Watery'],
    ['Colour', 'Brown', 'Green'],
    ['Contents', 'Grass', 'Hair'],
    ['Kind of blood', 'Fresh red', 'Dark / tarry'],
  ])('keeps vertically adjacent chips in %s from sharing a tap zone', (_field, a, b) => {
    const { getByText } = renderEditor();
    const chipA = owningTouchable(getByText(a));
    const chipB = owningTouchable(getByText(b));
    const row = commonAncestor(chipA, chipB);
    const rowGap = flat(row).rowGap ?? flat(row).gap ?? 0;
    const reach = facing(chipA, 'bottom') + facing(chipB, 'top');
    expect(reach).toBeGreaterThan(0);
    expect(rowGap).toBeGreaterThanOrEqual(reach);
  });

  it('re-tapping the selected value clears it to null on Save (tap-to-clear)', () => {
    const { getByText, onSave } = renderEditor();
    fireEvent.press(getByText('Hard lumps'));
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ ...INITIAL, stool_consistency: null });
  });

  // The server rule, mirrored: a blood correction away from "Present" must never
  // leave an orphan blood type behind. Blood's row renders above Mucus's, so the
  // first "None visible" is Blood's in both the old tree and the new one.
  it('moving Blood away from Present drops the blood type', () => {
    const { getAllByText, getByText, queryByText, onSave } = renderEditor();
    fireEvent.press(getAllByText('None visible')[0]);
    expect(queryByText('Fresh red')).toBeNull();
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ ...INITIAL, stool_blood_present: 'no', stool_blood_type: null });
  });

  it('clearing Blood (re-tap Present) also drops the blood type', () => {
    const { getAllByText, getByText, onSave } = renderEditor();
    fireEvent.press(getAllByText('Present')[0]);
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ ...INITIAL, stool_blood_present: null, stool_blood_type: null });
  });

  it('a Contents toggle reaches Save, and clearing the last one stores null', () => {
    const { getByText, onSave } = renderEditor();
    fireEvent.press(getByText('Grass'));
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ ...INITIAL, stool_content: null });
  });
});
