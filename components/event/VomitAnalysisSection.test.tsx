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
  // CUL-801 — no outstanding log-path chain by default, so the section
  // triggers its own read exactly as it did before the claim landed.
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
  // The realtime watch (CUL-171) is exercised on its own in lib/analysis.test.ts;
  // here it's a jest.fn so a test can grab the re-read callback it was handed.
  watchAnalysisRow: jest.fn(() => () => {}),
  saveVomitFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  deriveEditedFields: jest.fn(() => []),
  extractEditableFromPayload: jest.fn(() => null),
  normalizeVomitEdits: jest.fn((x: unknown) => x),
}));
jest.mock('./VomitFieldsEditor', () => ({ VomitFieldsEditor: () => null }));
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import { render, waitFor, act } from '@testing-library/react-native';
import { VomitAnalysisSection } from './VomitAnalysisSection';
import { watchAnalysisRow, awaitAnalysisChain, triggerVomitAnalysis } from '../../lib/analysis';

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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e1" petName="Rex" hasPhoto />);

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
    const { toJSON } = render(<VomitAnalysisSection eventId="e2" petName="Rex" hasPhoto />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('rows 6/7 — a fired contextual flag still escalates (server writes it completed)', async () => {
    // The capped/flagged-off-but-flag-fired case is a normal completed row with the
    // floor-forced recommendation — the client must render the escalation, not a cap
    // band and not a reassurance.
    mockRow = row({ status: 'completed', recommendation: 'worth_a_call', read_text: 'Given the repeated vomiting, a call to your vet is worth it.' });
    // hasPhoto={false}: a photoless contextual escalation (repeated vomiting) must
    // still render — B-363's no-photo suppression only eats the not_enough_to_say
    // dead-end, never an escalation.
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e3" petName="Rex" hasPhoto={false} />);

    expect(await findByText('Worth a call')).toBeTruthy();
    expect(queryByText(/photo reads are used up/i)).toBeNull(); // NOT the cap band
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('does not mis-render a capped row as the "not enough to say" fallback', async () => {
    // Guards the branch ORDER: `capped` must be caught before the `!row.recommendation`
    // fallback (which would otherwise offer a "Try analysis" retry on a capped row).
    mockRow = row({ status: 'capped' });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e4" petName="Rex" hasPhoto />);
    expect(await findByText(/photo reads are used up/i)).toBeTruthy();
    expect(queryByText(/Not enough to say about this one yet/i)).toBeNull();
  });
});

describe('VomitAnalysisSection — photoless suppression (B-363)', () => {
  afterEach(() => { mockRow = null; });

  it('photoless + no recommendation: renders nothing — no looping "Try analysis"', async () => {
    mockRow = row({ recommendation: null });
    const { toJSON } = render(<VomitAnalysisSection eventId="p1" petName="Rex" hasPhoto={false} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('photoless + not_enough_to_say: renders nothing', async () => {
    mockRow = row({ recommendation: 'not_enough_to_say' });
    const { toJSON } = render(<VomitAnalysisSection eventId="p2" petName="Rex" hasPhoto={false} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('photoless + pending: stays silent — no appear-then-vanish spinner', () => {
    // Assert the first (synchronous) frame is silent, then unmount before start()'s
    // async fetch resolves — so its poll loop never schedules a lingering timer.
    mockRow = row({ status: 'pending', recommendation: null });
    const { queryByText, toJSON, unmount } = render(<VomitAnalysisSection eventId="p5" petName="Rex" hasPhoto={false} />);
    expect(toJSON()).toBeNull();
    expect(queryByText(/Reading this one/i)).toBeNull();
    unmount();
  });

  it('WITH a photo + not_enough_to_say: keeps the retry (an unclear/unsynced photo is legitimately re-runnable)', async () => {
    mockRow = row({ recommendation: 'not_enough_to_say' });
    const { findByText } = render(<VomitAnalysisSection eventId="p3" petName="Rex" hasPhoto />);
    expect(await findByText(/Re-run analysis/i)).toBeTruthy();
  });

  it('WITH a photo + no row/recommendation: keeps the "Try analysis" fallback', async () => {
    mockRow = row({ recommendation: null });
    const { findByText } = render(<VomitAnalysisSection eventId="p4" petName="Rex" hasPhoto />);
    expect(await findByText(/Not enough to say about this one yet/i)).toBeTruthy();
    expect(await findByText(/Try analysis/i)).toBeTruthy();
  });
});

describe('VomitAnalysisSection — foreign-material visibility (CUL-240 / B-042)', () => {
  afterEach(() => { mockRow = null; });

  it("unsure + a described fragment: surfaces a DETERMINISTIC finding, still 'Keep an eye out', never the raw note", async () => {
    // The B-042 gap: the model marked foreign material 'unsure' AND described a non-food
    // fragment, but the row rendered only on 'yes' — so the owner saw nothing while the
    // record held a described piece. It now surfaces as a VISIBILITY fix that does NOT
    // touch the escalation floor. The note is model FREE TEXT (clinical-guardrails Pattern
    // 10): its PRESENCE is the trigger, but its CONTENT must never reach this monitor card.
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'unsure',
      foreign_material_note: 'a small pale fragment near the top',
    });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f1" petName="Rex" hasPhoto />);

    // Surfaces as a deterministic label — NOT the model's free text.
    expect(await findByText('Foreign material')).toBeTruthy();
    expect(await findByText('Possible — not identified')).toBeTruthy();
    expect(queryByText(/a small pale fragment/)).toBeNull();   // the raw note never appears
    // The floor is untouched: still a monitor card ('Keep an eye out'), not an escalation.
    expect(await findByText('Keep an eye out')).toBeTruthy();
    expect(queryByText('Worth a call')).toBeNull();
    // Present-direction: naming a possible finding, never reassuring on absence.
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('unsure + a note carrying a diagnosis/reassurance: the raw note never reaches the monitor card (Pattern 10)', async () => {
    // The adversarial counterexample (CUL-240 review): foreign_material_note is the
    // least-guarded model free-text field — no schema constraint, no parse/post-floor gate.
    // Such a note must NOT render on a non-worth_a_call card; only the deterministic label does.
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'unsure',
      foreign_material_note: 'looks like a piece of bone, probably from a raw diet and usually passes on its own',
    });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f1b" petName="Rex" hasPhoto />);

    expect(await findByText('Possible — not identified')).toBeTruthy();  // the safe label
    expect(queryByText(/bone/)).toBeNull();                              // no diagnosis leaks
    expect(queryByText(/usually passes on its own/)).toBeNull();         // no reassurance leaks
    expect(queryByText(/raw diet/)).toBeNull();
    expect(await findByText('Keep an eye out')).toBeTruthy();            // still monitor
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('unsure with NO described fragment: stays hidden — a bare "maybe" is noise, not a finding', async () => {
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'unsure',
      foreign_material_note: null,
      blood_present: 'none_visible', // gives the observations block a row to render
    });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f2" petName="Rex" hasPhoto />);
    expect(await findByText('Blood')).toBeTruthy();          // the block did render
    expect(queryByText('Foreign material')).toBeNull();      // but no foreign-material row
  });

  it("'no' + a note never surfaces a foreign-material row (present-only; a 'no' note is not a finding)", async () => {
    // Production holds 'no'+note rows (the model narrating absence). The 'unsure' path must
    // key off presence==='unsure', so those must never leak in as a foreign observation.
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'no',
      foreign_material_note: 'nothing that looks non-food',
      blood_present: 'none_visible',
    });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f3" petName="Rex" hasPhoto />);
    expect(await findByText('Blood')).toBeTruthy();
    expect(queryByText('Foreign material')).toBeNull();
    expect(queryByText(/nothing that looks non-food/)).toBeNull();
  });

  it("'yes' + a note is unchanged — a definite finding shows the model's description on its worth_a_call card", async () => {
    // 'yes' forces worth_a_call (the suspected_foreign_material visual flag), so the model's
    // own note rides an ESCALATED card — Pattern-10-compliant, and the shipped behaviour.
    mockRow = row({
      status: 'completed',
      recommendation: 'worth_a_call',
      read_text: 'I can see something that does not look like food. That is worth a call to your vet.',
      foreign_material_present: 'yes',
      foreign_material_note: 'a piece of green plastic',
    });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f4" petName="Rex" hasPhoto />);
    expect(await findByText('Foreign material')).toBeTruthy();
    expect(await findByText('a piece of green plastic')).toBeTruthy();
    // The 'yes' path shows the actual description, not the 'unsure' deterministic label.
    expect(queryByText('Possible — not identified')).toBeNull();
  });
});

describe('VomitAnalysisSection — realtime resolution (CUL-171)', () => {
  afterEach(() => { mockRow = null; (watchAnalysisRow as jest.Mock).mockClear(); });

  it('opens a realtime watch on a pending read and resolves when it fires', async () => {
    // Pending on mount (WITH a photo) → the working state, not an escalation yet.
    mockRow = row({ status: 'pending', recommendation: null });
    const { findByText, queryByText } = render(
      <VomitAnalysisSection eventId="rt1" petName="Rex" hasPhoto />,
    );
    // The section opened a realtime watch instead of polling.
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(queryByText('Worth a call')).toBeNull();

    // The Edge Function writes the escalation; realtime fires → the section's
    // re-read (the watch's 2nd arg) resolves the pending state to the read.
    mockRow = row({
      status: 'completed',
      recommendation: 'worth_a_call',
      read_text: 'Worth a call to your vet.',
    });
    const check = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![1] as () => Promise<boolean>;
    await act(async () => { await check(); });

    expect(await findByText('Worth a call')).toBeTruthy();
  });

  it('falls back to the retry affordance when the watch gives up (fidelity with the old poll floor)', async () => {
    // No row is ever written; the watch exhausts its bounded fallback schedule.
    mockRow = null;
    const { findByText } = render(
      <VomitAnalysisSection eventId="rt2" petName="Rex" hasPhoto />,
    );
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    // Invoke the watch's give-up callback (3rd arg) → the section drops the
    // spinner and offers the manual retry, exactly as the old ~36s poll did.
    const onGiveUp = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![2] as () => void;
    await act(async () => { onGiveUp(); });

    expect(await findByText(/Not enough to say about this one yet/i)).toBeTruthy();
    expect(await findByText(/Try analysis/i)).toBeTruthy();
  });
});

describe('VomitAnalysisSection — deferring to the log-path read (CUL-801)', () => {
  // Reset BEFORE each case, not after: earlier describes in this file also render
  // the section, and their calls would otherwise still be on these mocks.
  beforeEach(() => {
    mockRow = null;
    (watchAnalysisRow as jest.Mock).mockClear();
    (triggerVomitAnalysis as jest.Mock).mockClear();
    (awaitAnalysisChain as jest.Mock).mockReset().mockResolvedValue(false);
  });
  afterEach(() => {
    mockRow = null;
    (awaitAnalysisChain as jest.Mock).mockReset().mockResolvedValue(false);
  });

  it('does NOT trigger a second read when the log path already invoked one — it just watches', async () => {
    // The CUL-800 route: the owner photographs an incident and lands on its record
    // while the log path is still uploading. Two invocations would burn two units
    // of the daily-10 cap, race each other's write-back, and — if the second is
    // what crosses the cap — write a 'capped' state over a real read.
    mockRow = null;
    (awaitAnalysisChain as jest.Mock).mockResolvedValue(true);

    render(<VomitAnalysisSection eventId="rt-claimed" petName="Rex" hasPhoto />);

    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(awaitAnalysisChain as jest.Mock).toHaveBeenCalledWith('rt-claimed');
    // The whole point: one read per photo.
    expect(triggerVomitAnalysis as jest.Mock).not.toHaveBeenCalled();
  });

  it('DOES trigger when the log-path chain died before its read — the escalation must still run', async () => {
    // The upload threw / the attachment upsert errored, so the chain settled
    // without ever invoking. Skipping here would leave the incident with no
    // descriptive read AND no deterministic contextual escalation, which is the
    // one outcome the claim must never produce.
    mockRow = null;
    (awaitAnalysisChain as jest.Mock).mockResolvedValue(false);

    render(<VomitAnalysisSection eventId="rt-dead" petName="Rex" hasPhoto />);

    await waitFor(() => expect(triggerVomitAnalysis as jest.Mock).toHaveBeenCalledWith('rt-dead'));
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
  });

  it('issues the read even when the owner leaves DURING the wait — the invoke outlives the screen', async () => {
    // The break the adversarial pass found. The wait can span the whole upload;
    // an owner routed here by CUL-800 who glances at the photo and taps back is
    // inside it. If the unmount guard sat between the wait and the trigger, a
    // chain that then died before its read (a failed upload) would leave the
    // incident with NO descriptive read and NO deterministic contextual
    // escalation — nothing on the record, nothing on Home, nothing in the report.
    mockRow = null;
    let releaseChain!: (v: boolean) => void;
    (awaitAnalysisChain as jest.Mock).mockReturnValue(new Promise((r) => { releaseChain = r; }));

    const { unmount } = render(<VomitAnalysisSection eventId="rt-left" petName="Rex" hasPhoto />);
    await waitFor(() => expect(awaitAnalysisChain as jest.Mock).toHaveBeenCalledWith('rt-left'));

    unmount();            // the owner taps back, chain still live
    releaseChain(false);  // ...and the chain then dies without ever invoking

    await waitFor(() => expect(triggerVomitAnalysis as jest.Mock).toHaveBeenCalledWith('rt-left'));
    // The state writes ARE still guarded: no watch is opened on a dead instance.
    expect(watchAnalysisRow as jest.Mock).not.toHaveBeenCalled();
  });

  it('never waits on a chain when the row has already resolved — no trigger, no watch', async () => {
    // start() reads the row first; a completed read short-circuits before the
    // claim is ever consulted, so re-opening a read incident costs nothing.
    mockRow = row({ status: 'completed', recommendation: 'monitor', read_text: 'Keep an eye out.' });

    render(<VomitAnalysisSection eventId="rt-done" petName="Rex" hasPhoto />);

    await waitFor(() => expect(triggerVomitAnalysis as jest.Mock).not.toHaveBeenCalled());
    expect(awaitAnalysisChain as jest.Mock).not.toHaveBeenCalled();
    expect(watchAnalysisRow as jest.Mock).not.toHaveBeenCalled();
  });
});
