// §11 client-matrix rows 5/6/7 for the vomit read (T2-4) — the safety-critical
// render branches. A render-order regression here is exactly the class the pure
// decode tests can't catch, so the clinical invariant is pinned as a component test:
//   • capped (no flags) → the calm §7.3 cap state: no retry, no reassurance (row 5)
//   • read_disabled (no flags) → renders nothing, no dead affordance
//   • a fired contextual flag → the server writes a normal `completed` escalation,
//     so the client renders "Worth a call" even though the incident was capped/off
//     (rows 6/7 — never-reassure survives the cap by construction)

// A `mock`-prefixed holder the hoisted supabase mock closes over; each test sets it.
let mockRow: Record<string, unknown> | null = null;
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockRow, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
// lib/analysis pulls in the sync/supabase chain; stub it — a non-pending row never
// triggers analysis, but the import must resolve.
jest.mock('../../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(() => Promise.resolve({ error: null })),
  saveVomitFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  deriveEditedFields: jest.fn(() => []),
  extractEditableFromPayload: jest.fn(() => null),
  normalizeVomitEdits: jest.fn((x: unknown) => x),
}));
jest.mock('./VomitFieldsEditor', () => ({ VomitFieldsEditor: () => null }));
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import { render, waitFor } from '@testing-library/react-native';
import { VomitAnalysisSection } from './VomitAnalysisSection';

const REASSURANCE = /\b(fine|okay|ok|healthy|all clear|no worries|nothing to worry|probably fine)\b/i;

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'completed', recommendation: null, read_text: null, description: null,
    colour: null, contents: null, consistency: null, blood_present: null, bile_present: null,
    foreign_material_present: null, foreign_material_note: null, ai_raw_payload: null,
    edited_at: null, dismissed_at: null, error: null, ...over,
  };
}

describe('VomitAnalysisSection — T2-4 cap/flag render states', () => {
  afterEach(() => { mockRow = null; });

  it('row 5 — capped (no flags): renders the calm cap state, no retry, no reassurance', async () => {
    mockRow = row({ status: 'capped' });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e1" petName="Rex" />);

    // The §7.3 cap copy, personalized + the vet escalation.
    expect(await findByText(/photo reads are used up/i)).toBeTruthy();
    expect(await findByText(/If Rex keeps vomiting/)).toBeTruthy();
    expect(await findByText(/check in with your vet/i)).toBeTruthy();

    // No retry affordance on a cap state.
    expect(queryByText(/Try again/i)).toBeNull();
    expect(queryByText(/Re-run/i)).toBeNull();
    expect(queryByText(/Try analysis/i)).toBeNull();
    // Never reassures on absence.
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('read_disabled (no flags): renders nothing — no dead affordance', async () => {
    mockRow = row({ status: 'read_disabled' });
    const { toJSON } = render(<VomitAnalysisSection eventId="e2" petName="Rex" />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('rows 6/7 — a fired contextual flag still escalates (server writes it completed)', async () => {
    // The capped/flagged-off-but-flag-fired case is a normal completed row with the
    // floor-forced recommendation — the client must render the escalation, not a cap
    // band and not a reassurance.
    mockRow = row({ status: 'completed', recommendation: 'worth_a_call', read_text: 'Given the repeated vomiting, a call to your vet is worth it.' });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e3" petName="Rex" />);

    expect(await findByText('Worth a call')).toBeTruthy();
    expect(queryByText(/photo reads are used up/i)).toBeNull(); // NOT the cap band
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('does not mis-render a capped row as the "not enough to say" fallback', async () => {
    // Guards the branch ORDER: `capped` must be caught before the `!row.recommendation`
    // fallback (which would otherwise offer a "Try analysis" retry on a capped row).
    mockRow = row({ status: 'capped' });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e4" petName="Rex" />);
    expect(await findByText(/photo reads are used up/i)).toBeTruthy();
    expect(queryByText(/Not enough to say about this one yet/i)).toBeNull();
  });
});
