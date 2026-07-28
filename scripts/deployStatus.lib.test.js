/**
 * Tests for the deploy-drift comparison logic.
 *
 * Two of these are regressions against wrong answers this project actually
 * produced by hand on 2026-07-28, before the script existed:
 *
 *   1. The shallow clone's synthetic root made every function look drifted.
 *   2. `extract-food-from-photo`'s drift was mis-sized twice: first called a
 *      false positive (a shallow clone hid the commit that mattered), then
 *      shown to be 1 real change out of 5 commits touching its inputs. Commit
 *      counts describe activity; only a hash describes the artifact.
 *
 * Both were caught by a second look rather than by a check, which is exactly the
 * kind of luck this file exists to stop relying on.
 */

const {
  STATE,
  normalizeForHash,
  classifyFunction,
  normalizeMigrationName,
  versionFromFilename,
  diffMigrations,
  filterRealCommits,
  summarize,
  sortResults,
} = require('./deployStatus.lib');

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const complete = { commits: [], historyComplete: true };

describe('classifyFunction — hash comparison is the only thing allowed to say DRIFTED', () => {
  it('matching hashes are CURRENT even when many commits touch the dep set', () => {
    const r = classifyFunction({
      name: 'extract-food-from-photo',
      localSha: SHA_A,
      deployed: { version: 15, updatedAt: '2026-07-24T19:12:00Z', sourceSha: SHA_A },
      git: { commits: [{ sha: 'cf58457', subject: 'protein render' }], historyComplete: true },
    });
    expect(r.state).toBe(STATE.CURRENT);
  });

  it('differing hashes are DRIFTED even with zero commits visible', () => {
    const r = classifyFunction({
      name: 'delete-account',
      localSha: SHA_A,
      deployed: { version: 6, updatedAt: '2026-07-26T16:41:00Z', sourceSha: SHA_B },
      git: complete,
    });
    expect(r.state).toBe(STATE.DRIFTED);
    expect(r.reason).toMatch(/aaaaaaaa/);
    expect(r.reason).toMatch(/bbbbbbbb/);
  });

  it('REGRESSION: a commit touching the dep set is a CANDIDATE, never DRIFTED', () => {
    // `cf58457` added `readProteinSet` to lib/protein.ts; extract-food-from-photo
    // imports only `deriveProteinSet`, so esbuild dropped it and THAT commit
    // changed nothing in the bundle. Without a deployed hash the honest answer is
    // "worth checking", not "redeploy this" — the artifact may or may not differ.
    const r = classifyFunction({
      name: 'extract-food-from-photo',
      localSha: SHA_A,
      deployed: { version: 15, updatedAt: '2026-07-24T19:12:00Z' }, // no sourceSha — no token
      git: { commits: [{ sha: 'cf58457', subject: 'protein render' }], historyComplete: true },
    });
    expect(r.state).toBe(STATE.CANDIDATE);
    expect(r.state).not.toBe(STATE.DRIFTED);
    expect(r.reason).toMatch(/tree-shaken/);
  });

  it('no hash and no commits is LIKELY_CURRENT, which is not CURRENT', () => {
    const r = classifyFunction({
      name: 'analyze-vomit',
      localSha: SHA_A,
      deployed: { version: 9, updatedAt: '2026-07-18T22:16:00Z' },
      git: complete,
    });
    expect(r.state).toBe(STATE.LIKELY_CURRENT);
  });

  it('REGRESSION: a shallow clone with no hash reports UNKNOWN, not LIKELY_CURRENT', () => {
    // Silence from an incomplete history must never be rendered as a clean bill of
    // health — that is how "nobody wrote it down" becomes "nothing to do".
    const r = classifyFunction({
      name: 'generate-signal',
      localSha: SHA_A,
      deployed: { version: 25, updatedAt: '2026-07-18T12:43:00Z' },
      git: { commits: [], historyComplete: false },
    });
    expect(r.state).toBe(STATE.UNKNOWN);
    expect(r.reason).toMatch(/shallow/);
  });

  it('a function absent from the project is NOT_DEPLOYED', () => {
    const r = classifyFunction({ name: 'view-report', localSha: SHA_A, deployed: null, git: complete });
    expect(r.state).toBe(STATE.NOT_DEPLOYED);
  });
});

describe('filterRealCommits', () => {
  it("REGRESSION: drops the shallow clone's synthetic root", () => {
    // 8051551 is this repo's shallow root: 194 files, all additions, dated after
    // several real deploys. Counting it made all 8 functions look drifted.
    const root = '80515513e890bf7bd15768d09b967986d64e77eb';
    const commits = [
      { sha: root, subject: 'synthetic root' },
      { sha: '17e252e', subject: 'set-membership correlation' },
    ];
    const real = filterRealCommits(commits, [root]);
    expect(real).toHaveLength(1);
    expect(real[0].sha).toBe('17e252e');
  });

  it('is a no-op on a full clone', () => {
    const commits = [{ sha: 'abc', subject: 'x' }];
    expect(filterRealCommits(commits, [])).toHaveLength(1);
  });
});

describe('migration name normalization', () => {
  it('matches a numbered file to a timestamped history row', () => {
    expect(normalizeMigrationName('044_vet_documents.sql')).toBe('vet_documents');
    expect(normalizeMigrationName('vet_documents')).toBe('vet_documents');
  });

  it('matches a history row that kept its own numeric prefix', () => {
    expect(normalizeMigrationName('021_medication_photos_rls.sql')).toBe('medication_photos_rls');
    expect(normalizeMigrationName('021_medication_photos_rls')).toBe('medication_photos_rls');
  });

  it('strips only a LEADING run of digits, so mid-name digits survive', () => {
    // `complete_003_vet_visit_attachments` must NOT collapse onto `003_attachments`
    // — it is a genuinely separate applied migration with no file.
    expect(normalizeMigrationName('complete_003_vet_visit_attachments')).toBe(
      'complete_003_vet_visit_attachments'
    );
    expect(normalizeMigrationName('003_attachments.sql')).toBe('attachments');
  });

  it('derives the version the CLI would use for db push', () => {
    expect(versionFromFilename('036_nyx_food_photos_owner_insert.sql')).toBe('036');
    expect(versionFromFilename('no_prefix.sql')).toBeNull();
  });
});

describe('diffMigrations', () => {
  it('flags a file that was never applied — the migration 036 failure', () => {
    // 036 sat recorded as Done for nine days while never applied to production.
    const out = diffMigrations(
      ['035_food_items_archived_at.sql', '036_nyx_food_photos_owner_insert.sql'],
      [{ version: '20260717154727', name: 'food_items_archived_at' }]
    );
    expect(out.missingInProd).toEqual(['036_nyx_food_photos_owner_insert.sql']);
    expect(out.missingOnDisk).toEqual([]);
  });

  it('flags applied migrations that exist in no repo file', () => {
    const out = diffMigrations(
      ['033_per_account_food_med_library.sql'],
      [
        { version: '20260716185858', name: 'per_account_food_med_library' },
        { version: '20260716190519', name: 'per_account_food_med_library_med_owner_index' },
        { version: '20260606012459', name: 'complete_003_vet_visit_attachments' },
      ]
    );
    expect(out.missingOnDisk).toEqual([
      '20260606012459_complete_003_vet_visit_attachments',
      '20260716190519_per_account_food_med_library_med_owner_index',
    ]);
    expect(out.missingInProd).toEqual([]);
  });

  it('flags two files deriving the same version (the 018 collision)', () => {
    const out = diffMigrations(
      ['018_ai_signals_summary.sql', '018_feeding_arrangements.sql'],
      [
        { version: '018', name: 'ai_signals_summary' },
        { version: '20260606999999', name: 'feeding_arrangements' },
      ]
    );
    expect(out.duplicateVersions).toEqual([
      { version: '018', files: ['018_ai_signals_summary.sql', '018_feeding_arrangements.sql'] },
    ]);
  });

  it('is quiet when everything lines up', () => {
    const out = diffMigrations(
      ['044_vet_documents.sql'],
      [{ version: '20260726160324', name: 'vet_documents' }]
    );
    expect(out).toEqual({ missingInProd: [], missingOnDisk: [], duplicateVersions: [] });
  });
});

describe('summarize / sortResults', () => {
  const mk = (name, state) => ({ name, state, commits: [] });

  it('treats CANDIDATE and UNKNOWN as actionable — silence is not success', () => {
    const s = summarize([mk('a', STATE.CANDIDATE), mk('b', STATE.UNKNOWN), mk('c', STATE.CURRENT)]);
    expect(s.clean).toBe(false);
    expect(s.actionable.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('is clean only when every function is CURRENT or LIKELY_CURRENT', () => {
    expect(summarize([mk('a', STATE.CURRENT), mk('b', STATE.LIKELY_CURRENT)]).clean).toBe(true);
  });

  it('sorts worst-first so the report leads with what matters', () => {
    const sorted = sortResults([
      mk('z', STATE.CURRENT),
      mk('y', STATE.CANDIDATE),
      mk('x', STATE.DRIFTED),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(['x', 'y', 'z']);
  });
});

describe('normalizeForHash — the ASCII-escape transport artifact', () => {
  it('REGRESSION: an escaped literal and a real char hash the same', () => {
    // extract-food-from-photo v16. The bundle ships `\\u2014` (--charset=ascii);
    // the MCP JSON hop decodes it to a real em-dash before storing. Same program,
    // different bytes — exact mode must not call that drift.
    const bundled = 'var S = "sold as \\u2014 the one";';
    const deployed = 'var S = "sold as \u2014 the one";';
    expect(bundled).not.toBe(deployed);
    expect(normalizeForHash(bundled)).toBe(normalizeForHash(deployed));
  });

  it('leaves a file with no escapes untouched', () => {
    const src = 'var x = "plain ascii";';
    expect(normalizeForHash(src)).toBe(src);
  });

  it('still distinguishes a genuinely different program', () => {
    expect(normalizeForHash('var a = 1;')).not.toBe(normalizeForHash('var a = 2;'));
  });
});
