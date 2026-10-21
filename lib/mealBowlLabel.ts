// How a mixed bowl reads on a row (Mixed meals row 4, CUL-2053; spec §7.2 and T8).
//
// One row, one label: "⅓ Chicken Pâté + ⅔ Rabbit Pâté". The ratio is TEXT, never a pie
// (Principle 8): each food's share of the BOWL, so ¼ can + ½ can reads ⅓ + ⅔ (the spec's own
// example); the amounts as entered are the event detail's (§11). A share on a preset stop
// prints as its fraction, anything else as a percentage rounded to 5 with "~". A bowl whose
// ratio is unknown (a later path only, P-3) prints its foods with no numbers, never a
// default 50/50.
//
// The row renders the segments itself so each fraction can refuse to shrink (C-8): a
// long food name truncates, the share beside it never does.

import { productNameBesideTag } from './food';
import { componentDisplayName, type AppBowl, type AppBowlComponent } from './mealBowls';

/** The five preset stops (P-2), as the glyph a row prints. */
const STOPS: readonly { value: number; glyph: string }[] = [
  { value: 1 / 4, glyph: '¼' },
  { value: 1 / 3, glyph: '⅓' },
  { value: 1 / 2, glyph: '½' },
  { value: 2 / 3, glyph: '⅔' },
  { value: 3 / 4, glyph: '¾' },
];

/** Shares are stored to 3 places (NUMERIC(4,3)), so ⅓ comes back as 0.333. */
const STOP_TOLERANCE = 0.002;

/** How many foods a row names before "+N more" (the UI is built for two, R3). */
export const BOWL_ROW_NAMED = 2;

/** A share as a row prints it, or null when unknown. */
export function shareGlyph(normalizedShare: number | null): string | null {
  if (normalizedShare === null || !Number.isFinite(normalizedShare)) return null;
  if (normalizedShare >= 1 - STOP_TOLERANCE) return 'All';
  for (const s of STOPS) {
    if (Math.abs(normalizedShare - s.value) <= STOP_TOLERANCE) return s.glyph;
  }
  const pct = Math.max(5, Math.min(95, Math.round((normalizedShare * 100) / 5) * 5));
  return `~${pct}%`;
}

/** A component's short name on a row: the product without its format qualifier, else
 *  the snapshot name. The brand is dropped: two foods must fit on one row. */
export function componentRowName(c: Pick<AppBowlComponent, 'food' | 'foodLabel'>): string {
  const product = productNameBesideTag(c.food?.productName ?? null, c.food?.format ?? null);
  return product?.trim() || componentDisplayName(c);
}

export interface BowlSegment {
  /** The protected half: null when the ratio is unknown or the bowl is incomplete. */
  share: string | null;
  name: string;
}

export interface BowlRowLabel {
  segments: BowlSegment[];
  /** Foods past `BOWL_ROW_NAMED`, printed as "+N more". */
  more: number;
  /** The bowl's live set is smaller than it says (§3): its contents are not all known,
   *  so it never reads as one food or as a complete mix. */
  incomplete: boolean;
  /** The whole label as one string, for the spoken label and any plain-text surface. */
  text: string;
}

export const INCOMPLETE_BOWL_TAIL = 'and a food not on this phone yet';

export function bowlRowLabel(bowl: AppBowl): BowlRowLabel {
  const incomplete = bowl.status === 'incomplete';
  const named = bowl.components.slice(0, BOWL_ROW_NAMED);
  const segments: BowlSegment[] = named.map((c) => ({
    share: incomplete ? null : shareGlyph(c.normalizedShare),
    name: componentRowName(c),
  }));
  const more = Math.max(0, bowl.components.length - BOWL_ROW_NAMED);
  const parts = segments.map((s) => (s.share ? `${s.share} ${s.name}` : s.name));
  let text = parts.join(' + ');
  if (more > 0) text += ` +${more} more`;
  if (incomplete) text = `${text}${text ? ' ' : ''}${INCOMPLETE_BOWL_TAIL}`;
  return { segments, more, incomplete, text };
}
