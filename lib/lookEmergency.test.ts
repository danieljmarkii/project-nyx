// The emergency door's collapse rule, fed each condition (CUL-871 / N-4a; spec §4.6).
//
// This is the test §4.6 asks for by name: "the collapse is pinned by a test that feeds
// the door a record meeting each condition (D21 and D22 both hold)". It is a pure test
// over a pure resolver — no Modal, no database — which is why `lib/lookEmergency.ts`
// holds no read (`lib/lookEmergencyFacts.ts` does).

import {
  CALL_NOW_IMPERATIVE,
  CALL_TODAY_IMPERATIVE,
  allEmergencyStrings,
  resolveEmergencyDoor,
  type EmergencyFacts,
} from './lookEmergency';
import { hasBannedSignalVocabulary } from './signalCopy';
import { FLOOR_ROW_TIER, incidentFloor } from './incidentFloor';

/** A loaded, quiet record — every threshold unmet. */
const QUIET: EmergencyFacts = {
  refusedRecently: false,
  vomitCount24h: 0,
  lethargyRecently: false,
};

describe('the collapse — a conditional the record already meets becomes the imperative', () => {
  it('CAT · subdued and not eating: Sam reads the imperative, never "call by tonight"', () => {
    // §4.6's own worked example, and the adversarial pass's gap 3: v0.1 cited the
    // collapse rule INSIDE the clause that broke it.
    const door = resolveEmergencyDoor('cat', {
      ...QUIET,
      refusedRecently: true,
      lethargyRecently: true,
    });
    expect(door.imperative).toBe(CALL_TODAY_IMPERATIVE);
    expect(door.metIds).toContain('subdued_not_eating_24h');
    // The met row is GONE from the thresholds — it did not appear beside the
    // imperative, it BECAME it.
    expect(door.thresholds).not.toContain('Subdued and not eating a full meal in 24 hours');
    expect(door.thresholds.join(' ')).not.toMatch(/if|by tonight/i);
  });

  it('CAT · two refused bowls alone still collapse the "not eating for a day" row', () => {
    const door = resolveEmergencyDoor('cat', { ...QUIET, refusedRecently: true });
    expect(door.metIds).toEqual(['not_eating_a_day']);
    expect(door.imperative).toBe(CALL_TODAY_IMPERATIVE);
  });

  it('CAT · subdued and vomiting', () => {
    const door = resolveEmergencyDoor('cat', {
      ...QUIET,
      lethargyRecently: true,
      vomitCount24h: 1,
    });
    expect(door.metIds).toContain('subdued_vomiting');
  });

  it('DOG · vomiting again within 24 hours needs the SECOND row, not the first', () => {
    expect(resolveEmergencyDoor('dog', { ...QUIET, vomitCount24h: 1 }).metIds).toEqual([]);
    expect(resolveEmergencyDoor('dog', { ...QUIET, vomitCount24h: 2 }).metIds).toEqual([
      'vomiting_again_24h',
    ]);
  });

  it('DOG · subdued and no food for 24 hours', () => {
    const door = resolveEmergencyDoor('dog', {
      ...QUIET,
      lethargyRecently: true,
      refusedRecently: true,
    });
    expect(door.metIds).toContain('subdued_no_food_24h');
  });

  it('a quiet loaded record collapses nothing and keeps every threshold', () => {
    const cat = resolveEmergencyDoor('cat', QUIET);
    expect(cat.imperative).toBeNull();
    // Three call-today rows each since PR-28b moved "Subdued and vomiting" to call now;
    // unmet, it is printed in the call-now list instead.
    expect(cat.thresholds).toHaveLength(3);
    expect(cat.nowImperative).toBeNull();
    expect(cat.now).toContain('Subdued and vomiting');
    const dog = resolveEmergencyDoor('dog', QUIET);
    expect(dog.imperative).toBeNull();
    expect(dog.thresholds).toHaveLength(3);
    expect(dog.nowImperative).toBeNull();
    expect(dog.now).toContain('Subdued and vomiting');
  });

  it('the rows with no leaf behind them NEVER collapse, on any record', () => {
    // `Subdued and hiding` and `Won't drink` read look words, which this door may not
    // (T-5). They are permanent thresholds and the test says so, rather than leaving a
    // reader to wonder whether they are broken.
    const loud: EmergencyFacts = { refusedRecently: true, vomitCount24h: 5, lethargyRecently: true };
    expect(resolveEmergencyDoor('cat', loud).thresholds).toContain('Subdued and hiding');
    expect(resolveEmergencyDoor('dog', loud).thresholds).toContain('Won’t drink');
  });
});

describe('fail closed — an unanswered read never renders the softer half', () => {
  it('shows the imperative and NO thresholds while the facts are unknown', () => {
    for (const species of ['cat', 'dog'] as const) {
      const door = resolveEmergencyDoor(species, null);
      expect(door.imperative).toBe(CALL_TODAY_IMPERATIVE);
      expect(door.thresholds).toEqual([]);
      // The record-independent block is never withheld: those signs do not depend on
      // anything this device has loaded.
      expect(door.now.length).toBeGreaterThan(4);
    }
  });

  it('null is NOT the same as a quiet record', () => {
    expect(resolveEmergencyDoor('cat', null).imperative).not.toBe(
      resolveEmergencyDoor('cat', QUIET).imperative,
    );
  });
});

describe('every string the door can print', () => {
  // The never-reassure screen (`clinical-guardrails` Pattern 8): this page exists for an
  // owner who is not yet worried, and a single "probably fine" anywhere on it would undo
  // the whole surface.
  const REASSURANCE =
    /\b(fine|okay|ok|healthy|well|normal|nothing to worry|no concern|all clear|probably|don’t worry|doing great|picky)\b/i;

  it.each(allEmergencyStrings())('%s — never reassures', (line) => {
    expect(line).not.toMatch(REASSURANCE);
  });

  it.each(allEmergencyStrings())('%s — carries no banned Signal vocabulary', (line) => {
    expect(hasBannedSignalVocabulary(line)).toBe(false);
  });

  it.each(allEmergencyStrings())('%s — no exclamation (nyx-voice)', (line) => {
    expect(line).not.toContain('!');
  });

  it('says the imperative once, and says it plainly', () => {
    expect(CALL_TODAY_IMPERATIVE).toBe('Call your vet today.');
  });
});

// ── The door and the floor say the same thing (Engines v3 PR-28b, CUL-1436; spec §7) ──
// "Subdued and vomiting" is the floor's T3. The door's two facts both sit in the last 24
// hours, so they are never more than 24 hours apart, and the floor reads lethargy within
// 24 hours either side of a vomit. So every record that meets this row meets T3, and this
// drives the REAL floor at the widest separation the door's facts allow.
describe('subdued and vomiting is call now, matched to the floor (T3)', () => {
  const NOW = Date.parse('2026-10-08T12:00:00.000Z');
  const HOUR = 3_600_000;

  it.each(['cat', 'dog'] as const)('%s · the met row collapses to call now, not call today', (species) => {
    const door = resolveEmergencyDoor(species, { ...QUIET, lethargyRecently: true, vomitCount24h: 1 });
    expect(door.nowImperative).toBe(CALL_NOW_IMPERATIVE);
    expect(door.metIds).toContain('subdued_vomiting');
    expect(door.imperative).toBeNull();
    expect(door.now).not.toContain('Subdued and vomiting');
    expect(door.thresholds).not.toContain('Subdued and vomiting');
  });

  it.each(['cat', 'dog', 'other'])('%s · the floor gives the same facts call now through T3', (species) => {
    // Lethargy at the far edge of the door's window, the vomit at the near edge.
    const lethargyAt = new Date(NOW - 24 * HOUR).toISOString();
    const vomitAt = new Date(NOW).toISOString();
    const r = incidentFloor({
      anchor: { at: vomitAt, confidence: 'witnessed' },
      vomits: [{ at: vomitAt, confidence: 'witnessed' }],
      lethargyAt: [lethargyAt],
      species,
      birthDate: '2020-01-01',
    });
    expect(r.rows).toContain('T3');
    expect(r.tier).toBe('call_now');
    expect(FLOOR_ROW_TIER.T3).toBe('call_now');
  });

  it('a failed read prints the row as a call-now sign and never collapses it', () => {
    const door = resolveEmergencyDoor('cat', null);
    expect(door.nowImperative).toBeNull();
    expect(door.now).toContain('Subdued and vomiting');
    expect(door.imperative).toBe(CALL_TODAY_IMPERATIVE);
  });
});
