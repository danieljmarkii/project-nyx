// CUL-1099 — every PostgREST embed across `events` ↔ `medication_administrations` NAMES
// its foreign key.
//
// Migration 023 (B-156 PR B1, 2026-06-23) added `medication_administrations.paired_event_id`,
// a SECOND foreign key to `events` beside `event_id`. From then on a bare embed in either
// direction is ambiguous, and PostgREST answers PGRST201 instead of rows. This has now
// happened twice:
//
//   1. B-196: profile's `events(...)` embed from `medication_administrations` threw the whole
//      load and blanked the Current-medications card. Fixed at the site, not the class.
//   2. CUL-1099: the dose pulls in `generate-signal` and `ask` embedded
//      `medication_administrations(...)` from `events`. The error was read as "no doses",
//      so from June to September the Signal engine and Ask ran with zero doses for every
//      pet (41 of 41 live requests returned PGRST201). Nothing looked wrong, because an
//      empty dose list is a legal record.
//
// The second instance is why this is a guard. A hint is one word, and its absence is
// invisible to every test that mocks the client, because the mock never asks PostgREST.
//
// THE RULE the scan enforces, in every `.select(…)` in the repository:
//   • a `medication_administrations` embed carries a `!<constraint>_fkey` hint, whatever its
//     parent. Conservative on purpose: from `medications` the bare embed would resolve, and
//     hinting it there costs one word, while working out the parent of a nested embed is
//     where a scanner goes wrong quietly.
//   • in a chain `.from('medication_administrations')`, an `events` embed carries one too.
//     `events!inner(` alone is NOT a hint: `!inner` picks the join, never the relationship.
//
// BLIND SPOTS, stated because an undocumented one reads as coverage (C-38):
//   • A select string assembled at runtime (a variable, a template with `${}`) is read as
//     whatever literal text sits inside `.select(`. Every site today is a literal.
//   • The chain's table is the nearest `.from('…')` before `.select(` within 600 characters.
//     A select more than that far from its `.from` goes unscanned for the `events` half.
//     The `medication_administrations` half does not depend on it.
//   • A query outside supabase-js (raw SQL, `node:sqlite`) never embeds, so it is out of
//     scope. `ON medication_administrations(synced)` in local index DDL is not a select.
//   • `guards/` itself is not scanned: it holds this file's fixtures. Test files ARE scanned
//     for unhinted embeds, but left out of the non-vacuity counts (an assertion string is
//     not a query).

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'guards', 'docs', 'ios', 'android', 'dist', 'build']);

/** Every .ts / .tsx file in the repository, derived from the tree, never from a list
 *  (C-38: a floor that iterates its own constant is green when an entry is dropped). */
function repoSources(dir: string = ROOT, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) repoSources(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

export interface EmbedFinding {
  /** 1-based line of the `.select(` call. */
  line: number;
  table: string | null;
  embed: string;
}

/** The argument text of the `.select(` call opening at `open` (the index of its `(`),
 *  balanced on parentheses. Parens inside the select string are counted on purpose: they
 *  are the embed syntax, and a PostgREST select string always balances its own. */
function selectArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

const EMBED = (name: string) => new RegExp(`(?<![\\w!])${name}((?:![a-z0-9_]+)*)\\s*\\(`, 'g');
const HINTED = (modifiers: string) => /![a-z0-9_]+_fkey\b/.test(modifiers);

/** The unhinted `events` ↔ `medication_administrations` embeds in one source text. */
export function unhintedEmbeds(source: string): EmbedFinding[] {
  const src = blankComments(source);
  const out: EmbedFinding[] = [];
  const re = /\.select\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + '.select'.length;
    const args = selectArgs(src, open);
    const before = src.slice(Math.max(0, m.index - 600), m.index);
    const froms = [...before.matchAll(/\.from\('([a-z_][a-z0-9_]*)'\)/g)];
    const table = froms.length > 0 ? froms[froms.length - 1][1] : null;
    const line = src.slice(0, m.index).split('\n').length;
    for (const e of args.matchAll(EMBED('medication_administrations'))) {
      if (!HINTED(e[1])) out.push({ line, table, embed: e[0] });
    }
    if (table === 'medication_administrations') {
      for (const e of args.matchAll(EMBED('events'))) {
        if (!HINTED(e[1])) out.push({ line, table, embed: e[0] });
      }
    }
  }
  return out;
}

/** Hinted embeds across the two tables, for the non-vacuity floor. */
export function hintedEmbedCount(source: string): number {
  const src = blankComments(source);
  let n = 0;
  const re = /\.select\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const args = selectArgs(src, m.index + '.select'.length);
    for (const e of args.matchAll(EMBED('(?:medication_administrations|events)'))) {
      if (HINTED(e[1]) && /medication_administrations_[a-z_]+_fkey/.test(e[1])) n += 1;
    }
  }
  return n;
}

describe('CUL-1099 — the detector, on fixtures', () => {
  const chain = (table: string, select: string) =>
    `const r = await supabase.from('${table}').select(${select}).eq('pet_id', id)`;

  it('reds the CUL-1099 shape: a bare medication_administrations embed from events', () => {
    const src = chain('events', "'id, occurred_at, medication_administrations(medication_id, adherence, medication_items(generic_name))', { count: 'exact' }");
    expect(unhintedEmbeds(src).map((f) => f.embed)).toEqual(['medication_administrations(']);
  });

  it('passes the hinted form, nested embeds and all', () => {
    const src = chain('events', "'id, medication_administrations!medication_administrations_event_id_fkey(medication_id, medication_items(generic_name))'");
    expect(unhintedEmbeds(src)).toEqual([]);
    expect(hintedEmbedCount(src)).toBe(1);
  });

  it('reds an aliased embed and a join modifier that is not a hint', () => {
    expect(unhintedEmbeds(chain('events', "'id, doses:medication_administrations(adherence)'"))).toHaveLength(1);
    expect(unhintedEmbeds(chain('events', "'id, medication_administrations!inner(adherence)'"))).toHaveLength(1);
    expect(unhintedEmbeds(chain('events', "'id, medication_administrations!medication_administrations_event_id_fkey!inner(adherence)'"))).toEqual([]);
  });

  it('reds the B-196 shape: a bare events embed from medication_administrations, !inner included', () => {
    expect(unhintedEmbeds(chain('medication_administrations', "'adherence, events(deleted_at, occurred_at)'"))).toHaveLength(1);
    expect(unhintedEmbeds(chain('medication_administrations', "'adherence, events!inner(occurred_at)'"))).toHaveLength(1);
    expect(unhintedEmbeds(chain('medication_administrations', "'adherence, events!medication_administrations_event_id_fkey(occurred_at)'"))).toEqual([]);
  });

  it('reads a select split across concatenated lines (the generate-report shape)', () => {
    const src = `supabase
      .from('medication_administrations')
      .select(
        'event_id, adherence, ' +
          'events(occurred_at, deleted_at)',
        { count: 'exact' },
      )`;
    expect(unhintedEmbeds(src)).toHaveLength(1);
  });

  it('leaves unrelated embeds alone: events from another table, a comment, local index DDL', () => {
    expect(unhintedEmbeds(chain('event_ai_analysis', "'event_id, events!inner(occurred_at)'"))).toEqual([]);
    expect(unhintedEmbeds("// .from('events').select('medication_administrations(x)')\nconst a = 1")).toEqual([]);
    expect(unhintedEmbeds('await db.execAsync(`CREATE INDEX i ON medication_administrations(synced)`)')).toEqual([]);
  });
});

describe('CUL-1099 — the repository', () => {
  const files = repoSources();
  const sources = files.map((f) => ({ rel: path.relative(ROOT, f), src: fs.readFileSync(f, 'utf8') }));

  it('scans the directories that hold the known sites (non-vacuity, derived from the tree)', () => {
    const rels = sources.map((s) => s.rel);
    for (const known of [
      'supabase/functions/generate-signal/index.ts',
      'supabase/functions/ask/index.ts',
      'supabase/functions/generate-report/index.ts',
      'app/(tabs)/profile.tsx',
    ]) {
      expect(rels).toContain(known);
    }
  });

  it('finds every hinted embed a plain text count finds (two independent counts agree)', () => {
    // Independent of the select parser: the constraint name followed by the embed's `(`.
    // Test files are left out of BOTH counts: they hold the hint as an assertion string
    // (generate-signal/index.test.ts pins it with `includes`), which is not a query.
    const queries = sources.filter((s) => !/\.test\.tsx?$/.test(s.rel));
    const byText = queries.reduce(
      (n, s) => n + (blankComments(s.src).match(/!medication_administrations_[a-z_]+_fkey(?:![a-z]+)*\s*\(/g) ?? []).length,
      0,
    );
    const byParser = queries.reduce((n, s) => n + hintedEmbedCount(s.src), 0);
    // Floor: generate-signal, ask, generate-report and profile's two reads, at the time of writing.
    expect(byText).toBeGreaterThanOrEqual(5);
    expect(byParser).toBe(byText);
  });

  it('holds no unhinted events ↔ medication_administrations embed', () => {
    const found = sources.flatMap((s) => unhintedEmbeds(s.src).map((f) => `${s.rel}:${f.line} ${f.embed}`));
    expect(found).toEqual([]);
  });
});
