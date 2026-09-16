import { render, screen } from '@testing-library/react-native';
import { VisitEditBody, type VisitEditFields } from './VisitEditBody';

// CUL-953 item 1 — the note under the date field.
//
// The screen rendered *"Moving this date moves where {pet}'s vet report starts"*
// UNCONDITIONALLY, on every visit. It is true only for the visit the window keys
// off, so an owner correcting a typo on a March visit — with April's already on
// record — was told they had just moved their report window. False, and the kind of
// false an owner cannot check.
//
// This file exists because the gate could not be proven without it: the predicate
// behind it (`visitAnchorsAnything`) is exhaustively tested in lib/vetVisitPlan, and
// a mutant that DELETED the gate here still left that suite green. A rule and its
// wiring are two claims.

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: Record<string, unknown>) => <View {...props} /> };
});

const FIELDS: VisitEditFields = {
  visitedAt: new Date(2026, 2, 14, 12, 0),
  clinicName: 'Riverside Animal Hospital',
  vetName: 'Dr. Chen',
  reason: 'Recheck',
  notes: '',
};

function renderBody(movesReportWindow: boolean) {
  return render(
    <VisitEditBody
      petName="Mochi"
      fields={FIELDS}
      onChangeField={() => {}}
      saving={false}
      onSave={() => {}}
      movesReportWindow={movesReportWindow}
    />,
  );
}

const NOTE = /Moving this date moves where/;

describe('VisitEditBody — the report-window note', () => {
  it('states the consequence for the visit that actually anchors the window', () => {
    renderBody(true);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it('says NOTHING for a visit logged behind one already on record', () => {
    // The March-typo case. Silence is the correct output here, not a softened
    // sentence: there is no consequence to describe, and a hedged version of a
    // consequence that does not exist would still be a claim about their data.
    renderBody(false);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('keeps the date itself editable either way', () => {
    // The gate withholds a SENTENCE, never the control. If a future change ever
    // moves the note's condition onto the field, this reds.
    //
    // Matched on the control's accessibility label rather than the rendered date
    // string: `formatVisitDate` drops the year inside the current one, so any
    // literal here would be asserting what year the suite is run in and would flip
    // on 1 January (C-29).
    for (const moves of [true, false]) {
      const view = renderBody(moves);
      expect(screen.getByLabelText(/^Visit date,/)).toBeTruthy();
      view.unmount();
    }
  });
});
