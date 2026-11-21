// The docs only rule for CI (CUL-2860). The pure half: which paths are docs, which jest
// suites still run when only docs moved, and whether this pull request run may skip the
// full test jobs. docsOnlyCli.ts does the reads and writes the job outputs.
//
// The rule, and why it is safe. A run may skip the full suites only when one of two
// things is true of the code it would test:
//   (1) the pull request, against its base, changes docs and nothing else; or
//   (2) some earlier commit on the branch has a CI run that PASSED, and everything changed
//       between that commit and this head is docs.
// (2) is the case the retro measured: 23 of 67 dispatch branches ended on a docs only
// commit (the session record) that bought a whole new run of code that had just passed.
// A red or cancelled earlier run never qualifies, so a docs commit can never turn a red
// branch green; the walk keeps going back until it meets either a passed run or a code
// change, and a code change means the full run.
//
// "Docs" is narrow on purpose: Markdown outside the two trees whose Markdown is code
// (`supabase/` and `scripts/` hold test fixtures and corpora written as .md), and the HTML
// mocks under docs/. Everything else under docs/ is code to CI: the vet report's fixtures
// are JSON a Deno suite imports, and the bakeoff harnesses are TypeScript tsc checks.
//
// The suites that read docs still run on a docs only commit (selectDocsSuites): every
// guard, every tooling suite under scripts/ (they read .claude/commands/*.md), and any
// other suite whose source names a doc. So the instruction budget, the filing rule and
// every other guard over the docs keep their verdict on the commit that moves the docs.

/** True when a change to this repo path can only move a test that reads docs. */
export function isDocsPath(p: string): boolean {
  if (p.startsWith('supabase/') || p.startsWith('scripts/')) return false;
  if (p.endsWith('.md')) return true;
  return p.startsWith('docs/') && p.endsWith('.html');
}

/** True when the list is non-empty and every path in it is docs. Empty is not docs only:
 *  a diff that read as empty is a read that failed, and that means the full run. */
export function allDocs(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every(isDocsPath);
}

// A suite that names a doc in its source: a docs/ path, a Markdown or HTML file, the
// .claude tree, or the two root files guards read by name. Over-matching costs seconds;
// under-matching would let a doc change skip the suite that judges it, so this errs wide.
const NAMES_A_DOC = /docs\/|\.md\b|\.html\b|\.claude\/|CLAUDE|STATUS/;

/** The jest suites a docs only commit still runs, sorted. Paths are repo relative. */
export function selectDocsSuites(suites: readonly { path: string; text: string }[]): string[] {
  return suites
    .filter((s) => s.path.startsWith('guards/') || s.path.startsWith('scripts/') || NAMES_A_DOC.test(s.text))
    .map((s) => s.path)
    .sort();
}

/** One earlier commit on the branch, newest first, as the walk sees it. */
export interface Candidate {
  sha: string;
  /** Every path changed between this commit and the head; null when the read failed or was capped. */
  changedSince: string[] | null;
  /** Whether a CI run on this commit passed; null when the read failed. */
  passed: boolean | null;
}

export interface Decision {
  docsOnly: boolean;
  reason: string;
}

const short = (sha: string) => sha.slice(0, 7);

/**
 * The decision for one run. `event` is the GitHub event; anything but a pull request is a
 * full run (main's own runs are the verdict of record and are never skipped). `prFiles` is
 * the pull request's whole diff against its base (null when unread). `candidates` are the
 * branch's earlier commits, newest first, the head excluded. Every unread value means the
 * full run: the rule fails open.
 */
export function decide(event: string, prFiles: string[] | null, candidates: readonly Candidate[]): Decision {
  if (event !== 'pull_request') return { docsOnly: false, reason: `a ${event} run always runs the full suites` };
  if (prFiles !== null && allDocs(prFiles)) {
    return { docsOnly: true, reason: `the pull request changes only docs (${prFiles.length} file${prFiles.length === 1 ? '' : 's'})` };
  }
  for (const c of candidates) {
    if (c.changedSince === null) return { docsOnly: false, reason: `could not read what changed since ${short(c.sha)}; full run` };
    if (!allDocs(c.changedSince)) {
      const code = c.changedSince.find((p) => !isDocsPath(p));
      return {
        docsOnly: false,
        reason: code === undefined ? `nothing read as changed since ${short(c.sha)}; full run` : `code changed (${code}) since the last passed run; full run`,
      };
    }
    if (c.passed === null) return { docsOnly: false, reason: `could not read the CI run on ${short(c.sha)}; full run` };
    if (c.passed) return { docsOnly: true, reason: `only docs changed since ${short(c.sha)}, whose CI run passed` };
  }
  return { docsOnly: false, reason: 'no earlier commit on this branch has a passed run with only docs changed since; full run' };
}
