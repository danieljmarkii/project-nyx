// Pet photos load through signed links, never a public URL (CUL-1856).
//
// WHY THIS FILE EXISTS. CUL-594 was ruled private on 2026-10-12 (CUL-1825): the
// pet photo bucket stops serving public reads, and from that moment a public URL
// is a blank disc on every screen that shows the pet. This PR moved both
// renderers (the avatar disc and the Pet profile hero) onto lib/storage.ts's
// signed-link cache and deleted `getPublicUrl`. A public read is one line to
// write back, so this scan fails the build the day one returns.
//
// TWO RULES, one scan:
//   1. No source file calls `getPublicUrl(` (the SDK method or a helper of that
//      name). Every bucket this app reads is private or about to be.
//   2. The bucket's name is spelled in lib/storage.ts and nowhere else, so every
//      read of it goes through `PET_PHOTOS_BUCKET` and the signed-link cache
//      beside it. A second spelling is a second read path the cache cannot see.
//
// SCOPE — every non-test `.ts` / `.tsx` under app/, components/, hooks/, lib/,
// store/ and widgets/, comments blanked so a sentence ABOUT the call never reads
// as one. supabase/ is out: delete-account names the bucket server-side to purge
// it, which is not a read.
//
// ESCAPE HATCH: `// public-url-ok: <reason>` on the line or the one above, for a
// bucket ruled public on purpose (none today).

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store', 'widgets'];
const PUBLIC_READ = /\bgetPublicUrl\s*\(/g;
const BUCKET = /nyx-pet-photos/g;
const BUCKET_HOME = 'lib/storage.ts';
const EXEMPT = /\/\/[ \t]*public-url-ok:[ \t]*\S/;

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
}

/** Every unexempted public read, and every bucket spelling outside its home, as `rel:line`. */
function findPublicReads(root: string): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);
  const hits: string[] = [];
  for (const abs of files) {
    const raw = fs.readFileSync(abs, 'utf8');
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (!raw.includes('getPublicUrl') && !raw.includes('nyx-pet-photos')) continue;
    const code = blankComments(raw);
    const rawLines = raw.split('\n');
    const report = (index: number | undefined) => {
      const line = code.slice(0, index).split('\n').length;
      const window = rawLines.slice(Math.max(0, line - 2), line).join('\n');
      if (!EXEMPT.test(window)) hits.push(`${rel}:${line}`);
    };
    for (const m of code.matchAll(PUBLIC_READ)) report(m.index);
    if (rel !== BUCKET_HOME) for (const m of code.matchAll(BUCKET)) report(m.index);
  }
  return hits;
}

describe('pet photos load through signed links only (CUL-1856)', () => {
  it('no source file reads a public URL or spells the bucket outside lib/storage.ts', () => {
    expect(findPublicReads(ROOT)).toEqual([]);
  });

  it('the bucket is still spelled in its home, so rule 2 is not guarding nothing', () => {
    const home = blankComments(fs.readFileSync(path.join(ROOT, BUCKET_HOME), 'utf8'));
    expect(home).toMatch(/export const PET_PHOTOS_BUCKET = 'nyx-pet-photos'/);
  });

  describe('the detector', () => {
    let root: string;
    beforeEach(() => {
      root = createFixtureRoot('pet-photo-signed-only');
    });
    afterEach(() => removeFixtureRoot(root));

    it('finds an SDK public read', () => {
      writeFixture(
        root,
        'components/Hero.tsx',
        "const x = 1;\nconst { data } = supabase.storage.from(BUCKET).getPublicUrl(path);\n",
      );
      expect(findPublicReads(root)).toEqual(['components/Hero.tsx:2']);
    });

    it('finds the bucket spelled outside lib/storage.ts, and allows it there', () => {
      writeFixture(root, 'app/x.tsx', "const B = 'nyx-pet-photos';\n");
      writeFixture(root, 'lib/storage.ts', "export const PET_PHOTOS_BUCKET = 'nyx-pet-photos';\n");
      expect(findPublicReads(root)).toEqual(['app/x.tsx:1']);
    });

    it('ignores a comment that names either', () => {
      writeFixture(root, 'lib/note.ts', '// we used getPublicUrl() on nyx-pet-photos here\nexport {};\n');
      expect(findPublicReads(root)).toEqual([]);
    });

    it('honours a reasoned exemption, and only a reasoned one', () => {
      writeFixture(root, 'lib/ok.ts', '// public-url-ok: a bucket ruled public\nstore.getPublicUrl(p);\n');
      writeFixture(root, 'lib/bare.ts', '// public-url-ok:\nstore.getPublicUrl(p);\n');
      expect(findPublicReads(root)).toEqual(['lib/bare.ts:2']);
    });

    it('skips test files, which mock the call', () => {
      writeFixture(root, 'lib/x.test.ts', 'getPublicUrl(p);\n');
      expect(findPublicReads(root)).toEqual([]);
    });
  });
});
