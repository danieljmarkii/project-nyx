// CLI entry point for the device-pass fixture seed (CUL-1222, GC-2).
//
//   deno run scripts/emit-fixture-seed.deno.ts \
//     --user <fixture-user-uuid> --email <alias+culprit-fixture@…> \
//     --timezone America/New_York [--dry-run] > fixture.sql
//
// Prints the run-time-relative seed SQL (docs/device-pass-fixture-runbook.md step 3). With
// --dry-run it emits the prelude + upserts + a scoped read-back + ROLLBACK, so nothing
// persists. A thin Deno-only shell over scripts/fixture/emitFixtureSql.ts, at the top of
// scripts/ for the reason emit-demo-seed.deno.ts gives (the `scripts/*.deno.ts` check glob).

import { emitFixtureSqlForParams } from './fixture/emitFixtureSql.ts';

function fail(message: string): never {
  console.error(`emit-fixture-seed: ${message}`);
  console.error(
    'usage: deno run scripts/emit-fixture-seed.deno.ts --user <uuid> --email <alias+culprit-fixture@…> --timezone <IANA> [--dry-run]',
  );
  Deno.exit(1);
}

let userId = '';
let email = '';
let timezone = '';
let dryRun = false;
for (let i = 0; i < Deno.args.length; i++) {
  const arg = Deno.args[i];
  if (arg === '--user') userId = Deno.args[++i] ?? '';
  else if (arg === '--email') email = Deno.args[++i] ?? '';
  else if (arg === '--timezone') timezone = Deno.args[++i] ?? '';
  else if (arg === '--dry-run') dryRun = true;
  else fail(`unknown argument: ${arg}`);
}
if (!userId) fail('--user <uuid> is required');
if (!email) fail('--email <alias+culprit-fixture@…> is required');
if (!timezone) fail('--timezone <IANA> is required (e.g. America/New_York)');

try {
  console.log(emitFixtureSqlForParams({ userId, email, timezone }, { dryRun }));
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
