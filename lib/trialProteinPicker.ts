// The trial-protein picker + the allowed-set editor row + the correction confirm
// — B-704 PR 4 (spec §7.2/§7.3, mock frames C, G, H).
//
// PURE. Every string these surfaces render is built here, for the same reason
// `trialFoodsScreen.ts` and `dietTrialCard.ts` exist: the §8 copy pack is
// verbatim and copy that lives inside a component is copy no test can hold still.
// The picker component (components/profile/TrialProteinPickerSheet.tsx) lays this
// model out and owns exactly one judgement of its own — the confirm-step UI state
// — while the WRITE goes through `setTrialTargetProtein` (lib/dietTrialSetup.ts).
//
// ── THE SHARED PICKER (§7.2) ─────────────────────────────────────────────────
//
// One component, two mounts: the allowed-set screen's editor row (this PR) and
// the start sheet (PR 3). PR 4 lands first, so it builds the shared model here and
// PR 3 consumes it. The options are the SAME source of truth as `ProteinPicker`
// (`COMMON_PROTEINS`, `lib/protein.ts`), so an owner-picked value and an
// AI-extracted value key through the one `canonicalizeProtein` on read.
//
// ── NEVER A PERMIT, NEVER A CLAIM (TG-1/TG-2) ────────────────────────────────
//
// The picker only ever offers real protein keys or the two null escape hatches;
// there is no free-text entry, so arbitrary text can never reach the column (the
// write path's job per PR 2's `trialProtein.ts` docstring, discharged here by
// construction rather than by a sanitiser). A null resolution names nothing
// anywhere — the empty row is a set-prompt, never a "no protein" verdict.
import { COMMON_PROTEINS, canonicalizeProtein } from './protein';
import { capitalizeProtein, type TrialProteinSource } from './trialProtein';

// ── Sentinels for the two null-writing escape hatches ────────────────────────
//
// Both store NULL (§5 — deliberately indistinguishable in the column; the
// product distinction is carried here in the UI and matters nowhere downstream).
// They are distinct IDs only so the picker can render two rows and the confirm's
// button can read which one was tapped; neither is ever written.
export const TRIAL_PROTEIN_HYDROLYZED = '__hydrolyzed__';
export const TRIAL_PROTEIN_UNSET = '__unset__';

// ── §8 copy pack (DRAFT — every string passes `nyx-voice` in this PR) ─────────

export const TRIAL_PROTEIN_PICKER_TITLE = 'Trial protein';

/** The invariant, in owner language: the field NAMES, it never permits (§5.5 D-A,
 *  spoken out loud so an owner cannot hope to launder a treat into the trial by
 *  editing it). LOCKED in §8. */
export const TRIAL_PROTEIN_PICKER_INTRO =
  'If your vet named one protein for this trial, keep it here. Culprit uses it to ' +
  'name what shows up in the record — it never changes what counts as off-diet.';

/** The correction confirm (TP-3), verbatim from §8 — shown before an edit that
 *  CHANGES an existing owner-set value commits. Disclosed, not versioned: it says
 *  the whole-trial effect in two sentences, with the load-bearing second one that
 *  the off-diet counts do not move (TG-1/TG-5). First-time sets never see it. */
export const TRIAL_PROTEIN_CORRECTION_NOTE =
  'This updates the trial’s whole record, including days already logged. What ' +
  'counted as off-diet doesn’t change.';

// ── The editor row (frame G) ─────────────────────────────────────────────────

export const TRIAL_PROTEIN_ROW_LABEL = 'Trial protein';
/** The E1 empty register (TP-1) — a set-prompt, never a bare "Not set" verdict. */
export const TRIAL_PROTEIN_ROW_EMPTY_VALUE = 'Not set';
/** SECOND PERSON, not the report's "owner-confirmed" (nyx-voice Pattern 1 — never
 *  third-person about the owner). The report is a vet-facing artifact where
 *  "owner-confirmed" is the right provenance word (PR 5, §7.4); this is the
 *  owner's own screen, so it addresses them as "you". */
export const TRIAL_PROTEIN_ROW_SUB_OWNER = 'You set this — tap to change';
export const TRIAL_PROTEIN_ROW_SUB_DERIVED = 'From the trial diet — tap to change';
export const TRIAL_PROTEIN_ROW_SUB_EMPTY = 'Tap to name this trial’s protein';

// ── The escape hatches (frame C) ─────────────────────────────────────────────

export const TRIAL_PROTEIN_HYDROLYZED_LABEL = 'No single protein';
export const TRIAL_PROTEIN_HYDROLYZED_SUB =
  'Hydrolyzed or special diet — the food list is the trial';
export const TRIAL_PROTEIN_UNSET_LABEL = 'Not sure — leave it unset';

export const TRIAL_PROTEIN_GROUP_OTHER = 'Other proteins';
export const TRIAL_PROTEIN_GROUP_ESCAPE = 'Neither of these?';

/** A write that did not land — plain cause, a concrete next action, no error code,
 *  and NOT silent (the sheet stays open, says so). Matches `ADD_TRIAL_FOOD_ERROR`'s
 *  phrasing: the row is local-first, so "in a moment" is honest — a device write
 *  failing, not the network. */
export const SET_TRIAL_PROTEIN_ERROR = 'That didn’t save. Try again in a moment.';

/** "Everything still works. You can set it later from {pet}'s trial." — the
 *  reassurance that unset is a first-class answer, not a shrug (§8). */
export function trialProteinUnsetSubLabel(petName: string): string {
  return `Everything still works. You can set it later from ${petName}’s trial.`;
}

/** The derived group's provenance sub-label — how many of the trial's own foods
 *  list this protein. Accurate rather than fixed: "both" reads best for the mock's
 *  two-food case, but the phrasing degrades honestly for one food or three. */
export function derivedProteinSubLabel(count: number, totalPrimary: number): string {
  if (totalPrimary >= 2 && count === totalPrimary) {
    return count === 2 ? 'Listed on both trial foods' : `Listed on all ${count} trial foods`;
  }
  if (count >= 2) return `Listed on ${count} of your trial foods`;
  return 'Listed on the trial diet';
}

// ── The picker model (frame C) ───────────────────────────────────────────────

export interface TrialProteinOption {
  /** The value the picker reports on select: a canonical protein key, or a
   *  null-writing sentinel (`TRIAL_PROTEIN_HYDROLYZED` / `TRIAL_PROTEIN_UNSET`). */
  id: string;
  /** Capitalised for display (§8 "capitalized protein"). */
  label: string;
  subLabel: string | null;
  /** True for the two escape hatches — selecting one writes null. Carried so the
   *  component maps a selection to a protein without string-matching the sentinel. */
  writesNull: boolean;
}

export interface TrialProteinGroup {
  title: string;
  options: TrialProteinOption[];
}

export interface TrialProteinPickerModel {
  title: string;
  intro: string;
  groups: TrialProteinGroup[];
  /** The canonical key currently in force (owner OR derived), for the filled
   *  radio. Null when nothing resolves — NO radio filled, never the escape hatches
   *  pre-selected (the two null states are indistinguishable by design, §5). */
  selectedId: string | null;
  /** `source === 'owner'`. The component reads this to decide whether a DIFFERENT
   *  selection is a CORRECTION (needs the confirm, TP-3) or a first-set (no
   *  confirm). A derived value is never "an existing value" — the owner never set
   *  it — so picking over a derived value is a first-set. */
  isOwnerSet: boolean;
}

/**
 * The grouped options: derived-from-the-trial-diet first (with provenance),
 * common proteins next, the two escape hatches last (frame C).
 *
 * The derived group is the distinct non-null `canonicalizeProtein(primaryProtein)`
 * across the trial's `primary_diet` foods — the SAME source `trialTargetProtein`
 * derives from, deliberately NOT `proteins[0]` (that would resurrect a cleared
 * designation; see the predicate's docstring). "Other proteins" excludes anything
 * already shown in the derived group, so a protein never appears twice.
 */
export function buildTrialProteinPicker(args: {
  petName: string;
  /** The trial's `primary_diet` foods, for the derived group. */
  primaryFoods: readonly { primaryProtein: string | null }[];
  /** The resolved `{ protein, source }` from `trialTargetProtein` — sets the
   *  filled radio and the correction gate. */
  resolved: { protein: string | null; source: TrialProteinSource | null };
}): TrialProteinPickerModel {
  const { petName, primaryFoods, resolved } = args;

  const derivedSeen = new Set<string>();
  const derivedKeys: string[] = [];
  for (const f of primaryFoods) {
    const key = canonicalizeProtein(f.primaryProtein);
    if (key != null && !derivedSeen.has(key)) {
      derivedSeen.add(key);
      derivedKeys.push(key);
    }
  }
  const totalPrimary = primaryFoods.length;
  const derivedOptions: TrialProteinOption[] = derivedKeys.map((key) => {
    const count = primaryFoods.filter((f) => canonicalizeProtein(f.primaryProtein) === key).length;
    return {
      id: key,
      label: capitalizeProtein(key),
      subLabel: derivedProteinSubLabel(count, totalPrimary),
      writesNull: false,
    };
  });

  const otherOptions: TrialProteinOption[] = COMMON_PROTEINS.filter(
    (p) => !derivedSeen.has(p),
  ).map((p) => ({ id: p, label: capitalizeProtein(p), subLabel: null, writesNull: false }));

  const escapeOptions: TrialProteinOption[] = [
    {
      id: TRIAL_PROTEIN_HYDROLYZED,
      label: TRIAL_PROTEIN_HYDROLYZED_LABEL,
      subLabel: TRIAL_PROTEIN_HYDROLYZED_SUB,
      writesNull: true,
    },
    {
      id: TRIAL_PROTEIN_UNSET,
      label: TRIAL_PROTEIN_UNSET_LABEL,
      subLabel: trialProteinUnsetSubLabel(petName),
      writesNull: true,
    },
  ];

  const groups: TrialProteinGroup[] = [];
  if (derivedOptions.length > 0) {
    groups.push({ title: `From ${petName}’s trial diet`, options: derivedOptions });
  }
  groups.push({ title: TRIAL_PROTEIN_GROUP_OTHER, options: otherOptions });
  groups.push({ title: TRIAL_PROTEIN_GROUP_ESCAPE, options: escapeOptions });

  return {
    title: TRIAL_PROTEIN_PICKER_TITLE,
    intro: TRIAL_PROTEIN_PICKER_INTRO,
    groups,
    // Never a sentinel — a null resolution leaves nothing selected.
    selectedId: resolved.protein,
    isOwnerSet: resolved.source === 'owner',
  };
}

// ── The editor row (frame G) ─────────────────────────────────────────────────

export interface TrialProteinRowModel {
  label: string;
  value: string;
  /** False when nothing is set — the value renders in the dimmed register, and
   *  the row is a set-prompt (TP-1 E1), never a bare "Not set" verdict. */
  valueSet: boolean;
  subLine: string;
}

/**
 * The "Trial protein" row above the food list. Provenance drives the sub-line —
 * an owner's confirmed word reads differently from the app's best guess, and a
 * consumer that cannot tell them apart eventually presents a guess as a
 * confirmation (the same reason `trialTargetProtein` returns `source`).
 */
export function buildTrialProteinRow(resolved: {
  protein: string | null;
  source: TrialProteinSource | null;
}): TrialProteinRowModel {
  if (resolved.protein == null) {
    return {
      label: TRIAL_PROTEIN_ROW_LABEL,
      value: TRIAL_PROTEIN_ROW_EMPTY_VALUE,
      valueSet: false,
      subLine: TRIAL_PROTEIN_ROW_SUB_EMPTY,
    };
  }
  return {
    label: TRIAL_PROTEIN_ROW_LABEL,
    value: capitalizeProtein(resolved.protein),
    valueSet: true,
    subLine:
      resolved.source === 'owner' ? TRIAL_PROTEIN_ROW_SUB_OWNER : TRIAL_PROTEIN_ROW_SUB_DERIVED,
  };
}

// ── The correction confirm (frame H) ─────────────────────────────────────────

export interface ProteinCorrectionConfirm {
  note: string;
  confirmLabel: string;
}

/**
 * The confirm shown before a CHANGE to an existing owner-set value commits (frame
 * H). The note is §8 verbatim; the button names the destination so the commit is
 * unambiguous ("Change to venison"). A change to either null escape hatch removes
 * the naming, so the button says so.
 */
export function buildProteinCorrectionConfirm(
  newSelection: TrialProteinOption,
): ProteinCorrectionConfirm {
  return {
    note: TRIAL_PROTEIN_CORRECTION_NOTE,
    confirmLabel: newSelection.writesNull
      ? 'Remove the trial protein'
      : `Change to ${newSelection.label.toLowerCase()}`,
  };
}

/**
 * Map an option to the value the write path stores: a canonical key, or null for
 * either escape hatch. The one place the sentinel→null mapping lives.
 */
export function proteinValueOf(option: TrialProteinOption): string | null {
  return option.writesNull ? null : option.id;
}

/**
 * Does selecting `option` need the correction confirm (TP-3)?
 *
 * TRUE only when the current value is OWNER-set AND the new value differs. A
 * derived or unset value is never "an existing value", so selecting over it is a
 * first-set (no confirm); re-selecting the current owner value is a no-op (the
 * component closes without writing rather than confirming a change to itself).
 */
export function isProteinCorrection(
  model: Pick<TrialProteinPickerModel, 'selectedId' | 'isOwnerSet'>,
  option: TrialProteinOption,
): boolean {
  if (!model.isOwnerSet) return false;
  return proteinValueOf(option) !== model.selectedId;
}
