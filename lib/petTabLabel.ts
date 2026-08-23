import { theme } from '../constants/theme';

/**
 * The Pet tab's fallback ladder (CUL-599; app-polish spec §1 DP-1, ruling D2 /
 * mock round 2 §01 R2-1).
 *
 * The Pet tab IS the pet — their avatar and their NAME, not the word "Pet". The
 * risk that buys is long names on small phones, and the ruling closed it with a
 * ladder rather than a truncation:
 *
 *     the full name at 11pt  →  the full name at 10pt  →  the literal word "Pet"
 *
 * A name is never cut mid-word and there is no ellipsis rung, because a chopped
 * name reads worse than no name: the avatar carries the identity in every rung, and
 * the full name always rides the accessibility label, so VoiceOver never says "Pet"
 * when the pet is Schrodingers Cat.
 *
 * ── Why this measures instead of asking the platform ──────────────────────────
 *
 * The spec leaves the mechanism open ("onTextLayout or a char-width budget —
 * implementation's choice, deterministic either way"). This is the budget.
 * `onTextLayout` measures truthfully but only AFTER a first paint, so the tab would
 * render at 11pt and then visibly reflow to 10pt or to "Pet" on every cold start and
 * every pet switch — a flicker in the most-seen chrome in the app, to decide
 * something that is fixed for a given (name, width) pair. A synchronous estimate has
 * no first frame to get wrong, and it is a pure function, so the ruled behaviour is
 * pinned by tests instead of by a device someone happens to be holding.
 *
 * The cost is honest and bounded: an estimate can be wrong in two directions, and
 * only one of them matters. Over-estimating drops a name one rung early — mildly
 * unfortunate, still a whole word. UNDER-estimating renders a name too wide for its
 * tab, which is exactly the clipping the ladder exists to prevent. So the fit test
 * demands the estimate fit with headroom (see ESTIMATE_HEADROOM), deliberately
 * biasing every error toward the harmless direction.
 */

/** The rung the ladder falls back to. Never a truncation of the pet's name. */
export const PET_TAB_FALLBACK_LABEL = 'Pet';

/**
 * Per-side padding inside a tab, in points (spec §1: "the tab's width minus 6pt
 * side padding"). Kept here rather than in the stylesheet because the budget and
 * the rendered padding are the same fact — splitting them is how a label starts
 * fitting the arithmetic and not the tab.
 */
export const TAB_LABEL_SIDE_PADDING = 6;

/**
 * Required headroom on the width estimate, as a fraction of the budget.
 *
 * 4%. The character table below is a good approximation of Geist's advances, not a
 * measurement of them, and the asymmetry above means the residual error must be
 * spent on the safe side. Calibrated so the ladder reproduces the mock's own stated
 * figure — "at the narrowest supported width a tab fits ~12 characters" — and the
 * three names the acceptance criteria name land on their ruled rungs at 320pt.
 */
export const ESTIMATE_HEADROOM = 0.96;

/**
 * Character advance widths in em (multiply by font size for points).
 *
 * Geist is a fairly even grotesque, so a small class table tracks it far better
 * than one average would: an average alone makes "Willow" and "Lili" the same
 * width, and those differ by more than a whole rung.
 */
const ADVANCE_NARROW = 0.26; // i l I j . , ' ! : ; | and the space
const ADVANCE_SEMI_NARROW = 0.4; // f r t and bracket/punctuation strokes
const ADVANCE_DEFAULT = 0.52; // lowercase and digits — the bulk of any name
const ADVANCE_UPPER = 0.68; // capitals (a name is nearly always capitalised)
const ADVANCE_SEMI_WIDE = 0.78; // w
const ADVANCE_WIDE = 0.87; // m M W

const NARROW_CHARS = "iljI.,'!:;| ";
const SEMI_NARROW_CHARS = 'frt()[]{}/\\-"';
const WIDE_CHARS = 'mMW';

function advanceEm(char: string): number {
  // Order matters: `I` is narrow despite being a capital, and `M`/`W` are wide
  // despite the same. The specific classes are checked before the general one.
  if (NARROW_CHARS.includes(char)) return ADVANCE_NARROW;
  if (SEMI_NARROW_CHARS.includes(char)) return ADVANCE_SEMI_NARROW;
  if (WIDE_CHARS.includes(char)) return ADVANCE_WIDE;
  if (char === 'w') return ADVANCE_SEMI_WIDE;
  if (char >= 'A' && char <= 'Z') return ADVANCE_UPPER;
  return ADVANCE_DEFAULT;
}

/**
 * Estimated rendered width of `text` at `fontSize`, in points.
 *
 * Exported for the tests, which assert the calibration directly rather than only
 * through the rungs it produces — a table that drifts should fail loudly at the
 * character it drifted on, not silently at some future pet's name.
 */
export function estimateLabelWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) em += advanceEm(char);
  return em * fontSize;
}

/**
 * The horizontal space a tab's label may occupy, in points.
 *
 * The bar divides the window evenly between its routes (flex: 1 each), so a tab is
 * `windowWidth / tabCount` wide and the label gets that minus its side padding.
 */
export function tabLabelBudget(windowWidth: number, tabCount: number): number {
  if (tabCount <= 0) return 0;
  return Math.max(0, windowWidth / tabCount - TAB_LABEL_SIDE_PADDING * 2);
}

/**
 * The ladder's two name-bearing rungs, widest first. The fallback renders at the
 * top rung so it matches the three fixed labels beside it (the mock's "Pet" frame
 * is the same size as "Home").
 */
export const PET_TAB_RUNGS = [theme.textXS, theme.textTabLabelTight] as const;

export type PetTabLabel = {
  /** What the tab renders: the pet's whole name, or the word "Pet". Never a cut. */
  text: string;
  /** The rung it renders at. */
  fontSize: number;
  /** True when the name did not fit and the tab fell back to the generic word. */
  isFallback: boolean;
};

/**
 * Resolve the Pet tab's label for a given name and label budget.
 *
 * Pure and total: any name and any width produce a rendered label, and the result
 * for a given pair never changes, so the tab does not re-measure or re-lay-out on
 * re-render. Callers cache by (name, width) if they care; nothing here needs it.
 */
export function resolvePetTabLabel(name: string | null | undefined, budget: number): PetTabLabel {
  const trimmed = (name ?? '').trim();
  const usable = budget * ESTIMATE_HEADROOM;

  // A nameless pet is not reachable through the app's own pet form, but the tab is
  // chrome: it renders whatever the record holds, so it must have an answer for a
  // blank one rather than a bar with a gap in it.
  if (trimmed.length > 0) {
    for (const fontSize of PET_TAB_RUNGS) {
      if (estimateLabelWidth(trimmed, fontSize) <= usable) {
        return { text: trimmed, fontSize, isFallback: false };
      }
    }
  }

  return { text: PET_TAB_FALLBACK_LABEL, fontSize: PET_TAB_RUNGS[0], isFallback: true };
}

/**
 * The tab's accessibility label — ALWAYS the pet's full name, at every rung (spec
 * §1: `"Biscuit — pet profile"`). This is the half of the ladder that makes the
 * fallback acceptable: the name is never lost, only unrendered.
 */
export function petTabAccessibilityLabel(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? `${trimmed} — pet profile` : 'Pet profile';
}
