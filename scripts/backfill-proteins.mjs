#!/usr/bin/env node
// B-416 — re-derive `food_items.proteins` from stored `ingredients_notes`.
//
//   node scripts/backfill-proteins.mjs --rows <rows.json> [--no-rekey] [--out <dir>]
//
// The pass DOES NOT WRITE. It emits SQL for a human to read, apply, and keep:
//
//   <out>/backfill-proteins.sql           — the forward pass
//   <out>/backfill-proteins-rollback.sql  — the exact reversal, per row
//   <out>/backfill-proteins-report.md     — before/after, one line per changed row
//
// Why not write directly: this is a re-key of clinical data, and D3a's standing
// guard asks every Class-A/B re-key to ship with a before/after affected-row
// count. A pass whose output can be read in full before it is applied satisfies
// that by construction; one that mutates 62 rows and prints a summary does not.
// Applying is a separate, deliberate step (the Supabase MCP `execute_sql`, per
// docs/edge-deploy-runbook.md).
//
// Input `rows.json` is an array of food_items rows:
//   [{ id, brand, product_name, primary_protein, proteins, ingredients_notes }, …]
// Produce it with:
//   SELECT id, brand, product_name, primary_protein, proteins, ingredients_notes
//   FROM food_items ORDER BY brand, product_name;
//
// The derivation itself lives in lib/proteinBackfill.ts and is unit-tested there.
// This file is only I/O — deliberately, so the logic that touches clinical data is
// covered by `npm test` rather than by a script nobody runs twice.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { rows: null, out: join(ROOT, 'scripts'), rekey: true };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rows') args.rows = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--no-rekey') args.rekey = false;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.rows) throw new Error('Missing --rows <rows.json>');
  return args;
}

// The derivation is TypeScript and dependency-free by design (the same property
// that lets lib/protein.ts import from both Metro and Deno). Compiling it with the
// repo's own tsc keeps ONE implementation — the jest-tested one — rather than a
// hand-ported copy that could drift from the module the app actually runs.
function loadBackfillModule() {
  const outDir = mkdtempSync(join(tmpdir(), 'nyx-backfill-'));
  execFileSync(
    'npx',
    [
      'tsc',
      join(ROOT, 'lib', 'proteinBackfill.ts'),
      '--outDir', outDir,
      '--module', 'commonjs',
      '--target', 'es2022',
      '--skipLibCheck',
      // TS 6 errors (TS5112) rather than silently ignoring tsconfig.json when files
      // are named on the command line. The repo config targets the RN app and would
      // drag in its JSX/lib settings; this compile wants only the two pure modules.
      // `moduleResolution` is deliberately left unset: naming it explicitly trips
      // TS6's node10 deprecation error, and the default for `--module commonjs` is
      // already what these two dependency-free files need.
      '--ignoreConfig',
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  return createRequire(import.meta.url)(join(outDir, 'proteinBackfill.js'));
}

const sqlText = (value) =>
  value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;

const sqlTextArray = (values) =>
  values.length === 0
    ? `'{}'::text[]`
    : `ARRAY[${values.map(sqlText).join(', ')}]::text[]`;

// GUARD 1, mechanically enforced: both columns are set in ONE statement. Splitting
// them lets `proteins` be re-keyed while `primary_protein` keeps its old value,
// which is the shipped page-1 failure (a whitefish trial reported as contaminated
// with whitefish). There is deliberately no code path here that emits one column.
const forwardStatement = (plan) =>
  `UPDATE food_items SET primary_protein = ${sqlText(plan.primaryProtein)}, ` +
  `proteins = ${sqlTextArray(plan.proteins)} WHERE id = ${sqlText(plan.id)};`;

const rollbackStatement = (row) =>
  `UPDATE food_items SET primary_protein = ${sqlText(row.primary_protein)}, ` +
  `proteins = ${sqlTextArray(row.proteins ?? [])} WHERE id = ${sqlText(row.id)};`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { planRow } = loadBackfillModule();

  const rows = JSON.parse(readFileSync(args.rows, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('--rows must contain a JSON array');

  const options = { rekeyPrimaryProtein: args.rekey };
  const planned = rows.map((row) => ({ row, plan: planRow(row, options) }));
  const changed = planned.filter(({ plan }) => plan.changed);
  const rekeyed = changed.filter(({ plan }) => plan.rekeyedPrimary);
  // Reported separately on purpose — see BackfillPlan.classBRekey. Collapsing the
  // two into one "re-keyed" number overstates what the PM actually ratified.
  const classB = changed.filter(({ plan }) => plan.classBRekey);
  const unusual = changed.flatMap(({ row, plan }) =>
    plan.provenance.filter((d) => d.unusual).map((d) => ({ row, d })));

  mkdirSync(args.out, { recursive: true });

  const header = [
    '-- B-416 — re-derive food_items.proteins from stored ingredients_notes.',
    '-- GENERATED by scripts/backfill-proteins.mjs — do not hand-edit.',
    `-- Class-B primary re-key: ${args.rekey ? 'ON (PM-ratified 2026-07-25)' : 'OFF'}`,
    `-- Rows scanned: ${rows.length} · rows changed: ${changed.length}`,
    `-- Primaries rewritten: ${rekeyed.length} (Class B, PM-ratified: ${classB.length} · Class A, always permitted: ${rekeyed.length - classB.length})`,
    '--',
    '-- Additive only: no statement removes a stored protein key. Idempotent: a',
    '-- second run over the post-state produces zero statements.',
    '',
    'BEGIN;',
  ].join('\n');

  writeFileSync(
    join(args.out, 'backfill-proteins.sql'),
    `${header}\n${changed.map(({ plan }) => forwardStatement(plan)).join('\n')}\nCOMMIT;\n`,
  );

  writeFileSync(
    join(args.out, 'backfill-proteins-rollback.sql'),
    [
      '-- B-416 rollback — restores the exact pre-backfill values of every row the',
      '-- forward pass touched. Generated from the same input, so it is only valid',
      '-- against a database the forward pass has been applied to unchanged.',
      '',
      'BEGIN;',
      ...changed.map(({ row }) => rollbackStatement(row)),
      'COMMIT;',
      '',
    ].join('\n'),
  );

  const report = [
    '# B-416 — protein re-derivation, before/after',
    '',
    `- Rows scanned: **${rows.length}**`,
    `- Rows changed: **${changed.length}**`,
    `- Primaries rewritten: **${rekeyed.length}** — of which **${classB.length}** Class B (semantic, PM-ratified) and **${rekeyed.length - classB.length}** Class A (casing / processing qualifier, permitted always)`,
    `- Class-B primary re-key: **${args.rekey ? 'ON' : 'OFF'}**`,
    `- Derivations flagged for a human eye (⚠): **${unusual.length}**`,
    '',
    '| Food | primary_protein | proteins before | proteins after | added (← panel term) |',
    '|---|---|---|---|---|',
    ...changed.map(({ row, plan }) => {
      const name = `${row.brand ?? ''} ${row.product_name ?? ''}`.trim();
      const primary = plan.rekeyedPrimary
        ? `\`${row.primary_protein}\` → **\`${plan.primaryProtein}\`** ${plan.classBRekey ? '(B)' : '(A)'}`
        : `\`${row.primary_protein ?? 'NULL'}\``;
      const fmt = (list) => (list.length ? list.map((p) => `\`${p}\``).join(', ') : '—');
      // Provenance is shown for every added key so a reviewer can check the
      // derivation against the label without opening the panel text; ⚠ marks the
      // ones where the animal name rode on an unusual carrier.
      const added = plan.provenance.length
        ? plan.provenance
            .map((d) => `\`${d.key}\` ← _${d.term}_${d.unusual ? ' ⚠' : ''}`)
            .join('<br>')
        : '—';
      return `| ${name} | ${primary} | ${fmt(row.proteins ?? [])} | ${fmt(plan.proteins)} | ${added} |`;
    }),
    '',
    ...(unusual.length
      ? [
          '## ⚠ Derivations worth a human eye',
          '',
          'The animal name appeared inside an ingredient term that is not straightforwardly',
          'that animal. Each is still CAPTURED — flagging is not filtering, and dropping a',
          'real exposure to keep this list short would be the wrong trade. They are listed',
          'because they are the ones a reviewer might disagree with.',
          '',
          ...unusual.map(({ row, d }) =>
            `- **${row.brand} ${row.product_name}** — \`${d.key}\` read from "${d.term}"`),
          '',
        ]
      : []),
  ].join('\n');
  writeFileSync(join(args.out, 'backfill-proteins-report.md'), report);

  // Re-running the planner over its own output is the cheapest possible check that
  // the pass is safe to retry — and it runs against the REAL table, not fixtures.
  const drift = planned.filter(({ row, plan }) =>
    planRow(
      { ...row, primary_protein: plan.primaryProtein, proteins: plan.proteins },
      options,
    ).changed,
  );

  console.log(`scanned ${rows.length} · changed ${changed.length}`);
  console.log(`primaries rewritten ${rekeyed.length} — Class B ${classB.length} (ratified) · Class A ${rekeyed.length - classB.length}`);
  console.log(`flagged derivations (unusual carrier): ${unusual.length}`);
  console.log(`idempotence re-run: ${drift.length === 0 ? 'clean' : `DRIFT on ${drift.length} row(s)`}`);
  console.log(`wrote ${join(args.out, 'backfill-proteins.sql')}`);
  if (drift.length > 0) process.exitCode = 1;
}

main();
