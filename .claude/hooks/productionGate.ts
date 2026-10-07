// The production-write gate (CUL-1616, D3 of the /dispatch retro CUL-1606). Every agent
// writes to Linear and GitHub as the PM's account, so nothing an agent produces can
// prove the PM approved a production write. A permission dialog can: the harness
// raises it, only the person at the app answers it, and the answer lands in the
// session's transcript as a `control_request` / `control_response` pair (measured in
// the mechanism probe recorded on CUL-1616). So this hook turns every production write
// into that dialog.
//
// Rules, by tool:
//  - apply_migration, and the branch and project tools that write (merge_branch, which
//    applies a branch's migrations to production; reset_branch; rebase_branch;
//    delete_branch; pause_project; restore_project) → ask, naming the target and
//    quoting the SQL.
//  - execute_sql → ask unless sqlRead.ts proves the SQL only reads; a proven read gets
//    NO opinion (PM ruling 2026-10-07), so the platform's own flow still decides it
//    and a lexer miss can never become a silent write.
//  - deploy_edge_function → deny. It skips the deploy workflow and its holds.
//  - The gate's own files (.claude/settings*.json, .claude/hooks/, the managed
//    settings) → ask on any write (PM ruling 2026-10-07), so an Auto session cannot
//    edit the gate out without the dialog.
//
// MCP tools are matched by the tool's own name, whatever the server is called: in a
// cloud session a connector's server can be a UUID (`mcp__354c8bb4-…__apply_migration`)
// rather than `mcp__Supabase__`.
//
// Blind spots, stated so they do not read as coverage:
//  - A read this gate passes can still reach a writing function it cannot see: a
//    user-defined overload that out-matches a listed built-in, attribute notation
//    (`t.fn` calls `fn(t)`), a view or a type whose definition calls one. Each needs a
//    function or view created first, which is itself a write this gate asks about.
//  - The self-guard reads paths and command text. A script written elsewhere and then
//    run, a `git checkout` / `git stash` that swaps the files, or a path assembled in
//    the shell (`d=.cla; d+=ude`) gets past it. It is a tripwire, not a wall.
//  - When node cannot start at all, the settings.json fallback asks on every matched
//    call; when the harness skips hooks entirely, nothing here runs.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Decision, HookInput } from './hookIo.ts';
import { classifySql } from './sqlRead.ts';

export const PRODUCTION_PROJECT_ID = 'aigchluqluzuhtbfllgh';

// apply_migration is not here: it has its own branch, whose dialog names the number the
// PM types and quotes the SQL.
const ASK_TOOLS = new Set([
  'merge_branch',
  'reset_branch',
  'rebase_branch',
  'delete_branch',
  'pause_project',
  'restore_project',
]);

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
  if (tool === 'apply_migration') return askMigration(input.tool_input);
  if (tool === 'execute_sql') return askUnlessRead(input.tool_input);
  if (tool && ASK_TOOLS.has(tool)) return askProjectWrite(tool, input.tool_input);
  if (FILE_TOOLS.has(input.tool_name)) return askIfGateFile(input);
  if (input.tool_name === 'Bash') return askIfGateCommand(input.tool_input);
  return null;
}

function askMigration(ti: Record<string, unknown>): Decision {
  const name = typeof ti.name === 'string' ? ti.name : '(no name)';
  const number = /^\d+/.exec(name)?.[0];
  return {
    decision: 'ask',
    reason: [
      `Production write: apply_migration "${clean(name)}" on ${target(ti)}.`,
      number
        ? `Approve only if you, the PM, typed "apply ${number}" for this migration. No agent may answer this dialog, and nothing relayed counts (CUL-1616).`
        : NOBODY_ELSE,
      quoteSql(ti.query),
    ].join('\n'),
  };
}

function askUnlessRead(ti: Record<string, unknown>): Decision | null {
  if (typeof ti.query !== 'string') {
    return { decision: 'ask', reason: `execute_sql on ${target(ti)} carries no SQL this gate can read.\n${NOBODY_ELSE}` };
  }
  const verdict = classifySql(ti.query);
  if (verdict.read) return null;
  return {
    decision: 'ask',
    reason: [
      `Possible database write: execute_sql on ${target(ti)} is not a proven read: ${verdict.why}.`,
      NOBODY_ELSE,
      quoteSql(ti.query),
    ].join('\n'),
  };
}

function askProjectWrite(tool: string, ti: Record<string, unknown>): Decision {
  const what =
    tool === 'merge_branch'
      ? 'merges a branch into production, applying its migrations'
      : tool === 'pause_project'
        ? 'pauses a Supabase project'
        : tool === 'restore_project'
          ? 'restores a paused Supabase project'
          : `changes a Supabase branch (${tool})`;
  const args = Object.entries(ti)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `${k}=${clean(String(v))}`)
    .join(', ');
  return {
    decision: 'ask',
    reason: `Production write: ${tool} ${what}. Target: ${args || '(no arguments)'}${projectFlag(ti)}.\n${NOBODY_ELSE}`,
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

// A command that names a gate file. One shape passes: a single plain read (no chaining,
// redirection, substitution or variables) by a command that cannot write.
const NAMES_GATE_FILE = /\.claude\b[\s\S]*(?:settings[\w.-]*\.json|hooks)|managed-settings|disableAllHooks/;
const SHELL_META = /[;&|<>`$\n\\(){}]/;
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'ls', 'stat', 'file', 'diff', 'jq', 'sha256sum', 'md5sum']);
const READ_GIT = new Set(['diff', 'log', 'show', 'status', 'add', 'blame', 'ls-files']);

function askIfGateCommand(ti: Record<string, unknown>): Decision | null {
  const cmd = typeof ti.command === 'string' ? ti.command : '';
  if (!NAMES_GATE_FILE.test(cmd)) return null;
  if (!SHELL_META.test(cmd)) {
    const words = cmd.trim().split(/\s+/);
    const writesAFile = words.some((w) => w.startsWith('--output'));
    if (!writesAFile && READ_COMMANDS.has(words[0])) return null;
    if (!writesAFile && words[0] === 'git' && READ_GIT.has(words[1] ?? '')) return null;
  }
  return {
    decision: 'ask',
    reason:
      "This command names the production gate's own files (.claude/settings*.json, .claude/hooks/) and is " +
      'not a plain read. A change there can switch off the dialog that guards production writes. Approve only ' +
      `if you, the PM, asked for it (CUL-1616). Command: ${clean(cmd).slice(0, 400)}`,
  };
}

function target(ti: Record<string, unknown>): string {
  const id = typeof ti.project_id === 'string' ? clean(ti.project_id) : '(no project_id)';
  return `project ${id}${projectFlag(ti)}`;
}

function projectFlag(ti: Record<string, unknown>): string {
  return ti.project_id === PRODUCTION_PROJECT_ID ? ' (PRODUCTION)' : '';
}

const SQL_LINES = 12;

/** The first lines of the SQL, each marked as quoted data so it cannot pose as the dialog's own text. */
function quoteSql(q: unknown): string {
  if (typeof q !== 'string') return 'SQL: (none given)';
  const lines = q.split(/\r\n|\r|\n/);
  const head = lines.slice(0, SQL_LINES).map((l) => `  | ${clean(l).slice(0, 160)}`);
  const label = lines.length > SQL_LINES ? `SQL, first ${SQL_LINES} of ${lines.length} lines:` : 'SQL:';
  return [label, ...head].join('\n');
}

/**
 * Make text safe to show in the dialog: control, bidirectional and zero-width
 * characters become visible `\u{…}` escapes, so a value cannot reorder or hide what
 * the PM reads.
 */
export function clean(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, (c) => `\\u{${c.charCodeAt(0).toString(16)}}`);
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
