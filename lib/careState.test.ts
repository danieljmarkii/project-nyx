import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARE_SIGNS,
  careBackLine,
  careStateBody,
  careStateQuietsAsk,
  careStateTakesAnswers,
  careStateValueOf,
  careStateViewOf,
} from './careState';
import type { SignalFinding } from './signal';
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

  it('reads the back line off a raised-again sentence only', () => {
    expect(careBackLine(view('raised_again', 'Back because the vomiting is coming more often. Vomiting in 6 of the last 6 weeks.'))).toBe(
      'Back because the vomiting is coming more often.',
    );
    expect(careBackLine(view('with_vet', 'Back because x.'))).toBeNull();
  });
});
