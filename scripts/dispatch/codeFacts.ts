// Facts the dispatch script reads from the repository's own code rather than from the
// dispatcher (CUL-1872): what a hand-written list could get wrong, and where being wrong is
// QUIET. Read-only; it never touches the network.
//
// WHY. The sort's dark proof honours the `{"enabled": false, "allowlist": []}` object only for
// a key the code reads through the allowlist resolver. A kill switch read by
// `resolveFlagValue(raw, true)` turns every non-boolean into its fallback, so the same object
// is ON for every account (adversarial pass 2). The lists of allowlist-read keys live in the
// code; a facts file is never trusted for them.

import * as fs from 'node:fs';
import * as path from 'node:path';

// The repository root: the CLI and jest both run from it. A root that lacks the files reads
// as unreadable, which fails the run (never a guess).
const ROOT = process.cwd();

function readList(rel: string, name: string): string[] | undefined {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return undefined;
  const src = fs.readFileSync(file, 'utf8');
  const m = new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`).exec(src);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : undefined;
}

// `lib/appConfig.ts` ALLOWLIST_FLAG_KEYS and `_shared/engineFlags.ts` ENGINE_KEYS. Undefined
// when either cannot be read: the caller fails the run rather than guess.
export function allowlistKeysFromCode(): string[] | undefined {
  const a = readList('lib/appConfig.ts', 'ALLOWLIST_FLAG_KEYS');
  const b = readList('supabase/functions/_shared/engineFlags.ts', 'ENGINE_KEYS');
  return a && b && a.length && b.length ? [...new Set([...a, ...b])] : undefined;
}
