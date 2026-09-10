// The emergency door's copy, over the predicates the record can already settle
// (CUL-871 / N-4a; docs/nyx-daily-look-requirements.md §3.7, §4.6, T-4).
//
// WHAT THIS IS. A species-keyed page of signs behind one quiet door on the unfolded
// look grid. It is COPY OVER PREDICATES THAT EXIST: it writes nothing, escalates
// nothing, and mints no finding. It is the look's answer to the taxonomy's
// unbuildable §9a — the look does not hold the signs it cannot escalate, so it says
// them plainly instead and gets out of the way.
//
// ── THE ONE RULE THAT MAKES IT MORE THAN A LEAFLET (Dr. Chen, §4.6) ──────────
// A CONDITIONAL WHOSE CONDITION THE RECORD ALREADY MEETS COLLAPSES TO THE
// IMPERATIVE. Sam, with two refused bowls in the record, opens this door and reads
// "Call your vet today." — never "call if she hasn't eaten by tonight". v0.1 of the
// spec cited that rule *inside the clause that broke it* (the adversarial pass, gap
// 3), which is why the collapse lives in code with a test per condition rather than
// in a sentence somebody has to remember.
//
// ── FAIL CLOSED MEANS SHOW THE IMPERATIVE, NOT THE THRESHOLD ─────────────────
// `facts: null` is "this read did not answer", and the two error directions
// are not symmetric. Printing a threshold to an owner whose record already meets it
// is the delay §4.6 exists to prevent; printing "Call your vet today." to an owner
// whose cat is fine costs a phone call. n=1 never reassures: an absence of KNOWN
// facts is not evidence of a well animal, and a conditional is the reassuring-shaped
// half of this pair ("you can wait until tonight"). So an unanswered read renders the
// imperative alone — and no thresholds beside it, because we cannot say which of them
// are unmet either.
//
// A READ THAT IS STILL IN FLIGHT IS NOT THAT STATE, and conflating the two was this
// module's first shipped defect (found by the product read). The sheet used to open with
// `facts: null` and load afterwards, so EVERY owner saw **"Call your vet today."** for a
// frame before it was replaced by four conditionals. Fail-closed is right for a read
// that failed; applied to a read that is merely waiting it makes a safety imperative
// flicker, and an imperative the app takes back is one an owner learns to disbelieve.
// So the caller distinguishes the two (`EmergencyRead` below): waiting renders neither
// half, and only a failure falls through to the imperative.
//
// ── WHAT THE DOOR MAY READ, AND WHAT IT MAY NOT ─────────────────────────────
// It reads LEAF ROWS: a `lethargy` event, a `vomit` event, a meal the owner rated
// `refused` (or the trial card's own not-eating register, `isAnimalNotEating` — one
// predicate for intake, §4.5). It does NOT read look words, and that is the ruling
// rather than an oversight: a look enters no engine, count, floor or coverage line
// (T-5, floor 5), and this door is a read of the RECORD. So an owner who has just
// tapped *Off* — and not logged lethargy — opens a door that does not know it. The
// residual is CUL-845’s and CUL-889’s, never a bridge built quietly here.
//
// It also never infers a refusal from SILENCE. "No meal logged in 24 hours" is a
// fact about logging, not about eating (the intake anti-pattern), and a door that
// escalated on it would fire on every owner who had a busy Tuesday.

import type { LookSpecies } from '../constants/lookWords';

/** The sheet's title (§3.1a) and the door's own label (§3.7 — labelled for the
 *  ambiguous morning, not the alarmed one: the owner it exists for is the one who
 *  is not yet worried). Exported so the card and the sheet cannot drift. */
export const EMERGENCY_SHEET_TITLE = 'When to call the vet';
export const EMERGENCY_DOOR_LABEL = 'Signs that mean call today ›';

/** The imperative a met condition collapses to. One string, one place. */
export const CALL_TODAY_IMPERATIVE = 'Call your vet today.';

export const CALL_NOW_HEADER = 'Call your vet now';
export const CALL_TODAY_HEADER = 'Call today';

/**
 * What the record says right now, reduced to the three facts the thresholds turn on.
 * `null` (rather than all-false) is how a caller says "not answered yet" — see the
 * fail-closed note above; all-false is a real, loaded, quiet record.
 */
export interface EmergencyFacts {
  /** A refusal IS IN THE RECORD (a meal rated `refused`, or the trial card's
   *  not-eating register). Never derived from an absence of meals. */
  refusedRecently: boolean;
  /** `vomit` leaf rows in the last 24 hours. */
  vomitCount24h: number;
  /** A `lethargy` leaf row in the last 24 hours. The LEAF — never the look's
   *  `subdued` word (T-5). */
  lethargyRecently: boolean;
}

interface TodayRow {
  /** Stable id, so the test can name the row it is feeding. */
  id: string;
  /** The conditional form, shown while the record does not meet it. */
  threshold: string;
  /** Does the record meet it? A row with no leaf behind it answers `false` for
   *  every record and says so in its comment — an honest permanent threshold beats
   *  a predicate that pretends to read something. */
  met: (f: EmergencyFacts) => boolean;
}

// ── Call your vet now — the signs that are never an impression (§4.6) ─────────
// Record-independent by construction: none of these is a thing the app could hold a
// row for, which is exactly why they are printed rather than offered as chips (T-4,
// §4.1 rule 9). Verbatim from the spec, sentence-cased for the list.
const CALL_NOW: Record<LookSpecies, readonly string[]> = {
  cat: [
    'Breathing fast or open-mouthed while resting',
    'Straining or crying in the tray with little or nothing coming, going in and out of the tray (especially a male cat)',
    'Can’t stand or walk, collapsed, wobbling',
    'A fit or seizure',
    'Pale, white or blue gums',
  ],
  dog: [
    'Breathing hard or struggling for breath, or panting while lying still and cool',
    'Retching without bringing anything up, a swollen or tight belly (especially a deep-chested dog)',
    'Can’t stand or walk, collapsed',
    'A fit or seizure',
    'Pale, white or blue gums',
    'Straining and crying to pee with nothing coming',
  ],
};

// ── Call today — the triage-desk thresholds, each with its collapse (§4.6) ────
const CALL_TODAY: Record<LookSpecies, readonly TodayRow[]> = {
  cat: [
    {
      id: 'subdued_not_eating_24h',
      threshold: 'Subdued and not eating a full meal in 24 hours',
      met: (f) => f.lethargyRecently && f.refusedRecently,
    },
    {
      id: 'subdued_vomiting',
      threshold: 'Subdued and vomiting',
      met: (f) => f.lethargyRecently && f.vomitCount24h >= 1,
    },
    {
      // No leaf: hiding is a look word, and a look never feeds this door (T-5). It
      // stays a threshold for every record, which is the honest state — not a
      // predicate quietly wired to the one source this door may not read.
      id: 'subdued_hiding',
      threshold: 'Subdued and hiding',
      met: () => false,
    },
    {
      id: 'not_eating_a_day',
      threshold: 'Not eating for a day',
      met: (f) => f.refusedRecently,
    },
  ],
  dog: [
    {
      id: 'subdued_no_food_24h',
      threshold: 'Subdued and no food for 24 hours',
      met: (f) => f.lethargyRecently && f.refusedRecently,
    },
    {
      id: 'subdued_vomiting',
      threshold: 'Subdued and vomiting',
      met: (f) => f.lethargyRecently && f.vomitCount24h >= 1,
    },
    {
      id: 'vomiting_again_24h',
      threshold: 'Vomiting again within 24 hours',
      met: (f) => f.vomitCount24h >= 2,
    },
    {
      // No leaf for drinking in the taxonomy (`drinking_less` is a look word, which
      // this door may not read). A permanent threshold, said plainly.
      id: 'wont_drink',
      threshold: 'Won’t drink',
      met: () => false,
    },
  ],
};

/** The three states a caller can be in about the record, kept apart on purpose (see the
 *  fail-closed note): still asking, answered, or asked and failed. */
export type EmergencyRead =
  | { status: 'loading' }
  | { status: 'ready'; facts: EmergencyFacts }
  | { status: 'failed' };

export interface EmergencyDoorModel {
  /** The always-printed block. */
  now: readonly string[];
  /** `CALL_TODAY_IMPERATIVE` when the record meets at least one threshold — or when
   *  the facts have not answered (fail closed). Null on a loaded record that meets
   *  none, where the thresholds speak for themselves. */
  imperative: string | null;
  /** The rows still worth stating as conditionals: the unmet ones on a loaded
   *  record, and NONE at all while the facts are unknown. A met row is not listed
   *  beside the imperative — it has BECOME the imperative, which is the collapse. */
  thresholds: readonly string[];
  /** Which rows collapsed, for the test and for nothing else. Never rendered: naming
   *  the met condition would turn the door into a finding about the pet, and this
   *  surface escalates nothing (§4.6). */
  metIds: readonly string[];
}

/**
 * The door, resolved for one species against what the record can settle.
 *
 * Total and synchronous — the sheet renders straight off it, so there is no state in
 * which some of the page is live and some of it is waiting.
 */
export function resolveEmergencyDoor(
  species: LookSpecies,
  facts: EmergencyFacts | null,
): EmergencyDoorModel {
  const now = CALL_NOW[species];
  const rows = CALL_TODAY[species];
  if (facts === null) {
    return { now, imperative: CALL_TODAY_IMPERATIVE, thresholds: [], metIds: [] };
  }
  const met = rows.filter((r) => r.met(facts));
  return {
    now,
    imperative: met.length > 0 ? CALL_TODAY_IMPERATIVE : null,
    thresholds: rows.filter((r) => !met.includes(r)).map((r) => r.threshold),
    metIds: met.map((r) => r.id),
  };
}

/** Every string this module can put on screen, for the guardrail screens to sweep.
 *  Derived from the same tables the door renders from, so a row added without a
 *  voice/guardrail pass fails the test rather than shipping unread. */
export function allEmergencyStrings(): string[] {
  const out: string[] = [
    EMERGENCY_SHEET_TITLE,
    EMERGENCY_DOOR_LABEL,
    CALL_TODAY_IMPERATIVE,
    CALL_NOW_HEADER,
    CALL_TODAY_HEADER,
  ];
  for (const species of ['cat', 'dog'] as const) {
    out.push(...CALL_NOW[species]);
    out.push(...CALL_TODAY[species].map((r) => r.threshold));
  }
  return out;
}
