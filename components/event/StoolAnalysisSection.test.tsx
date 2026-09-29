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
      // Answers both write shapes Hide / Show has had: `await .update().eq()`, and
      // CUL-1323's compare-and-set, `.eq().eq|is|filter().select()` (lib/analysisDismissal),
      // which reads one written row back as "the words on screen were still the record's".
      update: () => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          is: () => chain,
          filter: () => chain,
          select: () => Promise.resolve({ data: [{ event_id: 'e' }], error: null }),
          then: (resolve: (r: { error: null }) => unknown) => resolve({ error: null }),
        };
        return chain;
      },
    }),
  },
}));
// lib/analysis pulls in the sync/supabase chain; stub it — a non-pending row never
// triggers analysis, but the import must resolve. The edit-diff helpers return the
// real-ish shapes the render path expects.
jest.mock('../../lib/analysis', () => ({
  triggerStoolAnalysis: jest.fn(() => Promise.resolve({ error: null })),
  // CUL-801 — no outstanding log-path chain by default, so the section
  // triggers its own read exactly as it did before the claim landed.
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
  // The realtime watch (CUL-171) is exercised on its own in lib/analysis.test.ts;
  // here it's a jest.fn so a test can grab the re-read callback it was handed.
  watchAnalysisRow: jest.fn(() => () => {}),
  saveStoolFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  deriveEditedStoolFields: jest.fn(() => []),
  extractStoolEditableFromPayload: jest.fn(() => null),
  normalizeStoolEdits: jest.fn((x: unknown) => x),
}));
// The editor's props, so a test can save an edit without driving the form (CUL-1408).
let mockEditorProps: { onSave: (next: Record<string, unknown>) => Promise<void> } | null = null;
jest.mock('./StoolFieldsEditor', () => ({
  StoolFieldsEditor: (props: { onSave: (next: Record<string, unknown>) => Promise<void> }) => {
    mockEditorProps = props;
    return null;
  },
}));
// CUL-1275 (F1) — the real announcer, `expectLanding` recorded on the way through (see the
// vomit suite for why the call itself is what an act-driven test can pin).
const mockExpectLanding = jest.fn();
jest.mock('./useReadLandingAnnouncement', () => {
  const actual = jest.requireActual('./useReadLandingAnnouncement');
  const { useMemo } = jest.requireActual('react');
  return {
    ...actual,
    useReadLandingAnnouncement: (args: unknown) => {
      const real = actual.useReadLandingAnnouncement(args);
      return useMemo(
        () => ({ note: real.note, expectLanding: () => { mockExpectLanding(); real.expectLanding(); } }),
        [real],
      );
    },
  };
});
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { Alert, LayoutAnimation } from 'react-native';
import { FOLD_MOTION } from '../motion/foldMotion';
import { StoolAnalysisSection } from './StoolAnalysisSection';
import { readLandedCopy } from './useReadLandingAnnouncement';
import { watchAnalysisRow, awaitAnalysisChain, triggerStoolAnalysis, deriveEditedStoolFields } from '../../lib/analysis';
import { __resetReducedMotionForTest, useReducedMotionStore } from '../../store/reducedMotionStore';

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
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

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
    const { toJSON } = render(<StoolAnalysisSection eventId="e2" petId="pet-1" petName="Rex" hasPhoto />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('a fired contextual flag still escalates EVEN with no photo (server writes it completed)', async () => {
    // The safety invariant B-363 must not break: a photoless contextual escalation
    // (repeated loose stool / concurrent vomiting or lethargy) returns worth_a_call
    // and MUST render — the no-photo suppression only eats the not_enough_to_say
    // dead-end, never an escalation.
    mockRow = row({
      status: 'completed',
      recommendation: 'worth_a_call',
      read_text: 'Rex has had more than one loose stool in a short window. That is worth a call to your vet.',
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e3" petId="pet-1" petName="Rex" hasPhoto={false} />);

    expect(await findByText('Worth a call')).toBeTruthy();
    expect(queryByText(/photo reads are used up/i)).toBeNull(); // NOT the cap band
    expect(queryByText(REASSURANCE)).toBeNull();
  });

  it('does not mis-render a capped row as the "not enough to say" fallback', async () => {
    // Guards the branch ORDER: `capped` must be caught before the `!row.recommendation`
    // fallback (which would otherwise offer a "Try analysis" retry on a capped row).
    mockRow = row({ status: 'capped' });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e4" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText(/photo reads are used up/i)).toBeTruthy();
    expect(queryByText(/Not enough to say about this one yet/i)).toBeNull();
  });
});

describe('StoolAnalysisSection — photoless suppression (B-363)', () => {
  afterEach(() => { mockRow = null; });

  it('photoless + no recommendation: renders nothing — no looping "Try analysis"', async () => {
    // The pm-feature-review catch: a photoless stool used to land on
    // "Not enough to say about this one yet · Try analysis", where the retry just
    // loops (no photo to read). With no photo it now renders nothing.
    mockRow = row({ recommendation: null });
    const { toJSON } = render(<StoolAnalysisSection eventId="p1" petId="pet-1" petName="Rex" hasPhoto={false} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('photoless + not_enough_to_say: renders nothing', async () => {
    mockRow = row({ recommendation: 'not_enough_to_say' });
    const { toJSON } = render(<StoolAnalysisSection eventId="p2" petId="pet-1" petName="Rex" hasPhoto={false} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('photoless + pending: stays silent — no appear-then-vanish spinner', () => {
    // The section must not flash "Reading this one…" for a photoless event and then
    // vanish when it resolves to not_enough_to_say — it stays silent throughout,
    // popping in only if a contextual escalation resolves to worth_a_call. Assert the
    // first (synchronous) frame is silent, then unmount before start()'s async
    // fetch resolves — so its poll loop never schedules a lingering timer.
    mockRow = row({ status: 'pending', recommendation: null });
    const { queryByText, toJSON, unmount } = render(<StoolAnalysisSection eventId="p5" petId="pet-1" petName="Rex" hasPhoto={false} />);
    expect(toJSON()).toBeNull();
    expect(queryByText(/Reading this one/i)).toBeNull();
    unmount();
  });

  it('WITH a photo + not_enough_to_say: keeps the retry (an unclear/unsynced photo is legitimately re-runnable)', async () => {
    mockRow = row({ recommendation: 'not_enough_to_say' });
    const { findByText } = render(<StoolAnalysisSection eventId="p3" petId="pet-1" petName="Rex" hasPhoto />);
    // The real read-path retry link survives when there IS a photo.
    expect(await findByText(/Re-run analysis/i)).toBeTruthy();
  });

  it('WITH a photo + no row/recommendation: keeps the "Try analysis" fallback', async () => {
    mockRow = row({ recommendation: null });
    const { findByText } = render(<StoolAnalysisSection eventId="p4" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText(/Not enough to say about this one yet/i)).toBeTruthy();
    expect(await findByText(/Try analysis/i)).toBeTruthy();
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
    const { findByText } = render(<StoolAnalysisSection eventId="e5" petId="pet-1" petName="Rex" hasPhoto />);

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
    const { findByText } = render(<StoolAnalysisSection eventId="e6" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText('Blood')).toBeTruthy();
    expect(await findByText('None visible')).toBeTruthy();
  });
});

describe('StoolAnalysisSection — foreign-material visibility (CUL-542, sibling of CUL-240 / B-042)', () => {
  afterEach(() => { mockRow = null; });

  it("unsure + a described fragment: surfaces a DETERMINISTIC finding, still 'Keep an eye out', never the raw note", async () => {
    // The CUL-240 (B-042) gap, mirrored on the stool sibling: the model marked foreign material
    // 'unsure' AND described a non-food fragment, but the row rendered only on 'yes' — so the
    // owner saw nothing while the record held a described piece. It now surfaces as a VISIBILITY
    // fix that does NOT touch the escalation floor. The note is model FREE TEXT
    // (clinical-guardrails Pattern 10): its PRESENCE is the trigger, but its CONTENT must never
    // reach this monitor card.
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'unsure',
      foreign_material_note: 'a small pale fragment near the edge',
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="s-f1" petId="pet-1" petName="Rex" hasPhoto />);

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
    // The adversarial counterexample: foreign_material_note is the least-guarded model free-text
    // field — no schema constraint, no parse/post-floor gate (analyze-stool leaves it ungated at
    // parse and warns consumers off it). Such a note must NOT render on a non-worth_a_call card;
    // only the deterministic label does.
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'unsure',
      foreign_material_note: 'looks like a piece of bone, probably from a raw diet and usually passes on its own',
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="s-f1b" petId="pet-1" petName="Rex" hasPhoto />);

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
      stool_blood_present: 'no', // gives the observations block a row to render
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="s-f2" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText('Blood')).toBeTruthy();          // the block did render
    expect(queryByText('Foreign material')).toBeNull();      // but no foreign-material row
  });

  it('unsure + a whitespace-only note: stays hidden — .trim() gates on real content, not mere presence', async () => {
    // Hardening beyond strict CUL-240 parity (the vomit suite lacks this — code-reviewer NIT):
    // a model note of only whitespace must NOT surface a foreign-material row on the 'unsure'
    // path. foreignNote is trimmed, so '   ' is falsy and the row is suppressed exactly like a
    // null note — pinning the Pattern-10 presence gate against a plausible model output.
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'unsure',
      foreign_material_note: '   ',
      stool_blood_present: 'no', // gives the observations block a row to render
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="s-f5" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText('Blood')).toBeTruthy();
    expect(queryByText('Foreign material')).toBeNull();
  });

  it("'no' + a note never surfaces a foreign-material row (present-only; a 'no' note is not a finding)", async () => {
    // The analyze-stool parser leaves foreign_material_note populated on 'no'/'unsure' too, so
    // the 'unsure' path must key off presence==='unsure' — a 'no' note must never leak in as a
    // foreign observation.
    mockRow = row({
      status: 'completed',
      recommendation: 'monitor',
      foreign_material_present: 'no',
      foreign_material_note: 'nothing that looks non-food',
      stool_blood_present: 'no',
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="s-f3" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText('Blood')).toBeTruthy();
    expect(queryByText('Foreign material')).toBeNull();
    expect(queryByText(/nothing that looks non-food/)).toBeNull();
  });

  it("'yes' + a note is unchanged — a definite finding shows the model's description on its worth_a_call card", async () => {
    // 'yes' forces the suspected_foreign_material visual flag at the stool floor (B-340), so the
    // model's own note rides an ESCALATED card — Pattern-10-compliant, and the shipped behaviour.
    mockRow = row({
      status: 'completed',
      recommendation: 'worth_a_call',
      read_text: 'I can see something that does not look like food in this stool photo. That is worth a call to your vet.',
      foreign_material_present: 'yes',
      foreign_material_note: 'a piece of green plastic',
    });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="s-f4" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText('Foreign material')).toBeTruthy();
    expect(await findByText('a piece of green plastic')).toBeTruthy();
    // The 'yes' path shows the actual description, not the 'unsure' deterministic label.
    expect(queryByText('Possible — not identified')).toBeNull();
  });
});

describe('StoolAnalysisSection — realtime resolution (CUL-171)', () => {
  afterEach(() => { mockRow = null; (watchAnalysisRow as jest.Mock).mockClear(); });

  it('opens a realtime watch on a pending read and resolves when it fires', async () => {
    // Pending on mount (WITH a photo) → the working state, not an escalation yet.
    mockRow = row({ status: 'pending', recommendation: null });
    const { findByText, queryByText } = render(
      <StoolAnalysisSection eventId="s-rt1" petId="pet-1" petName="Rex" hasPhoto />,
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
      <StoolAnalysisSection eventId="s-rt2" petId="pet-1" petName="Rex" hasPhoto />,
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

describe('StoolAnalysisSection — deferring to the log-path read (CUL-801)', () => {
  // Reset BEFORE each case, not after: earlier describes in this file also render
  // the section, and their calls would otherwise still be on these mocks.
  beforeEach(() => {
    mockRow = null;
    (watchAnalysisRow as jest.Mock).mockClear();
    (triggerStoolAnalysis as jest.Mock).mockClear();
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

    render(<StoolAnalysisSection eventId="s-rt-claimed" petId="pet-1" petName="Rex" hasPhoto />);

    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(awaitAnalysisChain as jest.Mock).toHaveBeenCalledWith('s-rt-claimed');
    // The whole point: one read per photo.
    expect(triggerStoolAnalysis as jest.Mock).not.toHaveBeenCalled();
  });

  it('DOES trigger when the log-path chain died before its read — the escalation must still run', async () => {
    // The upload threw / the attachment upsert errored, so the chain settled
    // without ever invoking. Skipping here would leave the incident with no
    // descriptive read AND no deterministic contextual escalation, which is the
    // one outcome the claim must never produce.
    mockRow = null;
    (awaitAnalysisChain as jest.Mock).mockResolvedValue(false);

    render(<StoolAnalysisSection eventId="s-rt-dead" petId="pet-1" petName="Rex" hasPhoto />);

    await waitFor(() => expect(triggerStoolAnalysis as jest.Mock).toHaveBeenCalledWith('s-rt-dead'));
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

    const { unmount } = render(<StoolAnalysisSection eventId="s-rt-left" petId="pet-1" petName="Rex" hasPhoto />);
    await waitFor(() => expect(awaitAnalysisChain as jest.Mock).toHaveBeenCalledWith('s-rt-left'));

    unmount();            // the owner taps back, chain still live
    releaseChain(false);  // ...and the chain then dies without ever invoking

    await waitFor(() => expect(triggerStoolAnalysis as jest.Mock).toHaveBeenCalledWith('s-rt-left'));
    // The state writes ARE still guarded: no watch is opened on a dead instance.
    expect(watchAnalysisRow as jest.Mock).not.toHaveBeenCalled();
  });

  it('never waits on a chain when the row has already resolved — no trigger, no watch', async () => {
    // start() reads the row first; a completed read short-circuits before the
    // claim is ever consulted, so re-opening a read incident costs nothing.
    mockRow = row({ status: 'completed', recommendation: 'monitor', read_text: 'Keep an eye out.' });

    render(<StoolAnalysisSection eventId="s-rt-done" petId="pet-1" petName="Rex" hasPhoto />);

    await waitFor(() => expect(triggerStoolAnalysis as jest.Mock).not.toHaveBeenCalled());
    expect(awaitAnalysisChain as jest.Mock).not.toHaveBeenCalled();
    expect(watchAnalysisRow as jest.Mock).not.toHaveBeenCalled();
  });
});

// ── CUL-827 — the pending sibling of CUL-812 ─────────────────────────────────
//
// A re-run over a live escalation used to swap the card for "Reading the photo…" the
// moment it was pressed, and a refused invoke or a watch that gave up left it there. Each
// test drives the real section through the real predicate (lib/incidentReadState.ts);
// only the network edges are stubbed.
describe('StoolAnalysisSection — an escalation stays on screen through a re-run (CUL-827)', () => {
  const PENDING = 'Reading the photo…';
  const RE_READING = 'Reading the photo again…';
  const READ_TEXT = 'There is blood visible in this one.';
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockRow = null;
    (watchAnalysisRow as jest.Mock).mockClear();
    (triggerStoolAnalysis as jest.Mock).mockClear();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    alert.mockRestore();
    mockRow = null;
  });

  /** The escalation is on screen, whole: its verdict and its words. */
  function expectEscalationShown(view: ReturnType<typeof render>, label = 'Worth a call') {
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByText(READ_TEXT)).toBeTruthy();
    expect(view.queryByText(PENDING)).toBeNull();
  }

  it('a REJECTING invoke keeps the escalation, rolls the pending mark back, and leaves Re-run pressable', async () => {
    (triggerStoolAnalysis as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    mockRow = row({ recommendation: 'worth_a_call', read_text: READ_TEXT });
    const view = render(<StoolAnalysisSection eventId="rr-1" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not start analysis', 'Try again in a moment.'));

    expectEscalationShown(view);
    expect(view.queryByText(RE_READING)).toBeNull();
    // The affordance is back AND live: a second press asks the server again.
    await act(async () => { fireEvent.press(view.getByText('Re-run analysis')); });
    await waitFor(() => expect(triggerStoolAnalysis as jest.Mock).toHaveBeenCalledTimes(2));
  });

  it('an invoke that returns an error does the same (the shipped refusal shape)', async () => {
    (triggerStoolAnalysis as jest.Mock).mockResolvedValueOnce({ error: 'FunctionsFetchError: offline' });
    mockRow = row({ recommendation: 'worth_a_call', read_text: READ_TEXT });
    const view = render(<StoolAnalysisSection eventId="rr-2" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expectEscalationShown(view);
    expect(view.getByText('Re-run analysis')).toBeTruthy();
  });

  it('a re-run over a live call never shows the pending frame alone — asking, watching, landing', async () => {
    let release: (v: { error: null }) => void = () => {};
    (triggerStoolAnalysis as jest.Mock).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    mockRow = row({ recommendation: 'worth_a_call', read_text: READ_TEXT, updated_at: '2026-09-29T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="rr-3" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(triggerStoolAnalysis as jest.Mock).toHaveBeenCalledTimes(1));

    // 1. Asking: the trigger has not answered.
    expectEscalationShown(view);
    expect(view.getByText(RE_READING)).toBeTruthy();
    expect(view.queryByText('Re-run analysis')).toBeNull();

    // 2. Watching: the server took it, the realtime watch is open.
    await act(async () => { release({ error: null }); });
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expectEscalationShown(view);
    expect(view.getByText(RE_READING)).toBeTruthy();

    // 3. Landing: the new read replaces the old one, and the control comes back.
    mockRow = row({ recommendation: 'worth_a_call', read_text: READ_TEXT, updated_at: '2026-09-29T09:00:05.000Z' });
    const check = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![1] as () => Promise<boolean>;
    await act(async () => { await check(); });
    expectEscalationShown(view);
    expect(view.queryByText(RE_READING)).toBeNull();
    expect(view.getByText('Re-run analysis')).toBeTruthy();
  });

  it('a watch that GIVES UP over a live call hands the control back — never a wait with no way on', async () => {
    mockRow = row({ recommendation: 'worth_a_call', read_text: READ_TEXT });
    const view = render(<StoolAnalysisSection eventId="rr-4" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(view.getByText(RE_READING)).toBeTruthy();

    const onGiveUp = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![2] as () => void;
    await act(async () => { onGiveUp(); });
    expectEscalationShown(view);
    expect(view.queryByText(RE_READING)).toBeNull();
    expect(view.getByText('Re-run analysis')).toBeTruthy();
  });

  it('holds a verdict this build does not know yet (EN-3’s call_now), in the rose’s words', async () => {
    let release: (v: { error: null }) => void = () => {};
    (triggerStoolAnalysis as jest.Mock).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    mockRow = row({ recommendation: 'call_now', read_text: READ_TEXT });
    const view = render(<StoolAnalysisSection eventId="rr-5" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(triggerStoolAnalysis as jest.Mock).toHaveBeenCalledTimes(1));
    expectEscalationShown(view);
    await act(async () => { release({ error: null }); });
  });

  it('a photoless contextual escalation re-reads in place with the photoless line', async () => {
    let release: (v: { error: null }) => void = () => {};
    (triggerStoolAnalysis as jest.Mock).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    mockRow = row({ recommendation: 'worth_a_call', read_text: READ_TEXT });
    const view = render(<StoolAnalysisSection eventId="rr-6" petId="pet-1" petName="Rex" hasPhoto={false} />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(triggerStoolAnalysis as jest.Mock).toHaveBeenCalledTimes(1));
    expectEscalationShown(view);
    expect(view.getByText('Reading this one again…')).toBeTruthy();
    expect(view.queryByText(RE_READING)).toBeNull();
    await act(async () => { release({ error: null }); });
  });

  it('a CALM verdict keeps the pending frame — never stood in front of a read that has not finished', async () => {
    mockRow = row({ recommendation: 'monitor', read_text: 'Keep an eye on this one.' });
    const view = render(<StoolAnalysisSection eventId="rr-7" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(view.getByText(PENDING)).toBeTruthy();
    expect(view.queryByText('Keep an eye out')).toBeNull();
  });

  it('…and when ITS watch gives up, the spinner ends in a retry, not in a wait that cannot end', async () => {
    mockRow = row({ recommendation: 'monitor', read_text: 'Keep an eye on this one.' });
    const view = render(<StoolAnalysisSection eventId="rr-8" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    const onGiveUp = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![2] as () => void;
    await act(async () => { onGiveUp(); });
    expect(view.queryByText(PENDING)).toBeNull();
    // The calm verdict is NOT put back over a read that never finished (CUL-1277): the
    // honest not-read-yet frame, with its retry.
    expect(view.queryByText('Keep an eye out')).toBeNull();
    expect(view.getByText('Try analysis')).toBeTruthy();
  });

  it('a stale pending row on mount whose watch gives up ends in a retry too', async () => {
    mockRow = row({ status: 'pending', recommendation: null });
    const view = render(<StoolAnalysisSection eventId="rr-9" petId="pet-1" petName="Rex" hasPhoto />);
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(view.getByText(PENDING)).toBeTruthy();
    const onGiveUp = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![2] as () => void;
    await act(async () => { onGiveUp(); });
    expect(view.queryByText(PENDING)).toBeNull();
    expect(view.getByText('Try analysis')).toBeTruthy();
  });
});

describe('StoolAnalysisSection — an escalation outlives a failed re-read (CUL-812)', () => {
  afterEach(() => { mockRow = null; });

  it('a failed row still holding worth_a_call renders the ESCALATION, not the error frame', async () => {
    // The defect: the failure write upserts status:'failed' over a row the record
    // already escalated, and 'failed' renders BEFORE the card. The owner is shown an
    // error where a "worth a call" belongs — which reads as nothing was found, on the
    // one surface built never to reassure.
    mockRow = row({ status: 'failed', recommendation: 'worth_a_call', read_text: 'There is blood visible in this one.', error: 'Claude API error 529' });
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

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
    const { findByText, queryByText } = render(<StoolAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

    expect(await findByText(/Couldn't finish reading this one/i)).toBeTruthy();
    expect(await findByText(/Try again/i)).toBeTruthy();
    expect(queryByText('Keep an eye out')).toBeNull();
  });

  it('a failed row with no read at all is unchanged — the retry frame', async () => {
    mockRow = row({ status: 'failed' });
    const { findByText } = render(<StoolAnalysisSection eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText(/Couldn't finish reading this one/i)).toBeTruthy();
    expect(await findByText(/Try again/i)).toBeTruthy();
  });
});

// ── The read's arrival (CUL-804, §7) ─────────────────────────────────────────
// The stool sibling of the vomit pair. The wiring is identical by construction — the
// stage and the hook are shared — so what this pins is that the SECTION passes the same
// `awaitingRead`, which is the half that is written per file and can drift.
describe('StoolAnalysisSection — the arrival fires only for a read the screen waited for', () => {
  let configureNext: jest.SpyInstance;
  beforeEach(() => {
    // A reader with motion ON, known before the first render: production's shape once the
    // root gate has the OS answer (CUL-1123). Unseeded, the store is unknown, which reads
    // as still, so the arrival never runs: the positive test below would fail and the
    // negative one would pass over nothing.
    useReducedMotionStore.setState({ reduceMotion: false, gateOpen: true });
    configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    (watchAnalysisRow as jest.Mock).mockClear();
  });
  afterEach(() => {
    configureNext.mockRestore();
    mockRow = null;
    // Still mounted here (the renderer's cleanup runs after this hook), so the reset
    // re-renders the section: inside act, or React warns.
    act(() => __resetReducedMotionForTest());
  });

  it('a read already in the record on open: no arrival, not one `configureNext`', async () => {
    mockRow = row({ status: 'completed', recommendation: 'monitor', read_text: 'Formed, brown.' });
    const { findByText } = render(
      <StoolAnalysisSection eventId="old-s1" petId="pet-1" petName="Rex" hasPhoto />,
    );
    expect(await findByText('Keep an eye out')).toBeTruthy();
    // Past beat 2's lag — an assertion taken when the text appears proves nothing.
    await act(async () => { await new Promise((r) => setTimeout(r, FOLD_MOTION.railLagMs + 20)); });
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('a read that lands while the screen waits: the box opens once', async () => {
    mockRow = row({ status: 'pending', recommendation: null });
    const { findByText } = render(
      <StoolAnalysisSection eventId="new-s1" petId="pet-1" petName="Rex" hasPhoto />,
    );
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));

    mockRow = row({ status: 'completed', recommendation: 'worth_a_call', read_text: 'Worth a call.' });
    const check = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![1] as () => Promise<boolean>;
    await act(async () => { await check(); });
    expect(await findByText('Worth a call')).toBeTruthy();

    await act(async () => { await new Promise((r) => setTimeout(r, FOLD_MOTION.railLagMs + 20)); });
    expect(configureNext).toHaveBeenCalledTimes(1);
  });
});

// ── CUL-1275 — the landing is SPOKEN ──────────────────────────────────────────
// The vomit suite carries the full matrix (every verdict, the edit re-read, failed,
// Android); this pins that the stool section is wired to the same announcer, on the two
// cases that matter most: a landing on an open record, and the photoless escalation that
// never shows a pending box.
describe('StoolAnalysisSection — the landing is announced (CUL-1275)', () => {
  const { AccessibilityInfo } = jest.requireActual<typeof import('react-native')>('react-native');
  let announce: jest.SpyInstance;

  beforeEach(() => {
    mockRow = null;
    (watchAnalysisRow as jest.Mock).mockClear();
    (awaitAnalysisChain as jest.Mock).mockReset().mockResolvedValue(false);
    // RN's jest preset already makes this a `jest.fn`, and `spyOn` over a mock returns
    // THAT mock, calls and all — so every earlier render in the file is still on it.
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
  });
  afterEach(() => {
    announce.mockRestore();
    mockRow = null;
  });

  // A landed row carries the change marker the server's write bumps (013's trigger), so
  // it reads as WRITTEN; a case about a wait that wrote nothing passes the old marker.
  async function land(next: Record<string, unknown>) {
    mockRow = { updated_at: '2026-09-26T12:00:05.000Z', ...next };
    const check = (watchAnalysisRow as jest.Mock).mock.calls.at(-1)![1] as () => Promise<boolean>;
    await act(async () => { await check(); });
  }

  it('a Worth a call that lands while the record is open is spoken, once', async () => {
    mockRow = row({ status: 'pending', recommendation: null });
    const view = render(<StoolAnalysisSection eventId="as-1" petId="pet-1" petName="Rex" hasPhoto />);
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    await land(row({ recommendation: 'worth_a_call', read_text: 'Black, tarry stool is worth a call today.' }));
    expect(await view.findByText('Worth a call')).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(readLandedCopy('Worth a call'));
  });

  it('a PHOTOLESS contextual escalation is spoken', async () => {
    const view = render(<StoolAnalysisSection eventId="as-2" petId="pet-1" petName="Rex" hasPhoto={false} />);
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    expect(view.toJSON()).toBeNull();
    await land(row({ recommendation: 'worth_a_call', read_text: 'Worth a call.' }));
    expect(announce).toHaveBeenCalledWith(readLandedCopy('Worth a call'));
  });

  it('Show, then a SKIPPED re-run, says nothing — the re-run re-bases on the server’s row', async () => {
    mockRow = row({ recommendation: 'monitor', read_text: 'Formed.', dismissed_at: '2026-09-19T08:00:00.000Z', updated_at: '2026-09-20T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="as-4" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Show'));
    const afterShow = row({ recommendation: 'monitor', read_text: 'Formed.', dismissed_at: null, updated_at: '2026-09-26T12:00:01.000Z' });
    mockRow = afterShow;
    fireEvent.press(await view.findByText('Re-run analysis'));
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    await land(afterShow);
    expect(await view.findByText('Keep an eye out')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
  });

  it('an UNSEEN Worth a call surfaced by a skipped re-run is spoken (R1)', async () => {
    mockRow = row({ recommendation: 'monitor', read_text: 'Formed.', updated_at: '2026-09-20T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="as-5" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await view.findByText('Keep an eye out')).toBeTruthy();
    const unseen = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.', updated_at: '2026-09-26T11:00:00.000Z' });
    mockRow = unseen;
    fireEvent.press(view.getByText('Re-run analysis'));
    await waitFor(() => expect(watchAnalysisRow as jest.Mock).toHaveBeenCalledTimes(1));
    await land(unseen);
    expect(announce).toHaveBeenCalledWith(readLandedCopy('Worth a call'));
  });

  it('a FAILED re-run trigger never parks the section on "Reading the photo…" (R3)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (triggerStoolAnalysis as jest.Mock).mockResolvedValueOnce({ error: 'FunctionsHttpError: 500' });
    mockRow = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.', updated_at: '2026-09-20T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="as-6" petId="pet-1" petName="Rex" hasPhoto />);
    const rerun = await view.findByText('Re-run analysis');
    await act(async () => { fireEvent.press(rerun); });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(await view.findByText('Worth a call')).toBeTruthy();
    expect(view.queryByText('Reading the photo…')).toBeNull();
    alert.mockRestore();
  });

  it('a failed trigger that uncovers an UNSEEN Worth a call shows it, speaks it, and says so outright (F1)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockExpectLanding.mockClear();
    (triggerStoolAnalysis as jest.Mock).mockResolvedValueOnce({ error: 'FunctionsHttpError: 500' });
    mockRow = row({ recommendation: 'monitor', read_text: 'Formed.', updated_at: '2026-09-20T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="as-7" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await view.findByText('Keep an eye out')).toBeTruthy();
    mockRow = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.', updated_at: '2026-09-26T11:00:00.000Z' });
    await act(async () => { fireEvent.press(view.getByText('Re-run analysis')); });
    expect(await view.findByText('Worth a call')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(readLandedCopy('Worth a call'));
    expect(mockExpectLanding).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('a failed attempt restores the row AS THE FUNCTION LEFT IT — the failure, not the calm read it replaced (round 5)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRow = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.', updated_at: '2026-09-20T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="as-8" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await view.findByText('Worth a call')).toBeTruthy();
    mockRow = row({ recommendation: 'monitor', read_text: 'Formed.', updated_at: '2026-09-26T11:00:00.000Z' });
    (triggerStoolAnalysis as jest.Mock).mockImplementationOnce(async () => {
      mockRow = row({ status: 'failed', recommendation: 'monitor', read_text: 'Formed.', updated_at: '2026-09-26T12:00:09.000Z' });
      return { error: 'FunctionsHttpError: 500' };
    });
    await act(async () => { fireEvent.press(view.getByText('Re-run analysis')); });
    expect(await view.findByText("Couldn't finish reading this one.")).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith(readLandedCopy('Keep an eye out'));
    alert.mockRestore();
  });

  it('when the post-error re-read FAILS, a calm pre-attempt copy is never put back or spoken (round 6)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRow = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.', updated_at: '2026-09-20T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="as-9" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await view.findByText('Worth a call')).toBeTruthy();
    mockRow = row({ recommendation: 'monitor', read_text: 'Formed.', updated_at: '2026-09-26T11:00:00.000Z' });
    (triggerStoolAnalysis as jest.Mock).mockImplementationOnce(async () => {
      mockRow = null;
      return { error: 'FunctionsHttpError: 500' };
    });
    await act(async () => { fireEvent.press(view.getByText('Re-run analysis')); });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    // What the owner already saw stays: the Worth a call, silently.
    expect(await view.findByText('Worth a call')).toBeTruthy();
    expect(view.queryByText('Keep an eye out')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('a failed Try again behind an old hide does not re-hide a NEW read the server has un-hidden (CUL-1323)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRow = row({ status: 'failed', recommendation: 'monitor', read_text: 'Formed.', dismissed_at: '2026-09-19T08:00:00.000Z', updated_at: '2026-09-20T09:00:00.000Z' });
    const view = render(<StoolAnalysisSection eventId="as-10" petId="pet-1" petName="Rex" hasPhoto />);
    const tryAgain = await view.findByText('Try again');
    mockRow = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.', dismissed_at: null, updated_at: '2026-09-26T11:00:00.000Z' });
    (triggerStoolAnalysis as jest.Mock).mockResolvedValueOnce({ error: 'FunctionsHttpError: 500' });
    await act(async () => { fireEvent.press(tryAgain); });
    expect(await view.findByText('Worth a call')).toBeTruthy();
    expect(view.queryByText('AI note hidden')).toBeNull();
    alert.mockRestore();
  });

  it('the owner’s own in-flight Show survives a failed trigger’s restore (M3)', async () => {
    // The vomit twin's M3, which the round-7 pass found missing here (mutating this
    // file's restore left every stool test green). Show, then Re-run before the Show
    // reached the server: the server's copy still says hidden, and the restore must not
    // put the note back behind "AI note hidden".
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const hidden = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.', dismissed_at: '2026-09-19T08:00:00.000Z', updated_at: '2026-09-20T09:00:00.000Z' });
    mockRow = hidden;
    const view = render(<StoolAnalysisSection eventId="as-11" petId="pet-1" petName="Rex" hasPhoto />);
    fireEvent.press(await view.findByText('Show'));
    mockRow = hidden; // the Show's write has not landed server-side yet
    (triggerStoolAnalysis as jest.Mock).mockResolvedValueOnce({ error: 'FunctionsHttpError: 500' });
    const rerun = await view.findByText('Re-run analysis');
    await act(async () => { fireEvent.press(rerun); });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(await view.findByText('Worth a call')).toBeTruthy();
    expect(view.queryByText('AI note hidden')).toBeNull();
    alert.mockRestore();
  });

  it('a read already in the record on open says nothing', async () => {
    mockRow = row({ recommendation: 'worth_a_call', read_text: 'Worth a call.' });
    const view = render(<StoolAnalysisSection eventId="as-3" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await view.findByText('Worth a call')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
  });
});

// ── CUL-1408 (PM ruling (a), 2026-09-29): an owner edit away from a formed stool re-runs a
// read EN-7 wrote without its vomiting call, so the call comes back. Dark: only a row the
// server stamped with engines_v3_en3 qualifies. The predicate's cases are lib/stoolForm.test.ts;
// this pins the wiring, both ways.
describe('StoolAnalysisSection — EN-7 re-check on an owner edit (CUL-1408)', () => {
  // Earlier suites in this file leave calls on the shared mocks; start from none.
  beforeEach(() => {
    (triggerStoolAnalysis as jest.Mock).mockClear();
    (watchAnalysisRow as jest.Mock).mockClear();
  });
  afterEach(() => {
    mockRow = null;
    mockEditorProps = null;
    (triggerStoolAnalysis as jest.Mock).mockClear();
    (watchAnalysisRow as jest.Mock).mockClear();
  });

  async function saveConsistency(over: Record<string, unknown>, next: string) {
    mockRow = row({ recommendation: 'monitor', stool_consistency: 'type_4_smooth_soft', ...over });
    const screen = render(<StoolAnalysisSection eventId="e" petId="p" petName="Cooper" hasPhoto />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    expect(triggerStoolAnalysis).not.toHaveBeenCalled(); // a finished read triggers nothing on mount
    fireEvent.press(screen.getByText('Edit'));
    await waitFor(() => expect(mockEditorProps).not.toBeNull());
    (deriveEditedStoolFields as jest.Mock).mockReturnValueOnce(['stool_consistency']);
    await act(async () => {
      await mockEditorProps!.onSave({ stool_consistency: next });
    });
    return screen;
  }

  it('a row EN-7 wrote with no vomiting call: an edit to watery re-runs the read and watches it', async () => {
    await saveConsistency({ engine_flags: ['engines_v3_en3'], contextual_flags: [] }, 'type_7_watery');
    expect(triggerStoolAnalysis).toHaveBeenCalledTimes(1);
    expect(triggerStoolAnalysis).toHaveBeenCalledWith('e');
    expect(watchAnalysisRow).toHaveBeenCalled();
  });

  it('a row written by today\'s rule (key off): the same edit re-runs nothing', async () => {
    await saveConsistency({ engine_flags: [], contextual_flags: [] }, 'type_7_watery');
    expect(triggerStoolAnalysis).not.toHaveBeenCalled();
  });

  it('a re-check that does not start is said, never a silent calm card (R2e)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (triggerStoolAnalysis as jest.Mock).mockImplementationOnce(() => Promise.resolve({ error: 'network' }));
    await saveConsistency({ engine_flags: ['engines_v3_en3'], contextual_flags: [] }, 'type_7_watery');
    expect(triggerStoolAnalysis).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Saved, but the read did not re-run', 'Tap Re-run analysis to check it again.');
    expect(watchAnalysisRow).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('an edit that stays formed, or a call that already stands: nothing re-runs', async () => {
    await saveConsistency({ engine_flags: ['engines_v3_en3'], contextual_flags: [] }, 'type_3_cracked');
    expect(triggerStoolAnalysis).not.toHaveBeenCalled();
  });
});
