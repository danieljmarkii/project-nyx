// The emergency door's collapse rule, fed each condition (CUL-871 / N-4a; spec §4.6).
//
// This is the test §4.6 asks for by name: "the collapse is pinned by a test that feeds
// the door a record meeting each condition (D21 and D22 both hold)". It is a pure test
// over a pure resolver — no Modal, no database — which is why `lib/lookEmergency.ts`
// holds no read (`lib/lookEmergencyFacts.ts` does).

import {
  CALL_TODAY_IMPERATIVE,
  allEmergencyStrings,
  resolveEmergencyDoor,
  type EmergencyFacts,
} from './lookEmergency';
import { hasBannedSignalVocabulary } from './signalCopy';

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
    expect(cat.thresholds).toHaveLength(4);
    const dog = resolveEmergencyDoor('dog', QUIET);
    expect(dog.imperative).toBeNull();
    expect(dog.thresholds).toHaveLength(4);
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
