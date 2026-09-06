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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readObservationFold, setObservationFold } from '../../lib/observationFold';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { LayoutAnimation, StyleSheet } from 'react-native';
import { FOLD_MOTION } from '../motion/foldMotion';
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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

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
    const { toJSON } = render(<VomitAnalysisSection eventId="e2" petId="pet-1" petName="Rex" hasPhoto />);
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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e3" petId="pet-1" petName="Rex" hasPhoto={false} />);

    expect(await findByText('Worth a call')).toBeTruthy();
    expect(queryByText(/photo reads are used up/i)).toBeNull(); // NOT the cap band
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('does not mis-render a capped row as the "not enough to say" fallback', async () => {
    // Guards the branch ORDER: `capped` must be caught before the `!row.recommendation`
    // fallback (which would otherwise offer a "Try analysis" retry on a capped row).
    mockRow = row({ status: 'capped' });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e4" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText(/photo reads are used up/i)).toBeTruthy();
    expect(queryByText(/Not enough to say about this one yet/i)).toBeNull();
  });
});

describe('VomitAnalysisSection — photoless suppression (B-363)', () => {
  afterEach(() => { mockRow = null; });

  it('photoless + no recommendation: renders nothing — no looping "Try analysis"', async () => {
    mockRow = row({ recommendation: null });
    const { toJSON } = render(<VomitAnalysisSection eventId="p1" petId="pet-1" petName="Rex" hasPhoto={false} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('photoless + not_enough_to_say: renders nothing', async () => {
    mockRow = row({ recommendation: 'not_enough_to_say' });
    const { toJSON } = render(<VomitAnalysisSection eventId="p2" petId="pet-1" petName="Rex" hasPhoto={false} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('photoless + pending: stays silent — no appear-then-vanish spinner', () => {
    // Assert the first (synchronous) frame is silent, then unmount before start()'s
    // async fetch resolves — so its poll loop never schedules a lingering timer.
    mockRow = row({ status: 'pending', recommendation: null });
    const { queryByText, toJSON, unmount } = render(<VomitAnalysisSection eventId="p5" petId="pet-1" petName="Rex" hasPhoto={false} />);
    expect(toJSON()).toBeNull();
    expect(queryByText(/Reading this one/i)).toBeNull();
    unmount();
  });

  it('WITH a photo + not_enough_to_say: keeps the retry (an unclear/unsynced photo is legitimately re-runnable)', async () => {
    mockRow = row({ recommendation: 'not_enough_to_say' });
    const { findByText } = render(<VomitAnalysisSection eventId="p3" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText(/Re-run analysis/i)).toBeTruthy();
  });

  it('WITH a photo + no row/recommendation: keeps the "Try analysis" fallback', async () => {
    mockRow = row({ recommendation: null });
    const { findByText } = render(<VomitAnalysisSection eventId="p4" petId="pet-1" petName="Rex" hasPhoto />);
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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f1" petId="pet-1" petName="Rex" hasPhoto />);

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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f1b" petId="pet-1" petName="Rex" hasPhoto />);

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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f2" petId="pet-1" petName="Rex" hasPhoto />);
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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f3" petId="pet-1" petName="Rex" hasPhoto />);
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
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="f4" petId="pet-1" petName="Rex" hasPhoto />);
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
      <VomitAnalysisSection eventId="rt1" petId="pet-1" petName="Rex" hasPhoto />,
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
      <VomitAnalysisSection eventId="rt2" petId="pet-1" petName="Rex" hasPhoto />,
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

    render(<VomitAnalysisSection eventId="rt-claimed" petId="pet-1" petName="Rex" hasPhoto />);

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

    render(<VomitAnalysisSection eventId="rt-dead" petId="pet-1" petName="Rex" hasPhoto />);

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

    const { unmount } = render(<VomitAnalysisSection eventId="rt-left" petId="pet-1" petName="Rex" hasPhoto />);
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

    render(<VomitAnalysisSection eventId="rt-done" petId="pet-1" petName="Rex" hasPhoto />);

    await waitFor(() => expect(triggerVomitAnalysis as jest.Mock).not.toHaveBeenCalled());
    expect(awaitAnalysisChain as jest.Mock).not.toHaveBeenCalled();
    expect(watchAnalysisRow as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('VomitAnalysisSection — an escalation outlives a failed re-read (CUL-812)', () => {
  afterEach(() => { mockRow = null; });

  it('a failed row still holding worth_a_call renders the ESCALATION, not the error frame', async () => {
    // The defect: the failure write upserts status:'failed' over a row the record
    // already escalated, and 'failed' renders BEFORE the card. The owner is shown an
    // error where a "worth a call" belongs — which reads as nothing was found, on the
    // one surface built never to reassure.
    mockRow = row({ status: 'failed', recommendation: 'worth_a_call', read_text: 'There is blood visible in this one.', error: 'Claude API error 529' });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

    expect(await findByText('Worth a call')).toBeTruthy();
    expect(await findByText(/blood visible/)).toBeTruthy();
    // The error frame and its retry are gone — the escalation is the state now.
    expect(queryByText(/Couldn't finish reading this one/i)).toBeNull();
    expect(queryByText(/Try again/i)).toBeNull();
    // The stored transport error never reaches the owner (copy guard).
    expect(queryByText(/529/)).toBeNull();
  });

  it('a failed row with a BENIGN read keeps the honest error frame — no stale reassurance', async () => {
    // Not rescued on purpose: the failed attempt may have been reading a replaced
    // photo, so standing "keep an eye out" in front of it would be a claim about an
    // image nothing has read.
    mockRow = row({ status: 'failed', recommendation: 'monitor', read_text: 'Keep an eye on this one.' });
    const { findByText, queryByText } = render(<VomitAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

    expect(await findByText(/Couldn't finish reading this one/i)).toBeTruthy();
    expect(await findByText(/Try again/i)).toBeTruthy();
    expect(queryByText('Keep an eye out')).toBeNull();
  });

  it('a failed row with no read at all is unchanged — the retry frame', async () => {
    mockRow = row({ status: 'failed' });
    const { findByText } = render(<VomitAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText(/Couldn't finish reading this one/i)).toBeTruthy();
    expect(await findByText(/Try again/i)).toBeTruthy();
  });
});

// ── CUL-803 — the read card, the observations grid and the fold ───────────────
//
// The section's job in this PR is composition: it owns the fold's STATE (so a re-render
// never drops what the owner folded) and hands the rest to the two shared components,
// which carry their own tests. What is pinned here is the wiring — that the fold reaches
// the store keyed by pet AND event, and that a device whose storage cannot answer shows
// the owner every finding rather than hiding them.
describe('VomitAnalysisSection — the observations fold (§5.3)', () => {
  afterEach(async () => {
    mockRow = null;
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  const READ = row({
    status: 'completed', recommendation: 'monitor',
    read_text: 'Yellow, foamy, mostly bile.',
    colour: 'yellow', consistency: 'foamy', contents: ['bile'], blood_present: 'none_visible',
  });

  it('folds to a strip that names the findings and counts them, and re-opens from it', async () => {
    mockRow = READ;
    const { findByText, getByText, queryByText } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Keep an eye out');
    expect(getByText('Yellow')).toBeTruthy();

    fireEvent.press(getByText('Keep it compact'));
    await waitFor(() => expect(queryByText('Yellow')).toBeNull());
    expect(getByText(/4 findings/)).toBeTruthy();
    // The READ is never folded — an escalation and its sentence stay on screen at every
    // fold state, which is the whole reason only the facts are foldable.
    expect(getByText('Keep an eye out')).toBeTruthy();
    expect(getByText('Yellow, foamy, mostly bile.')).toBeTruthy();

    fireEvent.press(getByText("What's visible"));
    await waitFor(() => expect(getByText('Yellow')).toBeTruthy());
  });

  it('persists per pet AND per event — a fold on one incident is not a fold on the next', async () => {
    mockRow = READ;
    const first = render(<VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />);
    await first.findByText('Keep an eye out');
    fireEvent.press(first.getByText('Keep it compact'));
    await waitFor(() => expect(first.queryByText('Yellow')).toBeNull());
    // The screen folds immediately and the store follows (the write is fire-and-forget by
    // design), so wait on the WRITE, not on the render — otherwise the remount below races
    // it and this test measures scheduling rather than persistence.
    await waitFor(async () => expect(await readObservationFold('pet-A', 'ev-1')).toBe(true));
    first.unmount();

    // The same record, re-opened: folded.
    const again = render(<VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />);
    await waitFor(() => expect(again.getByText(/4 findings/)).toBeTruthy());
    again.unmount();

    // A different incident, and the same event id under a different pet: both open.
    const other = render(<VomitAnalysisSection eventId="ev-2" petId="pet-A" petName="Biscuit" hasPhoto />);
    await waitFor(() => expect(other.getByText('Yellow')).toBeTruthy());
    other.unmount();
    const otherPet = render(<VomitAnalysisSection eventId="ev-1" petId="pet-B" petName="Rex" hasPhoto />);
    await waitFor(() => expect(otherPet.getByText('Yellow')).toBeTruthy());
  });

  it('a read that has not answered leaves the findings VISIBLE (C-12)', async () => {
    // The direction matters: a storage failure must never hide a fact. `null` from the
    // store is "did not answer", and only a true `folded` may collapse the grid.
    // Restored in a `finally` rather than left to `restoreAllMocks`: AsyncStorage's own
    // jest mock IS a jest.fn, so restoring a spy over it does not reliably drop the
    // rejection — and a leaked one makes every later persistence assertion in this file
    // read "did not answer" while still passing for the wrong reason.
    const getItem = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('storage gone'));
    try {
      mockRow = READ;
      const { findByText, getByText } = render(
        <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
      );
      await findByText('Keep an eye out');
      expect(getByText('Yellow')).toBeTruthy();
    } finally {
      getItem.mockRestore();
    }
  });
});

// ── CUL-803 — the seam the fold control created (C-5) ─────────────────────────
//
// `Re-run analysis` used to sit under inert text (the last observation row). The fold
// put a touchable there instead — `Keep it compact` when the grid is open, the strip when
// it is shut — flush against it, with no margin and no container gap between them. Two
// controls with facing hitSlop at a zero gap overlap, and the overlap is asymmetric in
// the worst direction: `Re-run analysis` costs an API call and replaces the read.
//
// The fix is the one C-5 prescribes for controls that are already flush — grow the BOX,
// drop the slop — so the invariant to pin is that neither side reaches into the other.
describe('VomitAnalysisSection — the fold control and Re-run analysis do not share hit area (C-5)', () => {
  afterEach(async () => {
    mockRow = null;
    await AsyncStorage.clear();
  });

  const READ = row({
    status: 'completed', recommendation: 'monitor', read_text: 'Yellow, foamy, mostly bile.',
    colour: 'yellow', consistency: 'foamy', contents: ['bile'], blood_present: 'none_visible',
  });

  /** The nearest responder host above a node — the thing that actually owns the touch. */
  function owningTouchable(node: { parent: unknown } | null): Record<string, unknown> | null {
    let cur = node as { parent: unknown; props?: Record<string, unknown> } | null;
    while (cur) {
      if (cur.props && typeof cur.props.onStartShouldSetResponder === 'function') {
        return cur.props;
      }
      cur = cur.parent as typeof cur;
    }
    return null;
  }

  function facingSlop(props: Record<string, unknown> | null, edge: 'top' | 'bottom'): number {
    const slop = props?.hitSlop as number | Record<string, number> | undefined;
    if (slop == null) return 0;
    return typeof slop === 'number' ? slop : (slop[edge] ?? 0);
  }

  it('neither the expanded fold control nor Re-run analysis reaches toward the other', async () => {
    mockRow = READ;
    const { findByText, getByText } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Keep an eye out');
    const fold = owningTouchable(getByText('Keep it compact') as never);
    const rerun = owningTouchable(getByText('Re-run analysis') as never);
    expect(fold).not.toBeNull();
    expect(rerun).not.toBeNull();
    // They are separate responders (a shared one would be its own defect — C-6), and the
    // rendered separation between them is zero, so the facing slop must be zero too.
    expect(fold).not.toBe(rerun);
    expect(facingSlop(fold, 'bottom') + facingSlop(rerun, 'top')).toBe(0);
  });

  it('the strip keeps its whole 44pt box when folded — Re-run does not reach into it', async () => {
    mockRow = READ;
    const { findByText, getByText } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Keep an eye out');
    fireEvent.press(getByText('Keep it compact'));
    await waitFor(() => expect(getByText(/4 findings/)).toBeTruthy());
    const strip = owningTouchable(getByText("What's visible") as never);
    const rerun = owningTouchable(getByText('Re-run analysis') as never);
    expect(strip).not.toBe(rerun);
    expect(facingSlop(strip, 'bottom') + facingSlop(rerun, 'top')).toBe(0);
  });

  it('both controls carry the 44pt floor in their own box, since the slop is gone', async () => {
    const { StyleSheet } = require('react-native');
    mockRow = READ;
    const { findByText, getByText } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Keep an eye out');
    for (const label of ['Keep it compact', 'Re-run analysis']) {
      const props = owningTouchable(getByText(label) as never)!;
      expect(StyleSheet.flatten(props.style as never).minHeight).toBe(44);
    }
  });
});

// ── CUL-803 — the two rules the adversarial pass added ────────────────────────
describe('VomitAnalysisSection — an escalation’s facts never fold (§5.3)', () => {
  afterEach(async () => {
    mockRow = null;
    await AsyncStorage.clear();
    // The C-12 test above spies `AsyncStorage.getItem` into rejecting; without this, a
    // later store read answers `null` ("did not answer") and every persistence assertion
    // in this file silently measures the wrong thing.
    jest.restoreAllMocks();
  });

  it('offers no fold on a worth_a_call — the facts justifying it stay on screen', async () => {
    // The named slots go in row order and every builder pushes the descriptive rows
    // first, so Blood / Foreign material are ALWAYS the rows a fold would compress. On an
    // escalation that leaves the verdict on screen with every fact behind a tap, on the
    // one surface D3 exists so an owner can turn the phone around to a vet.
    mockRow = row({
      status: 'completed', recommendation: 'worth_a_call',
      read_text: 'There are streaks that look like blood in this photo.',
      colour: 'brown', consistency: 'chunky', contents: ['undigested_food'],
      blood_present: 'fresh_red', foreign_material_present: 'yes',
      foreign_material_note: 'a piece of green plastic',
    });
    const { findByText, getByText, queryByText } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Worth a call');
    expect(queryByText('Keep it compact')).toBeNull();
    expect(getByText('Fresh red')).toBeTruthy();
    expect(getByText('a piece of green plastic')).toBeTruthy();
  });

  it('a fold stored before the read escalated is overridden, never honoured', async () => {
    // A re-analysis can turn a folded `monitor` into a `worth_a_call`. The stored fold is
    // still in the blob; the gate has to beat it, not race it.
    await setObservationFold('pet-A', 'ev-1', true, '2026-09-05T12:00:00.000Z');
    mockRow = row({
      status: 'completed', recommendation: 'worth_a_call', read_text: 'Blood is visible.',
      colour: 'brown', consistency: 'liquid', blood_present: 'fresh_red',
    });
    const { findByText, getByText, queryByText } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Worth a call');
    expect(getByText('Fresh red')).toBeTruthy();
    expect(queryByText(/findings/)).toBeNull();
  });
});

describe('VomitAnalysisSection — the RECORD re-opens a fold (§5.3)', () => {
  afterEach(async () => {
    mockRow = null;
    await AsyncStorage.clear();
    // The C-12 test above spies `AsyncStorage.getItem` into rejecting; without this, a
    // later store read answers `null` ("did not answer") and every persistence assertion
    // in this file silently measures the wrong thing.
    jest.restoreAllMocks();
  });

  const BENIGN = row({
    status: 'completed', recommendation: 'monitor', read_text: 'Yellow, foamy, mostly bile.',
    colour: 'yellow', consistency: 'foamy', contents: ['bile'], blood_present: 'none_visible',
  });

  it('a re-analysis landing NEW findings opens the grid it landed in', async () => {
    // `Re-run analysis` renders in the folded state — it is the control directly under the
    // strip. Without this rule a new blood finding lands behind a summary the owner has
    // already dismissed as read. The verdict was never folded; the FACT was.
    mockRow = BENIGN;
    const { findByText, getByText, queryByText, rerender } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Keep an eye out');
    fireEvent.press(getByText('Keep it compact'));
    await waitFor(() => expect(queryByText('Yellow')).toBeNull());

    // The owner presses the control that sits directly under the strip. The re-read
    // carries a finding the folded summary did not.
    mockRow = row({ ...BENIGN, blood_present: 'fresh_red' });
    await act(async () => { fireEvent.press(getByText('Re-run analysis')); });
    // …and the watch it opens resolves with the new row.
    const call = (watchAnalysisRow as jest.Mock).mock.calls.at(-1);
    expect(call).toBeTruthy();
    await act(async () => { await (call![1] as () => Promise<unknown>)(); });
    rerender(<VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />);

    await waitFor(() => expect(getByText('Fresh red')).toBeTruthy());
    expect(queryByText(/findings/)).toBeNull();
    // …and the store forgets it, so returning later meets the new findings open too.
    await waitFor(async () => expect(await readObservationFold('pet-A', 'ev-1')).toBe(false));
  });

  it('a re-render that changes NOTHING leaves the fold alone', async () => {
    // The other direction, and the one a naive implementation breaks: the fold must
    // survive its own screen re-rendering, and must survive the row arriving at all.
    mockRow = BENIGN;
    const { findByText, getByText, queryByText, rerender } = render(
      <VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />,
    );
    await findByText('Keep an eye out');
    fireEvent.press(getByText('Keep it compact'));
    await waitFor(() => expect(queryByText('Yellow')).toBeNull());
    rerender(<VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />);
    rerender(<VomitAnalysisSection eventId="ev-1" petId="pet-A" petName="Biscuit" hasPhoto />);
    expect(getByText(/4 findings/)).toBeTruthy();
  });
});

// ── The read's arrival (CUL-804, §7) ─────────────────────────────────────────
// The pair that decides whether the flourish is earned. Both cases paint the same
// "Reading the photo…" box on their first frame, and only one of them WAITED for
// anything: the section reads its local row on every mount, including the mount that
// happens when an owner opens an incident from History months later.
describe('VomitAnalysisSection — the arrival fires only for a read the screen waited for', () => {
  let configureNext: jest.SpyInstance;
  beforeEach(() => {
    configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    (watchAnalysisRow as jest.Mock).mockClear();
  });
  afterEach(() => { configureNext.mockRestore(); mockRow = null; });

  it('a read already in the record on open: no arrival, not one `configureNext`', async () => {
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      read_text: 'Yellow, foamy, mostly bile.',
    });
    const { findByText } = render(
      <VomitAnalysisSection eventId="old-1" petId="pet-1" petName="Rex" hasPhoto />,
    );
    expect(await findByText('Keep an eye out')).toBeTruthy();
    // PAST beat 2's lag before asserting: the box opens 80ms behind the rail, so an
    // assertion taken the moment the text appears passes whether or not an arrival was
    // started, and would not notice the fetch frame being counted as a wait.
    await act(async () => { await new Promise((r) => setTimeout(r, FOLD_MOTION.railLagMs + 20)); });
    // The fetch frame is not a wait. Nothing animated on the way to this read.
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('a read that lands while the screen waits: the box opens once', async () => {
    mockRow = row({ status: 'pending', recommendation: null });
    const { findByText } = render(
      <VomitAnalysisSection eventId="new-1" petId="pet-1" petName="Rex" hasPhoto />,
    );
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(configureNext).not.toHaveBeenCalled();

    mockRow = row({
      status: 'completed',
      recommendation: 'worth_a_call',
      read_text: 'Worth a call to your vet.',
    });
    const check = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![1] as () => Promise<boolean>;
    await act(async () => { await check(); });
    expect(await findByText('Worth a call')).toBeTruthy();

    // Beat 2 is 80ms behind the rail, and fires exactly once.
    await act(async () => { await new Promise((r) => setTimeout(r, FOLD_MOTION.railLagMs + 20)); });
    expect(configureNext).toHaveBeenCalledTimes(1);
  });

  it('the section wires the CARD\'s own measurement to the rail, not the block\'s', async () => {
    // The motion suite proves the rail must not measure the section block; only this
    // proves the real section actually hands the card's `onMeasure` to the arrival. A
    // section that forgot it would degrade silently to "the rail rides the box".
    mockRow = row({ status: 'pending', recommendation: null });
    const view = render(
      <VomitAnalysisSection eventId="new-2" petId="pet-1" petName="Rex" hasPhoto />,
    );
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    // The pending box's own geometry — without it the rail beat degrades to riding the
    // box, which would make the assertions below pass for the wrong reason.
    await act(async () => {
      fireEvent(view.getByTestId('incident-read-section').children[1] as never, 'layout', {
        nativeEvent: { layout: { x: 0, y: 22, width: 320, height: 48 } },
      });
    });

    mockRow = row({ status: 'completed', recommendation: 'monitor', read_text: 'Yellow, foamy.' });
    const check = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![1] as () => Promise<boolean>;
    await act(async () => { await check(); });

    const card = await view.findByTestId('incident-read-card');
    expect(card.props.onLayout).toBeDefined();
    await act(async () => {
      fireEvent(card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 152 } } });
    });
    // The rail took the card's height and left the flow — the beat actually ran.
    const rail = StyleSheet.flatten(view.getByTestId('incident-read-rail').props.style as never) as Record<string, unknown>;
    expect(rail.height).toBe(152);
    expect(rail.position).toBe('absolute');
  });
});
