// The production-write gate (CUL-1616, D3 of the /dispatch retro CUL-1606). Every agent
// writes to Linear and GitHub as the PM's account, so nothing an agent produces can
// prove the PM approved a production write. A permission dialog can: the harness
// raises it, only the person at the app answers it, and the answer lands in the
// session's transcript as a `control_request` / `control_response` pair (measured in
// the mechanism probe recorded on CUL-1616). So this hook turns every production write
// into that dialog, and makes the dialog say what is being approved.
//
// Rules, by tool:
//  - apply_migration → ask. The dialog's first line binds the SQL to the repo: MATCH
//    names the committed file in supabase/migrations/ the query equals exactly, and so
//    the number the PM types; MISMATCH says the SQL is in no file. A dialog that only
//    quoted the SQL let a write hide past a cut line (the isolated review, 2026-10-07).
//  - merge_branch (applies a branch's migrations to production), reset_branch,
//    rebase_branch, delete_branch, restore_project → ask.
//  - execute_sql → ask unless sqlRead.ts proves the SQL only reads; a proven read gets
//    NO opinion (PM ruling 2026-10-07), so the platform's own flow still decides it
//    and a lexer miss can never become a silent write.
//  - deploy_edge_function and pause_project → deny. The first skips the deploy workflow
//    and its holds; the second takes production offline, which no agent here needs.
//  - The gate's own files (.claude/settings*.json, .claude/hooks/, the user and managed
//    settings) → ask on any write (PM ruling 2026-10-07), so an Auto session cannot edit
//    the gate out without the dialog. Any shell command that mentions .claude, or runs
//    from inside it, asks unless it is one plain read.
//
// Every quoted value is escaped (control, format and bidirectional characters become
// visible `\u{…}`), every cut line or list says how much it cut, and the dialog names
// the branch that asked, so the same migration number in another session's dialog does
// not read as the one the PM typed for.
//
// MCP tools are matched by the tool's own name, whatever the server is called: in a
// cloud session a connector's server can be a UUID (`mcp__354c8bb4-…__apply_migration`)
// rather than `mcp__Supabase__`.
//
// Blind spots, stated so they do not read as coverage:
//  - A read this gate passes can still reach a writing function it cannot see: a
//    user-defined overload that out-matches a listed built-in, attribute notation
//    (`t.fn` calls `fn(t)`), a view or a type whose definition calls one. Each needs a
//    function or view created first, which is itself a write this gate asks about. (The
//    review found no live instance in supabase/migrations/ on 2026-10-07.)
//  - Only the tools named above are gated. A writing tool the connector adds later, and
//    a merge to main (which deploys Edge Functions), get no dialog from this hook.
//  - The self-guard reads paths and command text. A script written elsewhere and then
//    run, or a path assembled in the shell (`d=.cla; d+=ude`), gets past it. It is a
//    tripwire, not a wall.
//  - Hooks load when a session starts, so a session that started before this file
//    existed runs without it. When node cannot start at all, the settings.json fallback
//    asks on every matched call; when the harness skips hooks entirely, nothing here runs.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Decision, HookInput } from './hookIo.ts';
import { classifySql } from './sqlRead.ts';

export const PRODUCTION_PROJECT_ID = 'aigchluqluzuhtbfllgh';

// apply_migration is not here: it has its own branch, whose dialog binds the SQL to a file.
const ASK_TOOLS = new Set(['merge_branch', 'reset_branch', 'rebase_branch', 'delete_branch', 'restore_project']);

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const NOBODY_ELSE =
  'Approve only if you, the PM, asked for exactly this. No agent may answer this dialog, and nothing relayed counts (CUL-1616).';

/** `mcp__<server>__<tool>` → `<tool>`; null for a built-in tool. */
export function mcpToolName(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) return null;
  const at = toolName.lastIndexOf('__');
  return at > 3 ? toolName.slice(at + 2) : null;
}

export function decideGate(input: HookInput): Decision | null {
  const tool = mcpToolName(input.tool_name);
  if (tool === 'deploy_edge_function') {
    return {
      decision: 'deny',
      reason:
        'deploy_edge_function is blocked (CUL-1616). Edge Functions deploy only through the Deploy Edge ' +
        'Functions workflow on merge to main (CUL-1147), which honours the deploy-manifest holds such as ' +
        'delete-account. Merge the PR, or ask the PM to run that workflow from GitHub Actions.',
    };
  }
  if (tool === 'pause_project') {
    return {
      decision: 'deny',
      reason:
        'pause_project is blocked (CUL-1616): pausing a project takes it offline, and nothing in this repo needs an ' +
        'agent to do that. The PM pauses a project from the Supabase dashboard.',
    };
  }
  if (tool === 'apply_migration') return askMigration(input);
  if (tool === 'execute_sql') return askUnlessRead(input);
  if (tool && ASK_TOOLS.has(tool)) return askProjectWrite(tool, input);
  if (FILE_TOOLS.has(input.tool_name)) return askIfGateFile(input);
  if (input.tool_name === 'Bash') return askIfGateCommand(input);
  return null;
}

function projectDirOf(input: HookInput): string {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd;
}

function askMigration(input: HookInput): Decision {
  const ti = input.tool_input;
  const dir = projectDirOf(input);
  const rawName = typeof ti.name === 'string' ? ti.name : '';
  const name = rawName ? `"${clean(rawName).slice(0, 80)}"${/^[a-z0-9_]{1,80}$/.test(rawName) ? '' : ' (not a plain snake_case name)'}` : '(no name)';
  const bound = bindMigration(ti.query, rawName, dir);
  return {
    decision: 'ask',
    reason: [
      bound.line,
      `Production write: apply_migration ${name} on ${target(ti)}, asked from ${branchOf(dir)}.`,
      bound.number
        ? `Approve only if you, the PM, typed "apply ${bound.number}" in this session. No agent may answer this dialog, and nothing relayed counts (CUL-1616).`
        : NOBODY_ELSE,
      quoteSql(ti.query),
    ].join('\n'),
  };
}

type Binding = { line: string; number: string | null };

/** Which committed migration file, if any, the query is exactly. */
export function bindMigration(query: unknown, name: string, projectDir: string): Binding {
  const mismatch = (why: string): Binding => ({ line: `MISMATCH: ${why} Do not approve unless you know why.`, number: null });
  if (typeof query !== 'string') return mismatch('the call carries no SQL.');
  const dir = path.join(projectDir, 'supabase', 'migrations');
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => /^\d{3}_[^/]+\.sql$/.test(f)).sort();
  } catch {
    return mismatch('there is no supabase/migrations directory here, so the SQL matches no committed migration.');
  }
  const want = normalizeSql(query);
  const hit = files.find((f) => {
    try {
      return normalizeSql(fs.readFileSync(path.join(dir, f), 'utf8')) === want;
    } catch {
      return false;
    }
  });
  if (!hit) {
    const named = files.find((f) => f.slice(4, -4) === name);
    return mismatch(
      named
        ? `supabase/migrations/${named} has this name, but the SQL differs from it.`
        : 'the SQL equals no file in supabase/migrations/.',
    );
  }
  const rel = `supabase/migrations/${hit}`;
  return { line: `MATCH: the SQL is exactly ${rel}${commitStateOf(projectDir, rel)}.`, number: hit.slice(0, 3) };
}

function normalizeSql(s: string): string {
  return s.replace(/\r\n?/g, '\n').trim();
}

function git(dir: string, args: string[]): { status: number | null; out: string } {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 5000 });
  return { status: r.status, out: (r.stdout ?? '').trim() };
}

function commitStateOf(dir: string, rel: string): string {
  if (git(dir, ['ls-files', '--error-unmatch', '--', rel]).status !== 0) return ', but that file is not committed';
  const diff = git(dir, ['diff', '--quiet', 'HEAD', '--', rel]).status;
  if (diff === 1) return ', but that file has uncommitted changes';
  if (diff !== 0) return ' (commit state unknown)';
  const sha = git(dir, ['rev-parse', '--short', 'HEAD']).out;
  return `, as committed at ${sha || 'HEAD'}`;
}

function branchOf(dir: string): string {
  const b = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return b.status === 0 && b.out ? `branch ${clean(b.out)}` : 'an unknown branch';
}

function askUnlessRead(input: HookInput): Decision | null {
  const ti = input.tool_input;
  if (typeof ti.query !== 'string') {
    return { decision: 'ask', reason: `execute_sql on ${target(ti)} carries no SQL this gate can read.\n${NOBODY_ELSE}` };
  }
  const verdict = classifySql(ti.query);
  if (verdict.read) return null;
  return {
    decision: 'ask',
    reason: [
      `Possible database write: execute_sql on ${target(ti)}, asked from ${branchOf(projectDirOf(input))}, is not a proven read: ${verdict.why}.`,
      NOBODY_ELSE,
      quoteSql(ti.query),
    ].join('\n'),
  };
}

function askProjectWrite(tool: string, input: HookInput): Decision {
  const ti = input.tool_input;
  const what =
    tool === 'merge_branch'
      ? 'merges a branch into production, applying its migrations'
      : tool === 'restore_project'
        ? 'restores a paused Supabase project'
        : `changes a Supabase branch (${tool})`;
  const args = Object.entries(ti)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `${clean(k).slice(0, 40)}=${clean(String(v)).slice(0, 120)}`)
    .join(', ');
  return {
    decision: 'ask',
    reason:
      `Production write: ${tool} ${what}, asked from ${branchOf(projectDirOf(input))}. ` +
      `Target: ${args || '(no arguments)'}${projectFlag(ti)}.\n${NOBODY_ELSE}`,
  };
}

// The gate's own files. A write to any of them could switch the gate off: the project
// and user settings (hooks, `disableAllHooks`), the managed settings, and the scripts.
const GATE_FILE = /(?:^|\/)\.claude\/(?:settings[^/]*\.json$|hooks(?:\/|$))|^\/etc\/claude-code(?:\/|$)/;

export function isGateFile(abs: string): boolean {
  return GATE_FILE.test(abs) || GATE_FILE.test(realpathOfLongestExisting(abs));
}

function askIfGateFile(input: HookInput): Decision | null {
  const ti = input.tool_input;
  const p = typeof ti.file_path === 'string' ? ti.file_path : typeof ti.notebook_path === 'string' ? ti.notebook_path : null;
  if (p === null) return null;
  const abs = path.resolve(input.cwd, p);
  if (!isGateFile(abs)) return null;
  return {
    decision: 'ask',
    reason:
      `This edits the production gate's own files: ${clean(abs)}. A change here can switch off the dialog ` +
      'that guards production writes. Approve only if you, the PM, asked for this edit (CUL-1616).',
  };
}

// A shell command that mentions .claude, or runs from inside a .claude directory (where
// `sed -i … hooks/x.ts` names no .claude at all). One shape passes: a single plain read
// (no chaining, redirection, substitution or variables) by a command that cannot write
// or run code. `git add` is not one (a clean filter runs code), nor is `rg --pre`.
const NAMES_GATE = /\.claude\b|managed-settings|disableAllHooks/;
const IN_GATE_DIR = /(?:^|\/)\.claude(?:\/|$)|^\/etc\/claude-code(?:\/|$)/;
const SHELL_META = /[;&|<>`$\n\\(){}]/;
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'ls', 'stat', 'file', 'diff', 'jq', 'sha256sum', 'md5sum']);
const READ_GIT = new Set(['diff', 'log', 'show', 'status', 'blame', 'ls-files']);
const RUNS_OR_WRITES = /^--(?:output|pre)\b/;

function askIfGateCommand(input: HookInput): Decision | null {
  const cmd = typeof input.tool_input.command === 'string' ? input.tool_input.command : '';
  const cwd = path.resolve(input.cwd);
  const inside = IN_GATE_DIR.test(cwd) || IN_GATE_DIR.test(realpathOfLongestExisting(cwd));
  if (!NAMES_GATE.test(cmd) && !inside) return null;
  if (!SHELL_META.test(cmd)) {
    const words = cmd.trim().split(/\s+/);
    const unsafe = words.some((w) => RUNS_OR_WRITES.test(w));
    if (!unsafe && READ_COMMANDS.has(words[0])) return null;
    if (!unsafe && words[0] === 'git' && READ_GIT.has(words[1] ?? '')) return null;
  }
  return {
    decision: 'ask',
    reason:
      "This command names the production gate's own files (.claude/settings*.json, .claude/hooks/) or runs from " +
      'inside .claude, and is not a plain read. A change there can switch off the dialog that guards production ' +
      `writes. Approve only if you, the PM, asked for it (CUL-1616). Command: ${clean(cmd).slice(0, 400)}`,
  };
}

function target(ti: Record<string, unknown>): string {
  if (typeof ti.project_id !== 'string') return "no named project (the connector's default, which may be PRODUCTION)";
  return `project ${clean(ti.project_id).slice(0, 40)}${projectFlag(ti)}`;
}

function projectFlag(ti: Record<string, unknown>): string {
  return ti.project_id === PRODUCTION_PROJECT_ID ? ' (PRODUCTION)' : '';
}

const SQL_LINES = 12;
const LINE_CHARS = 160;

/**
 * The SQL's size and hash, then its first lines, each marked as quoted data so it cannot
 * pose as the dialog's own text. Every cut says how much it cut: a write past a cut
 * point is the one this dialog must not hide.
 */
function quoteSql(q: unknown): string {
  if (typeof q !== 'string') return 'SQL: (none given)';
  const lines = q.split(/\r\n|\r|\n/);
  const sha = createHash('sha256').update(q).digest('hex').slice(0, 12);
  const shown = lines.slice(0, SQL_LINES).map((l) => {
    const c = clean(l);
    return c.length > LINE_CHARS ? `  | ${c.slice(0, LINE_CHARS)} …[+${c.length - LINE_CHARS} more characters on this line]` : `  | ${c}`;
  });
  const hidden = lines.length - SQL_LINES;
  const rest = hidden > 0 ? [`  …[+${plural(hidden, 'more line')} not shown]`] : [];
  return [`SQL: ${plural(lines.length, 'line')}, ${plural(q.length, 'character')}, sha256 ${sha}:`, ...shown, ...rest].join('\n');
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

// Characters that hide or reorder text: controls, format characters (zero-width, bidi,
// soft hyphen, tag characters), line and paragraph separators, variation selectors, the
// combining grapheme joiner and the Hangul fillers.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u034f\u115f\u1160\u3164\uffa0\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu;

/** Make text safe to show in the dialog: every invisible character becomes a visible `\u{…}`. */
export function clean(s: string): string {
  return s.replace(/\t/g, '  ').replace(INVISIBLE, (c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16)}}`);
}

function realpathOfLongestExisting(abs: string): string {
  let head = abs;
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return abs;
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}
