import {
  ESTIMATE_HEADROOM,
  PET_TAB_FALLBACK_LABEL,
  PET_TAB_RUNGS,
  estimateLabelWidth,
  petTabAccessibilityLabel,
  resolvePetTabLabel,
  tabLabelBudget,
} from './petTabLabel';
import { theme } from '../constants/theme';

// The Pet tab's fallback ladder (CUL-599 / spec §1 D2). Three of these cases are
// acceptance criteria verbatim ("Schrodingers Cat" → "Pet"; "Bartholomew" → the
// 10pt rung; four tabs at 320pt without clip); the rest pin the invariants that
// make the ladder a ladder rather than a truncation.

const TAB_COUNT = 4;
// The narrowest width the app supports (iPhone SE 1st gen). Every AC that names a
// rung is stated against this frame, because it is the only width where the
// ladder's lower rungs are reachable for ordinary names.
const NARROWEST = 320;
const BUDGET_320 = tabLabelBudget(NARROWEST, TAB_COUNT);

const RUNG_FULL = PET_TAB_RUNGS[0];
const RUNG_TIGHT = PET_TAB_RUNGS[1];

describe('tabLabelBudget', () => {
  it('divides the window evenly and takes 6pt of padding off each side', () => {
    expect(BUDGET_320).toBe(320 / 4 - 12);
  });

  it('never returns a negative budget', () => {
    expect(tabLabelBudget(20, 4)).toBe(0);
    expect(tabLabelBudget(320, 0)).toBe(0);
  });
});

describe('the rungs', () => {
  it('are the two theme tokens, widest first, and nothing else', () => {
    expect(PET_TAB_RUNGS).toEqual([theme.textXS, theme.textTabLabelTight]);
    expect(RUNG_FULL).toBe(11);
    expect(RUNG_TIGHT).toBe(10);
  });
});

describe('resolvePetTabLabel — the acceptance criteria', () => {
  it('renders an ordinary name at the top rung on the narrowest phone', () => {
    expect(resolvePetTabLabel('Biscuit', BUDGET_320)).toEqual({
      text: 'Biscuit',
      fontSize: RUNG_FULL,
      isFallback: false,
    });
  });

  it('drops "Bartholomew" one rung — still the real name (AC)', () => {
    expect(resolvePetTabLabel('Bartholomew', BUDGET_320)).toEqual({
      text: 'Bartholomew',
      fontSize: RUNG_TIGHT,
      isFallback: false,
    });
  });

  it('falls back to "Pet" for "Schrodingers Cat" (AC)', () => {
    expect(resolvePetTabLabel('Schrodingers Cat', BUDGET_320)).toEqual({
      text: PET_TAB_FALLBACK_LABEL,
      fontSize: RUNG_FULL,
      isFallback: true,
    });
  });

  it('fits the three fixed labels beside it at 320pt', () => {
    // The AC's "four tabs render glyph+label at 320pt without clip" half that this
    // module owns: Home/History/Foods are fixed at the top rung and never ladder,
    // so they have to fit outright.
    ['Home', 'History', 'Foods'].forEach((label) => {
      expect(estimateLabelWidth(label, RUNG_FULL)).toBeLessThanOrEqual(BUDGET_320 * ESTIMATE_HEADROOM);
    });
  });

  it('lands near the mock’s stated calibration, and errs on the safe side of it', () => {
    // Mock round 2 §01: "At the narrowest supported width a tab fits ~12 characters,
    // so the fallback is the rare case, not the norm." Modelling the label's own
    // letter spacing — 0.4pt per character, which that eyeballed figure did not
    // account for — puts the real number at ~10, since tracking alone costs a
    // twelve-character name 4.8pt. The difference is in the direction this module
    // is required to err, so the mock's sentence stands as a design intent and this
    // is the measured version of it. If the advance table is ever retuned, this is
    // the claim that has to survive it.
    const fits = (n: number) =>
      estimateLabelWidth('a'.repeat(n), RUNG_FULL) <= BUDGET_320 * ESTIMATE_HEADROOM;
    expect(fits(10)).toBe(true);
    expect(fits(12)).toBe(false);
  });
});

describe('resolvePetTabLabel — invariants', () => {
  const NAMES = [
    'Biscuit',
    'Bartholomew',
    'Schrodingers Cat',
    'Nyx',
    'Mr. Wigglesworth III',
    'Lili',
    'Willow',
    'Mmmmmmmmmm',
    'Sir Pounce-a-lot',
    'A',
    '  Padded  ',
    'Ünïcödé Påw',
    '🐈 Mochi',
    '小白',
    '白い小さな猫',
    'ハッピー',
  ];
  const WIDTHS = [320, 360, 375, 390, 393, 414, 430, 744, 1024];

  it('never renders a truncation — the label is the whole name or the word "Pet"', () => {
    // The ruling's core: no ellipsis rung, never a mid-word cut. Anything that is
    // neither the trimmed name nor the fallback word is a truncation by definition.
    NAMES.forEach((name) => {
      WIDTHS.forEach((width) => {
        const { text } = resolvePetTabLabel(name, tabLabelBudget(width, TAB_COUNT));
        expect([name.trim(), PET_TAB_FALLBACK_LABEL]).toContain(text);
      });
    });
  });

  it('only ever renders at a declared rung', () => {
    NAMES.forEach((name) => {
      WIDTHS.forEach((width) => {
        const { fontSize } = resolvePetTabLabel(name, tabLabelBudget(width, TAB_COUNT));
        expect(PET_TAB_RUNGS).toContain(fontSize);
      });
    });
  });

  it('never renders a label estimated wider than its budget', () => {
    // The failure the ladder exists to prevent. Asserted over every name × width
    // rather than at the three AC points, because a clipped tab is a clipped tab
    // whichever pet caused it.
    NAMES.forEach((name) => {
      WIDTHS.forEach((width) => {
        const budget = tabLabelBudget(width, TAB_COUNT);
        const { text, fontSize } = resolvePetTabLabel(name, budget);
        expect(estimateLabelWidth(text, fontSize)).toBeLessThanOrEqual(budget);
      });
    });
  });

  it('is monotonic in width — a wider phone never renders a worse rung', () => {
    // A ladder that could jump back down on a larger screen would mean the bar
    // changed its mind on rotation. Rung quality = (not fallback, then larger font).
    const quality = (name: string, width: number) => {
      const { fontSize, isFallback } = resolvePetTabLabel(name, tabLabelBudget(width, TAB_COUNT));
      return isFallback ? 0 : fontSize;
    };
    NAMES.forEach((name) => {
      for (let i = 1; i < WIDTHS.length; i += 1) {
        expect(quality(name, WIDTHS[i])).toBeGreaterThanOrEqual(quality(name, WIDTHS[i - 1]));
      }
    });
  });

  it('is deterministic — the same pair always resolves the same way', () => {
    NAMES.forEach((name) => {
      const first = resolvePetTabLabel(name, BUDGET_320);
      expect(resolvePetTabLabel(name, BUDGET_320)).toEqual(first);
    });
  });

  it('rescues a name on a wider phone instead of falling back everywhere', () => {
    // The ladder is width-aware, not a per-name verdict. Two rescues, one per rung:
    // the name that drops to 10pt on an SE keeps its top rung on a modern phone…
    expect(resolvePetTabLabel('Bartholomew', tabLabelBudget(393, TAB_COUNT))).toEqual({
      text: 'Bartholomew',
      fontSize: RUNG_FULL,
      isFallback: false,
    });
    // …and the 16-char name that falls back entirely on an SE keeps its real name
    // on a Pro Max. (It still falls back at 393 — 16 characters plus tracking is
    // genuinely too wide for a quarter of that screen.)
    expect(resolvePetTabLabel('Schrodingers Cat', tabLabelBudget(430, TAB_COUNT))).toEqual({
      text: 'Schrodingers Cat',
      fontSize: RUNG_TIGHT,
      isFallback: false,
    });
  });

  it('trims surrounding whitespace rather than spending budget on it', () => {
    expect(resolvePetTabLabel('  Biscuit  ', BUDGET_320).text).toBe('Biscuit');
  });

  it('falls back for a missing or blank name instead of rendering a gap', () => {
    [null, undefined, '', '   '].forEach((name) => {
      expect(resolvePetTabLabel(name, BUDGET_320)).toEqual({
        text: PET_TAB_FALLBACK_LABEL,
        fontSize: RUNG_FULL,
        isFallback: true,
      });
    });
  });

  it('renders the fallback word itself at every supported width', () => {
    // The bottom of the ladder has to be reachable, or a narrow-enough tab renders
    // an over-wide "Pet" — the same clip, one rung lower.
    WIDTHS.forEach((width) => {
      expect(estimateLabelWidth(PET_TAB_FALLBACK_LABEL, RUNG_FULL)).toBeLessThanOrEqual(
        tabLabelBudget(width, TAB_COUNT),
      );
    });
  });
});

describe('estimateLabelWidth', () => {
  it('scales its glyph component with font size, but not its tracking', () => {
    // Letter spacing is a fixed point value per character — it does not grow with
    // the type — so the total is deliberately NOT proportional to font size. Pinned
    // because a "double the size, double the width" assumption is exactly what
    // would quietly drop the tracking term again.
    const tracking = 'Biscuit'.length * theme.trackingWide;
    const glyphsAt11 = estimateLabelWidth('Biscuit', 11) - tracking;
    const glyphsAt22 = estimateLabelWidth('Biscuit', 22) - tracking;
    expect(glyphsAt22).toBeCloseTo(glyphsAt11 * 2, 6);
    expect(estimateLabelWidth('Biscuit', 22)).toBeLessThan(estimateLabelWidth('Biscuit', 11) * 2);
  });

  it('charges full-width scripts about twice a Latin character', () => {
    // The gap that let a six-character Japanese name pass the fit test and then be
    // tail-cut by numberOfLines={1} — the one cut D2 forbids outright.
    expect(estimateLabelWidth('白', 11)).toBeGreaterThan(estimateLabelWidth('o', 11) * 1.7);
    expect(estimateLabelWidth('も', 11)).toBeGreaterThan(estimateLabelWidth('o', 11) * 1.7);
    expect(estimateLabelWidth('한', 11)).toBeGreaterThan(estimateLabelWidth('o', 11) * 1.7);
  });

  it('charges an emoji more than any Latin character', () => {
    // Measured once, as one code point — not as two half-width surrogate halves.
    expect(estimateLabelWidth('🐈', 11)).toBeGreaterThan(estimateLabelWidth('M', 11));
  });

  it('charges an accented capital as a capital, not as lowercase', () => {
    // An A–Z range check is ASCII-only, so Ü/É/Ñ used to fall through to the
    // lowercase default despite rendering as wide as U/E/N.
    ['Ü', 'É', 'Ñ', 'Ø'].forEach((upper) => {
      expect(estimateLabelWidth(upper, 11)).toBeCloseTo(estimateLabelWidth('N', 11), 6);
    });
    expect(estimateLabelWidth('ü', 11)).toBeLessThan(estimateLabelWidth('Ü', 11));
  });

  it('is additive over characters', () => {
    expect(estimateLabelWidth('Bis', 11) + estimateLabelWidth('cuit', 11)).toBeCloseTo(
      estimateLabelWidth('Biscuit', 11),
      6,
    );
  });

  it('separates narrow, default and wide characters', () => {
    // The reason for a class table rather than one average: these three would
    // otherwise measure identically, and they differ by more than a whole rung.
    const narrow = estimateLabelWidth('llllllllll', 11);
    const middle = estimateLabelWidth('oooooooooo', 11);
    const wide = estimateLabelWidth('mmmmmmmmmm', 11);
    expect(narrow).toBeLessThan(middle);
    expect(middle).toBeLessThan(wide);
  });

  it('treats a capital I as narrow and a capital M as wide', () => {
    expect(estimateLabelWidth('I', 11)).toBeLessThan(estimateLabelWidth('N', 11));
    expect(estimateLabelWidth('M', 11)).toBeGreaterThan(estimateLabelWidth('N', 11));
  });

  it('measures the empty string as zero', () => {
    expect(estimateLabelWidth('', 11)).toBe(0);
  });
});

describe('petTabAccessibilityLabel', () => {
  it('always speaks the full name, even at the rung that renders "Pet"', () => {
    // The half of the ladder that makes the fallback acceptable (AC: VoiceOver
    // reads the full name in every rung).
    const budget = BUDGET_320;
    expect(resolvePetTabLabel('Schrodingers Cat', budget).text).toBe(PET_TAB_FALLBACK_LABEL);
    expect(petTabAccessibilityLabel('Schrodingers Cat')).toBe('Schrodingers Cat — pet profile');
  });

  it('names the pet at the top rung too', () => {
    expect(petTabAccessibilityLabel('Biscuit')).toBe('Biscuit — pet profile');
  });

  it('degrades to a generic label when there is no name to speak', () => {
    [null, undefined, '  '].forEach((name) => {
      expect(petTabAccessibilityLabel(name)).toBe('Pet profile');
    });
  });
});
