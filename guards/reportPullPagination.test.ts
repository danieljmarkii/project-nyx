// Every row pull in `generate-report`, `generate-signal` and `ask` either PAGES to the end
// of its result set or carries an explicit cap with an ordering that makes the drop safe —
// and this file is what says so after the fact.
//
// WIDENED BY CUL-989 (Engines v3 PR-09). The report half was built for CUL-975, below; the
// same bare pull was in the Signal engine (the function that decides what to warn an owner
// about) and in Ask. The reader moved to `supabase/functions/_shared/pull.ts`, and this scan
// now reads all three directories.
//
// CUL-975. On 2026-09-15 the PM generated his own cat's vet report for an appointment the
// next morning. The report was titled Jul 26 – Sep 15 and contained no event after Sep 7.
// 1,057 live events were in the lookback; exactly 1,000 were on the document. The pull was
// bare — no `.order()`, no `.limit()`, no `.range()` — so PostgREST capped it at the
// project's `max-rows`, and with no ORDER BY Postgres returned physical (insertion) order,
// so the cap kept the OLDEST thousand and dropped the NEWEST fifty-seven. A cough from the
// previous day printed as ten days old; a vomit from three days earlier printed as eight.
//
// TWO PROPERTIES OF THAT FAILURE ARE WHY A GUARD AND NOT JUST A FIX:
//
//   1. IT WAS UNFALSIFIABLE FROM THE DOCUMENT. Every number agreed with every other
//      number, because they all derived from the same short set. Nothing contradicted
//      anything, and the `vet-report-cold-read` that found it only found it with the
//      database open beside the page. A report that cannot see its own truncation cannot
//      disclose it, and a reader cannot recover what the page never mentioned.
//
//   2. THE FILE ALREADY KNEW. `LOOK_PULL_CAP`'s comment documents the hazard by name
//      ("Below Supabase's default PostgREST `max-rows` (1000) ON PURPOSE"), and the dose
//      pull's comment recorded it as a KNOWN LIMIT "shared with every pull here". The
//      knowledge was present, written down, and applied to one table out of eleven. That
//      is precisely the class of thing a prose comment cannot hold and a test can.
//
// SCOPE, STATED RATHER THAN IMPLIED (C-38 — an undocumented blind spot reads as coverage).
// This is a SOURCE SCAN. It proves each pull is built in one of the shapes below; it
// cannot prove the shape behaves (that is `index.test.ts`, which drives the real reader
// against a server that caps), and it cannot see a query built somewhere other than a
// `.from('…')` chain in this directory. It also says nothing about `max-rows` itself: the
// deployed function cannot observe that setting, which is the whole reason completeness
// has to be earned from a count rather than inferred from a page's fullness.
//
// AND ONE MORE, because an undocumented blind spot reads as coverage (C-38). `sourceFiles()`
// is a NON-RECURSIVE `readdirSync`, so a `.ts` file added inside a future subdirectory of
// `generate-report/` escapes the scan entirely. The directory is flat today and every
// sibling function is flat too, so recursing now would be a guess about a shape nobody has
// proposed — but the first PR that nests a file here owes this line a `withFileTypes` walk,
// and the non-vacuity floor below (which counts sites two independent ways over the SAME
// file list) will not notice, because both counts read the same directory.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase/functions');

/**
 * The functions whose pulls this guard covers, each with the fewest multi-row pulls it must
 * find there — the per-function NON-VACUITY FLOOR. A directory removed from this list is
 * caught by the test that asserts each is a real function; a directory whose extractor
 * silently matched nothing is caught by its floor. It is a list and not every function on
 * purpose: the per-incident reads (`analyze-*`) and `delete-account` fetch by id or page by
 * their own discipline, and widening past these three is a decision, not a default.
 */
const COVERED: Record<string, number> = {
  'generate-report': 11,
  'generate-signal': 6,
  ask: 7,
};

/** Source files of a function, derived from the REPOSITORY rather than from a list in
 *  this file — a floor that iterates its own constant is green when an entry is dropped
 *  from it (C-38, measured on `guards/visitReaders.test.ts`). */
function sourceFiles(fn: string): string[] {
  return fs
    .readdirSync(path.join(FUNCTIONS_DIR, fn))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'))
    .sort()
    .map((f) => `${fn}/${f}`);
}

/** Comments blanked line-preservingly, so a sentence ABOUT a pull is never mistaken for
 *  the pull (C-18: a guard's own prose is not its evidence — and this file's subject is a
 *  defect whose comment described the fix it had not received). `rel` is relative to
 *  `supabase/functions/`. */
function code(rel: string): string {
  return blankComments(fs.readFileSync(path.join(FUNCTIONS_DIR, rel), 'utf8'));
}

interface Site {
  file: string;
  table: string;
  /** The chain text from `.from(` forward — far enough to hold the select and filters. */
  chain: string;
  /** The text immediately BEFORE `.from(`, where a `fetchAll<Row>('table', …` would sit. */
  lead: string;
}

/**
 * Every `.from('<table>')` query site in a source.
 *
 * `storage.from('<bucket>')` is excluded by shape, not by name: it addresses an object
 * bucket, has no rows and no `max-rows`, and matching it would force a permanent
 * exemption for something that was never in this rule's scope. Matching `.from('` with
 * the quote also keeps `Array.from(` and `Uint8Array.from(` out, which a bare `.from(`
 * would sweep in and then have to explain.
 */
function sites(file: string): Site[] {
  const src = code(file);
  const out: Site[] = [];
  const re = /\.from\('([a-z_][a-z0-9_-]*)'\)/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const at = m.index;
    const lead = src.slice(Math.max(0, at - 400), at);
    if (/storage\s*$/.test(lead)) continue;
    // BOUNDED AT THE NEXT QUERY, not at a character budget. A fixed window is not a
    // slice of the object under test (C-4): with 2,000 characters this scan read past the
    // dose pull into the regimen pull beside it in the same `Promise.all`, so deleting
    // `count: 'exact'` from the dose query left the guard GREEN on the neighbour's copy —
    // measured, on this file, before the bound below existed.
    const next = src.indexOf(".from('", at + 1);
    const end = next === -1 ? src.length : next;
    const chain = src.slice(at, Math.min(end, at + 2000));
    // A WRITE is not a pull (CUL-989: generate-signal replaces its cache row). Excluded by the
    // verb that follows `.from(…)`, so a read that merely mentions a write later cannot hide.
    if (/^\.from\('[^']+'\)\s*\.(insert|delete|update|upsert)\(/.test(chain)) continue;
    out.push({ file, table: m[1], chain, lead });
  }
  return out;
}

function allSites(): Site[] {
  return Object.keys(COVERED).flatMap(sourceFiles).flatMap(sites);
}

/**
 * THE REGISTRY IS AN EXEMPTION, AND EACH ENTRY IS EARNED (C-32).
 *
 * A pull listed here is NOT skipped — it is still scanned, and still has to carry an
 * `.order()`, a `.limit()` and `count: 'exact'`. What the entry buys is the right to stop
 * at a cap instead of paging, and the price is a written reason for why stopping is
 * correct THERE. Listing a table to record that somebody thought about it is the thing
 * this shape exists to prevent.
 */
const DELIBERATE_CAP: Record<string, string> = {
  // Keyed `<function>/<table>`: the same table can be a safe cap in one function and a defect
  // in another, and an exemption earned in one must not travel.
  'generate-report/looks':
    'CUL-875. This pull has NO date bound by design — the "answered on 118 days before it ' +
    'since May 3" clause reads back past the window on purpose, so a `.gte` would make that ' +
    'sentence a statement about the query. The cap is what bounds it, the newest-first order ' +
    'is what makes the cap safe, and `lookRowsComplete` already carries the shortfall into ' +
    'the render as a floor with no start date. Paging it would read an unbounded history to ' +
    'improve one clause that is already honest when it degrades.',
};

/**
 * READS BOUNDED BY THEIR OWN KEY, NOT BY A CAP (CUL-989). The rule above is about a pull
 * over a pet's RECORD, which grows without limit. These two grow with nothing a pet logs:
 * each is filtered to a closed set whose size is fixed by the code, so `max-rows` cannot
 * reach them. Each entry is earned by stating that bound; none is a pull over events.
 */
const BOUNDED_BY_KEY: Record<string, string> = {
  'generate-signal/app_config':
    'The phrasing flag and the caps: `.in(\'key\', [FLAG_KEY, \'ai_caps\'])`, two rows at most — ' +
    'app_config is keyed by `key`, so the filter bounds the result at the length of the list.',
  'ask/app_config':
    'The Ask flags and caps: `.in(\'key\', [ASK_FLAG, GENERAL_FLAG, \'ai_caps\'])`, three rows at ' +
    'most, by the same primary-key argument.',
  'ask/ai_usage':
    'The monthly conversation count: one row per (function, scope, UTC day), filtered to one ' +
    'function, one scope and the current month — at most 31 rows, fixed by the calendar.',
};

/** `generate-report/index.ts` → `generate-report`. */
const fnOf = (s: Site): string => s.file.split('/')[0];
const keyOf = (s: Site): string => `${fnOf(s)}/${s.table}`;

/** A site is PAGED when it is the query `fetchAll` builds: the call wraps it, and the
 *  chain carries the three things that make paging sound. */
function isPaged(s: Site): boolean {
  return (
    /fetchAll<[^>]*>\(\s*'[a-z_]+'/.test(s.lead) &&
    /\.range\(from,\s*to\)/.test(s.chain) &&
    /\.order\(/.test(s.chain) &&
    /count:\s*'exact'/.test(s.chain)
  );
}

/**
 * The columns that make "newest-first" mean anything on these tables.
 *
 * Deliberately a short allow-list rather than a shape test: the point of the first ordering
 * term is that a row's position in it tracks TIME, and no regex can tell that about a column
 * name. A new pull ordering on something else adds it here with a reason, which is the
 * conversation this list exists to force.
 */
const TIME_COLUMNS = ['occurred_at', 'created_at', 'started_at', 'visited_at', 'local_day'];

/** A site that returns AT MOST ONE ROW cannot truncate. `.limit(1)` is one row by
 *  definition (CUL-989: the active trial, the latest cached Signal), and says so in code. */
function isSingleRow(s: Site): boolean {
  return /\.maybeSingle\(\)/.test(s.chain) || /\.limit\(1\)/.test(s.chain);
}

describe('CUL-975 / CUL-989 — every pull in the covered functions paginates or carries an ordered, counted cap', () => {
  it('every covered function is a real function directory, and each meets its floor of paged pulls', () => {
    // Derived from the REPOSITORY: the list above is checked against what is on disk, so a
    // renamed function reds here instead of leaving its floor reading an empty directory.
    for (const fn of Object.keys(COVERED)) {
      expect(fs.existsSync(path.join(FUNCTIONS_DIR, fn, 'index.ts'))).toBe(true);
      const paged = sourceFiles(fn).flatMap(sites).filter(isPaged);
      expect(`${fn}: ${paged.length} paged pulls`).toBe(`${fn}: ${Math.max(paged.length, COVERED[fn])} paged pulls`);
    }
  });

  it('the scan finds every query site, and the same number a plain count does', () => {
    // NON-VACUITY FLOOR, and it is derived two independent ways. Eight green assertions
    // over an extractor that silently matched nothing is the failure mode this class of
    // guard actually has (C-36), and it is invisible from the assertions themselves.
    const found = allSites();
    // The second count shares no code with `sites()` beyond the regex: it re-reads the
    // files and re-classifies storage itself, so an extractor that silently stopped
    // matching disagrees with it rather than agreeing at zero.
    const plain = Object.keys(COVERED).flatMap(sourceFiles).flatMap((f) => {
      const src = code(f);
      return [...src.matchAll(/\.from\('[a-z_][a-z0-9_-]*'\)/g)].map((m) => ({
        storage: /storage\s*$/.test(src.slice(Math.max(0, (m.index ?? 0) - 400), m.index)),
        write: /^\.from\('[^']+'\)\s*\.(insert|delete|update|upsert)\(/.test(src.slice(m.index ?? 0, (m.index ?? 0) + 200)),
      }));
    });
    expect(found.length).toBeGreaterThanOrEqual(24);
    expect(found.length).toBe(plain.filter((m) => !m.storage && !m.write).length);
    expect(plain.filter((m) => m.storage).length).toBe(1); // the report's incident-photo bucket
    expect(plain.filter((m) => m.write).length).toBe(2); // the Signal's cache replace: delete + insert
    // And the tables are the ones this report is actually built from, not a subset the
    // extractor happened to reach.
    for (const t of ['events', 'medication_administrations', 'diet_trials', 'vet_visits', 'looks']) {
      expect(found.map((s) => s.table)).toContain(t);
    }
  });

  it.each(
    allSites()
      .filter((s) => !isSingleRow(s))
      .map((s) => [`${s.file} → ${s.table}`, s] as [string, Site]),
  )('%s pages, or is a registered cap that is ordered and counted', (_label, s) => {
    if (isPaged(s)) return;
    if (BOUNDED_BY_KEY[keyOf(s)]) {
      // Bounded by its key, and the filter that bounds it is still in the chain.
      expect(s.chain).toMatch(/\.(in|eq)\('key'|\.eq\('function'/);
      expect(BOUNDED_BY_KEY[keyOf(s)].length).toBeGreaterThan(80);
      return;
    }
    const reason = DELIBERATE_CAP[keyOf(s)];
    expect(reason ?? `${keyOf(s)} neither pages nor is registered as a deliberate cap`).toBe(reason);
    // A registered cap still has to be a SAFE one. Newest-first is what makes the drop
    // land on the oldest rows, and the count is what lets the shortfall be noticed at all.
    expect(s.chain).toMatch(/\.order\(/);
    expect(s.chain).toMatch(/\.limit\(/);
    expect(s.chain).toMatch(/count:\s*'exact'/);
    expect(reason.length).toBeGreaterThan(80);
  });

  it.each(
    allSites()
      .filter(isPaged)
      .map((s) => [`${s.file} → ${s.table}`, s] as [string, Site]),
  )('%s orders on a TOTAL key — a time column AND the primary key', (_label, s) => {
    // The tiebreaker is not decoration. None of these time columns is unique (this record
    // logs ~7 events a day and meal one-taps land on the same second), and under a
    // non-total sort Postgres may return tied rows in a different order per page — which
    // repeats some rows and skips others at every seam. `id` is the primary key on all of
    // them, so it is always available as the last ordering term.
    const orders = [...s.chain.matchAll(/\.order\('([a-z_]+)'/g)].map((m) => m[1]);
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders[orders.length - 1]).toBe('id');
    expect(s.chain).toMatch(/\.order\('id',\s*\{\s*ascending:\s*false/);
    // And the FIRST term is a time column. Without this the assertion above is satisfied by
    // `.order('severity').order('id')` — total, deterministic, and newest-first in no sense
    // at all, which quietly gives up the half of the ordering that makes a residual
    // shortfall drop the OLDEST rows. (`adversarial-reviewer`, this PR.)
    expect(TIME_COLUMNS).toContain(orders[0]);
    expect(s.chain).toMatch(new RegExp(`\\.order\\('${orders[0]}',\\s*\\{\\s*ascending:\\s*false`));
  });
});

describe('CUL-975 — the reader itself (_shared/pull.ts since CUL-989)', () => {
  const src = code('_shared/pull.ts');
  const report = code('generate-report/index.ts');

  it('advances by the rows RECEIVED, never by the page size', () => {
    // The one line that makes the reader correct at a server ceiling it cannot observe.
    // A fixed `from += PULL_PAGE` skips every row between what was asked for and what a
    // capped response returned, silently, forever.
    // `start + batch.length`, not `from + PULL_PAGE`: `start` is where the page was actually
    // requested (one row back, for the continuity check) and `batch.length` is what came
    // back, so the cursor lands exactly past what was read at whatever size the server chose.
    expect(src).toMatch(/from = start \+ batch\.length/);
    expect(src).not.toMatch(/from \+= PULL_PAGE/);
    expect(src).not.toMatch(/start \+ PULL_PAGE\b(?!\s*-\s*1)/);
  });

  it('takes the count from PAGE 0 only — the one request its rows came from', () => {
    // A later page's count is a different instant, so measuring completeness against it
    // compares a snapshot to rows that were never in it. The first draft read the first
    // NON-NULL count from any page while its own comment claimed otherwise.
    expect(src).toMatch(/if \(p === 0 && typeof res\.count === 'number'\) total = res\.count/);
    expect(src).not.toMatch(/if \(total === null && typeof res\.count === 'number'\)/);
  });

  it('earns completeness from the COUNT, never from a short page', () => {
    // `rows.length < PULL_PAGE` is the inference the looks pull's own comment warns
    // against, and it is exactly what a lowered `max-rows` defeats.
    expect(src).toMatch(/complete: !hitCeiling && !shifted && total !== null && rows\.length >= total/);
    expect(src).not.toMatch(/complete:\s*rows\.length\s*<\s*PULL_PAGE/);
  });

  it('pages OVERLAP by a row, and a page starting on an unseen row is not certified', () => {
    // The count alone cannot see a skip: a concurrent delete skips a row while a concurrent
    // insert restores the number, so `rows.length >= total` certified a pull that was
    // missing a live in-window event (measured, 1,057 rows, before this existed). The
    // one-row overlap is what makes the shift observable, and both halves of it are pinned
    // here because either one alone is inert.
    expect(src).toMatch(/const start = p === 0 \? 0 : from - 1/);
    expect(src).toMatch(/if \(p > 0 && batch\.length > 0 && !seen\.has\(keyOf\(batch\[0\]\)\)\) shifted = true/);
    expect(src).toMatch(/complete: !hitCeiling && !shifted &&/);
  });

  it('the floor a count is spoken over is the one the pull REACHED', () => {
    // `lookbackIso` is what the query asked for; after CUL-975 inverted the truncation
    // direction those are two different numbers on an incomplete pull, and `countIsFloor`
    // downstream reads this one.
    expect(report).toMatch(/eventsSinceIso: reachedLookbackIso\(/);
    expect(report).not.toMatch(/eventsSinceIso: lookbackIso/);
  });

  it('a page range error that means "the set shrank" stops the loop instead of 500ing', () => {
    // PostgREST answers 416 / PGRST103 when a `.range()` lower bound is past the end, which
    // a mid-pull delete can produce on the trailing probe. `rowsOrThrow` makes every error
    // fatal, so without this the benign race the (a′) ruling chose to RENDER through became
    // a hard 500 and no report at all.
    expect(src).toMatch(/PGRST103/);
    expect(src).toMatch(/if \(isRangeNotSatisfiable\(res\.error\)\) break/);
  });

  it('the page ceiling and an absent count both read as INCOMPLETE', () => {
    // Absent means unknown means incomplete — the `lookRowsComplete` rule, the direction
    // that cannot mislead. Both are pinned behaviourally in index.test.ts; this pins that
    // the expression cannot be relaxed into `total === null || …`.
    expect(src).not.toMatch(/total === null \|\|/);
  });

  it('the (a′) refusal reads the EVENTS pull, the one page 1 is computed from', () => {
    expect(report).toMatch(/const windowMayBeCut\s*=\s*\n?\s*!eventsPull\.complete/);
    expect(report).toMatch(/status: 503/);
    expect(report).toMatch(/record_incomplete/);
  });

  it('every incomplete pull is named to the render, and logged for us', () => {
    // The disclosure is what the owner and the vet get; the log line is what WE get, and
    // its absence is why this ran for a week without anyone knowing.
    expect(report).toMatch(/incompletePulls,/);
    expect(report).toMatch(/console\.error\('generate-report incomplete pulls:'/);
  });
});

// ── The detectors, proven (C-18: a guard that has only ever been green is untested) ──
describe('CUL-975 — the detectors fire on the shapes the defect takes', () => {
  const site = (chain: string, lead = '', table = 'events'): Site => ({ file: 'probe.ts', table, chain, lead });

  it('REJECTS the bare pull that shipped — no order, no limit, no range', () => {
    const bare = site(`.from('events').select('id, occurred_at').eq('pet_id', petId).is('deleted_at', null)`);
    expect(isPaged(bare)).toBe(false);
    expect(isSingleRow(bare)).toBe(false);
    expect(DELIBERATE_CAP[bare.table]).toBeUndefined();
  });

  it('REJECTS a paged pull whose `.order()` was deleted', () => {
    const noOrder = site(
      `.from('events').select('id', { count: 'exact' }).eq('pet_id', petId).range(from, to)`,
      `fetchAll<EventRow>('events', (r) => r.id, (from, to) =>\n      supabase`,
    );
    expect(isPaged(noOrder)).toBe(false);
  });

  it('REJECTS a paged pull whose `count: \'exact\'` was deleted', () => {
    const noCount = site(
      `.from('events').select('id').eq('pet_id', petId).order('occurred_at', { ascending: false }).range(from, to)`,
      `fetchAll<EventRow>('events', (r) => r.id, (from, to) =>\n      supabase`,
    );
    expect(isPaged(noCount)).toBe(false);
  });

  it('ACCEPTS the shape the converted pulls actually have', () => {
    const good = site(
      `.from('events').select('id', { count: 'exact' }).eq('pet_id', petId)` +
        `.order('occurred_at', { ascending: false }).order('id', { ascending: false }).range(from, to)`,
      `fetchAll<EventRow>('events', (r) => r.id, (from, to) =>\n      supabase`,
    );
    expect(isPaged(good)).toBe(true);
  });

  it('does not mistake a Storage bucket for a table', () => {
    expect(sites('generate-report/index.ts').map((s) => s.table)).not.toContain('nyx-event-attachments');
  });

  it('does not mistake a write for a pull, and does not let a read hide behind a later write', () => {
    expect(sites('generate-signal/index.ts').some((s) => /^\.from\('ai_signals'\)\s*\.delete/.test(s.chain))).toBe(false);
    const readThenWrite = `.from('events').select('id').eq('pet_id', p); await x.delete()`;
    expect(/^\.from\('[^']+'\)\s*\.(insert|delete|update|upsert)\(/.test(readThenWrite)).toBe(false);
  });

  it('a registered cap does not travel to another function', () => {
    expect(DELIBERATE_CAP['generate-signal/looks']).toBeUndefined();
    expect(DELIBERATE_CAP['ask/looks']).toBeUndefined();
  });
});

// ── CUL-989: what the Signal and Ask DO with an incomplete pull ──
describe('CUL-989 — an incomplete pull is acted on, in each function, and the dose exemption is one site each', () => {
  const signal = code('generate-signal/index.ts');
  const ask = code('ask/index.ts');

  it('generate-signal hands the incomplete pulls to the pipeline and logs them at error level', () => {
    // The pipeline's side (withhold the reassuring, floor the rest, disclose) is proven by
    // behaviour in _shared/engineCorpus/signalPipeline.test.ts (g)–(j); this pins the wire.
    expect(signal).toMatch(/const incompletePulls = incompletePullNames\(\{/);
    expect(signal).toMatch(/runSignalPipeline\(\{[\s\S]*?\n\s*incompletePulls,\n/);
    expect(signal).toMatch(/console\.error\('generate-signal incomplete pulls:'/);
    // Over an incomplete read no card goes to the model: the "at least" lives in the template.
    expect(signal).toMatch(/const phraseWithModel = phrasingEnabled && result\.incompleteDisclosure === null/);
  });

  it('ask answers nothing over an incomplete pull: it returns BEFORE the model loop', () => {
    const gate = ask.indexOf('if (ctx.recordIncomplete.length > 0)');
    const loop = ask.indexOf('await runAskLoop(');
    expect(gate).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(gate);
    const branch = ask.slice(gate, loop);
    expect(branch).toMatch(/buildDeflection\('llm_unavailable'/);
    expect(branch).toMatch(/safetyLead: leadingSafetyText\(/); // escalations are never hidden
    expect(branch).toMatch(/console\.error\('ask incomplete pulls:'/);
    expect(branch).toMatch(/return answerResponse\(/);
  });

  it('every failed read throws, except the one registered dose pull (CUL-1099)', () => {
    // The pre-CUL-989 shape: `(xRes.data ?? [])` read a failed query as an empty record.
    for (const [fn, src] of [['generate-signal', signal], ['ask', ask]] as const) {
      // What may still read `.data ?? []`: the trial read, whose error is thrown just above it,
      // and Ask's relay of the cached Signal, whose failure is logged and read as "no engine
      // findings" (the relay leads with nothing, never with a false calm).
      const allowed = /(trialRes|signalsRes)\.data \?\? \[\]\)/g;
      expect(`${fn}: ${(src.match(/Res\.data \?\? \[\]\)/g) ?? []).length}`).toBe(`${fn}: ${(src.match(allowed) ?? []).length}`);
      expect(src).toMatch(/if \(trialRes\.error\) throw/);
      expect(src).toMatch(/if \(profileRes\.error\) throw/);
      // THE EXEMPTION, earned once per function and wrapped around the dose pull only.
      const wraps = [...src.matchAll(/readDosesAsToday\('[a-z-]+', fetchAll<[^>]*>\('([a-z_]+)'[\s\S]{0,400}?\.eq\('event_type', '([a-z]+)'\)/g)];
      expect(wraps.map((m) => `${m[1]}:${m[2]}`)).toEqual(['events:medication']);
      expect((src.match(/readDosesAsToday\(/g) ?? []).length).toBe(1);
    }
  });
});
