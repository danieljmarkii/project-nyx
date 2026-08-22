// The silence-on-safety guard (CUL-604 · `docs/nyx-app-polish-requirements.md` §5.6, D7).
//
// WHY THIS FILE EXISTS. The seventh row of the §5.6 table is an ABSENCE: a safety card
// arriving, or a red-flag AI read landing, gets **no haptic, by rule**. Plainness is the
// severity signal (`nyx-signal-home-requirements.md` S1) and a buzz on bad news is the
// phone rewarding the owner for it. An absence is the one kind of rule code review is
// worst at holding: nothing in a diff that ADDS `commitRoutine()` to a safety card looks
// wrong on its face — it looks like consistency, which is exactly how it would arrive.
//
// `lib/haptics.ts` closes half of this structurally by exporting no verb a safety
// surface could reasonably call (there is no `safetyArrival()`; `lib/haptics.test.ts`
// pins the export list). This closes the other half: the six verbs that DO exist are
// all callable, so the remaining hole is a safety renderer importing one of them. This
// is a source scan in the shape of `widgets/CulpritWidget.test.ts` and
// `guards/ownerFacingCopy.test.ts` — it fails the build if that import appears.
//
// SCOPE — components, not screens, and derived rather than hand-listed. A file is a
// safety surface if it lives under `components/`, renders (`.tsx`), and its source
// carries one of the MARKERS below. That set is derived, so a NEW safety renderer is
// covered the day it is written, without anyone remembering to add it here — the
// failure mode of a hard-coded list. Screens under `app/` are deliberately out: they
// COMPOSE safety components alongside everything else (Home hosts the cross-pet banner
// and the pull-to-refresh gesture in one file), so a screen-level import proves nothing
// about what the safety surface itself plays. The arrival beat this rule governs would
// live in the component, which is what is scanned.
//
// ESCAPE HATCH: an inline `// haptics-guard-ok: <reason>` on the import line or the one
// above it suppresses a finding. The reason is mandatory, so an exemption is a named
// decision rather than a silent hole — the `LOCAL_WIPE_TABLES` / `NOT_WIPED_ON_SIGN_OUT`
// discipline. Reaching for it on a safety surface should feel like the argument it is.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIR = 'components';

/**
 * What makes a component a safety surface. Each marker is a thing only a file that
 * renders safety-class content has reason to mention:
 *
 *  - `priorityClass` / `INSIGHT_RENDERERS` — the Signal card machinery, where
 *    `'safety'` is a first-class rank (`lib/signal.ts`).
 *  - `event_ai_analysis` — the per-incident AI read sections (vomit / stool), i.e.
 *    the "red-flag reads" half of the D7 row.
 *  - `useCrossPetSafetyBanner` — the cross-pet safety banner.
 *  - `safetyFlag` / `safety_flag` — the vet-report + snapshot safety-band vocabulary,
 *    so a future component rendering that band is caught before it is written.
 */
const MARKERS = [
  'priorityClass',
  'INSIGHT_RENDERERS',
  'event_ai_analysis',
  'useCrossPetSafetyBanner',
  'safetyFlag',
  'safety_flag',
];

/**
 * Belt-and-braces: these are safety surfaces whatever the markers say. Listed by hand
 * because the marker derivation is a heuristic over source text and these four are the
 * ones whose silence is load-bearing enough that a rename or refactor must not quietly
 * drop them out of scope. A file here that no longer exists fails the test loudly
 * rather than shrinking coverage in silence.
 */
const ALWAYS_SCANNED = [
  'components/home/InsightCard.tsx',
  'components/home/SignalZone.tsx',
  'components/home/CrossPetSafetyBanner.tsx',
  'components/event/VomitAnalysisSection.tsx',
  'components/event/StoolAnalysisSection.tsx',
];

const HAPTICS_IMPORT = /from\s+['"][^'"]*\/haptics['"]|require\(\s*['"][^'"]*\/haptics['"]\s*\)/;
const EXEMPTION = /\/\/\s*haptics-guard-ok:\s*\S+/;

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, out);
    } else if (ent.name.endsWith('.tsx') && !ent.name.includes('.test.')) {
      out.push(path.relative(ROOT, full));
    }
  }
  return out;
}

/** The derived safety-surface set, plus the always-scanned five. */
function safetySurfaces(): string[] {
  const derived = walk(path.join(ROOT, SCAN_DIR)).filter((rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return MARKERS.some((m) => src.includes(m));
  });
  return Array.from(new Set([...derived, ...ALWAYS_SCANNED])).sort();
}

/** Lines importing `lib/haptics` that carry no exemption comment. */
function unexemptedHapticImports(rel: string): string[] {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (!HAPTICS_IMPORT.test(line)) return;
    const prev = i > 0 ? lines[i - 1] : '';
    if (EXEMPTION.test(line) || EXEMPTION.test(prev)) return;
    hits.push(`${rel}:${i + 1} — ${line.trim()}`);
  });
  return hits;
}

describe('D7 — silence on safety is enforced, not remembered', () => {
  it('every always-scanned safety surface still exists', () => {
    // A rename that quietly drops one of these out of the scan would shrink coverage
    // invisibly, which is the exact failure this whole file guards against.
    const missing = ALWAYS_SCANNED.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
    expect(missing).toEqual([]);
  });

  it('finds a non-trivial set of safety surfaces to scan', () => {
    // If the marker derivation ever silently matches nothing (a refactor renames
    // `priorityClass`), the guard would pass by scanning an empty set. Fail instead.
    expect(safetySurfaces().length).toBeGreaterThanOrEqual(ALWAYS_SCANNED.length);
  });

  it('no safety surface imports lib/haptics', () => {
    const findings = safetySurfaces().flatMap(unexemptedHapticImports);
    expect(findings).toEqual([]);
  });
});

describe('the detector itself', () => {
  const tmp = path.join(ROOT, 'components', '__haptics_guard_fixture__.tsx');
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('FLAGS a haptic import in a file carrying a safety marker', () => {
    fs.writeFileSync(
      tmp,
      [
        "import { commitRoutine } from '../lib/haptics';",
        "const x: string = 'priorityClass';",
        'export function Fixture() { commitRoutine(); return null; }',
      ].join('\n'),
    );
    const rel = path.relative(ROOT, tmp);
    expect(safetySurfaces()).toContain(rel);
    expect(unexemptedHapticImports(rel).length).toBe(1);
  });

  it('SPARES an import carrying a reasoned exemption comment', () => {
    fs.writeFileSync(
      tmp,
      [
        '// haptics-guard-ok: renders a safety card but the tap here is a nav gesture',
        "import { openMenu } from '../lib/haptics';",
        "const x: string = 'priorityClass';",
        'export function Fixture() { openMenu(); return null; }',
      ].join('\n'),
    );
    expect(unexemptedHapticImports(path.relative(ROOT, tmp))).toEqual([]);
  });

  it('SPARES a component with no safety marker (a haptic there is fine)', () => {
    fs.writeFileSync(
      tmp,
      [
        "import { selectChip } from '../lib/haptics';",
        'export function Fixture() { selectChip(); return null; }',
      ].join('\n'),
    );
    expect(safetySurfaces()).not.toContain(path.relative(ROOT, tmp));
  });
});
