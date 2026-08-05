// The trial-protein picker's PURE support layer — B-704 PR 3 (§7.1/§7.2, mock
// frames B/C/D). One home for the picker's state model, its option lists, its
// selection→storage resolution, and every §8 string, so the setup sheet
// (`StartTrialModal`) and the mid-trial allowed-set screen (PR 4) render the same
// picker from the same source of truth rather than two drifting copies.
//
// DEPENDENCY-FREE OF THE DB / UI — pure logic + copy only, so it is exercised in
// plain jest and imported by whichever component mounts the picker. The keying it
// leans on is the shared one: `canonicalizeProtein` (Class-A, TG-4) and
// `trialTargetProtein`'s COMMON_PROTEINS set, never a second protein vocabulary.
//
// THE ONE INVARIANT THIS FILE CARRIES (TG-1, restated for the write path it feeds):
// the value produced by `trialProteinToStore` only ever NAMES a trial's protein —
// it is never a permit. The food list (`diet_trial_foods`) stays the sole off-diet
// authority (diet-trial §5.5 D-A); nothing here can make a contaminant allowed.
import { COMMON_PROTEINS, canonicalizeProtein } from './protein';
import { proteinSourceBase } from './proteinRelation';

// ── The selection model ──────────────────────────────────────────────────────
//
// Four kinds, and the split between them is the whole of §5's "no single protein
// stores null" ruling made legible in the UI:
//
//   • derived      — the owner never opened the picker; the app's read of the
//                    picked foods stands. STORES NULL, so the read re-derives and
//                    the record honestly labels it "from the trial diet" (§7.4).
//                    The GOLDEN PATH: a glance, not a decision (mock frame B).
//   • protein      — the owner actively picked a protein (a derived option or a
//                    common one). STORES that canonical key → "owner-confirmed".
//   • hydrolyzed   — "No single protein (hydrolyzed / special diet)". STORES NULL
//                    (§5), because for a hydrolysed patient the food list IS the
//                    trial; the picker copy carries the inapplicable-vs-unset
//                    distinction that the null column deliberately does not.
//   • unset        — "Not sure — leave it unset". STORES NULL.
//
// `hydrolyzed` and `unset` are indistinguishable downstream by design (§5: both
// mean "no owner naming"); they differ only in what the owner SEES at selection
// time, which is a real product distinction and a null-column non-distinction at
// once. See `KNOWN RESIDUAL` on `effectiveTrialProteinKey`.
export type TrialProteinChoice =
  | { kind: 'derived' }
  | { kind: 'protein'; key: string }
  | { kind: 'hydrolyzed' }
  | { kind: 'unset' };

/** The picker opens here on a fresh trial: nothing chosen, derivation stands. */
export const INITIAL_TRIAL_PROTEIN_CHOICE: TrialProteinChoice = { kind: 'derived' };

/**
 * The canonical key to WRITE to `diet_trials.target_protein` for a choice (TG-4,
 * §5). Only an explicit `protein` pick stores a value; `derived`, `hydrolyzed` and
 * `unset` all store null — the three states §5 collapses onto one null column.
 *
 * Canonicalized here even though every offered key is already canonical, so the
 * "canonical key only" invariant holds by construction regardless of how the
 * picker's option set evolves — a raw label can never reach the column.
 */
export function trialProteinToStore(choice: TrialProteinChoice): string | null {
  return choice.kind === 'protein' ? canonicalizeProtein(choice.key) : null;
}

/**
 * The target key the setup ROW displays and the day-0 mismatch check reads — which
 * is NOT the same as the stored value, and the difference is deliberate:
 *
 *   • `derived`  resolves to the derivation (`derivedKey`), so the row shows
 *     "Rabbit" and the mismatch can fire — even though it stores null.
 *   • `protein`  resolves to the owner's key.
 *   • `hydrolyzed` / `unset` resolve to null — no target is NAMED, so the mismatch
 *     goes silent (TG-2: silence, never an all-clear).
 *
 * KNOWN RESIDUAL (§5, ratified). Because `hydrolyzed`/`unset` store null, a DOWNSTREAM
 * read (`trialTargetProtein`) re-derives from the foods and may name a protein the
 * owner explicitly declined here — but only on a trial whose foods derive a clean
 * protein, i.e. contradictory input (picking "no single protein" on a rabbit-
 * deriving diet). §5 accepts this: the distinction "matters nowhere downstream",
 * both states store null, and a genuinely hydrolysed diet derives empty. The MODAL
 * itself never shows that contradiction — it reads this function, not the stored
 * null — so the owner's choice is honoured everywhere they can see it at setup.
 */
export function effectiveTrialProteinKey(
  choice: TrialProteinChoice,
  derivedKey: string | null,
): string | null {
  switch (choice.kind) {
    case 'protein':
      return canonicalizeProtein(choice.key);
    case 'derived':
      return derivedKey;
    case 'hydrolyzed':
    case 'unset':
      return null;
  }
}

// ── The option lists (mock frame C) ──────────────────────────────────────────

/** One selectable protein row: a canonical key, its display label, and an optional
 *  provenance sub-label (the derived group carries these; common proteins do not). */
export interface TrialProteinOption {
  key: string;
  label: string;
  subLabel?: string;
}

/** A primary trial food as the derived-options builder reads it. */
export interface DerivedProteinFood {
  foodLabel: string;
  primaryProtein: string | null;
}

/** "rabbit" → "Rabbit". The picker's single display transform, matching the B-332
 *  ProteinPicker / ProteinSetPicker convention (Title-case the canonical key). */
export function titleProtein(key: string): string {
  return key.length ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

/**
 * The "From {pet}'s trial diet" group: the distinct canonical primary proteins of
 * the picked primary foods, in first-seen prominence order, each with a provenance
 * sub-label naming WHERE it came from (mock frame C: "Listed on both trial foods";
 * frame D row: "From Instinct LID Rabbit").
 *
 * For SOURCE-BEARING primaries the FIRST option's key is exactly
 * `trialTargetProtein({target_protein:null}, foods).protein` — both walk the same
 * canonicalized primaries in the same order and take the first non-null — so the
 * picker's default selection and the row's derived prefill agree. They diverge by
 * design only on a source-less process word ('hydrolyzed protein'), which this drops
 * (it is not a nameable protein) while `trialTargetProtein`'s derived arm still
 * returns it (kept plain-`canonicalizeProtein` for report behavior-neutrality until
 * B-705); the setup row applies the SAME source gate before display, so the row, the
 * picker and the mismatch all treat that value as "nothing derived" (mock frame E).
 * Locked by a test.
 */
export function buildDerivedProteinOptions(foods: readonly DerivedProteinFood[]): TrialProteinOption[] {
  const total = foods.length;
  // Group foods by their canonical primary protein, preserving first-seen order.
  const order: string[] = [];
  const labelsByKey = new Map<string, string[]>();
  for (const f of foods) {
    const key = canonicalizeProtein(f.primaryProtein);
    // Skip a source-less process word ('hydrolyzed protein'): it names no antigen,
    // so it is not a selectable trial protein — the "No single protein (hydrolyzed)"
    // escape hatch is the answer for that diet, not a derived option that would behave
    // oppositely (store a value + fire the mismatch). Mirrors the mismatch predicate's
    // and the setup row's source gate, so all three agree on what "derives".
    if (key == null || proteinSourceBase(key) == null) continue;
    if (!labelsByKey.has(key)) {
      labelsByKey.set(key, []);
      order.push(key);
    }
    labelsByKey.get(key)!.push(f.foodLabel);
  }

  return order.map((key) => {
    const labels = labelsByKey.get(key)!;
    const count = labels.length;
    let subLabel: string;
    if (count === total && total >= 2) {
      subLabel = total === 2 ? 'Listed on both trial foods' : 'Listed on all trial foods';
    } else if (count === 1) {
      subLabel = `From ${labels[0]}`;
    } else {
      subLabel = `Listed on ${count} trial foods`;
    }
    return { key, label: titleProtein(key), subLabel };
  });
}

/** The "Other proteins" group: the common canonical set MINUS anything already
 *  offered in the derived group (mock frame C shows rabbit only in the derived
 *  group, never repeated below). Single source of truth: `COMMON_PROTEINS`. */
export function commonProteinOptions(derivedKeys: readonly string[]): TrialProteinOption[] {
  const derived = new Set(derivedKeys);
  return COMMON_PROTEINS.filter((p) => !derived.has(p)).map((p) => ({ key: p, label: titleProtein(p) }));
}

// ── Copy (§8 draft — passed through nyx-voice in this PR) ─────────────────────
//
// LOCKED here rather than in the component so it is greppable, testable, and shared
// by both mounting screens. Every string is owner-facing (Jordan / Sam) and says
// "Culprit" (B-274 shipped). Never: "wrong food", "mistake", a per-feeding
// rendering of the mismatch, or any all-clear derived from an absent protein.

/** The row label under the trial-diet block (mock frames B/D). */
export const TRIAL_PROTEIN_ROW_LABEL = 'Trial protein';

/** Row sub-line when the value is DERIVED (untouched prefill) — mock frame B. */
export const TRIAL_PROTEIN_SUBLINE_DERIVED = 'From the foods you picked — tap to change';

/** Row sub-line when nothing derives (E1 empty state, TP-1) — mock frame B/E. The
 *  row still renders; this is a set-prompt, never a bare "Not set", because the
 *  picker's own first-class options carry the inapplicable-vs-incomplete meaning. */
export const TRIAL_PROTEIN_SUBLINE_EMPTY = "Tap to name this trial's protein";

/** Row sub-line once the owner has made any explicit choice (a protein, or one of
 *  the two escape hatches) — the value carries the meaning, the sub-line just keeps
 *  the affordance visible. */
export const TRIAL_PROTEIN_SUBLINE_CHOSEN = 'Tap to change';

/** The row VALUE shown for the "No single protein (hydrolyzed)" choice. */
export const TRIAL_PROTEIN_VALUE_HYDROLYZED = 'No single protein';
/** The row VALUE shown when unset (nothing derived and untouched, or "Not sure"). */
export const TRIAL_PROTEIN_VALUE_UNSET = 'Not set';

/** The picker intro — the §5.5 loophole guard spoken in owner language (mock C). */
export const TRIAL_PROTEIN_PICKER_INTRO =
  'If your vet named one protein for this trial, keep it here. Culprit uses it to ' +
  'name what shows up in the record — it never changes what counts as off-diet.';

/** Picker group headers (mock frame C). */
export function derivedGroupHeader(petName: string): string {
  return `From ${petName}'s trial diet`;
}
export const OTHER_PROTEINS_GROUP_HEADER = 'Other proteins';
export const ESCAPE_GROUP_HEADER = 'Neither of these?';

/** The two escape-hatch options, first-class (mock frame C; §8 copy pack). */
export const HYDROLYZED_OPTION = {
  label: 'No single protein',
  subLabel: 'Hydrolyzed or special diet — the food list is the trial.',
} as const;

export function unsetOption(petName: string): { label: string; subLabel: string } {
  return {
    label: 'Not sure — leave it unset',
    subLabel: `Everything still works. You can set it later from ${petName}'s trial.`,
  };
}

/** The day-0 mismatch heads-up (§6.2 / §8, mock frame D), split into the FACT it
 *  leads with (rendered prominently) and the non-alarming advice that follows.
 *  `foodLabel` and the two proteins are already Title-cased/humane by the caller. */
export function mismatchHeadsUp(args: {
  foodLabel: string;
  foodProtein: string; // canonical key
  petName: string;
  targetProtein: string; // canonical key
}): { fact: string; advice: string } {
  return {
    fact: `${args.foodLabel} lists ${args.foodProtein} as its main protein.`,
    advice: `If ${args.petName}'s trial is ${args.targetProtein}-only, worth checking that bag with your vet.`,
  };
}
