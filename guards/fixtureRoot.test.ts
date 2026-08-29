// Proof for the fixture-root helper itself (CUL-712).
//
// This file is shared infrastructure for three guards, and its whole promise is one
// containment invariant. Per the CUL-613 rule it is proven by MUTATION — the rejection
// branch is driven by handing the helper a real in-repo base and requiring the throw,
// not by reading the `if` and agreeing with it.

import * as fs from 'fs';
import * as path from 'path';

import { createFixtureRoot, isInsideRepo, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');

describe('createFixtureRoot keeps detector fixtures out of the scanned tree', () => {
  it('hands back a root outside the repository, with the requested scan dirs', () => {
    const root = createFixtureRoot('selftest', ['app', 'components']);
    try {
      expect(isInsideRepo(root)).toBe(false);
      expect(fs.statSync(path.join(root, 'app')).isDirectory()).toBe(true);
      expect(fs.statSync(path.join(root, 'components')).isDirectory()).toBe(true);
    } finally {
      removeFixtureRoot(root);
    }
    expect(fs.existsSync(root)).toBe(false);
  });

  it('THROWS rather than hand back a root inside the repository', () => {
    // The mutation, driven with a REAL in-repo base rather than a mocked `os.tmpdir()`
    // — `mkdtempSync` genuinely creates the offending directory and the check has to
    // catch it. Without that check this call succeeds and quietly re-creates the exact
    // collision the helper exists to remove.
    //
    // The probe directory sits at the repo ROOT, which no guard walks (they walk
    // `app/`, `components/`, `lib/`, …), and holds no files — so even mid-test it is
    // invisible to every scan.
    const probe = path.join(REPO_ROOT, '.guard-fixture-probe');
    fs.mkdirSync(probe, { recursive: true });
    try {
      expect(() => createFixtureRoot('probe', [], probe)).toThrow(/inside the repository/);
      // …and it cleaned up after itself rather than leaving the offending dir behind.
      expect(fs.readdirSync(probe)).toEqual([]);
    } finally {
      fs.rmSync(probe, { recursive: true, force: true });
    }
  });

  it('does not mistake a SIBLING directory for a child of the repo', () => {
    // `startsWith(REPO_ROOT)` alone would call `…/project-nyx-scratch` in-repo and
    // reject a perfectly good root. The separator is what makes it a path test.
    expect(isInsideRepo(REPO_ROOT)).toBe(true);
    expect(isInsideRepo(path.join(REPO_ROOT, 'components', 'x.tsx'))).toBe(true);
    expect(isInsideRepo(REPO_ROOT + '-scratch')).toBe(false);
  });

  it('refuses to delete an in-repo path', () => {
    // removeFixtureRoot is an `rmSync(recursive)`. Handed a repo path by a future
    // caller that built its root by hand, it would delete source.
    expect(() => removeFixtureRoot(path.join(REPO_ROOT, 'components'))).toThrow(/refusing to delete/);
    expect(fs.existsSync(path.join(REPO_ROOT, 'components'))).toBe(true);
  });

  it('writeFixture creates missing directories under the root', () => {
    const root = createFixtureRoot('write');
    try {
      const abs = writeFixture(root, 'components/nested/Fixture.tsx', 'export const X = 1;\n');
      expect(fs.readFileSync(abs, 'utf8')).toContain('export const X = 1;');
      expect(isInsideRepo(abs)).toBe(false);
    } finally {
      removeFixtureRoot(root);
    }
  });
});
