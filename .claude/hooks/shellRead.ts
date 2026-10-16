// Proves a shell command only READS, or says why it cannot (CUL-1963). The gate asks on
// any command that names .claude and is not one plain read, so agents searching the
// repo's own rules (`git grep -n x origin/main -- .claude/ | head`, `find .claude -name
// '*.md'`) raised a dialog each time: 56 of 82 dialogs in four sessions, every one a
// read. Like sqlRead.ts, the question is never "does this write?" but "can I show this
// only reads?", answered by an allowlist, and anything this module cannot prove is NOT
// a read, so the gate still asks a person.
//
// What a proven read is: every command in the chain (`|`, `&&`, `||`, `;`, newline) is
// a reader below whose arguments hold no flag that writes or runs a program; nothing
// expands (`$`, a backtick: a variable can carry `-delete` into find); no subshell,
// group, brace, here-document or background job; and output goes nowhere but the pipe,
// /dev/null or another stream. A glob reaches a command only where no flag of it writes
// (a file named `-delete` would expand into find's arguments).
//
// Blind spots, stated so they do not read as coverage: a reader trusts the binary its
// name resolves to on PATH, and git trusts the repository's own config (a diff driver
// or textconv in .git/config runs on `git diff`/`git show`, as it already does on the
// single plain read the gate passed before this module).

export type ShellRead = { read: true } | { read: false; why: string };

type Word = { v: string; glob: boolean };
type Tok = { k: 'word'; w: Word } | { k: 'op' };

const DEV_NULL = '/dev/null';
const GLOB = /[*?[]/;
const TARGET_END = /[\s;&|<>()]/;

function lex(cmd: string): { toks: Tok[] } | { error: string } {
  const toks: Tok[] = [];
  const n = cmd.length;
  let v = '';
  let glob = false;
  let inWord = false;
  const flush = (): void => {
    if (inWord) toks.push({ k: 'word', w: { v, glob } });
    v = '';
    glob = false;
    inWord = false;
  };
  let i = 0;
  while (i < n) {
    const c = cmd[i];
    if (c === "'") {
      const end = cmd.indexOf("'", i + 1);
      if (end === -1) return { error: 'an unterminated quote' };
      v += cmd.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= n) return { error: 'an unterminated quote' };
        const d = cmd[j];
        if (d === '"') break;
        // `$"` is a literal dollar (a regex's end anchor); any other `$` may expand.
        if ((d === '$' && cmd[j + 1] !== '"') || d === '`') return { error: 'an expansion inside double quotes' };
        if (d === '\\' && j + 1 < n && '$`"\\\n'.includes(cmd[j + 1])) {
          v += cmd[j + 1];
          j += 2;
        } else {
          v += d;
          j++;
        }
      }
      inWord = true;
      i = j + 1;
    } else if (c === '\\') {
      if (i + 1 >= n) return { error: 'a trailing backslash' };
      if (cmd[i + 1] !== '\n') {
        v += cmd[i + 1];
        inWord = true;
      }
      i += 2;
    } else if (c === '$' || c === '`') {
      return { error: 'an expansion ($ or a backtick)' };
    } else if (c === ' ' || c === '\t') {
      flush();
      i++;
    } else if (c === '\n' || c === ';') {
      flush();
      toks.push({ k: 'op' });
      i++;
    } else if (c === '|') {
      flush();
      if (cmd[i + 1] === '&') return { error: 'a |& pipe' };
      toks.push({ k: 'op' });
      i += cmd[i + 1] === '|' ? 2 : 1;
    } else if (c === '&' && cmd[i + 1] === '&') {
      flush();
      toks.push({ k: 'op' });
      i += 2;
    } else if (c === '&' && cmd[i + 1] === '>') {
      flush();
      const end = redirect(cmd, i + 2, false);
      if (end < 0) return { error: 'output sent somewhere other than /dev/null' };
      i = end;
    } else if (c === '&') {
      return { error: 'a background job' };
    } else if (c === '>') {
      // `2>` and `>`: the fd is the digits just before, written with no quote.
      if (inWord && !/^\d$/.test(v)) return { error: 'a redirect glued to a word' };
      v = '';
      inWord = false;
      const end = redirect(cmd, i + 1, true);
      if (end < 0) return { error: 'output sent somewhere other than /dev/null' };
      i = end;
    } else if (c === '<') {
      return { error: 'an input redirect or here-document' };
    } else if ('(){}'.includes(c)) {
      return { error: 'a subshell, group or brace' };
    } else if (c === '#' && !inWord) {
      return { error: 'a comment' };
    } else if (c.charCodeAt(0) < 0x20) {
      return { error: 'a control character' };
    } else {
      if (GLOB.test(c)) glob = true;
      v += c;
      inWord = true;
      i++;
    }
  }
  flush();
  return { toks };
}

/** After `>` (or `&>`): the index past a redirect to /dev/null or another stream, or -1. */
function redirect(cmd: string, from: number, dupOk: boolean): number {
  let j = from;
  if (cmd[j] === '>') j++;
  if (dupOk && cmd[j] === '&') {
    const m = /^&[0-2](?=\s|[;&|]|$)/.exec(cmd.slice(j));
    return m ? j + m[0].length : -1;
  }
  while (cmd[j] === ' ' || cmd[j] === '\t') j++;
  let k = j;
  while (k < cmd.length && !TARGET_END.test(cmd[k])) k++;
  return cmd.slice(j, k) === DEV_NULL ? k : -1;
}

type Check = (args: Word[]) => string | null;

const ANY: Check = () => null;
// Long flags that write a file or run a program, whatever the reader (rg --pre, git
// --output, sort --compress-program, git grep --open-files-in-pager, git --ext-diff).
// GNU getopt and git both take any unambiguous prefix (`--outp=x` is `--output=x`), so a
// flag is refused when its name is a prefix of one of these.
const RUNS_OR_WRITES_LONG = ['output', 'pre', 'compress-program', 'open-files-in-pager', 'ext-diff'];
const writesOrRuns = (a: string): boolean => {
  if (!a.startsWith('--') || a === '--') return false;
  const name = a.slice(2).split('=')[0];
  return RUNS_OR_WRITES_LONG.some((d) => d.startsWith(name));
};

const checkFind: Check = (args) =>
  args.some((a) => /^-(?:exec|ok|delete|fprint|fls)/.test(a.v)) ? 'find with an action that runs or writes' : null;

const checkSort: Check = (args) =>
  args.some((a) => /^-[^-]*o/.test(a.v)) ? 'sort -o writes a file' : null;

// `uniq IN OUT` writes OUT.
const checkUniq: Check = (args) => (args.filter((a) => !a.v.startsWith('-')).length > 1 ? 'uniq with an output file' : null);

const SED_FLAGS = new Set(['-n', '-E', '-r', '-s', '-u', '-z', '--posix', '--quiet', '--silent', '--regexp-extended', '--null-data', '--separate', '--unbuffered']);
const SED_ADDR = String.raw`(?:\d+|\$|/[^/\\\n]*/)`;
const SED_RANGE = `${SED_ADDR}(?:,${SED_ADDR})?p`;
// Only print commands: `1,12p`, `$p`, `/^## /p`. A `w` or `e` command writes or runs.
const SED_PRINT = new RegExp(`^${SED_RANGE}(?:;${SED_RANGE})*$`);

const checkSed: Check = (args) => {
  const flags = args.filter((a) => a.v.startsWith('-') && a.v !== '-');
  if (flags.some((a) => !SED_FLAGS.has(a.v))) return 'sed with a flag that edits or loads a script';
  const script = args.find((a) => !a.v.startsWith('-') || a.v === '-');
  if (!script || !SED_PRINT.test(script.v)) return 'a sed script that is not a plain print';
  return null;
};

const GIT_READS = new Set(['grep', 'ls-tree', 'ls-files', 'log', 'show', 'diff', 'status', 'blame', 'rev-parse', 'merge-base', 'rev-list']);
// `git grep -O<pager>` opens the matches in a program (its long forms are above).
const GIT_RUNS = /^-[^-]*O/;

const checkGit: Check = (args) => {
  const k = args[0]?.v === '--no-pager' ? 1 : 0;
  const sub = args[k]?.v;
  if (!sub || !GIT_READS.has(sub)) return `git ${sub ?? ''} is not a read this gate knows`;
  if (args.slice(k + 1).some((a) => GIT_RUNS.test(a.v))) return 'git with a flag that runs a program';
  return null;
};

const READERS = new Map<string, Check>([
  ['cat', ANY], ['head', ANY], ['tail', ANY], ['wc', ANY], ['grep', ANY], ['rg', ANY], ['ls', ANY],
  ['stat', ANY], ['diff', ANY], ['jq', ANY], ['sha256sum', ANY], ['md5sum', ANY], ['cut', ANY],
  ['tr', ANY], ['echo', ANY], ['printf', ANY], ['true', ANY], ['basename', ANY], ['dirname', ANY],
  ['cd', (a) => (a.length > 1 ? 'cd with more than one argument' : null)],
  ['find', checkFind], ['sort', checkSort], ['uniq', checkUniq], ['sed', checkSed], ['git', checkGit],
]);

// Readers where a glob could expand into a flag that writes or runs.
const GLOB_SENSITIVE = new Set(['find', 'sort', 'uniq', 'sed', 'git', 'rg', 'diff']);

export function classifyShell(cmd: string): ShellRead {
  const lexed = lex(cmd);
  if ('error' in lexed) return { read: false, why: lexed.error };
  const segments: Word[][] = [[]];
  for (const t of lexed.toks) {
    if (t.k === 'op') segments.push([]);
    else segments[segments.length - 1].push(t.w);
  }
  const live = segments.filter((s) => s.length > 0);
  if (live.length === 0) return { read: false, why: 'no command' };
  for (const [head, ...args] of live) {
    const check = READERS.get(head.v);
    if (!check || head.glob) return { read: false, why: `${head.v} is not a reader this gate knows` };
    if (args.some((a) => writesOrRuns(a.v))) return { read: false, why: `${head.v} with a flag that writes or runs` };
    if (GLOB_SENSITIVE.has(head.v) && args.some((a) => a.glob)) return { read: false, why: `an unquoted glob reaching ${head.v}` };
    const why = check(args);
    if (why !== null) return { read: false, why };
  }
  return { read: true };
}
