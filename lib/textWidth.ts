/**
 * Synchronous text-width estimation for the app's Geist chrome.
 *
 * Extracted from `lib/petTabLabel.ts` (CUL-599) when the Home header (CUL-600) needed
 * the same measurement for its own name ladder. The table is the reason for the
 * extraction rather than an accident of it: two copies of a character table are how
 * two surfaces quietly stop agreeing about the width of the same pet's name — the
 * same argument that moved `GlyphSvg` out of the event family. One table, two
 * consumers.
 *
 * ── Why estimate at all ───────────────────────────────────────────────
 *
 * `onTextLayout` measures truthfully, but only AFTER a first paint — so a surface
 * deciding a font size from it renders at the top rung and then visibly reflows, on
 * every cold start and every pet switch, to compute something that is FIXED for a
 * given (text, width) pair. A synchronous estimate has no first frame to get wrong,
 * and being pure, its behaviour is pinned by tests instead of by whichever device
 * someone happens to be holding.
 *
 * ── The limit of what it promises, stated rather than implied ─────────────
 *
 * The table models Latin (the class table below), the full-width scripts and astral
 * code points named in `isFullWidth`/`advanceEm`, and a caller-supplied letter
 * spacing. It is NOT a claim about scripts nobody has modelled — an estimate cannot
 * promise what it has not measured. A script that renders wider than Latin and is
 * not named below is under-charged. Callers must therefore decide what an
 * under-estimate COSTS them and bias accordingly (the Pet tab spends a headroom
 * fraction because its cost is a mid-word cut; the Home header does not, because its
 * cost is one point size — see each module's own note). If a real name ever
 * under-charges, the fix is a new class here, not a wider headroom: headroom is for
 * noise, not for a script.
 */

/**
 * Required headroom on a width estimate, as a fraction of the available budget.
 *
 * 4%. The class table below approximates Geist's advances rather than measuring
 * them, so every consumer carries a residual error — and every consumer's two error
 * directions cost different amounts. Over-estimating drops text a rung early;
 * under-estimating renders it wider than the space it was fitted to, which is the
 * failure a ladder exists to prevent. Spending the residual on the safe side is
 * therefore the same decision on every surface, which is why the number lives with
 * the table and not with one of its callers.
 *
 * Its value is checked at the surfaces that turn on it (the Pet tab's rungs against
 * the mock's stated "~12 characters at the narrowest supported width"), not here —
 * a constant cannot verify its own calibration.
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
const ADVANCE_FULL_WIDTH = 1.0; // CJK, kana, hangul, full-width forms — one em by design
const ADVANCE_ASTRAL = 1.2; // emoji and other astral-plane code points, which render wider

const NARROW_CHARS = "iljI.,'!:;| ";
const SEMI_NARROW_CHARS = 'frt()[]{}/\\-"';
const WIDE_CHARS = 'mMW';

/**
 * Whether a code point belongs to a script whose glyphs are drawn on a full-width
 * em square (CJK ideographs, kana, hangul, the full-width Latin forms).
 *
 * Without this every such character was charged the Latin default of 0.52em —
 * roughly HALF its true advance — so a six-character Japanese name passed the fit
 * test and was then tail-cut by the label's `numberOfLines={1}`. That is a mid-word
 * cut, which is the one thing D2 forbids outright: the ladder would itself have
 * caused the failure it exists to prevent. Charging a full em is the safe direction.
 */
function isFullWidth(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) || // CJK radicals … Yi (incl. kana)
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK compatibility ideographs
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) || // CJK compatibility forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // full-width forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) // full-width signs
  );
}

function advanceEm(char: string): number {
  // Order matters: `I` is narrow despite being a capital, and `M`/`W` are wide
  // despite the same. The specific classes are checked before the general one.
  if (NARROW_CHARS.includes(char)) return ADVANCE_NARROW;
  if (SEMI_NARROW_CHARS.includes(char)) return ADVANCE_SEMI_NARROW;
  if (WIDE_CHARS.includes(char)) return ADVANCE_WIDE;
  if (char === 'w') return ADVANCE_SEMI_WIDE;

  // Beyond ASCII the class strings stop covering anything, so the cases that are
  // reliably WIDER than the default are named rather than silently under-charged.
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint > 0xffff) return ADVANCE_ASTRAL;
  if (isFullWidth(codePoint)) return ADVANCE_FULL_WIDTH;

  // Capitals, tested by case rather than by an A–Z range: `Ü`, `É`, `Ñ` and `Ø` are
  // as wide as `U`, and an ASCII-only range charged every one of them the lowercase
  // default. European names are the common non-ASCII case, so this is the branch
  // that matters most in practice.
  if (char !== char.toLowerCase() && char === char.toUpperCase()) return ADVANCE_UPPER;

  return ADVANCE_DEFAULT;
}

/**
 * Estimated rendered width of `text` at `fontSize`, in points.
 *
 * `letterSpacing` is a REQUIRED argument rather than a defaulted one, because it is
 * not a rounding detail and a caller that forgets it gets a silently narrow answer:
 * the Pet tab renders at `trackingWide`, and 0.4pt across a twelve-character name is
 * 4.8pt — larger than the headroom meant to absorb the entire estimate's error, in
 * the one direction that module may not err. The Home header's name carries no
 * tracking and passes 0. Making each caller state its own means neither inherits the
 * other's typography by omission.
 *
 * Charged per code point INCLUDING the last (RN's iOS text layout adds trailing
 * spacing), which is the conservative reading.
 *
 * Exported for the tests, which assert the calibration directly rather than only
 * through the rungs it produces — a table that drifts should fail loudly at the
 * character it drifted on, not silently at some future pet's name.
 */
export function estimateTextWidth(text: string, fontSize: number, letterSpacing: number): number {
  let em = 0;
  let count = 0;
  // Iterating the string yields whole code points, so an astral character (an emoji
  // in a pet's name) is measured once rather than as two half-width halves.
  for (const char of text) {
    em += advanceEm(char);
    count += 1;
  }
  return em * fontSize + count * letterSpacing;
}
