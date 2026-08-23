import { theme } from '../constants/theme';
import { ESTIMATE_HEADROOM, estimateTextWidth } from './textWidth';

/**
 * The Home header's name-overflow rule (CUL-600; app-polish spec §2 DP-2, ruling D3).
 *
 * H2a made the header one ~52pt row anchored by the pet's photo, so the pet's NAME is
 * now the row's only text and has a variable amount of room beside it:
 *
 *     17pt semibold  →  16pt  →  tail-ellipsis
 *
 * ── Why this ladder deliberately differs from the Pet tab's ───────────────────
 *
 * Both are written down (spec §1 and §2) precisely so neither is re-derived from the
 * other. The tab's ladder ends in the literal word "Pet" and has NO ellipsis rung,
 * because a chopped name reads worse than no name there and the avatar carries the
 * identity anyway. The header has no acceptable generic fallback — a header reading
 * "Pet" over a photo is a downgrade, not a graceful one — and the full name is one
 * tap away in the switcher sheet and always in the accessibility label. So ellipsis
 * is the header's floor, and it is reached AT the bottom rung: a name too long for
 * 16pt renders at 16pt with a tail, never back up at 17pt.
 *
 * ── What an estimate can cost here, which is much less than on the tab ────────
 *
 * This module only ever chooses between two point sizes. The ellipsis is not its
 * decision at all — it is `numberOfLines={1}` doing what RN does when text overruns
 * its box, which is a truthful measurement, not an estimate. So the two error
 * directions are:
 *
 *   over-estimate  → a name renders at 16pt where 17pt would have fit. Imperceptible.
 *   under-estimate → a name renders at 17pt with a tail where 16pt would have shown
 *                    it whole. Mildly worse — it defeats the point of the 16pt rung.
 *
 * Neither is the mid-word cut the tab's ladder exists to prevent, so the asymmetry
 * that governs `lib/petTabLabel.ts` does not carry over. `ESTIMATE_HEADROOM` is still
 * spent, and in the same direction, because the second bullet is still the worse of
 * the two — but if the shared table ever needs a wider margin, this surface is not
 * the reason.
 *
 * The geometry constants below are exported and consumed by the header's own
 * stylesheet rather than duplicated into it: the budget and the rendered layout are
 * the same fact, and splitting them is how a name starts fitting the arithmetic
 * instead of the row (the `TAB_LABEL_SIDE_PADDING` lesson, one surface over).
 */

/** Horizontal padding on the header row, per side. */
export const HEADER_PADDING_X = theme.space2;
/** The pet's photo — the row's anchor, and the left cluster's leading element. */
export const HEADER_AVATAR_SIZE = 30;
/** Photo → name. */
export const HEADER_AVATAR_GAP = 9;
/** The multi-pet chevron, and the gap before it. Absent entirely for one pet. */
export const HEADER_CHEVRON_SIZE = 18;
export const HEADER_CHEVRON_GAP = 4;
/** The owner's monogram — the "You" doorway that closes the right cluster. */
export const HEADER_OWNER_AVATAR_SIZE = 32;
/** Ask pill → owner avatar. */
export const HEADER_RIGHT_GAP = 10;
/**
 * The minimum breathing room between the two clusters. Not a rendered `gap` — the
 * row is space-between — but the budget must reserve it, or a name would be sized to
 * run right up against the Ask pill.
 */
export const HEADER_CLUSTER_GAP = 12;

/** The Ask pill's fixed furniture: dot + gap + horizontal padding + its 1pt border. */
const ASK_DOT_SIZE = 6;
const ASK_DOT_GAP = 5;
const ASK_PADDING_X = 10;
const ASK_BORDER = 1;
export const ASK_PILL_LABEL = 'Ask';

/**
 * The rendered width of the Ask pill, derived from its own parts rather than stated
 * as a literal — the pill's label is a fixed string, so this is exact up to the same
 * table everything else here uses. The pill carries no letter spacing.
 */
export function askPillWidth(): number {
  return (
    ASK_DOT_SIZE +
    ASK_DOT_GAP +
    estimateTextWidth(ASK_PILL_LABEL, theme.textSM, 0) +
    ASK_PADDING_X * 2 +
    ASK_BORDER * 2
  );
}

/**
 * The horizontal space the pet's name may occupy, in points.
 *
 * Everything the row draws beside the name is subtracted: the photo, the gaps, the
 * chevron when there is more than one pet, and the whole right cluster — whose width
 * depends on whether Ask resolves on for this account, because an allowlist-gated
 * pill that isn't rendered isn't taking any room.
 */
export function headerNameBudget({
  windowWidth,
  multiPet,
  askEnabled,
}: {
  windowWidth: number;
  multiPet: boolean;
  askEnabled: boolean;
}): number {
  const rightCluster =
    HEADER_OWNER_AVATAR_SIZE + (askEnabled ? askPillWidth() + HEADER_RIGHT_GAP : 0);
  const chevron = multiPet ? HEADER_CHEVRON_SIZE + HEADER_CHEVRON_GAP : 0;

  return Math.max(
    0,
    windowWidth -
      HEADER_PADDING_X * 2 -
      HEADER_AVATAR_SIZE -
      HEADER_AVATAR_GAP -
      chevron -
      HEADER_CLUSTER_GAP -
      rightCluster,
  );
}

/** The ladder's two rungs, widest first. The third rung is a tail on the second. */
export const HEADER_NAME_RUNGS = [theme.textLG, theme.textHeaderNameTight] as const;

export type HeaderName = {
  /** The rung the name renders at. */
  fontSize: number;
  /**
   * True when the name does not fit even at the bottom rung, so `numberOfLines={1}`
   * will tail it. Not needed to render — the component always sets `numberOfLines` —
   * but it makes the third rung assertable, which is the only way a test can tell
   * "16pt with a tail" apart from "16pt because 17 didn't fit".
   */
  willEllipsize: boolean;
};

/**
 * Resolve the header name's rung for a given name and budget.
 *
 * Pure and total: any name and any width produce an answer, and the answer for a
 * given pair never changes, so the header does not re-measure or re-lay-out on
 * re-render.
 */
export function resolveHeaderName(name: string | null | undefined, budget: number): HeaderName {
  const trimmed = (name ?? '').trim();
  const usable = budget * ESTIMATE_HEADROOM;

  for (const fontSize of HEADER_NAME_RUNGS) {
    if (estimateTextWidth(trimmed, fontSize, 0) <= usable) {
      return { fontSize, willEllipsize: false };
    }
  }

  // Past the bottom rung the name renders there anyway and RN tails it. Falling back
  // UP to 17pt would cut more of the name to say the same thing louder.
  return { fontSize: HEADER_NAME_RUNGS[HEADER_NAME_RUNGS.length - 1], willEllipsize: true };
}

/**
 * The switcher's accessibility label — ALWAYS the pet's full name, at every rung.
 * That is what makes the ellipsis floor acceptable: the name is never lost, only
 * unrendered (the same bargain the Pet tab's ladder strikes).
 *
 * The row is tappable for one-pet households too, because the sheet is also the only
 * "Add a pet" entry point — so the single-pet label names the pet rather than saying
 * a bare "Your pets", which would drop the name for exactly the owner whose name is
 * most likely being ellipsised (no chevron means MORE room, but a long name still
 * tails).
 */
export function headerSwitcherLabel(name: string | null | undefined, multiPet: boolean): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) return 'Your pets';
  return multiPet ? `Switch pet — ${trimmed} active` : `${trimmed} — your pets`;
}
