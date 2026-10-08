import { theme } from '../constants/theme';

/**
 * THE FAB FAN'S HEIGHT BUDGET (CUL-1636).
 *
 * The fan is a column anchored to the disc that grows upward, and nothing used to
 * cap it. Its TOP row is the "Logging for" chip, the wrong-pet safeguard, so the
 * first thing an overflow cut was the one thing that says whose record a one-tap
 * food writes into. Computed by the convening's lens: a 375×667 iPhone SE lost the
 * chip at AX1, an SE under Display Zoom (320pt wide) at default text, and at AX1 the
 * two Royal Canin pills truncated to the same words.
 *
 * So the fan is planned before it is drawn, from the window and the text multiplier,
 * never measured after: a plan made from a measurement would draw the rows, then
 * take some away, which moves pills under a thumb already on its way (CUL-1634's
 * lesson). The order of sacrifice, each step taken only when the one before is not
 * enough:
 *
 *   1. The recent foods go, OLDEST first. The newest sits nearest the thumb and is
 *      the likeliest tap; `Log food` stays, so every food is still one door away.
 *   2. With no food left and the doors still too tall (AX2 and up on a small phone),
 *      the chip is PINNED at the top and the doors scroll beneath it, opened at the
 *      bottom so the pills nearest the thumb are the ones on screen. Context leads:
 *      the chip is never the row that leaves.
 *
 * And two shown foods never read the same: PR-23's tag already parts wet from dry
 * of one line, and where two labels would still truncate to the same visible words
 * under the same tag, both lose their line cap and wrap in full (their height is
 * planned at the full length, so the budget pays for it).
 *
 * ── An ESTIMATE, stated as one (C-38: undocumented blind spots read as coverage) ──
 * Text is measured by character count against an average glyph width, not shaped:
 * `CHAR_EM` and `LINE_EM` are set wide of Geist's real metrics so the estimate errs
 * toward a taller fan (a food dropped that would have fit) rather than a shorter one
 * (the chip cut). The spinner a logging food shows for a beat is not budgeted. The
 * plan is checked on device at 320pt and AX1 to AX3 (the issue's device gate).
 *
 * The geometry below is the fan's layout, exported and consumed by the FAB's own
 * stylesheet rather than restated there: the budget and the rendered pills are the
 * same fact (the `lib/headerName.ts` rule).
 */

/** The disc's offset from the bottom of the screen, its size, and the fan's lift off it. */
export const FAB_BOTTOM = 72;
export const FAB_DISC = 56;
export const FAN_MARGIN_BOTTOM = theme.space2;
/** Space kept clear under the status bar / Dynamic Island, above the fan's top row. */
export const FAN_TOP_MARGIN = theme.space1;
/** The fan's right inset (the disc's) and the clear margin a pill keeps on the left. */
export const FAN_RIGHT_INSET = theme.space3;
export const FAN_LEFT_MARGIN = theme.space2;
/** The gap between two stacked pills (C-5: no pill carries hitSlop, so any positive gap
 *  keeps neighbours from sharing hit area; this one is the mock's 10pt). */
export const FAN_GAP = 10;

/** The pill. The 44pt floor is the pill's own box, never hitSlop (CUL-612). */
export const PILL_MIN_HEIGHT = 44;
export const PILL_MAX_WIDTH = 300;
export const PILL_PADDING_V = theme.space1;
export const PILL_PADDING_LEFT = 10;
export const PILL_PADDING_RIGHT = theme.space2;
export const PILL_INNER_GAP = 10;
export const PILL_GLYPH = 28;
export const PILL_CHEVRON = 16;
export const PILL_LABEL_SIZE = 15;
/** The food label → format tag gap, and the tag's own box. */
export const FOOD_TAG_GAP = 6;
export const FOOD_TAG_PADDING_H = 4;
export const FOOD_TAG_PADDING_V = 1;
/** The chip's label → name gap. */
export const LOG_FOR_LABEL_GAP = 1;
/** The chip's name wraps to two lines at most, and a food's label to two by default. */
export const LOG_FOR_NAME_LINES = 2;
export const FOOD_LABEL_LINES = 2;

/** Average glyph advance, in em, set above Geist Medium's lowercase average (~0.55). */
const CHAR_EM = 0.6;
/** A tracked uppercase tag's advance: wider glyphs plus `trackingWide`. */
const TAG_CHAR_EM = 0.72;
/** A line's height, in em, set above Geist's ascent + descent (~1.26). */
const LINE_EM = 1.3;

export interface FanFoodInput {
  id: string;
  /** The label as drawn (`rowFoodLabelOf`), the tag already stripped from it. */
  label: string;
  /** The format tag as drawn (`foodFormatTag`), or null for no tag. */
  tag: string | null;
}

export interface FanBudgetInput {
  windowWidth: number;
  windowHeight: number;
  /** RN's text multiplier: 1 at default text, 1.786 at AX1, 2.143 at AX2, 2.643 at AX3. */
  fontScale: number;
  /** The safe area's top inset. */
  safeTop: number;
  /** The pet's name when the chip is drawn (two or more pets), else null. */
  chipName: string | null;
  /** The doors' labels, top to bottom. */
  doors: readonly string[];
  /** The recent foods, newest first (the order `getRecentFoods` answers in). */
  foods: readonly FanFoodInput[];
}

export interface FanFoodPlan {
  id: string;
  /** The label's line cap; `undefined` lets it wrap in full (a would-be collision). */
  numberOfLines: number | undefined;
}

export interface FanPlan {
  /** The widest a pill may be on this window: 300pt, or less on a 320pt screen. */
  pillMaxWidth: number;
  /** The foods to draw, newest first, each with its label's line cap. */
  foods: FanFoodPlan[];
  /** The height the fan may stand, from its lift off the disc to under the status bar. */
  available: number;
  /** The planned height of what is drawn (the scrolled rows at full length). */
  height: number;
  /** True when even the doors overflow: the chip pins, and the doors scroll beneath it. */
  scroll: boolean;
  /** In scroll mode, the scroll view's cap (the budget less the pinned chip). */
  scrollMaxHeight: number | null;
}

/** One line's height at a type size, scaled. */
function lineHeight(size: number, fontScale: number): number {
  return size * fontScale * LINE_EM;
}

/**
 * Greedy word wrap of `text` into lines no wider than `width`, by estimated advance.
 * A word wider than a line breaks across lines, as RN's does. Returns the lines.
 */
export function wrapEstimate(text: string, size: number, fontScale: number, width: number): string[] {
  const perLine = Math.max(1, Math.floor(width / (size * fontScale * CHAR_EM)));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= perLine) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    while (w.length > perLine) {
      lines.push(w.slice(0, perLine));
      w = w.slice(perLine);
    }
    line = w;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

/** The pill's height around a content block of `content` points. */
function pillHeight(content: number): number {
  return Math.max(PILL_MIN_HEIGHT, PILL_PADDING_V * 2 + Math.max(PILL_GLYPH, content));
}

function chipHeight(name: string, fontScale: number, pillMaxWidth: number): number {
  const width = pillMaxWidth - PILL_PADDING_LEFT - PILL_GLYPH - PILL_INNER_GAP * 2 - PILL_CHEVRON - PILL_PADDING_RIGHT;
  const nameLines = Math.min(LOG_FOR_NAME_LINES, wrapEstimate(name, theme.textLG, fontScale, width).length);
  return pillHeight(
    lineHeight(theme.textSM, fontScale) + LOG_FOR_LABEL_GAP + nameLines * lineHeight(theme.textLG, fontScale),
  );
}

function doorHeight(label: string, fontScale: number, pillMaxWidth: number): number {
  const width = pillMaxWidth - PILL_PADDING_LEFT - PILL_GLYPH - PILL_INNER_GAP * 2 - PILL_CHEVRON - PILL_PADDING_RIGHT;
  return pillHeight(wrapEstimate(label, PILL_LABEL_SIZE, fontScale, width).length * lineHeight(PILL_LABEL_SIZE, fontScale));
}

/** The width a food's LABEL wraps in: the pill less its glyph and, when it has one, its tag. */
function foodLabelWidth(food: FanFoodInput, fontScale: number, pillMaxWidth: number): number {
  const base = pillMaxWidth - PILL_PADDING_LEFT - PILL_GLYPH - PILL_INNER_GAP - PILL_PADDING_RIGHT;
  if (!food.tag) return base;
  const tag = food.tag.length * theme.textXS * fontScale * TAG_CHAR_EM + FOOD_TAG_PADDING_H * 2 + 2;
  return Math.max(1, base - FOOD_TAG_GAP - tag);
}

/**
 * Which of `foods` would read the same as another shown food: equal visible words
 * under the cap, the same tag, and a label that is not in fact the same. A food whose
 * full label equals another's is the same words honestly, and is left capped.
 */
function collidingIds(foods: readonly FanFoodInput[], fontScale: number, pillMaxWidth: number): Set<string> {
  const seen = foods.map((f) => {
    const lines = wrapEstimate(f.label, PILL_LABEL_SIZE, fontScale, foodLabelWidth(f, fontScale, pillMaxWidth));
    return { f, truncated: lines.length > FOOD_LABEL_LINES, visible: lines.slice(0, FOOD_LABEL_LINES).join(' ') };
  });
  const out = new Set<string>();
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      const a = seen[i];
      const b = seen[j];
      if (a.f.label === b.f.label || a.f.tag !== b.f.tag) continue;
      if (!a.truncated && !b.truncated) continue;
      if (a.visible === b.visible) {
        out.add(a.f.id);
        out.add(b.f.id);
      }
    }
  }
  return out;
}

function foodHeight(food: FanFoodInput, cap: number | undefined, fontScale: number, pillMaxWidth: number): number {
  const lines = wrapEstimate(food.label, PILL_LABEL_SIZE, fontScale, foodLabelWidth(food, fontScale, pillMaxWidth)).length;
  const shown = cap === undefined ? lines : Math.min(cap, lines);
  // The tag's own box is one line of tracked XS type: never taller than a label line.
  return pillHeight(shown * lineHeight(PILL_LABEL_SIZE, fontScale));
}

/** The column's height: every row, plus a gap between each pair. */
function stack(heights: number[]): number {
  return heights.reduce((sum, h) => sum + h, 0) + FAN_GAP * Math.max(0, heights.length - 1);
}

export function planFan(input: FanBudgetInput): FanPlan {
  const { windowWidth, windowHeight, fontScale, safeTop, chipName, doors, foods } = input;
  const pillMaxWidth = Math.min(PILL_MAX_WIDTH, windowWidth - FAN_RIGHT_INSET - FAN_LEFT_MARGIN);
  const available =
    windowHeight - safeTop - FAN_TOP_MARGIN - (FAB_BOTTOM + FAB_DISC + FAN_MARGIN_BOTTOM);

  const chip = chipName === null ? null : chipHeight(chipName, fontScale, pillMaxWidth);
  const doorHeights = doors.map((d) => doorHeight(d, fontScale, pillMaxWidth));
  const fixed = [...(chip === null ? [] : [chip]), ...doorHeights];

  // Step 1: keep the newest k foods, k from all of them down to none.
  for (let k = foods.length; k >= 0; k--) {
    const kept = foods.slice(0, k);
    const colliding = collidingIds(kept, fontScale, pillMaxWidth);
    const plans = kept.map((f) => ({
      id: f.id,
      numberOfLines: colliding.has(f.id) ? undefined : FOOD_LABEL_LINES,
    }));
    const height = stack([
      ...fixed,
      ...kept.map((f, i) => foodHeight(f, plans[i].numberOfLines, fontScale, pillMaxWidth)),
    ]);
    if (height <= available) {
      return { pillMaxWidth, foods: plans, available, height, scroll: false, scrollMaxHeight: null };
    }
  }

  // Step 2: the doors alone overflow. The chip pins; the doors scroll beneath it.
  return {
    pillMaxWidth,
    foods: [],
    available,
    height: stack(fixed),
    scroll: true,
    scrollMaxHeight: Math.max(PILL_MIN_HEIGHT, chip === null ? available : available - chip - FAN_GAP),
  };
}
