// The Pet tab's fallback ladder (CUL-599; spec §1, D2 / mock round 2 §01 R2-1).
//
// D1 made the Pet tab the pet — their avatar and their NAME as the label — which
// hands the bar a string it does not control. The ruled answer to a long name on a
// small phone is a ladder, never a truncation: the full name at 11pt, else the full
// name at 10pt, else the literal word "Pet". There is no ellipsis rung. A name is
// never cut mid-word, because a half-name is a worse answer than a generic one — the
// avatar carries the identity in every rung, and the full name always rides the
// accessibility label (NyxTabBar), so VoiceOver never says "Pet" when the pet is
// Schrodingers Cat.
//
// WHY A CHARACTER BUDGET, NOT onTextLayout. Both were sanctioned ("implementation's
// choice, deterministic either way"). A real measurement pass has to render a rung to
// learn it does not fit, so the bar would visibly settle on first paint and on every
// pet switch — and it is untestable in jest, which has no layout engine. A budget is
// pure, unit-testable against the ruled acceptance cases, and decides before the first
// frame. Its cost is that it is an ESTIMATE: the advances below are Geist SemiBold's,
// and a wrong one moves a name by a rung. That failure is bounded on purpose — the two
// directions are "shows the real name one point smaller" and "shows the calm word
// Pet", never a clipped or wrapped row (NyxTabBar also pins numberOfLines={1}).

export const PET_TAB_FALLBACK_LABEL = 'Pet';

// The two rungs that show the real name, largest first.
export const PET_TAB_LABEL_SIZES = [11, 10] as const;

// Breathing room reserved on EACH side of the label inside its tab, so a name never
// runs up against its neighbour's. This is the figure the ladder's ruled acceptance
// cases are calibrated to: at 320pt (an 80pt tab, 68pt usable) "Bartholomew" misses
// the 11pt rung and makes the 10pt one, exactly as R2-1 draws it.
export const PET_TAB_SIDE_PADDING = 6;

export interface PetTabLabel {
  /** What the tab renders — the pet's name, or the literal "Pet". */
  text: string;
  /** The rung's point size. Fixed per rung so the row's height never moves. */
  fontSize: number;
  /** True when the ladder ran out of rungs and fell back to the generic word. */
  isFallback: boolean;
}

// ── The width budget ────────────────────────────────────────────────────────────
// Advances in em, matched to Geist SemiBold (the label's active face; the inactive
// medium face is fractionally narrower, so measuring the bold one errs toward the
// safer rung). Only the characters that differ materially from their category are
// listed — everything else resolves through the category defaults below.
const UPPERCASE_EM = 0.68;
const LOWERCASE_EM = 0.58;
const DIGIT_EM = 0.6;
// Anything outside the Latin/Greek/Cyrillic block — CJK, Hangul, emoji — is drawn on
// a roughly square body. Guessing Latin width for those would under-measure a name
// badly enough to clip, which is the one outcome the ladder exists to prevent.
const WIDE_SCRIPT_EM = 1.0;
const WIDE_SCRIPT_MIN_CODE_POINT = 0x1100;

const ADVANCE_EM: Record<string, number> = {
  // Narrow lowercase.
  i: 0.3, j: 0.3, l: 0.3, f: 0.38, r: 0.4, t: 0.4,
  c: 0.52, s: 0.52, z: 0.52, v: 0.54, x: 0.54, y: 0.54,
  // Wide lowercase.
  m: 0.9, w: 0.82,
  // Uppercase that departs from the 0.68 default.
  I: 0.3, J: 0.5, M: 0.92, W: 0.92,
  // Punctuation and separators that turn up in real pet names.
  ' ': 0.28, '-': 0.4, "'": 0.26, '’': 0.26, '.': 0.3, ',': 0.3,
  '(': 0.38, ')': 0.38, '&': 0.7,
};

function advanceEm(char: string): number {
  const override = ADVANCE_EM[char];
  if (override !== undefined) return override;

  const code = char.codePointAt(0) ?? 0;
  if (code >= WIDE_SCRIPT_MIN_CODE_POINT) return WIDE_SCRIPT_EM;
  if (char >= '0' && char <= '9') return DIGIT_EM;
  if (char >= 'A' && char <= 'Z') return UPPERCASE_EM;
  // Lowercase Latin, and the sane default for accented and non-Latin-alphabet
  // letters (Cyrillic, Greek) whose advances sit in the same band.
  return LOWERCASE_EM;
}

/**
 * Estimated rendered width, in points, of `text` at `fontSize`.
 *
 * `letterSpacing` is a point value in React Native, not an em one, so it is added per
 * character rather than scaled with the size — which is exactly why the Pet tab's
 * label drops it (see NyxTabBar): a fixed 0.4pt per character costs the same 4.4pt at
 * both rungs, and on a 320pt phone that is most of the headroom the 10pt rung has.
 */
export function estimateLabelWidth(text: string, fontSize: number, letterSpacing = 0): number {
  const chars = Array.from(text);
  const em = chars.reduce((total, char) => total + advanceEm(char), 0);
  return em * fontSize + chars.length * letterSpacing;
}

// One entry per name × width. Bounded rather than unbounded: an account has a handful
// of pets and a device has one or two widths, so this never legitimately grows — the
// cap is there so a pathological caller cannot turn a cache into a leak.
const CACHE_LIMIT = 64;
const cache = new Map<string, PetTabLabel>();

/**
 * Resolve the Pet tab's label for `name` inside a tab `tabWidth` points wide.
 *
 * Deterministic: the same pair always produces the same rung, so the bar cannot
 * render one thing on mount and another after a re-render.
 */
export function resolvePetTabLabel(name: string, tabWidth: number): PetTabLabel {
  const trimmed = name.trim();
  // Width first: it is a number, so the colon that follows it can never be part of
  // the width, and no name/width pair can collide with another.
  const key = `${tabWidth}:${trimmed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const resolved = computePetTabLabel(trimmed, tabWidth);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, resolved);
  return resolved;
}

function computePetTabLabel(trimmedName: string, tabWidth: number): PetTabLabel {
  const fallback: PetTabLabel = {
    text: PET_TAB_FALLBACK_LABEL,
    fontSize: PET_TAB_LABEL_SIZES[0],
    isFallback: true,
  };

  // An unnamed pet, or a tab we have no width for yet, gets the generic word rather
  // than an empty label.
  const available = tabWidth - PET_TAB_SIDE_PADDING * 2;
  if (!trimmedName || available <= 0) return fallback;

  for (const fontSize of PET_TAB_LABEL_SIZES) {
    if (estimateLabelWidth(trimmedName, fontSize) <= available) {
      return { text: trimmedName, fontSize, isFallback: false };
    }
  }
  return fallback;
}

/** Test seam — the cache is module state, so a suite can start from a known one. */
export function clearPetTabLabelCache(): void {
  cache.clear();
}
