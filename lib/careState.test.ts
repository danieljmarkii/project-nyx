import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bookedVisitOf,
  bookedVisitRowLine,
  CARE_SIGNS,
  careBackLine,
  careStateBody,
  careStateQuietsAsk,
  careStateTakesAnswers,
  careStateValueOf,
  careStateViewOf,
} from './careState';
import type { SignalFinding } from './signal';
import { concernAskOverBooking } from './signalHomeLine';
import { signalHomeLine } from './signalHomeLine';

// EN-9 (Engines v3 PR-23, CUL-1417): the one client rule, and Home's ask through it.

const chronicity = (careState?: unknown): SignalFinding =>
  ({
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    episodeCount: 14,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 12,
    daysSinceLastEpisode: 1,
    firstOnsetIso: '2026-08-03T12:00:00Z',
    tier: 'firm',
    windowDays: 56,
    ...(careState === undefined ? {} : { careState }),
  }) as unknown as SignalFinding;

describe('careStateValueOf / careStateQuietsAsk', () => {
  it('reads the four states and nothing else', () => {
    expect(careStateValueOf(chronicity())).toBeNull();
    expect(careStateValueOf(chronicity({ state: 'with_vet' }))).toBe('with_vet');
    expect(careStateValueOf(chronicity({ state: 'seen' }))).toBeNull();
    expect(careStateValueOf(chronicity('with_vet'))).toBeNull();
    expect(careStateValueOf(chronicity(null))).toBeNull();
  });

  it('only the two watched states take the ask away', () => {
    expect(careStateQuietsAsk(chronicity({ state: 'with_vet' }))).toBe(true);
    expect(careStateQuietsAsk(chronicity({ state: 'recheck_booked' }))).toBe(true);
    expect(careStateQuietsAsk(chronicity({ state: 'raised' }))).toBe(false);
    expect(careStateQuietsAsk(chronicity({ state: 'raised_again' }))).toBe(false);
    expect(careStateQuietsAsk(chronicity({ state: 'WITH_VET' }))).toBe(false);
  });
});

describe('D1: a care state on an escalation is ignored (AC 3)', () => {
  it('an intake decline or red flag carrying a planted with_vet keeps its ask', () => {
    const intake = { type: 'intake_decline', priorityClass: 'safety', careState: { state: 'with_vet' } } as unknown as SignalFinding;
    const flag = { type: 'incident_red_flag', priorityClass: 'safety', careState: { state: 'with_vet' } } as unknown as SignalFinding;
    expect(careStateQuietsAsk(intake)).toBe(false);
    expect(careStateQuietsAsk(flag)).toBe(false);
  });
});

describe("Home's ask under a care state", () => {
  it('flag off (no field) and raised keep the shipped ask; a watched concern asks nothing', () => {
    expect(signalHomeLine(chronicity())?.ask).toBe('worth booking a vet visit');
    expect(signalHomeLine(chronicity({ state: 'raised' }))?.ask).toBe('worth booking a vet visit');
    expect(signalHomeLine(chronicity({ state: 'raised_again' }))?.ask).toBe('worth booking a vet visit');
    expect(signalHomeLine(chronicity({ state: 'with_vet' }))?.ask).toBeNull();
    expect(signalHomeLine(chronicity({ state: 'recheck_booked' }))?.ask).toBeNull();
    // The row itself stays: a watched concern is never dropped from Home.
    expect(signalHomeLine(chronicity({ state: 'with_vet' }))?.headline).toBe(signalHomeLine(chronicity())?.headline);
  });
});

// ── PR-35 (CUL-1418): the client's offered signs and the drawn lines ──────────────

describe('CARE_SIGNS — the answers the app offers', () => {
  it('equals 082’s care_acknowledgements CHECK, so no tap writes a row the server refuses', () => {
    const sql = readFileSync(join(__dirname, '..', 'supabase/migrations/082_care_record.sql'), 'utf8');
    const m = /symptom_type\s+TEXT\s+NOT NULL CHECK \(symptom_type IN \(([^)]*)\)\)/.exec(sql);
    expect(m).not.toBeNull();
    const checked = (m as RegExpExecArray)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect([...CARE_SIGNS].sort()).toEqual(checked.sort());
  });
});

describe('careStateViewOf — the PR-35 gate', () => {
  const chronic = (careState: unknown, symptomType = 'vomit') =>
    ({ type: 'symptom_chronicity', priorityClass: 'safety', symptomType, careState }) as never;

  it('is null without a server state (flag off, an old cache): nothing new renders', () => {
    expect(careStateViewOf(chronic(undefined))).toBeNull();
  });

  it('is null on an escalation even when a state is forged onto it (AC 3)', () => {
    const decline = { type: 'intake_decline', priorityClass: 'safety', careState: { state: 'with_vet', text: 'x' } } as never;
    expect(careStateViewOf(decline)).toBeNull();
  });

  it('is null for a sign 082 refuses, so no answer is offered on it', () => {
    expect(careStateViewOf(chronic({ state: 'raised', text: null }, 'sneeze'))).toBeNull();
  });

  it('takes answers when raised or raised again, never when the vet knows', () => {
    expect(careStateTakesAnswers(careStateViewOf(chronic({ state: 'raised', text: null })))).toBe(true);
    expect(careStateTakesAnswers(careStateViewOf(chronic({ state: 'raised_again', text: 'Back because x.' })))).toBe(true);
    expect(careStateTakesAnswers(careStateViewOf(chronic({ state: 'with_vet', text: 'x' })))).toBe(false);
    expect(careStateTakesAnswers(careStateViewOf(chronic({ state: 'recheck_booked', text: 'x' })))).toBe(false);
  });
});

describe('the watched row’s body and the back line', () => {
  const view = (state: string, text: string) =>
    careStateViewOf({ type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit', careState: { state, text } } as never)!;

  it('drops the head sentence the tag already says, in the D6 words and the older ones', () => {
    expect(careStateBody(view('with_vet', "Otis's vomiting, your vet knows. You said Otis's vet started the trial for it. Since Sep 1, 30 days."))).toBe(
      "You said Otis's vet started the trial for it. Since Sep 1, 30 days.",
    );
    expect(careStateBody(view('with_vet', "Otis's vomiting, with your vet. You said on Sep 30 Otis's vet knows."))).toBe(
      "You said on Sep 30 Otis's vet knows.",
    );
  });

  it('keeps the whole sentence when the head is not where it is expected (never a guessed split)', () => {
    expect(careStateBody(view('with_vet', 'You said on Sep 30 his vet knows.'))).toBe('You said on Sep 30 his vet knows.');
  });

  it('reads the back line from its own field, never by splitting the sentence (a pet called "Mr. Biggles")', () => {
    const back = careStateViewOf({
      type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit',
      careState: { state: 'raised_again', text: 'Back because Mr. Biggles has also vomited on 2 days since Sep 3. Lane.', backLine: 'Back because Mr. Biggles has also vomited on 2 days since Sep 3.' },
    } as never)!;
    expect(careBackLine(back)).toBe('Back because Mr. Biggles has also vomited on 2 days since Sep 3.');
    // An older cache without the field: no back line, and nothing guessed out of the text.
    expect(careBackLine(view('raised_again', 'Back because the vomiting is coming more often. Lane.'))).toBeNull();
    expect(careBackLine(view('with_vet', 'Back because x.'))).toBeNull();
  });
});

// ── CUL-2652: a booked visit ──────────────────────────────────────────────────────

describe('CUL-2652 — a booked visit, as the client reads it', () => {
  const v = { on: '2026-11-14', appointmentId: 'a1', passed: false };
  const chron = (careState: unknown) =>
    ({ type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'cough', tier: 'firm', careState }) as unknown as SignalFinding;
  const worse = (careState: unknown) =>
    ({ type: 'symptom_worsening', priorityClass: 'safety', symptomType: 'vomit', tier: 'firm', careState }) as unknown as SignalFinding;

  it('visit_booked quiets a chronicity card only; on a worsening card it is ignored (ruling A)', () => {
    expect(careStateQuietsAsk(chron({ state: 'visit_booked', bookedVisit: v }))).toBe(true);
    expect(careStateQuietsAsk(worse({ state: 'visit_booked', bookedVisit: v }))).toBe(false);
    expect(careStateQuietsAsk({ type: 'symptom_burden', priorityClass: 'safety', careState: { state: 'visit_booked' } } as unknown as SignalFinding)).toBe(false);
  });

  it('reads a booking only when every field is well formed, and never off an insight', () => {
    expect(bookedVisitOf(chron({ state: 'visit_booked', bookedVisit: v }))).toEqual(v);
    for (const bad of [{ ...v, on: '2026-13-01' }, { ...v, on: '2026-02-30' }, { ...v, appointmentId: '' }, { ...v, passed: 'no' }, null, 'x']) {
      expect(bookedVisitOf(chron({ state: 'visit_booked', bookedVisit: bad }))).toBeNull();
    }
    // An escalation carries it beside the finding, never inside a care state.
    expect(bookedVisitOf({ type: 'symptom_burden', priorityClass: 'safety', bookedVisit: v } as unknown as SignalFinding)).toEqual(v);
    expect(bookedVisitOf({ type: 'reflection', priorityClass: 'insight', bookedVisit: v } as unknown as SignalFinding)).toBeNull();
  });

  it('frame 3 B: a "booking" ask over an upcoming visit asks for a call before it; nothing else is re-worded', () => {
    const f = worse({ state: 'raised', bookedVisit: v });
    expect(concernAskOverBooking(f, 'worth booking a vet visit soon')).toBe('worth calling before Nov 14');
    // A softer ask is never made louder, a passed visit has no "before", an escalation is never re-worded.
    expect(concernAskOverBooking(f, 'worth a word with your vet')).toBe('worth a word with your vet');
    expect(concernAskOverBooking(worse({ state: 'raised', bookedVisit: { ...v, passed: true } }), 'worth booking a vet visit soon')).toBe('worth booking a vet visit soon');
    const burden = { type: 'symptom_burden', priorityClass: 'safety', tier: 'soon', bookedVisit: v } as unknown as SignalFinding;
    expect(concernAskOverBooking(burden, 'worth booking a vet visit soon')).toBe('worth booking a vet visit soon');
    expect(concernAskOverBooking(f, null)).toBeNull();
  });

  it('the row line: quiet on the quiet state, a call line only under a call-today ask', () => {
    expect(bookedVisitRowLine(chron({ state: 'visit_booked', bookedVisit: v }), null)).toEqual({ kind: 'quiet', text: 'Visit booked for Nov 14. Worth mentioning the coughing.', howDidItGoFor: null });
    expect(bookedVisitRowLine(chron({ state: 'visit_booked', bookedVisit: { ...v, passed: true } }), null)?.howDidItGoFor).toBe('a1');
    const esc = { type: 'symptom_burden', priorityClass: 'safety', tier: 'today', bookedVisit: v } as unknown as SignalFinding;
    expect(bookedVisitRowLine(esc, 'worth a call to your vet today')?.kind).toBe('call');
    expect(bookedVisitRowLine(esc, 'call your vet now')).toBeNull();
    expect(bookedVisitRowLine(esc, 'worth booking a vet visit soon')).toBeNull();
    expect(bookedVisitRowLine(chron({ state: 'raised' }), 'worth booking a vet visit')).toBeNull();
  });
});
