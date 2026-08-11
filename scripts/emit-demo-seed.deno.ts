// CLI entry point for the Culprit App Review demo seed (B-271, PR 1).
//
//   deno run scripts/emit-demo-seed.deno.ts \
//     --user <demo-user-uuid> --pet <demo-pet-uuid> \
//     --timezone America/New_York [--dry-run] > seed.sql
//
// Prints the run-time-relative seed SQL to stdout (the PM pastes it into the
// Supabase MCP `execute_sql`, service role, at runbook step 2 — §12.3). With
// --dry-run it emits the assert + upserts + a scoped counts read-back + ROLLBACK
// so nothing persists (the pre-flight, §8).
//
// WHY THIS LIVES AT scripts/ TOP LEVEL, not scripts/demo/ (S4 / Eng F8): a
// Deno-global entry point (`Deno.args`, `Deno.exit`) must carry the
// `*.deno.ts` suffix so tsconfig's `scripts/*.deno.ts` exclude keeps it out of
// the app's `tsc` run — the app graph has no `Deno` global. Those exclude/
// deno-check globs do NOT recurse, so an entry point under scripts/demo/ would
// be type-checked by NOTHING. The pure, dual-checked logic lives in
// scripts/demo/{demoStory,emitSeedSql}.ts; this file is a thin, Deno-only shell
// over it, kept deliberately trivial because it is the one piece no type-check
// covers.

import { emitSeedSqlForParams } from './demo/emitSeedSql.ts';

function fail(message: string): never {
  console.error(`emit-demo-seed: ${message}`);
  console.error(
    'usage: deno run scripts/emit-demo-seed.deno.ts --user <uuid> --pet <uuid> --timezone <IANA> [--dry-run]',
  );
  Deno.exit(1);
}

function parseArgs(argv: string[]): {
  userId: string;
  petId: string;
  timezone: string;
  dryRun: boolean;
} {
  let userId = '';
  let petId = '';
  let timezone = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--user':
        userId = argv[++i] ?? '';
        break;
      case '--pet':
        petId = argv[++i] ?? '';
        break;
      case '--timezone':
        timezone = argv[++i] ?? '';
        break;
      case '--dry-run':
        dryRun = true;
        break;
      default:
        fail(`unknown argument: ${arg}`);
    }
  }
  if (!userId) fail('--user <uuid> is required');
  if (!petId) fail('--pet <uuid> is required');
  if (!timezone) fail('--timezone <IANA> is required (e.g. America/New_York)');
  return { userId, petId, timezone, dryRun };
}

const { userId, petId, timezone, dryRun } = parseArgs(Deno.args);

try {
  // emitSeedSqlForParams validates the uuids (uuidLit) and throws on a malformed
  // one, so a mistyped id fails here rather than producing invalid SQL.
  const sql = emitSeedSqlForParams({ userId, petId, timezone }, { dryRun });
  console.log(sql);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
