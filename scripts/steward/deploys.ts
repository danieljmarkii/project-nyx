// Which Edge Functions a merge would deploy (CUL-1654). `merge-check.sh` asks this
// for the base tree and the landed tree, and a self-merge that deploys anything waits
// for the PM's typed `merge`: merging to main runs the deploy workflow (CUL-1147), so a
// merge that changes a function's shipping code is a production write.
//
// The answer is the deploy workflow's own question, asked of two trees: a function
// deploys when its fingerprint (scripts/edge-deploy/fingerprint.ts, the one walker the
// workflow uses) differs between them and the landed deploy-manifest.json does not
// hold it, or when the landing releases a hold. A function the landing adds deploys.
//
// This file is the rule; `deploys-cli.ts` beside it reads the two trees and calls it.
//
// Stated blind spots:
//  - It compares the two trees, not the deploy records. A function main changed whose
//    deploy failed or was skipped deploys again on the next merge whatever it touches,
//    and this does not report it.
//  - Only ROOTS are read out of each tree. A closure that reaches past them leaves an
//    unresolved import, which is exit 3 (treated as deploying) until ROOTS grows.

// Every directory a function's closure reaches today (measured 2026-10-10: 8 functions,
// every closure file under these three, nothing unresolved).
export const ROOTS = ['supabase/functions', 'lib', 'constants'];
export const MANIFEST = 'supabase/functions/deploy-manifest.json';

export type Deploy = { fn: string; why: string };

/** The functions held by a manifest's text; an unreadable manifest is a thrown error. */
export function heldIn(manifest: string | null): Set<string> {
  if (manifest === null) return new Set();
  const parsed = JSON.parse(manifest) as { holds?: Record<string, unknown> };
  return new Set(Object.keys(parsed.holds ?? {}));
}

/** The pure rule: which functions the landing deploys, given both sides' facts. */
export function deploysBetween(
  base: Record<string, string>,
  landed: Record<string, string>,
  heldBase: Set<string>,
  heldLanded: Set<string>,
): Deploy[] {
  const out: Deploy[] = [];
  for (const fn of Object.keys(landed).sort()) {
    if (heldLanded.has(fn)) continue;
    if (!(fn in base)) out.push({ fn, why: 'new function' });
    else if (base[fn] !== landed[fn]) out.push({ fn, why: 'shipping code changed' });
    else if (heldBase.has(fn)) out.push({ fn, why: 'hold released' });
  }
  return out;
}
