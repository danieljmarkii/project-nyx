// Proof for the fixture-root helper itself (CUL-712).
//
// This file is shared infrastructure for three guards, and its whole promise is one
// containment invariant. Per the CUL-613 rule it is proven by MUTATION — the rejection
// branch is driven by handing the helper a real in-repo base and requiring the throw,
// not by reading the `if` and agreeing with it.

import * as fs from 'fs';
import * as os from 'os';
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

  it('treats the never-created sentinel as a no-op rather than a repo path', () => {
    // `let root = ''` is what a guard holds before its beforeEach runs. `''` resolves
    // to the cwd — the repo — so without the early return a failed setup would be
    // followed by an afterEach throw standing in front of the real error.
    expect(() => removeFixtureRoot('')).not.toThrow();
  });

  it('resolves awkward paths the way a containment check must (characterization)', () => {
    // Pinned rather than reasoned about: this predicate is the only thing standing
    // between a recursive delete and the working tree.
    expect(isInsideRepo('components')).toBe(true); // relative → resolved against cwd
    expect(isInsideRepo('.')).toBe(true);
    expect(isInsideRepo(REPO_ROOT + path.sep)).toBe(true); // trailing separator
    expect(isInsideRepo(path.join(REPO_ROOT, 'app', '..', 'components'))).toBe(true);
    expect(isInsideRepo(path.join(REPO_ROOT, '..', 'elsewhere'))).toBe(false); // .. escapes
  });

  it('refuses to delete an in-repo path', () => {
    // removeFixtureRoot is an `rmSync(recursive)` — the most destructive call in the
    // test tree. Handed a repo path by a caller that built its root by hand, an
    // unguarded version deletes source. This is not hypothetical: a reviewer probing
    // exactly this question during the CUL-712 build wiped `components/` from the
    // working tree (recovered from HEAD, nothing lost).
    expect(() => removeFixtureRoot(path.join(REPO_ROOT, 'components'))).toThrow(/inside the repository/);
    expect(fs.existsSync(path.join(REPO_ROOT, 'components'))).toBe(true);
  });

  it('refuses to delete an out-of-repo path it did not create', () => {
    // The structural half, and the reason it is not redundant with the check above:
    // containment is ONE predicate in front of a recursive delete, so the function
    // also refuses anything it did not hand out. That holds even if `isInsideRepo`
    // is someday wrong — which is the failure the containment check cannot cover.
    const stranger = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'not-ours-'));
    try {
      expect(() => removeFixtureRoot(stranger)).toThrow(/not handed out by createFixtureRoot/);
      expect(fs.existsSync(stranger)).toBe(true);
    } finally {
      fs.rmSync(stranger, { recursive: true, force: true });
    }
  });

  it('is idempotent — removing the same root twice is not an error', () => {
    // `afterEach` plus a `finally` can both fire on the same root.
    const root = createFixtureRoot('twice');
    removeFixtureRoot(root);
    expect(() => removeFixtureRoot(root)).not.toThrow();
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
