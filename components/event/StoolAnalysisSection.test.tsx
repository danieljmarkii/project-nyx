// Safety-critical render branches for the stool read (B-247 PR 6), mirroring
// VomitAnalysisSection.test.tsx — the render-order regressions the pure decode
// tests can't catch, pinned as component tests:
//   • capped (no flags) → the calm cap state: no retry, no reassurance
//   • read_disabled (no flags) → renders nothing, no dead affordance
//   • a fired contextual flag → the server writes a normal `completed` escalation,
//     so the client renders "Worth a call" even though the incident was capped/off
//     (never-reassure survives the cap by construction)
// Plus the Bristol-as-secondary framing (§3.4): the plain-language texture leads,
// the Bristol number is a quiet secondary annotation.

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
// triggers analysis, but the import must resolve. The edit-diff helpers return the
// real-ish shapes the render path expects.
jest.mock('../../lib/analysis', () => ({
  triggerStoolAnalysis: jest.fn(() => Promise.resolve({ error: null })),
  saveStoolFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  deriveEditedStoolFields: jest.fn(() => []),
  extractStoolEditableFromPayload: jest.fn(() => null),
  normalizeStoolEdits: jest.fn((x: unknown) => x),
}));
jest.mock('./StoolFieldsEditor', () => ({ StoolFieldsEditor: () => null }));
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import { render, waitFor } from '@testing-library/react-native';
import { StoolAnalysisSection } from './StoolAnalysisSection';

const REASSURANCE = /\b(fine|okay|ok|healthy|all clear|no worries|nothing to worry|probably fine)\b/i;

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'completed', recommendation: null, read_text: null, description: null,
    stool_consistency: null, stool_colour: null, stool_content: null,
    stool_blood_present: null, stool_blood_type: null, stool_mucus_present: null,
    foreign_material_present: null, foreign_material_note: null, ai_raw_payload: null,
    edited_at: null, dismissed_at: null, error: null, ...over,
  };
}

describe('StoolAnalysisSection — cap/flag render states', () => {
  afterEach(() => { mockRow = null; });

  it('capped (no flags): renders the calm cap state, no retry, no reassurance', async () => {
    mockRow = row({ status: 'capped' });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e1" petName="Rex" />);

    expect(await findByText(/photo reads are used up/i)).toBeTruthy();
    expect(await findByText(/If Rex's stool keeps looking off/)).toBeTruthy();
    expect(await findByText(/check in with your vet/i)).toBeTruthy();

    // No retry affordance on a cap state.
    expect(queryByText(/Try again/i)).toBeNull();
    expect(queryByText(/Re-run/i)).toBeNull();
    expect(queryByText(/Try analysis/i)).toBeNull();
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('read_disabled (no flags): renders nothing — no dead affordance', async () => {
    mockRow = row({ status: 'read_disabled' });
    const { toJSON } = render(<StoolAnalysisSection eventId="e2" petName="Rex" />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('a fired contextual flag still escalates (server writes it completed)', async () => {
    mockRow = row({
      status: 'completed',
      recommendation: 'worth_a_call',
      read_text: 'Rex has had more than one loose stool in a short window. That is worth a call to your vet.',
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e3" petName="Rex" />);

    expect(await findByText('Worth a call')).toBeTruthy();
    expect(queryByText(/photo reads are used up/i)).toBeNull(); // NOT the cap band
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('does not mis-render a capped row as the "not enough to say" fallback', async () => {
    // Guards the branch ORDER: `capped` must be caught before the `!row.recommendation`
    // fallback (which would otherwise offer a "Try analysis" retry on a capped row).
    mockRow = row({ status: 'capped' });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e4" petName="Rex" />);
    expect(await findByText(/photo reads are used up/i)).toBeTruthy();
    expect(queryByText(/Not enough to say about this one yet/i)).toBeNull();
  });
});

describe('StoolAnalysisSection — Bristol-as-secondary framing (§3.4)', () => {
  afterEach(() => { mockRow = null; });

  it('leads with the plain-language texture and shows the Bristol type as a secondary detail', async () => {
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      read_text: 'A single photo on its own can’t tell you how Rex’s gut is doing.',
      stool_consistency: 'type_6_mushy',
    });
    const { findByText } = render(<StoolAnalysisSection eventId="e5" petName="Rex" />);

    // Plain-language label is present…
    expect(await findByText('Soft and mushy')).toBeTruthy();
    // …and the Bristol number appears only as the small secondary annotation, never
    // as the value itself (never "Type 6 — soft and mushy" as one blob).
    expect(await findByText('Type 6')).toBeTruthy();
  });

  it('shows blood as a factual observation even when none is visible', async () => {
    // Blood is clinically central — shown always (unlike the n=1 read's reassurance
    // ban, which governs read_text, not a factual structured observation).
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      read_text: 'Keep an eye on things.',
      stool_blood_present: 'no',
    });
    const { findByText } = render(<StoolAnalysisSection eventId="e6" petName="Rex" />);
    expect(await findByText('Blood')).toBeTruthy();
    expect(await findByText('None visible')).toBeTruthy();
  });
});
