// The record-pet-name guard (CUL-574 · CUL-626 · CUL-659 · CUL-711).
//
// WHY THIS FILE EXISTS. A surface displaying one RECORD — an event, a dose, a
// completion payload, the meal a retroactive combo is added to — names its pet from
// the id the record carries, through `resolveRecordPetName` (store/petStore.ts). That
// helper has NO active-pet rung on purpose: `pets` holds only non-archived pets, and
// every store mutator keeps `activePet` a member of `pets`, so the lookup can only miss
// when the record's pet is NOT the active pet either. An `?? activePet?.name` fallback
// behind such a lookup is therefore wrong 100% of the times it is taken: it names a
// different animal, with confidence, on exactly the surfaces (a vomit's AI read, a "did
// the dose still get in?" ask) where a wrong name costs the most. An unnamed sentence
// is recoverable; a confidently wrong name is not.
//
// CUL-574 wrote the rule down and fixed six sites. CUL-626, CUL-659 and CUL-711 each
// found one more, by grep, weeks apart. Three rediscoveries is a class, and a class is
// held by a guard rather than by whoever runs the next closing sweep.
//
// WHAT IT MATCHES. The fallback SHAPE — `?? activePet?.name` or
// `?? usePetStore.getState().activePet?.name`, on one line or split across two — and
// not every read of the active pet's name. A surface scoped to the active pet (the log
// screen's "Log for {pet}" header, the Foods tab) reads `activePet?.name` directly,
// with no record lookup in front of it, and that is correct: there the active pet
// genuinely is the subject. Only the *fallback* position is the defect.
//
// WHAT IT DOES NOT CLAIM. A syntactic scan proves the rung is absent, not that a
// surface resolves the right id. Review owns that; this owns the class that shipped.
//
// ESCAPE HATCH: an inline `// record-pet-ok: <reason>` within the ten lines above the
// site (the geistRollout / accentOnLight window, so a chain that starts several lines
// above its `??` can carry the marker at its head). The reason is mandatory — an
// exemption is a named decision, never a hole.
//
// The scanner takes its root as a REQUIRED parameter so the detector self-tests below
// run against a fixture outside the repository (CUL-712); a default would silently
// re-point a forgetful self-test at the real tree.

import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store'];

/** The one sanctioned lookup, and where it lives. */
const SANCTIONED = 'resolveRecordPetName';
const SANCTIONED_PATH = 'store/petStore.ts';

const EXEMPTION = /\/\/\s*record-pet-ok:\s*\S+/;
/** How far above the `??` line a marker still counts. Matches the other scanners. */
const EXEMPTION_WINDOW_LINES = 10;

/** The fallback rung: a nullish-coalesce INTO the active pet's name. */
const RUNG = /\?\?\s*(?:usePetStore\.getState\(\)\.)?activePet\??\.name\b/g;

/**
 * Comments out, code in — with NEWLINES KEPT, so a match's offset still maps to the
 * real source line (the exemption window below is read off the raw lines). Both the
 * helper's own header and the vet-document screen discuss the rung in prose; matching
 * raw source would flag the explanation of the rule as a violation of it.
 */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, ' ');
}

function walk(dir: string, root: string, out: string[]): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, root, out);
    } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

function sourceFiles(root: string): string[] {
  return SCAN_DIRS.flatMap((d) => {
    const abs = path.join(root, d);
    return fs.existsSync(abs) ? walk(abs, root, []) : [];
  }).sort();
}

/** ENOENT → null: a sibling guard's fixture can vanish between the walk and the read. */
function readSource(abs: string): string | null {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

interface Finding {
  file: string;
  line: number;
}

function findRungs(root: string): Finding[] {
  const out: Finding[] = [];
  for (const rel of sourceFiles(root)) {
    const raw = readSource(path.join(root, rel));
    if (raw === null) continue;
    const code = blankComments(raw);
    const rawLines = raw.split('\n');
    for (const m of code.matchAll(RUNG)) {
      const line = code.slice(0, m.index).split('\n').length; // 1-based, the `??` line
      const window = rawLines.slice(Math.max(0, line - 1 - EXEMPTION_WINDOW_LINES), line).join('\n');
      if (EXEMPTION.test(window)) continue;
      out.push({ file: rel, line });
    }
  }
  return out;
}

describe('CUL-574 — a record-scoped surface names the RECORD’s pet, never the active one', () => {
  it('the sanctioned lookup still exists and is consumed', () => {
    // Without a floor the guard passes vacuously the day the helper is renamed or
    // inlined away — the same floor reversePath / haptics / completionCard pin.
    const def = fs.readFileSync(path.join(REPO_ROOT, SANCTIONED_PATH), 'utf8');
    expect(def).toMatch(new RegExp(`export function ${SANCTIONED}\\b`));
    const consumers = sourceFiles(REPO_ROOT).filter((rel) => {
      if (rel === SANCTIONED_PATH) return false;
      const src = readSource(path.join(REPO_ROOT, rel));
      return src !== null && new RegExp(`\\b${SANCTIONED}\\b`).test(blankComments(src));
    });
    expect(consumers.length).toBeGreaterThanOrEqual(3);
  });

  it('scans a non-trivial tree', () => {
    expect(sourceFiles(REPO_ROOT).length).toBeGreaterThan(200);
  });

  it('no surface falls back to the active pet’s name behind a record lookup', () => {
    expect(
      findRungs(REPO_ROOT).map(
        (f) =>
          `${f.file}:${f.line} falls back to the active pet's name. Resolve the record's pet with ` +
          `${SANCTIONED} (${SANCTIONED_PATH}): a miss must read as "your pet", never as whichever ` +
          `pet happens to be active (CUL-574). Or add an inline "// record-pet-ok: <reason>" above the site.`,
      ),
    ).toEqual([]);
  });
});

describe('the detector itself', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('record-pet', ['components']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  it('FLAGS the rung, on one line or split across two', () => {
    writeFixture(
      root,
      'components/A.tsx',
      "const n = pets.find((p) => p.id === id)?.name ?? activePet?.name ?? 'your pet';\n",
    );
    writeFixture(
      root,
      'components/B.tsx',
      'const n =\n  (id ? pets.find((p) => p.id === id)?.name : null)\n' +
        "  ?? usePetStore.getState().activePet?.name\n  ?? 'your pet';\n",
    );
    expect(findRungs(root)).toEqual([
      { file: 'components/A.tsx', line: 1 },
      { file: 'components/B.tsx', line: 3 },
    ]);
  });

  it('SPARES a direct read of the active pet — an active-pet-scoped surface is right to', () => {
    writeFixture(root, 'components/C.tsx', "const petName = activePet?.name ?? 'your pet';\n");
    expect(findRungs(root)).toEqual([]);
  });

  it('SPARES a reasoned exemption at the head of a chain whose `??` sits lines below it', () => {
    writeFixture(
      root,
      'components/D.tsx',
      '// record-pet-ok: this sheet is scoped to the active pet by construction\n' +
        'const n =\n  (id ? pets.find((p) => p.id === id)?.name : null)\n' +
        "  ?? activePet?.name\n  ?? 'your pet';\n",
    );
    expect(findRungs(root)).toEqual([]);
  });

  it('does NOT spare a marker that sits outside the window', () => {
    // A marker eleven lines up is not a decision about THIS site.
    writeFixture(
      root,
      'components/F.tsx',
      '// record-pet-ok: some other site, far above\n' +
        '\n'.repeat(EXEMPTION_WINDOW_LINES) +
        "const n = override ?? activePet?.name ?? 'your pet';\n",
    );
    expect(findRungs(root)).toEqual([{ file: 'components/F.tsx', line: EXEMPTION_WINDOW_LINES + 2 }]);
  });

  it('SPARES the shape in prose — a comment explaining the rule is not a violation of it', () => {
    writeFixture(
      root,
      'components/E.tsx',
      '// an `?? activePet?.name` fallback would name the wrong pet here\n' +
        '/* so would\n   ?? usePetStore.getState().activePet?.name */\n' +
        'const n = resolveRecordPetName(pets, id);\n',
    );
    expect(findRungs(root)).toEqual([]);
  });
});
