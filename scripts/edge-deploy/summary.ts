// The job summaries the PM reads on each Actions run (CUL-1147). Plain markdown,
// written for someone who did not build this: what deployed, what was held and why,
// and what to do when something failed.
//
// The repo is public, so these pages are too. They carry function names, versions,
// commits, hashes and the function's own one-line error string from the smoke call,
// and nothing read from an API response beyond that.

import type { Outcome } from './deploy.ts';
import type { Plan, Row } from './plan.ts';
import type { DeployRecord } from './records.ts';

export type SummaryContext = {
  headSha: string;
  trigger: string; // e.g. "push" or "manual run: ask from 1a2b3c4"
  repoUrl: string;
};

const short = (sha: string) => sha.slice(0, 7);
const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function lastCell(last: DeployRecord | undefined): string {
  if (!last) return 'none recorded';
  const when = last.createdAt ? ` · ${last.createdAt.slice(0, 10)}` : '';
  return `v${last.version} · from \`${short(last.sourceSha)}\`${when} · [run](${last.runUrl})`;
}

const rolledBack = (last: DeployRecord | undefined) => !!last && last.fingerprint !== last.mainFingerprint;

function decisionCell(row: Row, mode: Plan['mode']): string {
  switch (row.decision) {
    case 'deploy': {
      const verb = mode === 'bootstrap' ? 'would deploy' : '**deploy**';
      const why = {
        first: 'no deploy on record yet',
        changed: 'code changed since its last deploy',
        requested: 'requested by hand',
        rollback: `rollback to \`${short(row.item.sourceSha)}\``,
      }[row.item.reason];
      return `${verb} (${why})`;
    }
    case 'unchanged':
      return rolledBack(row.last)
        ? `unchanged · **rolled back** to \`${short(row.last.sourceSha)}\`; main's version is not live`
        : 'unchanged';
    case 'held': {
      const behind = row.behind === null ? 'live state not on record' : row.behind ? "main's code is not live" : 'live matches main';
      return `**held** by ${row.hold.ref} · ${behind}`;
    }
    case 'not-requested':
      return row.owed ? 'not in this run · **owed a deploy**' : 'not in this run';
  }
}

export function planSummary(plan: Plan, ctx: SummaryContext): string {
  const lines: string[] = ['### Edge Function deploy plan', '', `Commit \`${short(ctx.headSha)}\` on main · ${ctx.trigger}`, ''];

  if (plan.mode === 'refused') {
    lines.push(`**Refused.** ${plan.refusal ?? ''}`, '');
    return lines.join('\n');
  }
  if (plan.mode === 'bootstrap') {
    lines.push(
      '**Nothing deploys yet.** No deploy has been recorded, so this run only shows what it would do. ' +
        'Start with one function: Actions → Deploy Edge Functions → Run workflow → pick the function. ' +
        'After the first recorded deploy, merges deploy on their own.',
      '',
    );
  } else if (plan.deploys.length) {
    lines.push(`**Deploying ${plan.deploys.length}**, in this order: ${plan.deploys.map((d) => `\`${d.fn}\``).join(', ')}.`, '');
  } else {
    lines.push("**Nothing to deploy.** No function's code changed since its last deploy.", '');
  }

  lines.push('| Function | Decision | Last recorded deploy |', '|---|---|---|');
  for (const row of plan.rows) {
    lines.push(`| \`${row.fn}\` | ${escapeCell(decisionCell(row, plan.mode))} | ${lastCell(row.last)} |`);
  }

  const holds = plan.rows.flatMap((r) => (r.decision === 'held' ? [r] : []));
  if (holds.length) {
    lines.push('', '**Holds** (in `supabase/functions/deploy-manifest.json`; delete the entry in a PR to release one):');
    for (const h of holds) {
      const since = h.hold.since ? `, since ${h.hold.since}` : '';
      lines.push(`- \`${h.fn}\` (${h.hold.ref}${since}): ${escapeCell(h.hold.reason)}`);
    }
  }

  const owed = plan.rows.filter((r) => r.decision === 'not-requested' && r.owed);
  if (owed.length) {
    lines.push(
      '',
      `${owed.length} other function(s) are owed a deploy (${owed.map((r) => `\`${r.fn}\``).join(', ')}). ` +
        'Run the workflow again with `all-changed` to deploy them.',
    );
  }
  const rollbacks = plan.rows.filter((r) => r.decision === 'unchanged' && rolledBack(r.last));
  if (rollbacks.length) {
    lines.push(
      '',
      `**A rollback is live** for ${rollbacks.map((r) => `\`${r.fn}\``).join(', ')}. It stays live until that ` +
        "function's code changes on main, so merge the fix or the revert (or a hold) next.",
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function resultSummary(
  outcomes: Outcome[],
  lastRecords: Record<string, DeployRecord | undefined>,
  ctx: SummaryContext,
): string {
  const lines = ['### Deploy results', '', '| Function | Result | Detail |', '|---|---|---|'];
  for (const o of outcomes) {
    if (o.result === 'deployed') {
      const detail = [...o.checks, `bundle sha256 \`${o.bundleSha256.slice(0, 16)}…\``].join(' · ');
      lines.push(`| \`${o.fn}\` | deployed v${o.version} | ${escapeCell(detail)} |`);
    } else if (o.result === 'failed') {
      const where = o.live ? 'the new code may be live' : 'nothing went live';
      lines.push(`| \`${o.fn}\` | **failed** at ${o.stage} | ${escapeCell(o.detail)} (${where}) |`);
    } else {
      lines.push(`| \`${o.fn}\` | not attempted | an earlier deploy in this run failed |`);
    }
  }
  const failure = outcomes.find((o) => o.result === 'failed');
  if (failure && failure.result === 'failed') {
    const last = lastRecords[failure.fn];
    lines.push('');
    if (failure.live && last) {
      lines.push(
        `**To put the previous version back:** Actions → Deploy Edge Functions → Run workflow → function ` +
          `\`${failure.fn}\`, ref \`${last.sourceSha}\` (v${last.version}, the last deploy that passed its checks).`,
      );
    } else if (failure.live) {
      lines.push(
        `No earlier deploy of \`${failure.fn}\` is on record to roll back to. Fix forward, or see ` +
          '`docs/edge-deploy-runbook.md` § Break glass.',
      );
    } else {
      lines.push('Nothing changed in production. Fix the cause and re-run this workflow, or merge the fix.');
    }
    lines.push('', `Run logs: ${ctx.repoUrl}/actions`);
  }
  lines.push('');
  return lines.join('\n');
}
