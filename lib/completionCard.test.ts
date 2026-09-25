// lib/weight.ts imports the Supabase client at module scope (its insert path uses
// it), so pulling in the pure kgToLbs conversion drags the client along and its
// env fail-fast throws under jest. Stubbed rather than worked around by inlining
// the conversion: there is ONE rounding rule in this app and the card's number has
// to be the same one the trend card draws, so the test exercises the real helper.
// Nothing under test here touches the client or the sync queue.
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn(),
  syncPendingWeightChecks: jest.fn(),
}));

import {
  summarizeLoggedRecord, canChangeTime, resolveNamedTimeEdit, applyNamedTimeEdit,
  timeEditPrompt, removedNoticeCopy,
  HITSLOP_ACTION_LEFT, HITSLOP_ACTION_RIGHT, HITSLOP_ACTION_SOLO, undoGateCopy,
  eventHasNote, removeConfirmCopy,
  type LoggedRecord,
} from './completionCard';
import { formatTime, describeOccurredAt } from './utils';

// B-514 — the day boundary is LOCAL midnight, and summarizeLoggedRecord's
// "today/yesterday" phrasing reads it. A UTC literal for a local-day question is
// already the next day at UTC+13 and the previous one at UTC-11, so every fixture
// here is built from LOCAL components and compared against a LOCAL `now`.
// (The CI matrix runs this suite at UTC+14 / UTC+12:45 / UTC-10.)
//
// The TIME portion of every expectation is composed through formatTime rather
// than written as "5:33 PM" — the shipped logCopy.test.ts convention. `hour:
// '2-digit'` renders a leading zero under some locales (the jest runner's among
// them), and hard-coding one turns a copy assertion into a statement about the
// runner's Intl data. What is asserted here is the SHAPE around the time.
const at = (h: number, m: number) => new Date(2026, 5, 7, h, m);
const NOW = at(18, 0);

function eventRecord(over: Partial<Extract<LoggedRecord, { kind: 'event' }>> = {}): LoggedRecord {
  return {
    kind: 'event',
    typeLabel: 'Vomit',
    confidence: 'witnessed',
    earliest: null,
    latest: null,
    ...over,
  };
}

describe('summarizeLoggedRecord', () => {
  it('names a witnessed event with its day and time', () => {
    expect(summarizeLoggedRecord(eventRecord(), at(17, 33).toISOString(), NOW))
      .toBe(`Vomit · today at ${formatTime(at(17, 33))}`);
  });

  // The load-bearing one. An open-ended window is upper-bound-only: the record
  // knows when it was FOUND and nothing about when it happened. The sentence must
  // say exactly that — never "at", never a lower bound the row does not hold.
  it('an open-ended window reads "found by", never a point', () => {
    const sentence = summarizeLoggedRecord(
      eventRecord({ confidence: 'window', earliest: null, latest: at(17, 33).toISOString() }),
      at(17, 33).toISOString(),
      NOW,
    );
    expect(sentence).toBe(`Vomit · found by ${formatTime(at(17, 33))}`);
    expect(sentence).not.toMatch(/\bat\b/);
    expect(sentence).not.toMatch(/since/);
  });

  it('a bounded window reads both edges', () => {
    expect(summarizeLoggedRecord(
      eventRecord({
        typeLabel: 'Loose stool',
        confidence: 'window',
        earliest: at(14, 0).toISOString(),
        latest: at(17, 33).toISOString(),
      }),
      at(17, 33).toISOString(),
      NOW,
    )).toBe(`Loose stool · between ${formatTime(at(14, 0))} and ${formatTime(at(17, 33))}`);
  });

  // The degenerate lower-edge-only window (the capture UI guards against it, but
  // legacy rows can hold it). describeOccurredAt renders "after 2:00 PM" and the
  // sentence inherits that verbatim — honest, and notably NOT a point.
  it('a lower-edge-only window reads "after", never an exact time', () => {
    const sentence = summarizeLoggedRecord(
      eventRecord({ confidence: 'window', earliest: at(14, 0).toISOString(), latest: null }),
      at(14, 0).toISOString(),
      NOW,
    );
    expect(sentence).toBe(`Vomit · after ${formatTime(at(14, 0))}`);
  });

  it('an estimated time reads "around"', () => {
    expect(summarizeLoggedRecord(
      eventRecord({ typeLabel: 'Lethargy', confidence: 'estimated' }),
      at(9, 15).toISOString(),
      NOW,
    )).toBe(`Lethargy · around ${formatTime(at(9, 15))}`);
  });

  // migration 012: a NULL confidence is "NOT a claim either way", so it renders
  // as History renders it — a BARE POINT, with no day assertion.
  //
  // This assertion previously read "today at 5:33 PM", i.e. it PINNED the
  // witnessed-register phrasing instead of catching it: the module defaulted a
  // null confidence to 'witnessed' for rendering, which prints the day-asserting
  // form over a row that makes no such claim (the display flattening B-527 fixed
  // on the edit screen). The adversarial-reviewer found it and named the shape of
  // the mistake exactly — a test can hold a defect in place as easily as it can
  // prevent one.
  it('an unclassified row renders as a bare point — no day assertion', () => {
    const sentence = summarizeLoggedRecord(eventRecord({ confidence: null }), at(17, 33).toISOString(), NOW);
    expect(sentence).toBe(`Vomit · ${formatTime(at(17, 33))}`);
    expect(sentence).not.toMatch(/today/);
    // ...and it matches what History will show for the identical row.
    expect(sentence).toBe(`Vomit · ${describeOccurredAt({
      confidence: null, occurredAt: at(17, 33).toISOString(), earliest: null, latest: null,
    }).primary}`);
  });

  it('back-dates read "yesterday" and then an explicit date', () => {
    const yesterday = new Date(2026, 5, 6, 20, 0);
    expect(summarizeLoggedRecord(eventRecord(), yesterday.toISOString(), NOW))
      .toBe(`Vomit · yesterday at ${formatTime(yesterday)}`);
    const older = new Date(2026, 5, 1, 20, 0);
    expect(summarizeLoggedRecord(eventRecord(), older.toISOString(), NOW))
      .toBe(`Vomit · Jun 1 at ${formatTime(older)}`);
  });

  // The weight card names the VALUE. The unit is "lbs" — what WeightTrendCard and
  // WeightCard already print — not the round-2 mock's "lb".
  it('a weight check names the value in lbs, on the app-wide rounding rule', () => {
    expect(summarizeLoggedRecord({ kind: 'weight', weightKg: 5.62 }, at(9, 0).toISOString(), NOW))
      .toBe('Weight · 12.4 lbs');
    expect(summarizeLoggedRecord({ kind: 'weight', weightKg: 4.54 }, at(9, 0).toISOString(), NOW))
      .toBe('Weight · 10 lbs');
  });

  // §5's sentence rule, stated as an assertion rather than a comment: whatever the
  // record is, the card never falls back to a bare "Logged".
  it('never emits a bare "Logged" for any record shape', () => {
    const records: LoggedRecord[] = [
      eventRecord(),
      eventRecord({ confidence: null }),
      eventRecord({ confidence: 'estimated' }),
      eventRecord({ confidence: 'window', earliest: null, latest: at(17, 33).toISOString() }),
      eventRecord({ confidence: 'window', earliest: at(14, 0).toISOString(), latest: at(17, 33).toISOString() }),
      { kind: 'weight', weightKg: 5.62 },
    ];
    for (const r of records) {
      const s = summarizeLoggedRecord(r, at(17, 33).toISOString(), NOW);
      expect(s).not.toBe('Logged');
      expect(s).toContain(' · ');
    }
  });
});

describe('canChangeTime / resolveNamedTimeEdit', () => {
  const next = at(16, 5);

  // THE RULE THIS MODULE EXISTS FOR. The meal card's picker re-asserts
  // `witnessed` on save, which is correct for a meal and a silent over-claim
  // here: it would turn a row nobody witnessed into one the report prints as
  // `seen`. Everything except an open-ended window omits the key entirely, so the
  // stored claim survives a time correction untouched (B-448).
  it.each([
    ['witnessed', eventRecord()],
    ['estimated', eventRecord({ confidence: 'estimated' })],
    ['unclassified', eventRecord({ confidence: null })],
  ] as const)('a %s record moves the point and never restates the confidence', (_label, record) => {
    const edit = resolveNamedTimeEdit(record, next);
    expect(edit).toEqual({ occurredAtIso: next.toISOString() });
    expect(edit).not.toHaveProperty('confidence');
    // ...and the record the card re-renders from is unchanged, so its sentence
    // cannot start claiming something the write did not make true.
    expect(applyNamedTimeEdit(record, edit!)).toEqual(record);
  });

  // An open-ended window's point IS its discovery bound (deriveOccurredAt reduces
  // a latest-only window to `latest`). Moving one without the other leaves the row
  // self-contradictory and the card's own sentence false.
  it('an open-ended window moves the discovery bound WITH the point', () => {
    const record = eventRecord({ confidence: 'window', earliest: null, latest: at(17, 33).toISOString() });
    const edit = resolveNamedTimeEdit(record, next);
    expect(edit).toEqual({
      occurredAtIso: next.toISOString(),
      confidence: { value: 'window', earliest: null, latest: next.toISOString() },
    });
    // earliest stays null — the row never held a lower bound, and a time edit is
    // not the place to invent one.
    expect(edit!.confidence!.earliest).toBeNull();
    // The re-derived sentence tracks the write.
    expect(summarizeLoggedRecord(applyNamedTimeEdit(record, edit!), edit!.occurredAtIso, NOW))
      .toBe(`Vomit · found by ${formatTime(next)}`);
  });

  // A single datetime control cannot express two bounds. Every one-value reading
  // either discards an edge or invents one, so the affordance is withheld: the
  // full Saw-it/Found-it control on the edit screen is where this record changes.
  it('a BOUNDED window offers no picker at all', () => {
    const record = eventRecord({
      confidence: 'window',
      earliest: at(14, 0).toISOString(),
      latest: at(17, 33).toISOString(),
    });
    expect(canChangeTime(record)).toBe(false);
    expect(resolveNamedTimeEdit(record, next)).toBeNull();
  });

  // Same withholding as the two-sided window, for the same reason: the point and
  // the single stored edge are not the same value, so one control cannot move
  // both coherently. The safe direction on an ambiguous record is no affordance.
  it('a lower-edge-only window also offers no picker', () => {
    const record = eventRecord({
      confidence: 'window', earliest: at(14, 0).toISOString(), latest: null,
    });
    expect(canChangeTime(record)).toBe(false);
    expect(resolveNamedTimeEdit(record, next)).toBeNull();
  });

  // The card's sentence names the value and no time, so a picker here edits a
  // field the owner can see neither before nor after — and a back-date desyncs
  // the pets.weight_kg snapshot that handleConfirmWeight repointed at log time.
  // Withholding costs nothing against the white takeover, which offered none.
  it('a weight check offers no picker at all', () => {
    const record: LoggedRecord = { kind: 'weight', weightKg: 5.62 };
    expect(canChangeTime(record)).toBe(false);
    expect(resolveNamedTimeEdit(record, next)).toBeNull();
    expect(timeEditPrompt(record)).toBeNull();
  });

  // The falsification the confidence split has to survive: for every record the
  // card will ever hold, an edit must never make the row's claim STRONGER than it
  // was. Ranked weakest→strongest; the resolved value may never move up the list.
  it('no edit ever promotes a record toward a stronger claim', () => {
    // null sits BELOW witnessed, not level with it. The previous map had
    // `null: 2`, which encodes "unclassified is as strong as seen" — precisely
    // the equivalence migration 012 exists to deny, and it would have let a
    // null -> witnessed promotion pass this property silently.
    const strength = { window: 0, null: 1, estimated: 1, witnessed: 2 } as const;
    const records = [
      eventRecord({ confidence: null }),
      eventRecord({ confidence: 'estimated' }),
      eventRecord({ confidence: 'witnessed' }),
      eventRecord({ confidence: 'window', earliest: null, latest: at(17, 33).toISOString() }),
    ];
    for (const record of records) {
      const edit = resolveNamedTimeEdit(record, next);
      if (!edit) continue;
      const after = applyNamedTimeEdit(record, edit);
      if (after.kind !== 'event' || record.kind !== 'event') throw new Error('event records only');
      const before = strength[String(record.confidence) as keyof typeof strength];
      expect(strength[String(after.confidence) as keyof typeof strength]).toBeLessThanOrEqual(before);
    }
  });
});


// The adversarial-reviewer's counterexample, and the reason it got through: the
// module modelled claim-strength as a CLASS ladder, so an edit that narrows the
// INTERVAL while keeping the class was invisible to every guard here.
//
// The sequence: owner finds vomit at 5:33 PM and logs "found it → before now".
// They tap Change time and are asked "When did this happen?" — so they answer
// about OCCURRENCE ("I was out from noon, probably around 2") and the app writes
// it as DISCOVERY. The row then claims it was discovered by 2:00 PM, which is
// false; the only fact it held (found at 5:33) is gone; the window narrows from
// (-inf, 17:33] to (-inf, 14:00]; and occurred_at moves 3.5h earlier, toward the
// preceding meal — the correlation engine's independent variable.
//
// The write itself is right. The QUESTION was wrong, so the prompt is now derived
// from the record alongside the write and pinned here.
describe('timeEditPrompt — the question must name the field being written', () => {
  const found = (): LoggedRecord => ({
    kind: 'event', typeLabel: 'Vomit', confidence: 'window',
    earliest: null, latest: at(17, 33).toISOString(),
  });

  it('asks about DISCOVERY on a found-by record, never about occurrence', () => {
    expect(timeEditPrompt(found())).toBe('When did you find it?');
    expect(timeEditPrompt(found())).not.toMatch(/happen/);
  });

  it('asks about occurrence on a witnessed record', () => {
    expect(timeEditPrompt(eventRecord())).toBe('When did this happen?');
  });

  it('returns null wherever no picker may be offered — a control always has a question', () => {
    const shapes: LoggedRecord[] = [
      { kind: 'weight', weightKg: 5.62 },
      eventRecord({ confidence: 'window', earliest: at(14, 0).toISOString(), latest: at(17, 33).toISOString() }),
      eventRecord({ confidence: 'window', earliest: at(14, 0).toISOString(), latest: null }),
    ];
    for (const r of shapes) {
      expect(canChangeTime(r)).toBe(false);
      expect(timeEditPrompt(r)).toBeNull();
    }
  });

  // The invariant behind all of the above, stated once: wherever a picker is
  // offered there is a question, and wherever there is a question it matches the
  // field the resolver writes (discovery iff the write moves `latest`).
  it('the prompt and the write always agree about which field is being edited', () => {
    const shapes: LoggedRecord[] = [
      eventRecord(),
      eventRecord({ confidence: 'estimated' }),
      eventRecord({ confidence: null }),
      found(),
      eventRecord({ confidence: 'window', earliest: at(14, 0).toISOString(), latest: at(17, 33).toISOString() }),
      { kind: 'weight', weightKg: 5.62 },
    ];
    for (const r of shapes) {
      const prompt = timeEditPrompt(r);
      const edit = resolveNamedTimeEdit(r, at(16, 5));
      expect(prompt === null).toBe(edit === null);
      if (!prompt || !edit) continue;
      // The write moves a discovery bound exactly when the question asked about one.
      expect(Boolean(edit.confidence)).toBe(prompt === 'When did you find it?');
    }
  });
});

// ── The removal line (CUL-612) ──────────────────────────────────────────────
describe('removedNoticeCopy', () => {
  it('mirrors "Saved to {pet}’s record" — the same grammar, reversed', () => {
    const n = removedNoticeCopy('Biscuit');
    expect(n.title).toBe('Removed');
    expect(n.detail).toBe('Taken out of Biscuit’s record');
  });

  it('speaks as ONE announcement for a screen reader, not two orphan lines', () => {
    expect(removedNoticeCopy('Mochi').a11yLabel).toBe('Removed. Taken out of Mochi’s record');
  });

  it('never claims nothing was written', () => {
    // A dose logged through the meal card's combo line KEEPS its own row when the
    // meal is undone (lib/undoLog.ts), so "nothing was saved" would be false on the
    // one path where it matters most — a medication.
    const n = removedNoticeCopy('Biscuit');
    expect(`${n.title} ${n.detail}`).not.toMatch(/nothing|wasn.t saved|not saved/i);
  });

  it('holds to the voice: no exclamation, no reassurance (nyx-voice 4 + 6)', () => {
    // Removing a symptom log is a correction, not good news.
    const n = removedNoticeCopy('Biscuit');
    const all = `${n.title} ${n.detail}`;
    expect(all).not.toContain('!');
    expect(all).not.toMatch(/all clear|no worries|looks fine|great|done for now/i);
  });

  it('carries the pet through, including the generic fallback', () => {
    expect(removedNoticeCopy('your pet').detail).toBe('Taken out of your pet’s record');
  });
});

// ── The removal line (CUL-612) ──────────────────────────────────────────────
describe('removedNoticeCopy', () => {
  it('mirrors "Saved to {pet}’s record" — the same grammar, reversed', () => {
    const n = removedNoticeCopy('Biscuit');
    expect(n.title).toBe('Removed');
    expect(n.detail).toBe('Taken out of Biscuit’s record');
  });

  it('speaks as ONE announcement for a screen reader, not two orphan lines', () => {
    expect(removedNoticeCopy('Mochi').a11yLabel).toBe('Removed. Taken out of Mochi’s record');
  });

  it('never claims nothing was written', () => {
    // A dose logged through the meal card's combo line KEEPS its own row when the
    // meal is undone (lib/undoLog.ts), so "nothing was saved" would be false on the
    // one path where it matters most — a medication.
    const n = removedNoticeCopy('Biscuit');
    expect(`${n.title} ${n.detail}`).not.toMatch(/nothing|wasn.t saved|not saved/i);
  });

  it('holds to the voice: no exclamation, no reassurance (nyx-voice 4 + 6)', () => {
    // Removing a symptom log is a correction, not good news.
    const n = removedNoticeCopy('Biscuit');
    const all = `${n.title} ${n.detail}`;
    expect(all).not.toContain('!');
    expect(all).not.toMatch(/all clear|no worries|looks fine|great|done for now/i);
  });

  it('carries the pet through, including the generic fallback', () => {
    expect(removedNoticeCopy('your pet').detail).toBe('Taken out of your pet’s record');
  });
});

// The action pair's touch targets are asserted where they are rendered
// (NamedCompletionCard.test.tsx); here we only pin that the two constants are
// complements — a symmetric pair would silently re-open the overlap.
describe('HITSLOP_ACTION_LEFT / _RIGHT', () => {
  it('yield opposing edges, and only the facing one', () => {
    expect(HITSLOP_ACTION_LEFT.right).toBeLessThan(HITSLOP_ACTION_LEFT.left);
    expect(HITSLOP_ACTION_RIGHT.left).toBeLessThan(HITSLOP_ACTION_RIGHT.right);
    expect(HITSLOP_ACTION_LEFT.right + HITSLOP_ACTION_RIGHT.left).toBeLessThanOrEqual(8);
  });
});


// CUL-964 — the R2 in-sheet beat's Undo has no sibling to face, so it takes an even
// reach rather than the pair's yielded edge.
describe('HITSLOP_ACTION_SOLO', () => {
  it('is symmetric, and keeps the outward reach the pair gives up', () => {
    expect(HITSLOP_ACTION_SOLO.left).toBe(HITSLOP_ACTION_SOLO.right);
    expect(HITSLOP_ACTION_SOLO.top).toBe(HITSLOP_ACTION_SOLO.bottom);
    // The point of the constant: the facing edge is NOT clipped, because there is
    // nothing to collide with. Re-using HITSLOP_ACTION_LEFT here would hand a lone
    // control a short side for a neighbour that does not exist.
    expect(HITSLOP_ACTION_SOLO.right).toBeGreaterThan(HITSLOP_ACTION_LEFT.right);
    expect(HITSLOP_ACTION_SOLO.right).toBe(HITSLOP_ACTION_LEFT.left);
  });
});

// CUL-645, widened by CUL-869 and shared by CUL-964. Undo is one tap because the tap
// IS the destructive confirm — except over a record carrying something the owner
// cannot make again, where the dialog's job is to say the one thing they do not know.
describe('undoGateCopy', () => {
  it('returns NOTHING for a bare record — no friction bought for its own sake', () => {
    expect(undoGateCopy({})).toBeNull();
    expect(undoGateCopy({ hasAttachment: false, hasNote: false })).toBeNull();
  });

  it('names the photo', () => {
    expect(undoGateCopy({ hasAttachment: true })).toEqual({
      title: 'Remove this log?',
      body: 'The photo you attached will be removed with it.',
    });
  });

  it('names the note — the sentence she typed at 2am is not recreatable either', () => {
    expect(undoGateCopy({ hasNote: true })?.body).toBe(
      'The note you wrote will be removed with it.',
    );
  });

  it('names BOTH when the record carries both, as one sentence', () => {
    // Composed, never branched: the sheet confirm offers a photo and a note on the
    // same screen, and a body that silently dropped one of two facts is the defect
    // this gate exists to prevent. The join is what makes the phrases lower-case —
    // the sentence capitalises its own first letter, so it can never read
    // "…and The note…" mid-sentence.
    expect(undoGateCopy({ hasAttachment: true, hasNote: true })?.body).toBe(
      'The photo you attached and the note you wrote will be removed with it.',
    );
  });

  it('never carries an exclamation mark or a reassurance (nyx-voice)', () => {
    const bodies = [
      undoGateCopy({ hasAttachment: true }),
      undoGateCopy({ hasNote: true }),
      undoGateCopy({ hasAttachment: true, hasNote: true }),
    ];
    for (const copy of bodies) {
      expect(copy).not.toBeNull();
      expect(`${copy?.title} ${copy?.body}`).not.toMatch(/!/);
    }
  });
});

// CUL-1125. Both Remove confirms (the record screen's and today's History's) are built
// here, and their second sentence IS the Undo gate's body: one act, one wording, from
// every door out of a record (C-21).
describe('eventHasNote', () => {
  it('reads an event\'s own note, on any type', () => {
    expect(eventHasNote({ event_type: 'meal', notes: 'Ate half, left the rest' })).toBe(true);
    expect(eventHasNote({ event_type: 'vomit', notes: 'Grass first' })).toBe(true);
  });

  it('reads a look\'s note, which lives on its child', () => {
    expect(eventHasNote({ event_type: 'check_in', notes: null, look_note: 'Slept all afternoon' })).toBe(true);
  });

  it('whitespace, null and a missing column are not a note', () => {
    expect(eventHasNote({ event_type: 'meal', notes: '   \n ' })).toBe(false);
    expect(eventHasNote({ event_type: 'meal', notes: null, look_note: null })).toBe(false);
    expect(eventHasNote({ event_type: 'meal' })).toBe(false);
    expect(eventHasNote({ event_type: 'check_in', look_note: '  ' })).toBe(false);
  });
});

describe('removeConfirmCopy', () => {
  const meal = { event_type: 'meal', notes: null, look_note: null };

  it('a bare record: the lead alone, never a warning about something that is not there', () => {
    expect(removeConfirmCopy(meal, { hasAttachment: false })).toEqual({
      title: 'Remove this log?',
      body: 'This will remove the Meal from history.',
    });
  });

  it('names an EVENT\'s note, which neither Remove used to', () => {
    expect(removeConfirmCopy({ ...meal, notes: 'Only ate the topper' }, { hasAttachment: false }).body).toBe(
      'This will remove the Meal from history. The note you wrote will be removed with it.',
    );
  });

  it('names the photo', () => {
    expect(removeConfirmCopy({ ...meal, event_type: 'vomit' }, { hasAttachment: true }).body).toBe(
      'This will remove the Vomit from history. The photo you attached will be removed with it.',
    );
  });

  it('names BOTH when the record carries both, as one sentence', () => {
    expect(
      removeConfirmCopy({ ...meal, event_type: 'vomit', notes: 'Grass first' }, { hasAttachment: true }).body,
    ).toBe(
      'This will remove the Vomit from history. ' +
        'The photo you attached and the note you wrote will be removed with it.',
    );
  });

  it('a look is "what you noticed", never "the Noticed", and its note is named', () => {
    expect(
      removeConfirmCopy({ event_type: 'check_in', notes: null, look_note: 'Off her food' }, { hasAttachment: false })
        .body,
    ).toBe('This will remove what you noticed from history. The note you wrote will be removed with it.');
  });

  it('an unknown type still reads as a sentence', () => {
    expect(removeConfirmCopy({ event_type: 'retired_type' }, { hasAttachment: false }).body).toBe(
      'This will remove the event from history.',
    );
  });

  it('its second sentence IS the Undo gate\'s body, for every combination', () => {
    // The sharing is structural, not a copy kept in step: change the gate's wording and
    // every Remove follows.
    for (const hasAttachment of [false, true]) {
      for (const notes of [null, 'A note']) {
        const gate = undoGateCopy({ hasAttachment, hasNote: notes !== null });
        const copy = removeConfirmCopy({ ...meal, notes }, { hasAttachment });
        expect(copy.body).toBe(
          gate ? `This will remove the Meal from history. ${gate.body}` : 'This will remove the Meal from history.',
        );
        if (gate) expect(copy.title).toBe(gate.title);
      }
    }
  });

  it('never carries an exclamation mark (nyx-voice)', () => {
    const copy = removeConfirmCopy({ ...meal, notes: 'A note' }, { hasAttachment: true });
    expect(`${copy.title} ${copy.body}`).not.toMatch(/!/);
  });
});
