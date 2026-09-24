// One navigation header (B-075, CUL-399). components/ui/Header.tsx replaced the top
// bars the pushed and modal screens once drew by hand; CUL-399 moved the last two local
// copies (app/food-capture.tsx, app/medication-capture.tsx) onto it. This keeps a
// screen from growing its own again under the same name, which is how both copies
// outlived the migration: each was a private `function Header` that read, at its call
// sites, like the shared one.
//
// BLIND SPOT, stated so it does not read as coverage (C-38): a bar drawn inline, or a
// component under another name, is not seen. The scan is for the shape that recurred.

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components'];
const SHARED = 'components/ui/Header.tsx';

/** A component DECLARED as `Header`: a function, or a const bound to one. */
const DECLARES_HEADER = /\bfunction\s+Header\s*[(<]|\bconst\s+Header\s*(?::[^=]+)?=/;

function declaresHeader(src: string): boolean {
  return DECLARES_HEADER.test(blankComments(src));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

describe('one navigation header (B-075)', () => {
  it('no screen or component declares its own Header beside the shared one', () => {
    const local = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
      .filter((rel) => rel !== SHARED)
      .filter((rel) => declaresHeader(fs.readFileSync(path.join(ROOT, rel), 'utf8')))
      .sort();
    // A hit is a screen drawing its own top bar again. Use components/ui/Header
    // (`leading="back" | "close"`, `right` for a trailing action, `left` for the rare
    // text button) rather than a local copy.
    expect(local).toEqual([]);
  });

  it('the shared Header still declares itself, so the scan can see the shape it forbids', () => {
    expect(declaresHeader(fs.readFileSync(path.join(ROOT, SHARED), 'utf8'))).toBe(true);
  });

  it('red-check: both declaration shapes count; an import, a mention or a longer name does not', () => {
    expect(declaresHeader('function Header({ title }: { title: string }) {')).toBe(true);
    expect(declaresHeader('const Header = ({ title }: Props) => null;')).toBe(true);
    expect(declaresHeader('const Header: React.FC<Props> = () => null;')).toBe(true);
    expect(declaresHeader("import { Header } from '../components/ui';")).toBe(false);
    expect(declaresHeader('// function Header() was the local copy')).toBe(false);
    expect(declaresHeader('function HomeHeader() {}')).toBe(false);
    expect(declaresHeader('function HeaderRow() {}')).toBe(false);
  });
});
