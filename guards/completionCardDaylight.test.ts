// No on-dark ink is left on the daylight completion surfaces (CUL-1691 PR 1, spec §1 Rules).
//
// The three completion cards and the Snackbar moved from colorNeutralDark to white. Any
// text or divider style still holding an on-dark token would now paint white on white,
// or a hairline nobody can see: invisible on the screen, green in every rendered test
// that looks for words rather than colours. So the four tokens are banned from the four
// files outright, comments blanked first so the history a comment tells is not a hit.
//
// Scoped to the four files on purpose. Other surfaces sit on real dark grounds (the night
// ground, photo scrims, the dark button) and use these tokens correctly.

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';

const REPO_ROOT = path.resolve(__dirname, '..');

const DAYLIGHT_FILES = [
  'components/ui/MealCompletionCard.tsx',
  'components/ui/MedicationCompletionCard.tsx',
  'components/ui/NamedCompletionCard.tsx',
  'components/ui/Snackbar.tsx',
] as const;

const ON_DARK = /\b(colorTextOnDark|colorTextOnDarkSubtle|colorTextOnDarkFaint|colorDividerOnDark)\b/g;

/** Every on-dark token used in CODE in `src`, with its 1-based line. */
function onDarkInk(src: string): { token: string; line: number }[] {
  const code = blankComments(src);
  const hits: { token: string; line: number }[] = [];
  for (const m of code.matchAll(ON_DARK)) {
    hits.push({ token: m[1], line: code.slice(0, m.index).split('\n').length });
  }
  return hits;
}

describe('the daylight completion surfaces carry no on-dark ink (CUL-1691)', () => {
  it('detects each banned token, in code only', () => {
    expect(onDarkInk('const s = { a: { color: theme.colorTextOnDark } };').map((h) => h.token)).toEqual(['colorTextOnDark']);
    expect(onDarkInk('x(theme.colorTextOnDarkSubtle, theme.colorTextOnDarkFaint);\ny(theme.colorDividerOnDark);').map((h) => [h.token, h.line])).toEqual([
      ['colorTextOnDarkSubtle', 1],
      ['colorTextOnDarkFaint', 1],
      ['colorDividerOnDark', 2],
    ]);
    // A comment telling the history is not a site.
    expect(onDarkInk('// was theme.colorTextOnDark before CUL-1691\nconst a = 1;')).toEqual([]);
    // The daylight siblings and the unrelated muted / secondary on-dark tokens are not hits.
    expect(onDarkInk('theme.colorTextPrimary; theme.colorTextOnDarkMuted; theme.colorTextOnDarkSecondary;')).toEqual([]);
  });

  it.each(DAYLIGHT_FILES)('%s holds none of the four on-dark tokens', (rel) => {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    // Non-vacuity: the file is the surface it claims to be (it paints a card ground).
    expect(src).toMatch(/backgroundColor:/);
    expect(onDarkInk(src).map((h) => `${rel}:${h.line} ${h.token}`)).toEqual([]);
  });
});
