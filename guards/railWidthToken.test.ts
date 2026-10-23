// The rail's width is one token (CUL-1900).
//
// `RAIL_WIDTH = 3` was typed four times (InsightCard, IncidentReadCard, HomeSilhouette,
// SpineNodeRow as SPINE_RAIL_WIDTH), and Home's card surface imported it backwards from
// a Home card. A silhouette that drew a rail its card did not was one edit away. Now
// each reads `theme.railWidth`; this pins that no rail width under app/ or components/
// is typed as a number again, and that the token still holds the width the rails drew.

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';
import { theme } from '../constants/theme';

const REPO_ROOT = path.resolve(__dirname, '..');

const DEFINITIONS = [
  'components/home/InsightCard.tsx',
  'components/event/IncidentReadCard.tsx',
  'components/surfaces/waits/HomeSilhouette.tsx',
  'components/dayRow/SpineNodeRow.tsx',
];

// `const RAIL_WIDTH = 3`, `export const SPINE_RAIL_WIDTH = 3.5`: a rail width typed by hand.
const TYPED = /\b[A-Z_]*RAIL_WIDTH\s*=\s*\d/;

function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('the rail width is one token (CUL-1900)', () => {
  it('holds the width the rails drew before the move (no visible change)', () => {
    expect(theme.railWidth).toBe(3);
  });

  it('each of the four definitions reads the token', () => {
    for (const rel of DEFINITIONS) {
      const src = blankComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
      expect({ rel, reads: /RAIL_WIDTH\s*=\s*theme\.railWidth\b/.test(src) }).toEqual({ rel, reads: true });
    }
  });

  it('no file under app/ or components/ types a rail width by hand', () => {
    const files = ['app', 'components'].flatMap((d) => walk(path.join(REPO_ROOT, d), []));
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((f) => TYPED.test(blankComments(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(REPO_ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('the surfaces folder no longer imports the width from a Home card', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'components/surfaces/home/HomeCard.tsx'), 'utf8');
    expect(src).not.toMatch(/from '\.\.\/\.\.\/home\/InsightCard'/);
  });
});
