import { theme, textStyles } from './theme';

// The scale's holes, filled (CUL-1897 D3, ruled (a) 2026-10-23), and the named text
// styles that pair size, weight and line height. These pin the decisions a later edit
// could quietly undo: the half steps exist and sit on the 2pt sub-grid, the hit target
// is the 44pt floor, and every named style is built from tokens at a readable leading.

const tokensWithPrefix = (prefix: string) =>
  Object.entries(theme).filter(([k, v]) => k.startsWith(prefix) && typeof v === 'number') as [string, number][];

describe('the spacing scale', () => {
  it('carries the two half steps D3 added, 6 and 12', () => {
    expect(theme.space0_75).toBe(6);
    expect(theme.space1_5).toBe(12);
  });

  it('ascends in key order and never repeats a value', () => {
    const order = ['spaceMicro', 'space0_5', 'space0_75', 'space1', 'space1_5', 'space2', 'space3', 'space4', 'space5', 'space6'];
    expect(tokensWithPrefix('space').map(([k]) => k).sort()).toEqual([...order].sort());
    const values = order.map((k) => theme[k as keyof typeof theme] as number);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('the hit target', () => {
  it('is the 44pt floor (Apple HIG), not a spacing step', () => {
    expect(theme.hitTarget).toBe(44);
    expect(tokensWithPrefix('space').some(([, v]) => v === theme.hitTarget)).toBe(false);
  });
});

describe('the named text styles', () => {
  const lineHeights = new Set(tokensWithPrefix('lineHeight').map(([, v]) => v));
  const sizes = new Set(tokensWithPrefix('text').map(([, v]) => v));
  const weights = new Set([theme.weightRegular, theme.weightMedium, theme.weightSemibold]);

  it('are built only from scale tokens, never a hand typed number', () => {
    for (const [name, s] of Object.entries(textStyles)) {
      expect({ name, size: sizes.has(s.fontSize) }).toEqual({ name, size: true });
      expect({ name, leading: lineHeights.has(s.lineHeight) }).toEqual({ name, leading: true });
      expect({ name, weight: weights.has(s.fontWeight) }).toEqual({ name, weight: true });
    }
  });

  // Below ~1.25 a wrapped line's descenders meet the next line's ascenders; above ~1.5
  // a caption reads as two separate lines. The hand computed sites ran 1.3 to 1.45.
  it('set every leading between 1.25 and 1.5 times its size', () => {
    for (const [name, s] of Object.entries(textStyles)) {
      const ratio = s.lineHeight / s.fontSize;
      expect({ name, readable: ratio >= 1.25 && ratio <= 1.5 }).toEqual({ name, readable: true });
    }
  });

  it('give the caption paragraph the leading call sites computed by hand (textSM × 1.45)', () => {
    expect(textStyles.captionParagraph.lineHeight).toBe(Math.round(theme.textSM * 1.45));
  });
});
