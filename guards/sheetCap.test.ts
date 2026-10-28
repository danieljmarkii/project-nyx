// Every Modal is held to the column (CUL-2243).
//
// A `<Modal>` presents in its own window, outside the root `LayoutColumn`, so on the
// unfolded Duo whatever it draws spans the whole canvas unless it is held in. Three shapes
// are held:
//   - `transparent`: a sheet, card or menu over a scrim. Its panel takes `useSheetCap()`
//     (`hooks/useLayoutClass.ts`), the one cap, so the scrim still spans the window.
//   - `presentationStyle="pageSheet"`: the platform presents it as a card at regular
//     width on its own (the issue's item 2, verified on the device in CUL-2247).
//   - anything else is full screen, and wraps its content in `LayoutColumn`.
// A file that renders the shape and not its hold reds here.
//
// WHAT IT READS. Every `.tsx` under app/ and components/ (tests aside), parsed: each JSX
// element named `Modal`, its `transparent` and `presentationStyle` attributes, and whether
// the FILE calls `useSheetCap(` or renders `<LayoutColumn`. File-level on purpose: a panel
// split from its Modal wrapper in the same file (`PetSwitcherPanel`) takes the cap in the
// panel. A Modal whose panel lives in ANOTHER file is not seen through; none does today.
//
// BLIND SPOT, stated: the guard sees that the cap is called, not that it reaches the panel
// rather than some other View. The captures at 626 and 890 are what show the panel.
//
// THE REGISTRY is an exemption (C-32): full-screen media that should span the window,
// each with its reason. It ratchets: an entry that no longer renders a bare full-screen
// Modal reds.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCANNED = ['app', 'components'];

const REGISTRY: Record<string, string> = {
  'components/ui/PhotoViewer.tsx': 'a photo viewer: the photo takes the whole window, as the Photos app does',
  'components/vetfiles/DocumentPdfViewer.tsx': 'a document viewer: the page takes the whole window, as Files does',
};

type Shape = 'transparent' | 'pageSheet' | 'fullScreen';

function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

export interface ModalUse {
  shapes: Shape[];
  callsCap: boolean;
  rendersColumn: boolean;
}

export function modalUse(src: string, fileName = 'file.tsx'): ModalUse {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: ModalUse = { shapes: [], callsCap: false, rendersColumn: false };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tag === 'LayoutColumn') out.rendersColumn = true;
      if (tag === 'Modal') {
        let shape: Shape = 'fullScreen';
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr)) continue;
          const name = attr.name.getText(sf);
          const init = attr.initializer;
          // `transparent` alone, or `transparent={true}`; `transparent={false}` is not.
          if (name === 'transparent' && (!init || init.getText(sf) !== '{false}')) shape = 'transparent';
          if (name === 'presentationStyle' && shape !== 'transparent' && init && /pageSheet|formSheet/.test(init.getText(sf))) shape = 'pageSheet';
        }
        out.shapes.push(shape);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useSheetCap') out.callsCap = true;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** What the file is missing, or null when every Modal in it is held. */
export function missingHold(use: ModalUse): string | null {
  if (use.shapes.includes('transparent') && !use.callsCap) return 'a transparent Modal with no useSheetCap()';
  if (use.shapes.includes('fullScreen') && !use.rendersColumn) return 'a full-screen Modal with no LayoutColumn';
  return null;
}

const files = SCANNED.flatMap((d) => walk(path.join(REPO_ROOT, d), [])).map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'));
const uses = new Map(files.map((rel) => [rel, modalUse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'), rel)]));

describe('the detector', () => {
  it.each([
    ['a bare transparent sheet', '<Modal visible transparent><View style={styles.sheet} /></Modal>', 'a transparent Modal with no useSheetCap()'],
    ['transparent={true}', '<Modal transparent={true} />', 'a transparent Modal with no useSheetCap()'],
    ['a bare full-screen Modal', '<Modal visible animationType="slide"><View /></Modal>', 'a full-screen Modal with no LayoutColumn'],
    ['transparent={false}', '<Modal transparent={false}><View /></Modal>', 'a full-screen Modal with no LayoutColumn'],
    ['a capped sheet beside a bare full-screen one', 'const c = useSheetCap();\n<><Modal transparent /><Modal /></>', 'a full-screen Modal with no LayoutColumn'],
  ])('reds %s', (_label, src, why) => {
    expect(missingHold(modalUse(src))).toBe(why);
  });

  it.each([
    ['a capped sheet', 'const c = useSheetCap();\n<Modal transparent><View style={[styles.sheet, c]} /></Modal>'],
    ['a page sheet', '<Modal visible presentationStyle="pageSheet"><View /></Modal>'],
    ['a full-screen Modal in the column', '<Modal visible><LayoutColumn><View /></LayoutColumn></Modal>'],
    ['a Modal named only in a comment', '// a <Modal transparent> would span the window\nconst x = 1;'],
  ])('passes %s', (_label, src) => {
    expect(missingHold(modalUse(src))).toBeNull();
  });
});

describe('every Modal is held to the column (CUL-2243)', () => {
  it('scans the app (non-vacuity)', () => {
    const withModal = [...uses].filter(([, u]) => u.shapes.length > 0);
    expect(withModal.length).toBeGreaterThan(25);
    expect(withModal.filter(([, u]) => u.shapes.includes('transparent')).length).toBeGreaterThan(15);
  });

  it('finds no unheld Modal outside the registry', () => {
    const offenders = [...uses]
      .filter(([rel]) => !(rel in REGISTRY))
      .map(([rel, u]) => [rel, missingHold(u)] as const)
      .filter(([, why]) => why !== null)
      .map(([rel, why]) => `${rel}: ${why}`);
    expect(offenders).toEqual([]);
  });

  it('keeps no stale registry entry (it ratchets)', () => {
    const stale = Object.keys(REGISTRY).filter((rel) => {
      const u = uses.get(rel);
      return !u || missingHold(u) !== 'a full-screen Modal with no LayoutColumn';
    });
    expect(stale).toEqual([]);
  });
});
