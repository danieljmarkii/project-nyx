// analysis.ts pulls in ./supabase (fail-fast env check) and ./sync (→ ./db →
// expo-sqlite, unresolvable under jest); stubbing both before the import resolves
// keeps this a pure-logic unit test (same shape as lib/meals.test.ts /
// account.test.ts). saveVomitFieldEdits is thin I/O over buildVomitEditWrite —
// the write SHAPE is tested via buildVomitEditWrite below; the round-trip is
// exercised by the Manual QA Script.
jest.mock('./supabase', () => {
  // Controllable realtime channel mock (CUL-171): each .channel() records its
  // postgres-changes handler + subscribe callback so a test can drive an event
  // or a SUBSCRIBED status by hand. Created channels are exposed on __channels
  // for filter assertions + teardown checks. Defined inside the factory to stay
  // clear of jest's hoisting.
  const channels: Array<Record<string, unknown>> = [];
  return {
    supabase: {
      from: jest.fn(),
      functions: { invoke: jest.fn() },
      channel: jest.fn((name: string) => {
        const ch: Record<string, unknown> = { name, pgHandler: null, subCb: null };
        ch.on = jest.fn((_event: string, _filter: unknown, cb: (p: unknown) => void) => {
          ch.pgHandler = cb;
          return ch;
        });
        ch.subscribe = jest.fn((cb: (status: string) => void) => {
          ch.subCb = cb;
          return ch;
        });
        channels.push(ch);
        return ch;
      }),
      removeChannel: jest.fn(),
      __channels: channels,
    },
  };
});
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  ensureEventAttachmentsSynced: jest.fn().mockResolvedValue(undefined),
}));

import {
  EDITABLE_VOMIT_FIELDS,
  EDITABLE_STOOL_FIELDS,
  VomitEditableFields,
  StoolEditableFields,
  normalizeVomitEdits,
  normalizeStoolEdits,
  extractEditableFromPayload,
  extractStoolEditableFromPayload,
  deriveEditedFields,
  deriveEditedStoolFields,
  buildVomitEditWrite,
  buildStoolEditWrite,
  triggerStoolAnalysis,
  triggerVomitAnalysis,
  claimAnalysisChain,
  awaitAnalysisChain,
  watchAnalysisRow,
  ANALYSIS_WATCH_FALLBACK_DELAYS_MS,
} from './analysis';
import { supabase } from './supabase';

// Grab a typed handle to the mocked invoke AFTER import (referencing it inside
// the jest.mock factory hits a TDZ/hoisting trap).
const mockInvoke = supabase.functions.invoke as jest.Mock;

const blank = (): VomitEditableFields => ({
  colour: null,
  consistency: null,
  contents: null,
  blood_present: null,
  foreign_material_present: null,
  foreign_material_note: null,
  description: null,
});

describe('triggerStoolAnalysis (B-247)', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('invokes the analyze-stool function with the event id', async () => {
    mockInvoke.mockResolvedValue({ error: null });
    const res = await triggerStoolAnalysis('evt-1');
    // A typo in the function name silently means no stool read ever runs — lock it.
    expect(mockInvoke).toHaveBeenCalledWith('analyze-stool', { body: { event_id: 'evt-1' } });
    expect(res.error).toBeNull();
  });

  it('surfaces the invoke error message rather than throwing', async () => {
    mockInvoke.mockResolvedValue({ error: new Error('boom') });
    const res = await triggerStoolAnalysis('evt-2');
    expect(res.error).toBe('boom');
  });
});

describe('EDITABLE_STOOL_FIELDS (B-247)', () => {
  it('names the stool structured columns, never an n=1 read column', () => {
    // The editable set feeds the vet report and gates the client edit write —
    // it must never include a read/pipeline column, mirroring the vomit
    // never-clobber guarantee (a client edit can never alter the read).
    for (const forbidden of [
      'recommendation',
      'read_text',
      'visual_flags',
      'contextual_flags',
      'status',
      'ai_raw_payload',
      'ai_confidence',
      'dismissed_at',
      'edited_at',
    ]) {
      expect(EDITABLE_STOOL_FIELDS as readonly string[]).not.toContain(forbidden);
    }
    // The escalation-driving structured fields ARE owner-editable (the B-028
    // blood-correction case), so they must be present.
    expect(EDITABLE_STOOL_FIELDS as readonly string[]).toContain('stool_blood_present');
    expect(EDITABLE_STOOL_FIELDS as readonly string[]).toContain('stool_blood_type');
  });
});

describe('normalizeVomitEdits', () => {
  it('collapses empty strings and empty arrays to null (blank === absent)', () => {
    const n = normalizeVomitEdits({
      ...blank(),
      contents: [],
      foreign_material_note: '   ',
      description: '',
    });
    expect(n.contents).toBeNull();
    expect(n.foreign_material_note).toBeNull();
    expect(n.description).toBeNull();
  });

  it('trims text fields but preserves real content', () => {
    const n = normalizeVomitEdits({ ...blank(), description: '  A little yellow foam.  ' });
    expect(n.description).toBe('A little yellow foam.');
  });

  it('keeps enum + populated array values intact', () => {
    const n = normalizeVomitEdits({
      ...blank(),
      colour: 'yellow',
      blood_present: 'none_visible',
      contents: ['bile', 'foam'],
    });
    expect(n.colour).toBe('yellow');
    expect(n.blood_present).toBe('none_visible');
    expect(n.contents).toEqual(['bile', 'foam']);
  });

  it('de-dups contents (a set), preserving order — guards the marker mis-fire', () => {
    // A vision model can emit ['bile','bile']; without de-dup it would diff as an
    // edit against an owner's ['bile'] (adversarial-reviewer finding).
    const n = normalizeVomitEdits({ ...blank(), contents: ['bile', 'foam', 'bile'] });
    expect(n.contents).toEqual(['bile', 'foam']);
  });
});

describe('extractEditableFromPayload', () => {
  it('returns null when there is no payload (no AI baseline)', () => {
    expect(extractEditableFromPayload(null)).toBeNull();
    expect(extractEditableFromPayload(undefined)).toBeNull();
  });

  it('pulls only the editable fields out of a raw AI payload, normalized', () => {
    const got = extractEditableFromPayload({
      // Real ai_raw_payload shape — carries read fields too; they must be ignored.
      appears_to_show_vomit: true,
      colour: 'yellow',
      contents: ['bile', 'foam'],
      consistency: 'foamy',
      blood_present: 'none_visible',
      bile_present: 'yes',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'A small amount of yellow foam.',
      recommendation: 'monitor',
      read_text: "This one doesn't show anything concerning on its own.",
    });
    expect(got).toEqual({
      colour: 'yellow',
      consistency: 'foamy',
      contents: ['bile', 'foam'],
      blood_present: 'none_visible',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'A small amount of yellow foam.',
    });
    // bile_present is captured but not in the editable set — must not leak in.
    expect(got).not.toHaveProperty('bile_present');
  });

  it('drops non-string scalars and non-array contents to null', () => {
    const got = extractEditableFromPayload({ colour: 42, contents: 'bile' })!;
    expect(got.colour).toBeNull();
    expect(got.contents).toBeNull();
  });
});

describe('deriveEditedFields', () => {
  const ai: VomitEditableFields = {
    colour: 'yellow',
    consistency: 'foamy',
    contents: ['bile', 'foam'],
    blood_present: 'none_visible',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'A small amount of yellow foam.',
  };

  it('reports no edits when current matches the AI read exactly', () => {
    expect(deriveEditedFields({ ...ai }, ai)).toEqual([]);
  });

  it('reports no edits with no AI baseline to diff against', () => {
    expect(deriveEditedFields({ ...ai }, null)).toEqual([]);
  });

  it('flags the clinically load-bearing blood correction (the B-028 case)', () => {
    // The vet-report scenario: AI mis-read "Blood: none", owner corrects it.
    const edited = deriveEditedFields({ ...ai, blood_present: 'fresh_red' }, ai);
    expect(edited).toEqual(['blood_present']);
  });

  it('treats contents as a set — reorder is not an edit, add/remove is', () => {
    expect(deriveEditedFields({ ...ai, contents: ['foam', 'bile'] }, ai)).toEqual([]);
    expect(deriveEditedFields({ ...ai, contents: ['bile'] }, ai)).toEqual(['contents']);
  });

  it('a value reverted to the AI original is no longer "edited"', () => {
    // Owner corrects blood, then changes it back to what the AI said: value-based
    // diff correctly reports no edit (the report must not claim it as the owner's).
    expect(deriveEditedFields({ ...ai, blood_present: 'none_visible' }, ai)).toEqual([]);
  });

  it('flags clearing a field the AI had set', () => {
    expect(deriveEditedFields({ ...ai, colour: null }, ai)).toEqual(['colour']);
  });

  it('flags adding a field the AI left blank', () => {
    const aiNoNote = { ...ai, foreign_material_present: 'yes', foreign_material_note: null };
    const edited = deriveEditedFields(
      { ...aiNoNote, foreign_material_note: 'a strand of thread' },
      aiNoNote,
    );
    expect(edited).toEqual(['foreign_material_note']);
  });

  it('does not flag a whitespace-only / blank no-op against an absent field', () => {
    expect(deriveEditedFields({ ...ai, foreign_material_note: '   ' }, ai)).toEqual([]);
  });

  it('reports multiple independent edits', () => {
    const edited = deriveEditedFields(
      { ...ai, colour: 'green', blood_present: 'fresh_red' },
      ai,
    );
    expect(edited.sort()).toEqual(['blood_present', 'colour']);
  });
});

describe('buildVomitEditWrite — client-side never-clobber guarantee', () => {
  const NOW = '2026-06-22T10:00:00.000Z';
  const edits: VomitEditableFields = {
    colour: 'green',
    consistency: 'watery',
    contents: ['undigested_food'],
    blood_present: 'fresh_red',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'Looked different this time.',
  };

  it('always stamps edited_at (this is what arms the re-analysis guard)', () => {
    expect(buildVomitEditWrite(blank(), NOW).edited_at).toBe(NOW);
    expect(buildVomitEditWrite(edits, NOW).edited_at).toBe(NOW);
  });

  it('writes ONLY the editable fields + edited_at — never a read column', () => {
    const w = buildVomitEditWrite(edits, NOW);
    expect(Object.keys(w).sort()).toEqual(
      [...EDITABLE_VOMIT_FIELDS, 'edited_at'].sort(),
    );
    // The read is owner-facing and dismissible-not-editable — a client edit must
    // never touch it, nor the cached original, nor the pipeline status.
    for (const forbidden of [
      'recommendation',
      'read_text',
      'visual_flags',
      'contextual_flags',
      'status',
      'ai_raw_payload',
      'ai_confidence',
      'dismissed_at',
    ]) {
      expect(w).not.toHaveProperty(forbidden);
    }
  });

  it('normalizes the written values (blank text/array → null)', () => {
    const w = buildVomitEditWrite(
      { ...blank(), description: '  ', contents: [] },
      NOW,
    );
    expect(w.description).toBeNull();
    expect(w.contents).toBeNull();
  });
});

// ── Stool edit machinery (B-247 PR 6) ─────────────────────────────────────────
const blankStool = (): StoolEditableFields => ({
  stool_consistency: null,
  stool_colour: null,
  stool_content: null,
  stool_blood_present: null,
  stool_blood_type: null,
  stool_mucus_present: null,
  foreign_material_present: null,
  foreign_material_note: null,
  description: null,
});

describe('normalizeStoolEdits', () => {
  it('collapses empty strings and empty arrays to null (blank === absent)', () => {
    const n = normalizeStoolEdits({
      ...blankStool(),
      stool_content: [],
      foreign_material_note: '   ',
      description: '',
    });
    expect(n.stool_content).toBeNull();
    expect(n.foreign_material_note).toBeNull();
    expect(n.description).toBeNull();
  });

  it('de-dups stool_content (a set), preserving order', () => {
    const n = normalizeStoolEdits({ ...blankStool(), stool_content: ['hair', 'grass', 'hair'] });
    expect(n.stool_content).toEqual(['hair', 'grass']);
  });

  it('clears stool_blood_type when blood is not present (server-parity)', () => {
    // A "Dark / tarry" type left behind after the owner corrects blood → "None"
    // would let colour/blood corroboration drift — clear it (matches analyze-stool).
    expect(normalizeStoolEdits({ ...blankStool(), stool_blood_present: 'no', stool_blood_type: 'dark_tarry' }).stool_blood_type).toBeNull();
    expect(normalizeStoolEdits({ ...blankStool(), stool_blood_present: 'unsure', stool_blood_type: 'fresh_red' }).stool_blood_type).toBeNull();
    // Preserved when blood IS present.
    expect(normalizeStoolEdits({ ...blankStool(), stool_blood_present: 'yes', stool_blood_type: 'fresh_red' }).stool_blood_type).toBe('fresh_red');
  });
});

describe('extractStoolEditableFromPayload', () => {
  it('returns null when there is no payload (no AI baseline)', () => {
    expect(extractStoolEditableFromPayload(null)).toBeNull();
    expect(extractStoolEditableFromPayload(undefined)).toBeNull();
  });

  it('maps the UN-prefixed payload keys onto the prefixed editable fields, normalized', () => {
    const got = extractStoolEditableFromPayload({
      // Real ai_raw_payload shape (StoolAnalysis) — un-prefixed keys, carries read
      // fields too; they must be ignored.
      appears_to_show_stool: true,
      consistency: 'type_6_mushy',
      colour: 'brown',
      contents: ['hair'],
      blood_present: 'yes',
      blood_type: 'fresh_red',
      mucus_present: 'no',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'Soft and unformed.',
      recommendation: 'monitor',
      read_text: 'Keep an eye on things.',
    });
    expect(got).toEqual({
      stool_consistency: 'type_6_mushy',
      stool_colour: 'brown',
      stool_content: ['hair'],
      stool_blood_present: 'yes',
      stool_blood_type: 'fresh_red',
      stool_mucus_present: 'no',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'Soft and unformed.',
    });
    // Read fields must not leak into the editable set.
    expect(got).not.toHaveProperty('recommendation');
    expect(got).not.toHaveProperty('read_text');
  });
});

describe('deriveEditedStoolFields', () => {
  const ai: StoolEditableFields = {
    stool_consistency: 'type_6_mushy',
    stool_colour: 'brown',
    stool_content: ['hair'],
    stool_blood_present: 'no',
    stool_blood_type: null,
    stool_mucus_present: 'no',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'Soft and unformed.',
  };

  it('reports no edits when current matches the AI read exactly', () => {
    expect(deriveEditedStoolFields({ ...ai }, ai)).toEqual([]);
  });

  it('reports no edits with no AI baseline to diff against', () => {
    expect(deriveEditedStoolFields({ ...ai }, null)).toEqual([]);
  });

  it('flags the clinically load-bearing blood correction (the B-028 case)', () => {
    // AI mis-read "Blood: none", owner corrects it to fresh red — the escalation-
    // driving field is owner-editable and the edit must be attributable.
    const edited = deriveEditedStoolFields(
      { ...ai, stool_blood_present: 'yes', stool_blood_type: 'fresh_red' },
      ai,
    );
    expect(edited.sort()).toEqual(['stool_blood_present', 'stool_blood_type']);
  });

  it('treats stool_content as a set — reorder is not an edit, add/remove is', () => {
    expect(deriveEditedStoolFields({ ...ai, stool_content: ['hair'] }, ai)).toEqual([]);
    expect(deriveEditedStoolFields({ ...ai, stool_content: ['hair', 'grass'] }, ai)).toEqual(['stool_content']);
  });

  it('does not flag an orphan blood_type once blood is cleared (normalize parity)', () => {
    // Owner sets blood present + fresh, then reverts presence to "no": both the
    // presence AND the type collapse back to the AI original (no spurious edit).
    const withBlood = { ...ai, stool_blood_present: 'no' as string | null, stool_blood_type: 'fresh_red' as string | null };
    expect(deriveEditedStoolFields(withBlood, ai)).toEqual([]);
  });
});

describe('buildStoolEditWrite — client-side never-clobber guarantee', () => {
  const NOW = '2026-07-17T10:00:00.000Z';
  const edits: StoolEditableFields = {
    stool_consistency: 'type_7_watery',
    stool_colour: 'red_streaked',
    stool_content: ['undigested_food'],
    stool_blood_present: 'yes',
    stool_blood_type: 'fresh_red',
    stool_mucus_present: 'yes',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'Looked different this time.',
  };

  it('always stamps edited_at (this is what arms the re-analysis guard)', () => {
    expect(buildStoolEditWrite(blankStool(), NOW).edited_at).toBe(NOW);
    expect(buildStoolEditWrite(edits, NOW).edited_at).toBe(NOW);
  });

  it('writes ONLY the editable fields + edited_at — never a read column', () => {
    const w = buildStoolEditWrite(edits, NOW);
    expect(Object.keys(w).sort()).toEqual([...EDITABLE_STOOL_FIELDS, 'edited_at'].sort());
    for (const forbidden of [
      'recommendation',
      'read_text',
      'visual_flags',
      'contextual_flags',
      'status',
      'ai_raw_payload',
      'ai_confidence',
      'dismissed_at',
    ]) {
      expect(w).not.toHaveProperty(forbidden);
    }
  });
});

// ── The analysis-chain claim: one read per photo (CUL-801) ────────────────────
//
// The defect this closes: the log path (compress → upload → invoke) and the
// incident screen's mount both trigger a read for the same event. Two invocations
// burn two units of the daily-10 cap, race each other's write-back, and — when
// the SECOND call is the one that crosses the cap — can write a 'capped' state
// over the first call's real read of a photo that did land.
//
// The invariant these tests exist to defend is the OTHER direction, and it is the
// one that matters clinically: the claim must never suppress the ONLY read. Every
// path that settles without invoking settles FALSE, and false means "trigger your
// own".
describe('analysis-chain claim (CUL-801)', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('resolves false when no chain is outstanding — the caller triggers its own read', async () => {
    await expect(awaitAnalysisChain('nobody-claimed-me')).resolves.toBe(false);
  });

  it('holds a waiter while a chain is outstanding, then releases it with the outcome', async () => {
    const claim = claimAnalysisChain('ev-claim-1');
    expect(claim).not.toBeNull();

    let settled: boolean | 'still-waiting' = 'still-waiting';
    const waiter = awaitAnalysisChain('ev-claim-1').then((v) => { settled = v; });
    // A microtask turn is enough for an already-resolved promise to land; the
    // waiter must NOT have resolved, because the chain is still running.
    await Promise.resolve();
    expect(settled).toBe('still-waiting');

    claim!.settle(true);
    await waiter;
    expect(settled).toBe(true);
  });

  it('a chain that dies before its read settles FALSE — the waiter must trigger one itself', async () => {
    // This is the upload-threw / attachment-upsert-errored path in
    // attachPhotoBestEffort. Skipping instead of awaiting would leave the
    // incident with no descriptive read AND no deterministic escalation.
    // The waiter is taken BEFORE the settle on purpose: once a chain settles its
    // key is freed, and awaiting a freed key returns false no matter WHAT was
    // settled — so asserting after the fact would pass on any implementation.
    const claim = claimAnalysisChain('ev-dead-chain');
    const waiter = awaitAnalysisChain('ev-dead-chain');
    claim!.settle(false);
    await expect(waiter).resolves.toBe(false);
  });

  it('refuses a second claim while one is outstanding, and frees the key once it settles', () => {
    const first = claimAnalysisChain('ev-claim-2');
    expect(first).not.toBeNull();
    // The nesting case: the log path holds the claim, and the trigger it calls
    // finds it taken. A null claim must never settle a chain it does not own.
    expect(claimAnalysisChain('ev-claim-2')).toBeNull();

    first!.settle(true);
    expect(claimAnalysisChain('ev-claim-2')).not.toBeNull();
  });

  it('settle is idempotent — a second settle neither throws nor changes the outcome', async () => {
    const claim = claimAnalysisChain('ev-double-settle');
    // The waiter has to be taken BEFORE the settle: once a chain finishes, its key
    // is freed and a LATER caller correctly gets false (no chain is running, so it
    // should decide for itself). Idempotence is about the waiters already holding
    // the promise — e.g. attachPhotoBestEffort's `finally` firing after the inner
    // trigger already settled the same claim.
    const waiter = awaitAnalysisChain('ev-double-settle');
    claim!.settle(true);
    claim!.settle(false);
    await expect(waiter).resolves.toBe(true);
  });

  it('a caller arriving after the chain finished gets false — and the row read is what stops a re-invoke', async () => {
    // Stated rather than left to be discovered: the claim covers the window while
    // a chain is RUNNING, not after it. The section's own fetchRow() is what
    // covers "already done" — the Edge Function writes its row before it responds,
    // so by the time an invoke resolves the row exists and start() returns early
    // on it. The residual is the millisecond between that DB write and the
    // response landing, and a section that mounts inside it degrades to exactly
    // the pre-CUL-801 behaviour (one extra call), never to something worse.
    const claim = claimAnalysisChain('ev-after');
    claim!.settle(true);
    await expect(awaitAnalysisChain('ev-after')).resolves.toBe(false);
  });

  it('a re-claimed event is a genuinely NEW chain — a stale settle cannot disturb it', async () => {
    // Deliberately NOT a test of the identity comparison in settle(): the
    // per-claim `settled` flag short-circuits before that comparison, so nothing
    // reachable from this API can make a settle run against someone else's slot
    // (the comparison stays as wiring against a future refactor that drops the
    // flag — a defect guard kept even where the gate makes it unreachable).
    // What IS reachable and load-bearing: the second chain must hold its own
    // waiters independently of the first.
    const stale = claimAnalysisChain('ev-identity');
    stale!.settle(true);

    const fresh = claimAnalysisChain('ev-identity');
    expect(fresh).not.toBeNull();
    expect(claimAnalysisChain('ev-identity')).toBeNull(); // fresh holds the key

    let resolved: boolean | 'still-waiting' = 'still-waiting';
    const waiter = awaitAnalysisChain('ev-identity').then((v) => { resolved = v; });
    stale!.settle(false); // idempotent no-op
    await Promise.resolve();
    expect(resolved).toBe('still-waiting');

    fresh!.settle(true);
    await waiter;
    expect(resolved).toBe(true);
  });

  it('trigger*Analysis claims its own chain: a concurrent waiter is released, and does not invoke twice', async () => {
    let release!: (v: { error: null }) => void;
    mockInvoke.mockReturnValue(new Promise((r) => { release = r; }));

    const triggering = triggerVomitAnalysis('ev-trigger-claim');
    // Let the trigger reach its claim + invoke.
    await Promise.resolve();

    let waiterSaw: boolean | 'still-waiting' = 'still-waiting';
    const waiter = awaitAnalysisChain('ev-trigger-claim').then((v) => { waiterSaw = v; });
    await Promise.resolve();
    expect(waiterSaw).toBe('still-waiting'); // held while the invoke is in flight

    release({ error: null });
    await triggering;
    await waiter;
    expect(waiterSaw).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('a REFUSED invoke settles false — a waiter retries rather than watching for a row nothing writes', async () => {
    // The waiter has to be holding the chain's promise while the invoke is still
    // in flight; grabbing it after the trigger resolves reads a freed key and
    // would report false against any implementation.
    let release!: (v: { error: { message: string } }) => void;
    mockInvoke.mockReturnValue(new Promise((r) => { release = r; }));
    const triggering = triggerStoolAnalysis('ev-refused');
    const waiter = awaitAnalysisChain('ev-refused');

    release({ error: { message: 'network down' } });
    await expect(triggering).resolves.toEqual({ error: 'network down' });
    await expect(waiter).resolves.toBe(false);
  });

  it('a throwing invoke settles false too — the claim is never left outstanding', async () => {
    let reject!: (e: Error) => void;
    mockInvoke.mockReturnValue(new Promise((_r, rj) => { reject = rj; }));
    const triggering = triggerVomitAnalysis('ev-threw');
    const waiter = awaitAnalysisChain('ev-threw');

    reject(new Error('boom'));
    await expect(triggering).resolves.toEqual({ error: 'boom' });
    await expect(waiter).resolves.toBe(false);
    // And the key is free again, so nothing is stuck waiting on a dead chain.
    expect(claimAnalysisChain('ev-threw')).not.toBeNull();
  });

  it('an explicit re-trigger still invokes while a chain is outstanding (the retry floor)', async () => {
    // Deliberate: the sections' "Try analysis" is an owner action and must never
    // be swallowed by a claim. Only callers that await the chain FIRST defer to
    // it; a direct trigger always calls.
    const claim = claimAnalysisChain('ev-retry');
    mockInvoke.mockResolvedValue({ error: null });
    await triggerVomitAnalysis('ev-retry');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    claim!.settle(true);
  });
});

// ── watchAnalysisRow: realtime watch over event_ai_analysis (CUL-171) ──────────
// The per-incident sections wait for the analyze-* Edge Function to write the
// row. This replaces a 3s×12 poll with a filtered realtime subscription plus a
// bounded fallback. These pin the plumbing the components mock out.
describe('watchAnalysisRow — realtime watch (CUL-171)', () => {
  type Chan = {
    name: string;
    pgHandler: ((p: unknown) => void) | null;
    subCb: ((status: string) => void) | null;
    on: jest.Mock;
    subscribe: jest.Mock;
  };
  const chans = () =>
    (supabase as unknown as { __channels: Chan[] }).__channels;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    chans().length = 0;
    (supabase.channel as jest.Mock).mockClear();
    (supabase.removeChannel as jest.Mock).mockClear();
  });

  it('subscribes filtered to this event row and reconciles once SUBSCRIBED', async () => {
    const check = jest.fn().mockResolvedValue(false);
    const teardown = watchAnalysisRow('ev-1', check, jest.fn());
    const ch = chans().at(-1)!;

    expect(supabase.channel).toHaveBeenCalledWith('event_ai_analysis:ev-1');
    expect(ch.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'event_ai_analysis', filter: 'event_id=eq.ev-1' }),
      expect.any(Function),
    );
    // Nothing is read until the socket is confirmed live — realtime only carries
    // changes after SUBSCRIBED, so the reconcile is what closes the race.
    expect(check).not.toHaveBeenCalled();

    ch.subCb!('SUBSCRIBED');
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    teardown();
  });

  it('resolves and removes the channel when a change moves the row off pending', async () => {
    const check = jest.fn().mockResolvedValue(true); // resolved on re-read
    const onGiveUp = jest.fn();
    watchAnalysisRow('ev-2', check, onGiveUp);
    const ch = chans().at(-1)!;

    ch.pgHandler!({ new: { status: 'completed' } });
    await flush();

    expect(check).toHaveBeenCalledTimes(1);
    expect(supabase.removeChannel).toHaveBeenCalledWith(ch);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('teardown removes the channel and is safe to call twice', () => {
    const teardown = watchAnalysisRow('ev-3', jest.fn().mockResolvedValue(false), jest.fn());
    const ch = chans().at(-1)!;
    teardown();
    teardown(); // idempotent — no throw, no double remove
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(supabase.removeChannel).toHaveBeenCalledWith(ch);
  });

  it('a failing check() is logged, not fatal — keeps watching, no give-up', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const check = jest.fn().mockRejectedValue(new Error('transient read failure'));
      const onGiveUp = jest.fn();
      const teardown = watchAnalysisRow('ev-5', check, onGiveUp);
      const ch = chans().at(-1)!;

      ch.subCb!('SUBSCRIBED'); // reconcile tick → check rejects
      await flush();

      expect(check).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('[analysis-watch] check failed:', expect.any(Error));
      // A transient failure is neither a resolution nor a give-up — still watching.
      expect(onGiveUp).not.toHaveBeenCalled();
      expect(supabase.removeChannel).not.toHaveBeenCalled();
      teardown();
    } finally {
      warn.mockRestore();
    }
  });

  it('gives up exactly once after the fallback schedule if realtime never delivers', async () => {
    jest.useFakeTimers();
    try {
      const check = jest.fn().mockResolvedValue(false); // never resolves
      const onGiveUp = jest.fn();
      watchAnalysisRow('ev-4', check, onGiveUp);
      const ch = chans().at(-1)!;

      await jest.advanceTimersByTimeAsync(ANALYSIS_WATCH_FALLBACK_DELAYS_MS.at(-1)!);

      // one re-read per fallback delay, then a single give-up + teardown — the
      // same "give up → manual retry" floor the old 36s poll had.
      expect(check).toHaveBeenCalledTimes(ANALYSIS_WATCH_FALLBACK_DELAYS_MS.length);
      expect(onGiveUp).toHaveBeenCalledTimes(1);
      expect(supabase.removeChannel).toHaveBeenCalledWith(ch);
    } finally {
      jest.useRealTimers();
    }
  });
});
