// What a landing changes (CUL-2874): its files and its added and removed lines, read from
// git for the self merge verdict. selfMerge-cli.ts and selfMerge-replay.ts share it.

import { execFileSync } from 'node:child_process';

const git = (a: string[]) => execFileSync('git', ['-c', 'core.quotePath=false', ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

export type Landing = { files: string[]; changedLines: { file: string; line: string }[] };

/** Throws when git cannot read either side; the caller treats that as held. */
export function readLanding(base: string, landed: string): Landing {
  const files = git(['diff', '--name-only', '--no-renames', base, landed]).split('\n').filter(Boolean);
  const changedLines: Landing['changedLines'] = [];
  // Headers sit between `diff --git` and the first `@@`; only after that is a `+` or `-`
  // line content, so a changed line that itself starts with `++` is never read as a header.
  let file = '';
  let inHunk = false;
  for (const l of git(['diff', '-U0', '--no-renames', '--no-color', base, landed]).split('\n')) {
    if (l.startsWith('diff --git ')) {
      inHunk = false;
      file = '';
    } else if (!inHunk && (l.startsWith('--- ') || l.startsWith('+++ '))) {
      const p = l.slice(4).replace(/^[ab]\//, '');
      if (p !== '/dev/null') file = p;
    } else if (l.startsWith('@@')) inHunk = true;
    else if (inHunk && file && (l.startsWith('+') || l.startsWith('-'))) changedLines.push({ file, line: l.slice(1) });
  }
  return { files, changedLines };
}
