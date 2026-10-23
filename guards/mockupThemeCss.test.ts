// docs/mockups/theme.css is constants/theme.ts, and nothing else (CUL-1894).
//
// A build ready mock round takes its colours only from that stylesheet
// (.claude/rules/docs.md § the mock round contract), so a stale copy is a mock drawn
// in values the app no longer ships: the class that put a 3:1-failing teal on the FAB
// mock (CUL-1063). The file is generated; this guard reds the moment it and theme.ts
// disagree, in either direction (a theme edit not regenerated, or a hand edit to the
// css), and its message names the one command that repairs it.
import * as fs from 'fs';
import * as path from 'path';
import { theme, shadows } from '../constants/theme';
import { themeCss } from '../scripts/mockup-theme/themeCss';

const REPO_ROOT = path.resolve(__dirname, '..');
const CSS_PATH = path.join(REPO_ROOT, 'docs', 'mockups', 'theme.css');
const REGENERATE = 'node --no-warnings scripts/mockup-theme/emit.ts';

const committed = fs.readFileSync(CSS_PATH, 'utf8');
const expected = themeCss(theme, shadows);

describe('docs/mockups/theme.css matches constants/theme.ts (CUL-1894)', () => {
  // Non-vacuity: an empty generator and an empty file would agree.
  it('carries one custom property per theme token and per shadow', () => {
    const props = committed.match(/^ {2}--[\w-]+: .+;$/gm) ?? [];
    expect(props.length).toBe(Object.keys(theme).length + Object.keys(shadows).length);
    expect(committed).toContain(`  --colorAccent: ${theme.colorAccent};`);
    expect(committed).toContain(`  --space2: ${theme.space2}px;`);
  });

  it('is byte-identical to what the generator emits from theme.ts today', () => {
    if (committed !== expected) {
      throw new Error(
        [
          'docs/mockups/theme.css has diverged from constants/theme.ts.',
          '',
          `THE REPAIR: run \`${REGENERATE}\` and commit docs/mockups/theme.css in the same PR.`,
          'Never hand edit theme.css: it is generated, and the next run overwrites the edit.',
        ].join('\n'),
      );
    }
    expect(committed).toBe(expected);
  });

  it('refuses a token family it has no CSS unit for, rather than dropping it', () => {
    expect(() => themeCss({ zIndexSheet: 10 }, {})).toThrow(/zIndexSheet matches no token family/);
  });

  it('blends a shadow colour and its opacity into one rgba', () => {
    const css = themeCss(
      {},
      { x: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 } },
    );
    expect(css).toContain('  --shadow-x: 0px 2px 4px rgba(0, 0, 0, 0.2);');
  });
});
