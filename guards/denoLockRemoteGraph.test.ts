// Proof for the deno.lock remote-graph guard (CUL-421 / B-434).
//
// The rule, and the measured reason it is not `--frozen`, live in
// `guards/denoLockRemoteGraph.ts`. This file proves the predicate DISCRIMINATES, which
// is the only thing that makes the scoping defensible: it has to go red on the drift
// `--frozen` would have caught, and stay green on the drift `--frozen` would have caught
// SPURIOUSLY. A guard that only ever answers one way is not a guard (CUL-613), and here
// the green direction is load-bearing too — if a package.json bump reddened this, the
// design would be `--frozen` with extra steps.
//
// Every case below was run against the real Deno 2.9.4 behaviour before being written
// down: the added-remote-entry fixture is the actual seven-entry absorption observed
// when an unreviewed `https://deno.land/std@0.221.0/...` import was added to a suite, and
// the workspace-only fixture is the actual rewrite observed after bumping a dependency
// range in package.json.

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  MIN_BASELINE_GUARDED_ENTRIES,
  SCALAR_ENTRY_KEY,
  UNGUARDED_LOCK_SECTIONS,
  countGuardedEntries,
  diffLockSections,
} from './denoLockRemoteGraph';

/** A miniature lockfile in the real v5 shape. */
function lock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '5',
    specifiers: { 'jsr:@deno/installer-shell-setup@*': '0.3.4' },
    remote: {
      'https://deno.land/std@0.224.0/assert/assert.ts': 'aaa',
      'https://deno.land/std@0.224.0/assert/mod.ts': 'bbb',
    },
    workspace: { packageJson: { dependencies: ['npm:expo@^57.0.8', 'npm:zustand@^5.0.13'] } },
    ...overrides,
  };
}

describe('the guarded direction — drift the run must not absorb silently', () => {
  it('flags a NEW remote entry (the unreviewed-import case plain --lock swallows)', () => {
    const after = lock({
      remote: {
        ...(lock().remote as Record<string, string>),
        'https://deno.land/std@0.221.0/assert/assert_equals.ts': 'ccc',
      },
    });
    const findings = diffLockSections(lock(), after);
    expect(findings).toHaveLength(1);
    expect(findings[0].section).toBe('remote');
    expect(findings[0].added).toEqual(['https://deno.land/std@0.221.0/assert/assert_equals.ts']);
    expect(findings[0].removed).toEqual([]);
    expect(findings[0].changed).toEqual([]);
  });

  it('flags a CHANGED remote hash (a pinned URL now serving different content)', () => {
    const after = lock({
      remote: { ...(lock().remote as Record<string, string>), 'https://deno.land/std@0.224.0/assert/assert.ts': 'TAMPERED' },
    });
    const findings = diffLockSections(lock(), after);
    expect(findings).toHaveLength(1);
    expect(findings[0].changed).toEqual(['https://deno.land/std@0.224.0/assert/assert.ts']);
  });

  it('flags a REMOVED remote entry', () => {
    const findings = diffLockSections(lock(), lock({ remote: { 'https://deno.land/std@0.224.0/assert/mod.ts': 'bbb' } }));
    expect(findings[0].removed).toEqual(['https://deno.land/std@0.224.0/assert/assert.ts']);
  });

  it('flags a section vanishing entirely, not just entries within it', () => {
    const after = lock();
    delete after.remote;
    const findings = diffLockSections(lock(), after);
    expect(findings.map((f) => f.section)).toEqual(['remote']);
    expect(findings[0].removed).toHaveLength(2);
  });

  it('flags a scalar section such as `version`', () => {
    const findings = diffLockSections(lock(), lock({ version: '6' }));
    expect(findings).toEqual([{ section: 'version', added: [], removed: [], changed: [SCALAR_ENTRY_KEY] }]);
  });

  it('flags a section Deno has not invented yet — the denylist-of-one default', () => {
    // The whole point of naming only `workspace` as unguarded: a future lockfile section
    // is policed on the day it appears, instead of being silently ignored by an allowlist
    // written before it existed.
    const findings = diffLockSections(lock(), lock({ someFutureSection: { entry: 'x' } }));
    expect(findings.map((f) => f.section)).toEqual(['someFutureSection']);
  });

  it('flags jsr and specifiers too, not only remote', () => {
    const bothMoved = diffLockSections(
      lock(),
      lock({ specifiers: { 'jsr:@deno/installer-shell-setup@*': '9.9.9' }, jsr: { '@scope/pkg@1.0.0': { integrity: 'z' } } }),
    );
    expect(bothMoved.map((f) => f.section).sort()).toEqual(['jsr', 'specifiers']);
  });
});

describe('the green direction — churn the guard must NOT fire on', () => {
  it('ignores a package.json bump rewriting the workspace mirror', () => {
    // This is the case that makes the design worth its custom machinery. 12 of the last
    // 14 dependency-changing commits looked exactly like this, and `--frozen` reds on
    // every one of them despite the Edge Functions importing zero npm: specifiers.
    const after = lock({
      workspace: { packageJson: { dependencies: ['npm:expo@^57.0.9', 'npm:zustand@^5.0.99', 'npm:left-pad@^1.3.0'] } },
    });
    expect(diffLockSections(lock(), after)).toEqual([]);
  });

  it('ignores the workspace section appearing or vanishing wholesale', () => {
    const without = lock();
    delete without.workspace;
    expect(diffLockSections(lock(), without)).toEqual([]);
    expect(diffLockSections(without, lock())).toEqual([]);
  });

  it('ignores key re-ordering within a guarded section', () => {
    const reordered = lock({
      remote: {
        'https://deno.land/std@0.224.0/assert/mod.ts': 'bbb',
        'https://deno.land/std@0.224.0/assert/assert.ts': 'aaa',
      },
    });
    expect(diffLockSections(lock(), reordered)).toEqual([]);
  });

  it('is a no-op against itself', () => {
    expect(diffLockSections(lock(), lock())).toEqual([]);
  });
});

describe('the floor that stops an empty read reading as a clean one', () => {
  it('counts guarded entries and excludes the workspace mirror from the count', () => {
    // 1 version + 1 specifier + 2 remote = 4. The two workspace deps are not counted.
    expect(countGuardedEntries(lock())).toBe(4);
  });

  it('returns 0 for a lockfile that did not parse into an object', () => {
    expect(countGuardedEntries(null)).toBe(0);
    expect(countGuardedEntries('')).toBe(0);
  });

  it('throws rather than reporting "no findings" when a lockfile is not an object', () => {
    // Two files that both failed to load must not diff to a clean pass.
    expect(() => diffLockSections(null, lock())).toThrow(/JSON object/);
    expect(() => diffLockSections(lock(), undefined)).toThrow(/JSON object/);
  });
});

describe('anchored to the real committed lockfile, not only to fixtures', () => {
  const real = JSON.parse(readFileSync(join(__dirname, '..', 'deno.lock'), 'utf8')) as Record<string, unknown>;

  it('the repo lockfile clears the CLI floor by a wide margin', () => {
    // The CLI refuses a baseline under MIN_BASELINE_GUARDED_ENTRIES. Read the constant
    // rather than restating it: a test that names its own number stops describing the
    // script the moment someone edits one of the two (the CUL-621 lesson — assert the
    // thing under test, not arithmetic the test supplied itself).
    const actual = countGuardedEntries(real);
    expect(actual).toBeGreaterThanOrEqual(MIN_BASELINE_GUARDED_ENTRIES * 3);
    expect(MIN_BASELINE_GUARDED_ENTRIES).toBeGreaterThan(0);
  });

  it('the repo lockfile really does carry an npm workspace mirror to exclude', () => {
    // If this ever stops being true, the exclusion is dead weight and the guard should
    // simply become `--frozen` — so the premise is asserted rather than assumed.
    expect(real).toHaveProperty('workspace');
    expect(JSON.stringify(real.workspace)).toContain('npm:expo@');
  });

  it('pins the exclusion list, so widening it is an argued change', () => {
    expect(UNGUARDED_LOCK_SECTIONS).toEqual(['workspace']);
  });
});
