// CUL-677 / W1-PR-4 — CLI wrapper around the pure emitter.
//
//   deno run --allow-read --allow-write scripts/w1-other-row-swap/emit.deno.ts [--live] [--rollback]
//
// Writes swap.dry-run.sql / swap.live.sql / rollback.live.sql beside this file, and
// prints the emitted SQL. Default is a DRY RUN — the live file is only written when
// --live is passed, so an absent-minded run cannot leave a committable live script
// lying around next to the dry one.
//
// The `.deno.ts` suffix keeps this out of the app's tsc run (tsconfig excludes it);
// `emitSwapSql.ts` itself is plain TS and IS type-checked and jest-covered.

import { emitRollbackSql, emitSwapSql, type ReviewedList } from './emitSwapSql.ts';

const here = new URL('.', import.meta.url).pathname;
const list = JSON.parse(await Deno.readTextFile(`${here}reviewed-ids.json`)) as ReviewedList;

const live = Deno.args.includes('--live');
const rollback = Deno.args.includes('--rollback');
const generatedOn = new Date().toISOString().slice(0, 10);

const emit = rollback ? emitRollbackSql : emitSwapSql;
const sql = emit(list, { dryRun: !live, generatedOn });

const name = rollback
  ? (live ? 'rollback.live.sql' : 'rollback.dry-run.sql')
  : (live ? 'swap.live.sql' : 'swap.dry-run.sql');
await Deno.writeTextFile(`${here}${name}`, sql);
console.error(`wrote ${name} (${live ? 'LIVE — ends in COMMIT' : 'dry run — ends in ROLLBACK'})`);
console.log(sql);
