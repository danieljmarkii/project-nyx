// The emergency door's read (CUL-871 / N-4a; spec §4.6).
//
// The module is small and the reason it is tested is entirely about its BOUNDARIES: what
// window it asks for, what it refuses to derive, and what a failed read returns. All
// three are decisions rather than mechanics, and all three were wrong in the first cut.

const mockGetAll = jest.fn();
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: (...a: unknown[]) => mockGetAll(...a) }) }));

import { EMERGENCY_WINDOW_MS, loadEmergencyFacts, withIntakeRefusal } from './lookEmergencyFacts';

const NOW = Date.parse('2026-09-10T18:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
});

describe('the window', () => {
  it('asks for 24 hours, not "today"', async () => {
    // Every threshold in §4.6 is written in hours. A local-midnight window holds nine of
    // them at 9 AM, so a dog that vomited at 10 PM and again at 8 AM would meet
    // "vomiting again within 24 hours" with only one of the two rows in view — the
    // direction §4.6 exists to prevent.
    await loadEmergencyFacts('p1', NOW);
    const [, params] = mockGetAll.mock.calls[0] as [string, [string, string]];
    expect(EMERGENCY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(params[0]).toBe('p1');
    expect(Date.parse(params[1])).toBe(NOW - EMERGENCY_WINDOW_MS);
  });

  it('drops soft-deleted rows, and scopes to the pet', async () => {
    await loadEmergencyFacts('p1', NOW);
    const [sql] = mockGetAll.mock.calls[0] as [string];
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('pet_id = ?');
  });
});

describe('what it counts', () => {
  it('counts vomit rows and notices a lethargy row', async () => {
    mockGetAll.mockResolvedValue([
      { event_type: 'vomit' },
      { event_type: 'vomit' },
      { event_type: 'lethargy' },
      { event_type: 'meal' },
    ]);
    expect(await loadEmergencyFacts('p1', NOW)).toEqual({
      refusedRecently: false,
      vomitCount24h: 2,
      lethargyRecently: true,
    });
  });

  it('DERIVES NO INTAKE FACT of its own — the query does not even read meals', async () => {
    // The first cut read `meals.intake_rating === 'refused'` here and broke four ways:
    // it missed `picked` and `some` (the delay direction), fired on ONE refused bowl
    // followed by a full dinner, fired on a refused pill-pocket TREAT, and inverted past
    // 24 hours. Reading the same COLUMN as the shipped detectors is not the same
    // PREDICATE as theirs (`qualifyingIntakeMeals`), and a second intake predicate on a
    // safety page is how an owner learns to disbelieve it. The record-local arm is
    // N-4b's, on the exported qualifying-set helper with its own gate (T-20, E-5).
    mockGetAll.mockResolvedValue([{ event_type: 'meal' }]);
    const facts = await loadEmergencyFacts('p1', NOW);
    const sql = mockGetAll.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/intake_rating|JOIN meals/i);
    expect(facts?.refusedRecently).toBe(false);
  });

  it('never infers anything from an empty record', async () => {
    // Silence is a fact about logging, not about eating (the intake anti-pattern).
    expect(await loadEmergencyFacts('p1', NOW)).toEqual({
      refusedRecently: false,
      vomitCount24h: 0,
      lethargyRecently: false,
    });
  });
});

describe('a failed read', () => {
  it('returns null — NOT a zeroed record', async () => {
    mockGetAll.mockRejectedValue(new Error('database is locked'));
    // All-false is a real, loaded, quiet record and the door reads it as one. A failure
    // is not that, and the door fails closed on it (`resolveEmergencyDoor(species, null)`).
    expect(await loadEmergencyFacts('p1', NOW)).toBeNull();
  });
});

describe('withIntakeRefusal — the OR that is never an AND', () => {
  const QUIET = { refusedRecently: false, vomitCount24h: 0, lethargyRecently: false };

  it('raises the intake fact when the trial register has one', () => {
    expect(withIntakeRefusal(QUIET, true)).toEqual({ ...QUIET, refusedRecently: true });
  });

  it('leaves a quiet record quiet when the register is silent', () => {
    expect(withIntakeRefusal(QUIET, false)).toEqual(QUIET);
  });

  it('never turns an unanswered read into an answered one', () => {
    // The fail-closed state has to survive the merge, in both directions: a trial fact
    // does not make the rest of the record known, and its absence does not make a failed
    // read succeed.
    expect(withIntakeRefusal(null, true)).toBeNull();
    expect(withIntakeRefusal(null, false)).toBeNull();
  });

  it('cannot CANCEL a refusal the read already found', () => {
    // OR, never AND — neither register may stand the other down (the R1 asymmetry).
    const refusing = { ...QUIET, refusedRecently: true };
    expect(withIntakeRefusal(refusing, false)).toEqual(refusing);
  });
});

// ── The fourth consumer, wired (CUL-873) ─────────────────────────────────────
//
// The adversarial pass checked the claim rather than believing it and found nothing
// outside `lib/lookWithheld.ts` importing `intakeArm`, so the card and the door could
// disagree about whether the same animal was eating. These pin the OR.
describe('withIntakeRefusal — two registers, one OR', () => {
  const QUIET = { refusedRecently: false, vomitCount24h: 0, lethargyRecently: false };

  it('the trial register alone still fires it', () => {
    expect(withIntakeRefusal(QUIET, true)?.refusedRecently).toBe(true);
  });

  it('the RECORD-LOCAL arm alone fires it — the non-trial cat the gap was measured on', () => {
    // Two refused bowls today, no trial. Before this wiring her card withheld its words
    // while this door printed *Not eating for a day* as an UNMET conditional.
    expect(withIntakeRefusal(QUIET, false, true)?.refusedRecently).toBe(true);
  });

  it('neither register firing leaves the fact alone', () => {
    expect(withIntakeRefusal(QUIET, false, false)?.refusedRecently).toBe(false);
  });

  it('an omitted arm is NO EVIDENCE, never a refusal — ignorance must not escalate', () => {
    expect(withIntakeRefusal(QUIET, false)?.refusedRecently).toBe(false);
  });

  it('neither register can cancel the other', () => {
    expect(withIntakeRefusal(QUIET, true, false)?.refusedRecently).toBe(true);
    expect(withIntakeRefusal(QUIET, false, true)?.refusedRecently).toBe(true);
  });

  it('a failed facts read stays null through both registers', () => {
    expect(withIntakeRefusal(null, true, true)).toBeNull();
  });
});
