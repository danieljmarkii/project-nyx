// What a deploy run does, decided per function (CUL-1147).
//
// The rule the PM set: deploy only functions whose shipping closure changed since
// their last recorded deploy, and never a held one. "Changed" compares `main`'s
// fingerprint now against `mainFingerprint` on the function's last successful
// record, which is `main`'s fingerprint when it last deployed. For an ordinary
// deploy that is also the fingerprint that went live; for a rollback it is not, and
// that difference is the point: a rollback stays live until `main` changes that
// function again (the fix or the revert), instead of being undone by the next
// unrelated merge.
//
// BOOTSTRAP. Until any successful deploy is on record, a push run deploys nothing
// and prints what it would have done. That is what makes merging this workflow safe
// before its first proof run, and it fails closed if the records are ever lost.
//
// Pure: fingerprints, records and the ledger come in as arguments.

import { inDeployOrder, type Hold, type Ledger } from './ledger.ts';
import type { DeployRecord } from './records.ts';

export const ALL_CHANGED = 'all-changed';

export type Request =
  // push, or a manual `all-changed` run. Only a push is gated by bootstrap: a
  // manual run is someone choosing to deploy.
  | { kind: 'changed'; bootstrapGate: boolean }
  // a manual run for one function; `sourceSha` is `main`'s head for a redeploy,
  // or an older commit on `main` for a rollback
  | { kind: 'one'; fn: string; sourceSha: string };

export type PlanInput = {
  functions: string[];
  fingerprints: Record<string, string>;
  ledger: Ledger;
  records: Record<string, DeployRecord | undefined>;
  headSha: string;
  request: Request;
};

export type DeployReason = 'first' | 'changed' | 'requested' | 'rollback';
export type DeployItem = { fn: string; sourceSha: string; reason: DeployReason };

export type Row =
  | { fn: string; decision: 'deploy'; item: DeployItem; last?: DeployRecord }
  | { fn: string; decision: 'unchanged'; last: DeployRecord }
  // `behind`: main's code differs from what is live. Null when nothing is on record.
  | { fn: string; decision: 'held'; hold: Hold; last?: DeployRecord; behind: boolean | null }
  // a manual run for another function; `owed` says a push would deploy this one
  | { fn: string; decision: 'not-requested'; owed: boolean; last?: DeployRecord };

export type Plan = {
  mode: 'normal' | 'bootstrap' | 'refused';
  rows: Row[];
  deploys: DeployItem[];
  refusal?: string;
};

// The decision a push would make for one function.
function changedRow(fn: string, input: PlanInput): Row {
  const last = input.records[fn];
  const hold = input.ledger.holds[fn];
  if (hold) {
    return { fn, decision: 'held', hold, last, behind: last ? input.fingerprints[fn] !== last.fingerprint : null };
  }
  if (!last) return { fn, decision: 'deploy', item: { fn, sourceSha: input.headSha, reason: 'first' } };
  if (input.fingerprints[fn] !== last.mainFingerprint) {
    return { fn, decision: 'deploy', item: { fn, sourceSha: input.headSha, reason: 'changed' }, last };
  }
  return { fn, decision: 'unchanged', last };
}

const orderedDeploys = (rows: Row[], ledger: Ledger): DeployItem[] =>
  inDeployOrder(
    rows.flatMap((r) => (r.decision === 'deploy' ? [r.item] : [])),
    ledger.order,
  );

export function planDeploys(input: PlanInput): Plan {
  const { functions, request, ledger } = input;
  const missing = functions.filter((fn) => typeof input.fingerprints[fn] !== 'string');
  if (missing.length) {
    return { mode: 'refused', rows: [], deploys: [], refusal: `No fingerprint for ${missing.join(', ')}.` };
  }

  if (request.kind === 'changed') {
    const rows = functions.map((fn) => changedRow(fn, input));
    const noRecords = functions.every((fn) => !input.records[fn]);
    if (request.bootstrapGate && noRecords) return { mode: 'bootstrap', rows, deploys: [] };
    return { mode: 'normal', rows, deploys: orderedDeploys(rows, ledger) };
  }

  const { fn, sourceSha } = request;
  if (!functions.includes(fn)) {
    return { mode: 'refused', rows: [], deploys: [], refusal: `There is no deployable function named '${fn}' on main.` };
  }
  const hold = ledger.holds[fn];
  if (hold) {
    return {
      mode: 'refused',
      rows: [],
      deploys: [],
      refusal:
        `'${fn}' is held (${hold.ref}): ${hold.reason} ` +
        `A manual run does not override a hold. Lift it in a PR (delete holds.${fn} in ` +
        `supabase/functions/deploy-manifest.json); merging that PR deploys it.`,
    };
  }
  const item: DeployItem = { fn, sourceSha, reason: sourceSha === input.headSha ? 'requested' : 'rollback' };
  const rows: Row[] = functions.map((other) => {
    if (other === fn) return { fn, decision: 'deploy', item, last: input.records[fn] };
    const row = changedRow(other, input);
    return { fn: other, decision: 'not-requested', owed: row.decision === 'deploy', last: input.records[other] };
  });
  return { mode: 'normal', rows, deploys: [item] };
}
