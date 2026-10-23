// The widget's hand copied palette matches constants/theme.ts, entry for entry.
//
// CUL-2138 (PR-03a of CUL-1897, scope item 3) · the design system usage audit, CUL-1893.
//
// WHY. `widgets/CulpritWidget.tsx` cannot import the theme: its layout is stringified
// and evaluated in a bare JavaScriptCore context with no module graph
// (`.claude/rules/widgets.md`), so its palette `T` is a copy. Each entry names its
// `theme.*` token in a trailing comment so a drift is greppable, but nothing read the
// comment: a theme change left the widget on the old colour with every test green.
// This reads the comment and checks the value.
//
// WHAT IT CHECKS. Every entry of `const T = { … }` is one `key: '#hex', // theme.token`
// line; the token exists in `theme`, and its value equals the copy (case-insensitive).
// An entry with no token named is a failure, not a skip: a colour with no theme source
// is the drift this exists to stop, and so is a hex typed anywhere else in the file.
// Scope boundary: it checks the copy against the
// token the comment names, not that the comment names the RIGHT token for the role.

import * as fs from 'fs';
import * as path from 'path';
import { theme } from '../constants/theme';
import { blankComments } from './blankComments';

const WIDGET = path.resolve(__dirname, '..', 'widgets/CulpritWidget.tsx');
const source = fs.readFileSync(WIDGET, 'utf8');

const block = (() => {
  const start = source.indexOf('const T = {');
  const end = source.indexOf('\n  };', start);
  return start >= 0 && end > start ? source.slice(start, end) : '';
})();

const ENTRY = /^\s*(\w+):\s*'([^']*)',(.*)$/;
const entries = block
  .split('\n')
  .slice(1)
  .filter((line) => line.trim() !== '')
  .map((line) => {
    const m = line.match(ENTRY);
    const token = m?.[3].match(/\/\/\s*theme\.(\w+)/)?.[1] ?? null;
    return { line: line.trim(), key: m?.[1] ?? null, value: m?.[2] ?? null, token };
  });

const themeColours = theme as unknown as Record<string, unknown>;

// Every hex in the file's code (comments blanked) must sit inside `T`: a colour typed
// straight into the layout, or a second palette, is a copy nothing above checks.
const HEX = /['"`]#[0-9A-Fa-f]{3,8}['"`]/g;
const code = blankComments(source);
const tStart = code.indexOf('const T = {');
const tEnd = code.indexOf('\n  };', tStart);
const strayHex = [...code.matchAll(HEX)]
  .filter((m) => m.index < tStart || m.index > tEnd)
  .map((m) => `line ${code.slice(0, m.index).split('\n').length}: ${m[0]}`);

describe('the widget palette (CUL-2138)', () => {
  it('finds the palette (non-vacuity)', () => {
    expect(block).not.toBe('');
    expect(entries.length).toBeGreaterThanOrEqual(12);
    expect(entries.map((e) => e.key)).toEqual(expect.arrayContaining(['accent', 'surface', 'textPrimary', 'crescent']));
  });

  it('holds one `key: value, // theme.token` entry per line', () => {
    for (const e of entries) expect({ line: e.line, parsed: e.key !== null && e.token !== null }).toEqual({ line: e.line, parsed: true });
  });

  it('types no colour outside the palette', () => {
    expect(tStart).toBeGreaterThan(-1);
    expect(strayHex).toEqual([]);
  });

  it('copies each token verbatim from constants/theme.ts', () => {
    for (const e of entries) {
      const actual = e.token ? themeColours[e.token] : undefined;
      expect({ key: e.key, token: e.token, value: e.value?.toUpperCase() }).toEqual({
        key: e.key,
        token: e.token,
        value: typeof actual === 'string' ? actual.toUpperCase() : `<theme.${e.token} is not a colour token>`,
      });
    }
  });
});
