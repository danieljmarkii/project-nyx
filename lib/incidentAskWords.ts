// The reason-keyed ask words (Clinical voice row 2, CUL-2667; CUL-2654 D1 ruled (a);
// docs/clinical-voice-inventory-2026-11.md §R; docs/nyx-incident-tiers-requirements.md §2 rule 6;
// clinical-guardrails "THE WORDS ARE KEYED BY REASON" and Pattern 11).
//
// A tier cannot tell a blood photo from a dog that vomited twice, so the words are picked here,
// from the reason. Two registers:
//   FLOOR        direct words: "Call your vet today. If they're closed, call an emergency clinic."
//                Blood in vomit or stool, suspected foreign material, a cat with no meal rated Most
//                or All in 24 h, any read tiered `call_now` (which keeps its own "now" words), and
//                ANY REASON THIS BUILD DOES NOT KNOW.
//   DEFERENTIAL  a nudge that keeps the clock and the service: "Worth a call today …" (Pattern 11:
//                soften the verb, keep the clock, keep the reason; never a condition on the
//                owner's sense of normal, never "can wait").
//
// THE RULES, IN ORDER (each one fails toward the floor):
//   1. Any floor reason present wins, whatever else is on the row. Never key on a single
//      "main" reason: blood plus repeat vomiting is floor.
//   2. A reason the build does not know is floor. So is a reasons field the caller never
//      supplied (`undefined`): a surface that cannot see why the read called does not get to
//      guess the quiet answer. Only a supplied, fully known, floor-free set is deferential.
//   3. `visual_flags` count until the OWNER changed that sign's own column to none (`none_visible`,
//      `no`), as the caller's `ownerEdited` diff shows: an edit is the owner's account of the
//      field they changed, never of the row, and a negative the model wrote is not the owner's.
//      A rescue write carries the flag and no structured column. Louder than the spec's "on a
//      row the owner never edited", on purpose (adversarial passes 1 and 2).
//   4. The live cat check (`catNoGoodMeal24h`) can ADD the floor and never remove it.
//   5. A floor flag on an earlier-rule or unknown tier gets the floor words too (CUL-2675 (a)):
//      the floor is set by the sign, not by when the read was written.
//
// IMPORT-FREE on purpose, so the Edge Functions can import it with a `.ts` path (row 3) the way
// they import `lib/incidentVerdict.ts`. No literal floor ask lives outside this file
// (`guards/incidentAskWords.test.ts`); the one exemption is `lib/incidentTierWords.ts`, whose
// call-today row the server still reads until row 3 moves the server copy.

export type AskLevel = 'floor' | 'deferential';

// ── The words ────────────────────────────────────────────────────────────────

/** The floor's words, verbatim from today's call-today row (unchanged by the ruling). */
export const FLOOR_ASK = {
  verb: 'Call your vet',
  label: 'Call your vet today',
  short: 'Call today',
  action: "Call your vet today. If they're closed, call an emergency clinic.",
  /** The imperative a met door row collapses to. */
  imperative: 'Call your vet today.',
  /** The Signal door's label once the record meets a floor sign. */
  door: 'Call your vet today ›',
  /** The ask spoken mid-sentence. */
  inline: 'call your vet today',
  /** The Signal strip's verb (≤ STRIP_ASK_LINE_MAX). */
  strip: 'Call your vet',
} as const;

/** The deferential words (tiers spec §2's second call-today row; signal-home spec's strip row). */
export const DEFERENTIAL_ASK = {
  /** The nudge's verb alone, for a line that names its own clock ("… first thing tomorrow"). */
  verb: 'Worth a call',
  label: 'Worth a call today',
  short: 'Worth a call today',
  action:
    'This is the kind of thing vets like to hear about the same day. If yours is closed, an emergency clinic can talk it through.',
  imperative: 'Worth a call today.',
  door: 'Worth a call today ›',
  inline: 'worth a call to your vet today',
  strip: 'Worth a call today',
} as const;

export type AskWords = { readonly [K in keyof typeof FLOOR_ASK]: string };

export function askWordsFor(level: AskLevel): AskWords {
  return level === 'floor' ? FLOOR_ASK : DEFERENTIAL_ASK;
}

/** The two softer strip verbs (signal-home spec, Dr. Chen signed; CUL-2666). */
export const WORD_STRIP_ASKS = {
  /** was `Tell your vet` */
  tell: 'Worth telling a vet',
  /** was `Check with your vet` */
  check: 'Worth asking a vet',
} as const;

// ── The reasons ──────────────────────────────────────────────────────────────

/** The contextual flags the build knows that are NOT floor. Anything else is floor. */
const KNOWN_DEFERENTIAL_CONTEXTUAL: readonly string[] = [
  // analyze-vomit
  'repeated_vomiting',
  'concurrent_lethargy',
  // analyze-stool
  'repeated_loose_stool',
  'concurrent_vomiting',
];
/** The floor's contextual flag: a cat whose meals say it has not eaten (EN-5 / D3's arm). */
const FLOOR_CONTEXTUAL: readonly string[] = ['feline_reduced_intake'];
/** The vision model's flags (both descriptors share the set). Both are floor signs. */
const FLOOR_VISUAL: readonly string[] = ['blood', 'suspected_foreign_material'];

export type FloorReason = 'call_now' | 'blood' | 'foreign_material' | 'cat_intake' | 'unknown';

/** The columns this module reads. Text throughout: a server may hold values this build has never
 *  seen, and they must fail toward the floor, never throw. */
export interface AskReasonRow {
  tier?: string | null;
  /** The server's `text[]`, or the phone's JSON text of it. `undefined` = not supplied (floor). */
  contextual_flags?: unknown;
  /** The photo's own flags. `undefined` = not supplied (floor). */
  visual_flags?: unknown;
  blood_present?: string | null;
  stool_blood_present?: string | null;
  foreign_material_present?: string | null;
}

export interface AskOptions {
  /** The live D3 predicate, for a cat, at the moment of showing: an owner who rates meals has
   *  rated none Most or All in the last 24 h. Can only add the floor. */
  catNoGoodMeal24h?: boolean;
  /** The structured columns the OWNER changed from the model's read (the record's diff against
   *  `ai_raw_payload`, e.g. `deriveEditedFields`). A photo flag is silenced only when the owner
   *  changed that sign's own column to none. Absent, every photo flag stands. */
  ownerEdited?: readonly string[];
}

/** A text[] column as an array of strings, or null when it is absent or cannot be read. */
function textArray(value: unknown): readonly unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The first floor reason on the row, or null when the row's reasons are supplied, fully known and
 * floor-free. Rule order only picks which reason to NAME: any one of them makes the row floor.
 */
export function floorReasonOf(row: AskReasonRow | null | undefined, opts: AskOptions = {}): FloorReason | null {
  if (!row) return 'unknown';
  if (row.tier === 'call_now') return 'call_now';
  if (row.blood_present === 'fresh_red' || row.blood_present === 'coffee_ground') return 'blood';
  if (row.stool_blood_present === 'yes') return 'blood';
  if (row.foreign_material_present === 'yes') return 'foreign_material';

  // Rule 3: the photo's flags speak until the OWNER changed THAT sign's own column to none. A
  // negative the model wrote itself is not the owner's word, and an edit to another field (the
  // colour) silences nothing (adversarial passes 1 and 2 on CUL-2667). The caller says which
  // columns the owner changed (`ownerEdited`, the record's own diff against the model's payload);
  // with no list, no flag is silenced.
  const ownerSaid = new Set(opts.ownerEdited ?? []);
  const ownerSaidNoBlood =
    (ownerSaid.has('blood_present') && row.blood_present === 'none_visible') ||
    (ownerSaid.has('stool_blood_present') && row.stool_blood_present === 'no');
  const ownerSaidNoForeign = ownerSaid.has('foreign_material_present') && row.foreign_material_present === 'no';
  const visual = textArray(row.visual_flags);
  if (visual === null) return 'unknown';
  for (const f of visual) {
    if (f === 'blood') {
      if (ownerSaidNoBlood) continue;
      return 'blood';
    }
    if (f === 'suspected_foreign_material') {
      if (ownerSaidNoForeign) continue;
      return 'foreign_material';
    }
    return 'unknown';
  }

  const contextual = textArray(row.contextual_flags);
  if (contextual === null) return 'unknown';
  if (contextual.some((f) => typeof f === 'string' && FLOOR_CONTEXTUAL.includes(f))) return 'cat_intake';
  if (opts.catNoGoodMeal24h === true) return 'cat_intake';
  if (contextual.some((f) => typeof f !== 'string' || !KNOWN_DEFERENTIAL_CONTEXTUAL.includes(f))) return 'unknown';
  return null;
}

/** Floor or deferential, for a row that stands as a call. */
export function askLevelOf(row: AskReasonRow | null | undefined, opts: AskOptions = {}): AskLevel {
  return floorReasonOf(row, opts) === null ? 'deferential' : 'floor';
}

/**
 * Whether the row carries a floor SIGN (blood, foreign material, the cat flag, an unknown flag),
 * as opposed to merely lacking the facts to be deferential. Used where a row keeps its shipped
 * words unless a floor sign raises them (an earlier-rule "Worth a call", CUL-2675 (a)): there an
 * unsupplied field must not turn every old read into a floor call, because "Worth a call" is
 * already the escalation and the earlier rule never knew the reason.
 */
export function hasFloorSign(row: AskReasonRow | null | undefined, opts: AskOptions = {}): boolean {
  if (!row) return false;
  // Named fields, never a spread: a reader that copies the row reads every column it holds.
  const reason = floorReasonOf(
    {
      tier: null,
      blood_present: row.blood_present,
      stool_blood_present: row.stool_blood_present,
      foreign_material_present: row.foreign_material_present,
      // An absent field is "no sign seen", here only: the shipped words already escalate.
      contextual_flags: row.contextual_flags === undefined ? [] : row.contextual_flags,
      visual_flags: row.visual_flags === undefined ? [] : row.visual_flags,
    },
    opts,
  );
  return reason !== null;
}

/** Every owner-facing string this module can return, for the copy screens to sweep. */
export function allAskStrings(): string[] {
  return [...Object.values(FLOOR_ASK), ...Object.values(DEFERENTIAL_ASK), ...Object.values(WORD_STRIP_ASKS)];
}

/** Exposed for the guard: the known sets, so a new flag added server-side reds a test. */
export const KNOWN_ASK_FLAGS = {
  deferentialContextual: KNOWN_DEFERENTIAL_CONTEXTUAL,
  floorContextual: FLOOR_CONTEXTUAL,
  floorVisual: FLOOR_VISUAL,
} as const;
