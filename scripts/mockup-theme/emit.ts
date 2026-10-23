// Writes docs/mockups/theme.css from constants/theme.ts (CUL-1894).
//
//   node --no-warnings scripts/mockup-theme/emit.ts
//
// Run it after any edit to constants/theme.ts; guards/mockupThemeCss.test.ts reds
// until you do. Node 22 strips the types itself, so no build step; it resolves no
// path alias either, which is why theme.ts is reached by a two-level relative path.
import * as fs from 'fs';
import * as path from 'path';
import { theme, shadows } from '../../constants/theme.ts';
import { themeCss } from './themeCss.ts';

const REPO_ROOT = path.resolve(path.dirname(process.argv[1]), '..', '..');
const OUT = path.join(REPO_ROOT, 'docs', 'mockups', 'theme.css');

fs.writeFileSync(OUT, themeCss(theme, shadows));
process.stdout.write(`wrote ${path.relative(REPO_ROOT, OUT)}\n`);
