// The live-region guard (CUL-1275).
//
// WHY THIS FILE EXISTS. `accessibilityLiveRegion` is ANDROID-ONLY. On iOS the prop does
// nothing, so a node that relies on it alone is silent to VoiceOver — and Nyx ships
// iOS-first. Every completion surface in the app shipped that way: the named card, the
// meal and dose cards' removal lines and the in-sheet beat each confirmed a save to
// TalkBack and said nothing on an iPhone. `TextField` and `SignalZone`'s ack line had each
// found the gap and closed it inline first, and neither fix travelled — two instances and
// five misses is a class, and a class is held by a guard. CUL-1275 also names the forward
// case: Engines v3 adds new moments to exactly this path, and no prompt it adds may depend
// on a live region.
//
// WHAT IT CHECKS. A source file that renders a live region must also carry its iOS half:
// a call to `useLiveRegionAnnouncement` (hooks/useLiveRegionAnnouncement.ts — the lifted
// fix) or a direct `AccessibilityInfo.announceForAccessibility` (the inline precedents).
// `accessibilityLiveRegion="none"` is the absence of a live region and is not counted.
//
// BLIND SPOT, stated so it does not read as coverage (C-38): the pairing is PER FILE, not
// per node. A file whose one announcement covers one live region passes with a second,
// unrelated live region beside it; and the scan cannot see WHAT is announced, so a call
// that speaks a different string from the node's label passes too. Per-node pairing needs
// a JSX-aware scan; the component tests (each surface asserts the announcement equals the
// node's label) are what hold the string today.
//
// ESCAPE HATCH: an inline `// live-region-ok: <reason>` within the ten lines above the
// site (the window every scanner here uses). The reason is mandatory — a live region that
// is deliberately Android-only is a named decision, never a hole.
//
// The scanner takes its root as a REQUIRED parameter so the detector self-tests below run
// against a fixture outside the repository (CUL-712).

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store', 'widgets'];

/** The lifted fix, and where it lives. */
const HOOK = 'useLiveRegionAnnouncement';
const HOOK_PATH = 'hooks/useLiveRegionAnnouncement.ts';

/** A live region, as a JSX prop or an object key (a spread props object). */
const LIVE_REGION = /\baccessibilityLiveRegion\s*(?:=|:)\s*\{?\s*(["'`])?(\w+)?/g;
/** The iOS half: the hook, or the imperative call it wraps. */
const IOS_HALF = new RegExp(`\\b(?:${HOOK}|announceForAccessibility(?:WithOptions)?)\\s*\\(`);

const EXEMPTION = /\/\/\s*live-region-ok:\s*\S+/;
const EXEMPTION_WINDOW_LINES = 10;

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

interface Site {
  file: string;
  line: number;
}

/** Every live region in the tree, whatever its pairing — the non-vacuity floor reads it. */
function liveRegionSites(root: string): Site[] {
  const out: Site[] = [];
  for (const rel of sourceFiles(root)) {
    const raw = readSource(path.join(root, rel));
    if (raw === null) continue;
    const code = blankComments(raw);
    for (const m of code.matchAll(LIVE_REGION)) {
      if (m[2] === 'none') continue;
      out.push({ file: rel, line: code.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

/** The live regions with no iOS half in their file and no reasoned exemption above them. */
function findUnpaired(root: string): Site[] {
  const out: Site[] = [];
  const byFile = new Map<string, Site[]>();
  for (const site of liveRegionSites(root)) {
    byFile.set(site.file, [...(byFile.get(site.file) ?? []), site]);
  }
  for (const [rel, sites] of byFile) {
    const raw = readSource(path.join(root, rel));
    if (raw === null) continue;
    if (IOS_HALF.test(blankComments(raw))) continue;
    const rawLines = raw.split('\n');
    for (const site of sites) {
      const window = rawLines
        .slice(Math.max(0, site.line - 1 - EXEMPTION_WINDOW_LINES), site.line)
        .join('\n');
      if (EXEMPTION.test(window)) continue;
      out.push(site);
    }
  }
  return out;
}

describe('CUL-1275 — a live region is never the only way a screen reader hears a change', () => {
  it('the lifted fix still exists and is consumed', () => {
    // Without a floor the guard passes vacuously the day the hook is renamed away.
    const def = fs.readFileSync(path.join(REPO_ROOT, HOOK_PATH), 'utf8');
    expect(def).toMatch(new RegExp(`export function ${HOOK}\\b`));
    const consumers = sourceFiles(REPO_ROOT).filter((rel) => {
      if (rel === HOOK_PATH) return false;
      const src = readSource(path.join(REPO_ROOT, rel));
      return src !== null && new RegExp(`\\b${HOOK}\\s*\\(`).test(blankComments(src));
    });
    expect(consumers.length).toBeGreaterThanOrEqual(4);
  });

  it('scans a tree that actually holds live regions', () => {
    // Derived from the repository, never from a list in this file (C-38): the day the
    // scan stops seeing the completion cards, this reds instead of going quietly green.
    const files = new Set(liveRegionSites(REPO_ROOT).map((s) => s.file));
    expect(files.size).toBeGreaterThanOrEqual(5);
    expect(files).toContain('components/ui/NamedCompletionCard.tsx');
  });

  it('every live region has its iOS half', () => {
    expect(
      findUnpaired(REPO_ROOT).map(
        (s) =>
          `${s.file}:${s.line} renders an accessibilityLiveRegion, which is Android-only — VoiceOver ` +
          `never hears it. Speak the same string on iOS with ${HOOK} (${HOOK_PATH}), or add an ` +
          `inline "// live-region-ok: <reason>" above the site if Android-only is the decision.`,
      ),
    ).toEqual([]);
  });
});

describe('the detector itself', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('live-region', ['components']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  it('FLAGS a live region with no iOS half — the shape every completion card shipped in', () => {
    writeFixture(
      root,
      'components/A.tsx',
      'export const A = () => (\n  <View accessibilityLiveRegion="polite" accessibilityLabel={label} />\n);\n',
    );
    writeFixture(root, 'components/B.tsx', "const props = { accessibilityLiveRegion: 'assertive' };\n");
    expect(findUnpaired(root)).toEqual([
      { file: 'components/A.tsx', line: 2 },
      { file: 'components/B.tsx', line: 1 },
    ]);
  });

  it('SPARES a file that carries the hook, or the imperative call', () => {
    writeFixture(
      root,
      'components/C.tsx',
      `${HOOK}(shown ? label : null, id);\nconst c = <View accessibilityLiveRegion="polite" />;\n`,
    );
    writeFixture(
      root,
      'components/D.tsx',
      'AccessibilityInfo.announceForAccessibility(error);\nconst d = <Text accessibilityLiveRegion="polite" />;\n',
    );
    expect(findUnpaired(root)).toEqual([]);
  });

  it('does NOT count an iOS half that is only mentioned in a comment', () => {
    writeFixture(
      root,
      'components/E.tsx',
      `// TODO: ${HOOK}(label)\nconst e = <View accessibilityLiveRegion="polite" />;\n`,
    );
    expect(findUnpaired(root)).toEqual([{ file: 'components/E.tsx', line: 2 }]);
  });

  it('SPARES "none" — the absence of a live region is not one', () => {
    writeFixture(root, 'components/F.tsx', 'const f = <View accessibilityLiveRegion="none" />;\n');
    expect(findUnpaired(root)).toEqual([]);
  });

  it('SPARES a reasoned exemption in the window, and not one outside it', () => {
    writeFixture(
      root,
      'components/G.tsx',
      '// live-region-ok: a TalkBack-only progress tick; VoiceOver reads the value on focus\n' +
        'const g = <View accessibilityLiveRegion="polite" />;\n',
    );
    writeFixture(
      root,
      'components/H.tsx',
      '// live-region-ok: some other site, far above\n' +
        '\n'.repeat(EXEMPTION_WINDOW_LINES) +
        'const h = <View accessibilityLiveRegion="polite" />;\n',
    );
    expect(findUnpaired(root)).toEqual([{ file: 'components/H.tsx', line: EXEMPTION_WINDOW_LINES + 2 }]);
  });

  it('SPARES the prop named in prose — a comment explaining the rule is not a violation of it', () => {
    writeFixture(
      root,
      'components/I.tsx',
      '// accessibilityLiveRegion="polite" is Android-only\n/* accessibilityLiveRegion: x */\nexport {};\n',
    );
    expect(findUnpaired(root)).toEqual([]);
  });
});
