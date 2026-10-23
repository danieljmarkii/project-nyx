// No photo pick asks for the whole library first (CUL-1840 · App Review 5.1.1(iii)).
//
// WHY THIS FILE EXISTS. Six photo paths each asked for the media-library grant before
// opening the picker: the event log (`lib/photoSource.ts`), food and medication capture,
// food and medication detail, and vet documents. The system picker runs out of process
// and hands back only the photo the owner chose, so the grant bought nothing but a
// permission prompt App Review reads as collecting more than the app needs. The ask was
// copied path to path, so the next photo surface would copy it again: this scan fails
// the build the day one does.
//
// SCOPE — every non-test `.ts` / `.tsx` under app/, components/, hooks/, lib/ and store/,
// comments blanked so a sentence ABOUT the call never reads as one. The camera grant is
// untouched: a camera photo still needs it.
//
// ESCAPE HATCH: `// library-ask-ok: <reason>` on the call's line or the one above, for a
// surface that genuinely reads the library itself (none today).

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store'];
const CALL = /\brequestMediaLibraryPermissionsAsync\s*\(/g;
const EXEMPT = /\/\/[ \t]*library-ask-ok:[ \t]*\S/;

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
}

/** Every unexempted library-permission call under `root`, as `rel:line`. */
function findAsks(root: string): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);
  const hits: string[] = [];
  for (const abs of files) {
    const raw = fs.readFileSync(abs, 'utf8');
    if (!raw.includes('requestMediaLibraryPermissionsAsync')) continue;
    const code = blankComments(raw);
    const rawLines = raw.split('\n');
    for (const m of code.matchAll(CALL)) {
      const line = code.slice(0, m.index).split('\n').length;
      const window = rawLines.slice(Math.max(0, line - 2), line).join('\n');
      if (EXEMPT.test(window)) continue;
      hits.push(`${path.relative(root, abs)}:${line}`);
    }
  }
  return hits;
}

describe('photo picks never ask for the whole library (CUL-1840)', () => {
  it('no source file calls requestMediaLibraryPermissionsAsync', () => {
    expect(findAsks(ROOT)).toEqual([]);
  });

  describe('the detector', () => {
    let root: string;
    beforeEach(() => {
      root = createFixtureRoot('photo-library-ask');
    });
    afterEach(() => removeFixtureRoot(root));

    it('finds a real call', () => {
      writeFixture(
        root,
        'app/pick.tsx',
        'async function f() {\n  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();\n}\n',
      );
      expect(findAsks(root)).toEqual(['app/pick.tsx:2']);
    });

    it('ignores a comment that names the call', () => {
      writeFixture(root, 'lib/note.ts', '// we used to call requestMediaLibraryPermissionsAsync() here\nexport {};\n');
      expect(findAsks(root)).toEqual([]);
    });

    it('honours a reasoned exemption, and only a reasoned one', () => {
      writeFixture(
        root,
        'lib/ok.ts',
        '// library-ask-ok: reads the camera roll itself\nImagePicker.requestMediaLibraryPermissionsAsync();\n',
      );
      writeFixture(root, 'lib/bare.ts', '// library-ask-ok:\nImagePicker.requestMediaLibraryPermissionsAsync();\n');
      expect(findAsks(root)).toEqual(['lib/bare.ts:2']);
    });

    it('skips test files, which mock the call', () => {
      writeFixture(root, 'lib/x.test.ts', 'ImagePicker.requestMediaLibraryPermissionsAsync();\n');
      expect(findAsks(root)).toEqual([]);
    });
  });
});
