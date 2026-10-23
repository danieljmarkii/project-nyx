// The mock round's stylesheet, generated from constants/theme.ts (CUL-1894).
//
// A build ready round draws its colours, type, spacing, radii and shadows only from
// `docs/mockups/theme.css`, so a mock can no longer hold a value the app does not
// (the FAB teal that failed 3:1, CUL-1063, was a hex typed into a mock). Every token
// becomes a custom property named exactly like its key (`--colorAccent`, `--space2`,
// `--shadow-card`), so a frame's tag and its CSS read the same word as the code.
//
// Regenerate with `node --no-warnings scripts/mockup-theme/emit.ts`;
// guards/mockupThemeCss.test.ts fails when the committed file and theme.ts diverge.

type Token = string | number;
type TextStyle = { fontSize: number; fontWeight: string; lineHeight: number };
type Shadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
};

// A unit per token family, by key prefix. A key no family claims THROWS: a new kind
// of token is a decision about how a mock draws it, never a silent omission.
const FAMILIES: { prefix: RegExp; unit: (v: Token) => string }[] = [
  { prefix: /^color/, unit: (v) => String(v) },
  { prefix: /^font(Body|Display)/, unit: (v) => `'${v}'` },
  { prefix: /^(fontWeight|weight)/, unit: (v) => String(v) },
  { prefix: /^(text|lineHeight|space|radius|tracking|hitTarget)/, unit: (v) => `${v}px` },
  { prefix: /^duration/, unit: (v) => `${v}ms` },
  { prefix: /^(opacity|easing)/, unit: (v) => String(v) },
];

function cssValue(key: string, value: Token): string {
  const family = FAMILIES.find((f) => f.prefix.test(key));
  if (!family) {
    throw new Error(
      `themeCss: theme.${key} matches no token family in scripts/mockup-theme/themeCss.ts. ` +
        'Add its family (and its CSS unit) there, then regenerate docs/mockups/theme.css.',
    );
  }
  return family.unit(value);
}

function rgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`themeCss: shadowColor ${hex} is not a #rgb or #rrggbb hex`);
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// A named text style (constants/theme.ts `textStyles`) is a class, not a property, so a
// frame tags `class="textStyle-body"` with the same name the build passes as ThemedText's `variant`.
export function themeCss(
  theme: Record<string, Token>,
  shadows: Record<string, Shadow>,
  textStyles: Record<string, TextStyle> = {},
): string {
  const lines = [
    '/* GENERATED from constants/theme.ts by scripts/mockup-theme/emit.ts. Do not edit.',
    ' * Regenerate: node --no-warnings scripts/mockup-theme/emit.ts',
    ' * A build ready mock round takes every colour from here (.claude/rules/docs.md, CUL-1894). */',
    ':root {',
    ...Object.entries(theme).map(([key, value]) => `  --${key}: ${cssValue(key, value)};`),
    ...Object.entries(shadows).map(([key, s]) => {
      const { width, height } = s.shadowOffset;
      return `  --shadow-${key}: ${width}px ${height}px ${s.shadowRadius}px ${rgba(s.shadowColor, s.shadowOpacity)};`;
    }),
    '}',
    ...Object.entries(textStyles).map(
      ([name, t]) =>
        `.textStyle-${name} { font-size: ${t.fontSize}px; font-weight: ${t.fontWeight}; line-height: ${t.lineHeight}px; }`,
    ),
    '',
  ];
  return lines.join('\n');
}
