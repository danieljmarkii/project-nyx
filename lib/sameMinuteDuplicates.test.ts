// The same-minute duplicate rule (CUL-1161 / HV-4). Three things are proven here:
//
//   1. The rule's own scenarios, ported from the vet report's suite
//      (`supabase/functions/generate-report/report.test.ts`, the "de-dup" tests), so the
//      behaviour the report was reviewed for is the behaviour this module has.
//   2. It IS the report's rule, not a copy that agrees today. The report is Deno code and
//      jest cannot import it, so the test parses `report.ts` with the TypeScript compiler,
//      evaluates the report's own `dedupeEvents` (with the constants and the helper it
//      reads), and drives both implementations over thousands of seeded inputs built to
//      sit on every edge of the rule. A change to either side reds here until HV-15
//      (CUL-1170) moves the report onto this module and this differential retires with
//      the second copy.
//   3. The corpus is not vacuous: every clause of the rule is exercised by it, counted.
//
// Instants are UTC literals on purpose: the rule compares milliseconds and never asks
// what day it is, so the process zone cannot move a result (C-29 does not bite here).

/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

import {
  SAME_MINUTE_OBSERVATION_TYPES,
  SAME_MINUTE_WINDOW_MS,
  collapseSameMinute,
  sameMinuteGroupKey,
  type SameMinuteEvent,
} from './sameMinuteDuplicates';

const REPORT_PATH = 'supabase/functions/generate-report/report.ts';

function ev(id: string, type: string, occurredAt: string, foodItemId: string | null = null): SameMinuteEvent {
  return { id, type, occurredAt, foodItemId };
}

const at = (hms: string) => `2026-06-01T${hms}.000Z`;

// ── 1. The report's scenarios, ported ─────────────────────────────────────────

describe('the rule — the report\'s own scenarios', () => {
  it('a bout logged twice keeps the PREFERRED member (the report: the completed read), not the empty duplicate', () => {
    const events = [ev('v-completed', 'vomit', at('08:00:00')), ev('v-dup', 'vomit', at('08:00:20'))];
    const { clusters, droppedEventIds } = collapseSameMinute(events, {
      isPreferred: (e) => e.id === 'v-completed',
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].representative.id).toBe('v-completed');
    expect(clusters[0].members).toHaveLength(2);
    expect([...droppedEventIds]).toEqual(['v-dup']);
  });

  it('with nothing preferred, the earliest member represents the incident', () => {
    const events = [ev('b', 'vomit', at('08:00:20')), ev('a', 'vomit', at('08:00:00'))];
    const { clusters, droppedEventIds } = collapseSameMinute(events);
    expect(clusters[0].representative.id).toBe('a');
    expect([...droppedEventIds]).toEqual(['b']);
  });

  it('two DIFFERENT medication events at the same minute are NOT collapsed (the B-156 combo data-loss guard)', () => {
    const events = [
      ev('dose-a', 'medication', at('08:00:00')),
      ev('dose-b', 'medication', at('08:00:10')),
      ev('weigh-a', 'weight_check', at('09:00:00')),
      ev('weigh-b', 'weight_check', at('09:00:15')),
      ev('other-a', 'other', at('10:00:00')),
      ev('other-b', 'other', at('10:00:05')),
    ];
    const { clusters, droppedEventIds } = collapseSameMinute(events);
    expect(clusters).toHaveLength(6);
    expect(droppedEventIds.size).toBe(0);
  });

  it('two DIFFERENT foods seconds apart are two real feedings; the SAME food is one', () => {
    expect(
      collapseSameMinute([ev('m1', 'meal', at('08:00:00'), 'chicken'), ev('m2', 'meal', at('08:00:10'), 'salmon')])
        .droppedEventIds.size,
    ).toBe(0);
    expect(
      [...collapseSameMinute([ev('m1', 'meal', at('08:00:00'), 'chicken'), ev('m2', 'meal', at('08:00:10'), 'chicken')])
        .droppedEventIds],
    ).toEqual(['m2']);
  });

  it('two meals with no food recorded group together, as the report\'s `meal|null` key does', () => {
    const { droppedEventIds } = collapseSameMinute([ev('m1', 'meal', at('08:00:00')), ev('m2', 'meal', at('08:00:30'))]);
    expect([...droppedEventIds]).toEqual(['m2']);
  });

  it('two different symptoms at the same minute are two incidents', () => {
    const { droppedEventIds } = collapseSameMinute([ev('v', 'vomit', at('08:00:00')), ev('c', 'cough', at('08:00:05'))]);
    expect(droppedEventIds.size).toBe(0);
  });

  it('a normal stool logged twice collapses (the one observation type outside the symptom set)', () => {
    const { droppedEventIds } = collapseSameMinute([
      ev('s1', 'stool_normal', at('08:00:00')),
      ev('s2', 'stool_normal', at('08:00:30')),
    ]);
    expect([...droppedEventIds]).toEqual(['s2']);
  });

  it('is span-bounded: a chain of 59s gaps forms clusters of two, never one long incident (finding 3)', () => {
    const events = [
      ev('c0', 'vomit', at('10:00:00')),
      ev('c1', 'vomit', at('10:00:59')),
      ev('c2', 'vomit', at('10:01:58')),
      ev('c3', 'vomit', at('10:02:57')),
    ];
    const { clusters } = collapseSameMinute(events);
    expect(clusters.map((c) => c.memberEventIds)).toEqual([['c0', 'c1'], ['c2', 'c3']]);
  });

  it('the window is inclusive at exactly 60s and exclusive one millisecond past it', () => {
    expect(
      collapseSameMinute([ev('a', 'vomit', '2026-06-01T08:00:00.000Z'), ev('b', 'vomit', '2026-06-01T08:01:00.000Z')])
        .droppedEventIds.size,
    ).toBe(1);
    expect(
      collapseSameMinute([ev('a', 'vomit', '2026-06-01T08:00:00.000Z'), ev('b', 'vomit', '2026-06-01T08:01:00.001Z')])
        .droppedEventIds.size,
    ).toBe(0);
  });

  it('parses both spellings of an instant: `…Z` and `…+00:00` at the same second are one incident (C-40)', () => {
    const { droppedEventIds } = collapseSameMinute([
      ev('local', 'vomit', '2026-06-01T08:00:00.000Z'),
      ev('synced', 'vomit', '2026-06-01T08:00:00+00:00'),
    ]);
    expect(droppedEventIds.size).toBe(1);
  });

  it('an in-window member outranks an earlier out-of-window one (finding 1)', () => {
    const events = [ev('before-midnight', 'vomit', at('23:59:50')), ev('after-midnight', 'vomit', '2026-06-02T00:00:20.000Z')];
    const { clusters, droppedEventIds } = collapseSameMinute(events, {
      isInWindow: (e) => e.id === 'after-midnight',
    });
    expect(clusters[0].representative.id).toBe('after-midnight');
    expect([...droppedEventIds]).toEqual(['before-midnight']);
  });

  it('an unparseable instant never joins a cluster', () => {
    const { clusters, droppedEventIds } = collapseSameMinute([
      ev('a', 'vomit', at('08:00:00')),
      ev('bad', 'vomit', 'not a date'),
      ev('empty', 'vomit', ''),
    ]);
    expect(clusters).toHaveLength(3);
    expect(droppedEventIds.size).toBe(0);
  });

  it('the result does not depend on the input\'s order', () => {
    const events = [
      ev('a', 'vomit', at('08:00:00')),
      ev('b', 'vomit', at('08:00:30')),
      ev('c', 'meal', at('08:00:10'), 'f'),
      ev('d', 'meal', at('08:00:40'), 'f'),
      ev('e', 'cough', at('09:00:00')),
    ];
    const forward = collapseSameMinute(events);
    const backward = collapseSameMinute([...events].reverse());
    expect(backward.clusters.map((c) => c.memberEventIds)).toEqual(forward.clusters.map((c) => c.memberEventIds));
    expect([...backward.droppedEventIds].sort()).toEqual([...forward.droppedEventIds].sort());
  });

  it('clusters come back in the representatives\' order: instant, then id', () => {
    const { clusters } = collapseSameMinute([
      ev('late', 'cough', at('12:00:00')),
      ev('early', 'vomit', at('08:00:00')),
      ev('tie-b', 'meal', at('10:00:00'), 'x'),
      ev('tie-a', 'meal', at('10:00:00'), 'y'),
    ]);
    expect(clusters.map((c) => c.representative.id)).toEqual(['early', 'tie-a', 'tie-b', 'late']);
  });

  it('the group key: a meal by its food, an observation by its type, anything else by itself', () => {
    expect(sameMinuteGroupKey(ev('1', 'meal', 'x', 'food-1'))).toBe('meal|food-1');
    expect(sameMinuteGroupKey(ev('1', 'meal', 'x'))).toBe('meal|null');
    expect(sameMinuteGroupKey(ev('1', 'scratch', 'x'))).toBe('scratch');
    expect(sameMinuteGroupKey(ev('7', 'medication', 'x'))).toBe('keep|7');
    expect(sameMinuteGroupKey(ev('7', 'check_in', 'x'))).toBe('keep|7');
  });
});

// ── 2. The report's live source, evaluated ────────────────────────────────────

interface ReportEventLike {
  id: string;
  type: string;
  occurredAt: string;
  occurredAtConfidence: null;
  occurredAtEarliest: null;
  occurredAtLatest: null;
  severity: number | null;
  notes: string | null;
  loggedAt: string;
  meal: { foodItemId: string | null } | null;
}

interface ReportSurvivor extends ReportEventLike {
  dupCount: number;
  memberEventIds: string[];
}

interface ReportRule {
  dedupeEvents: (
    events: ReportEventLike[],
    completed: Set<string>,
    isInWindow?: (e: ReportEventLike) => boolean,
  ) => { events: ReportSurvivor[]; droppedEventIds: Set<string> };
  DEDUP_WINDOW_MS: number;
  DEDUP_OBSERVATION_TYPES: Set<string>;
}

/** The declarations `dedupeEvents` reads, found by NAME in the parsed file. Each must be
 *  found exactly once: a rename or a move reds here, loudly, instead of evaluating nothing. */
const REPORT_DECLARATIONS = [
  'REPORT_SYMPTOM_TYPES',
  'STOOL_NORMAL_TYPE',
  'DEDUP_OBSERVATION_TYPES',
  'DEDUP_WINDOW_MS',
  'parseMs',
  'dedupeEvents',
] as const;

function loadReportRule(): ReportRule {
  const src = readFileSync(join(__dirname, '..', REPORT_PATH), 'utf8');
  const sf = ts.createSourceFile(REPORT_PATH, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const wanted = new Set<string>(REPORT_DECLARATIONS);
  const found: string[] = [];
  const pieces: string[] = [];
  // In FILE order, so a constant is declared before the code that reads it.
  for (const stmt of sf.statements) {
    let names: string[] = [];
    if (ts.isFunctionDeclaration(stmt) && stmt.name) names = [stmt.name.text];
    else if (ts.isVariableStatement(stmt)) {
      names = stmt.declarationList.declarations.map((d) => (ts.isIdentifier(d.name) ? d.name.text : ''));
    }
    const hits = names.filter((n) => wanted.has(n));
    if (hits.length === 0) continue;
    found.push(...hits);
    pieces.push(stmt.getText(sf).replace(/^export\s+/, ''));
  }
  expect([...found].sort()).toEqual([...REPORT_DECLARATIONS].sort());
  const js = ts.transpileModule(pieces.join('\n\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  // eslint-disable-next-line no-new-func -- evaluating the report's own source is the point
  const factory = new Function(`${js}\nreturn { dedupeEvents, DEDUP_WINDOW_MS, DEDUP_OBSERVATION_TYPES };`);
  return factory() as ReportRule;
}

/** A small, seeded PRNG (mulberry32): the corpus is the same on every run and every machine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every type the rule can meet, the report's dormant leaves and an unknown one included. */
const CORPUS_TYPES = [
  'vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough', 'sneeze', 'lethargy', 'stool_normal',
  'meal', 'meal', 'meal', 'medication', 'weight_check', 'other', 'check_in', 'a_future_leaf',
];

/** Gaps (ms) chosen to sit on the rule's edges: the same instant, well inside, one tick
 *  either side of the window, and far apart. */
const GAPS = [0, 0, 1, 20_000, 59_000, 59_999, 60_000, 60_000, 60_001, 61_000, 90_000, 150_000, 3_600_000];

interface CorpusCase {
  events: ReportEventLike[];
  completed: Set<string>;
  inWindow: Set<string>;
}

function buildCorpus(seed: number, cases: number): CorpusCase[] {
  const rand = prng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const out: CorpusCase[] = [];
  const base = Date.UTC(2026, 5, 1, 23, 58, 0);
  for (let c = 0; c < cases; c++) {
    const n = 1 + Math.floor(rand() * 12);
    let t = base;
    const events: ReportEventLike[] = [];
    // A window edge somewhere in the run: members before it are out of the window.
    const edge = base + Math.floor(rand() * 240_000);
    const inWindow = new Set<string>();
    const completed = new Set<string>();
    for (let i = 0; i < n; i++) {
      t += pick(GAPS);
      const id = `e${c}-${pick(['a', 'b', 'c', 'd'])}${i}`;
      const type = pick(CORPUS_TYPES);
      const r = rand();
      // Both spellings of the instant (C-40), and now and then one that does not parse.
      const occurredAt = r < 0.05 ? pick(['', 'not a date'])
        : r < 0.5 ? new Date(t).toISOString()
        : new Date(t).toISOString().replace(/\.\d{3}Z$/, '+00:00');
      events.push({
        id,
        type,
        occurredAt,
        occurredAtConfidence: null,
        occurredAtEarliest: null,
        occurredAtLatest: null,
        severity: rand() < 0.3 ? 1 + Math.floor(rand() * 5) : null,
        notes: rand() < 0.2 ? 'a note' : null,
        loggedAt: new Date(t).toISOString(),
        meal: type === 'meal' ? { foodItemId: pick(['food-a', 'food-b', null]) } : null,
      });
      if (rand() < 0.25) completed.add(id);
      // Mostly a real edge (time-ordered); sometimes an arbitrary set, which the rule must
      // handle identically too.
      const inside = rand() < 0.8 ? t >= edge : rand() < 0.5;
      if (inside) inWindow.add(id);
    }
    // Shuffle: the rule must not depend on input order, and neither may the comparison.
    for (let i = events.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [events[i], events[j]] = [events[j], events[i]];
    }
    out.push({ events, completed, inWindow });
  }
  return out;
}

describe('it IS the report\'s rule — the report\'s live dedupeEvents, evaluated from source', () => {
  const report = loadReportRule();
  const corpus = buildCorpus(0x5eed1161, 4000);

  it('the same window', () => {
    expect(report.DEDUP_WINDOW_MS).toBe(SAME_MINUTE_WINDOW_MS);
  });

  it('the same observation types, exactly', () => {
    expect([...report.DEDUP_OBSERVATION_TYPES].sort()).toEqual([...SAME_MINUTE_OBSERVATION_TYPES].sort());
  });

  it('the same incidents, representatives, members and dropped rows over the seeded corpus', () => {
    const mismatches: string[] = [];
    corpus.forEach((k, i) => {
      const theirs = report.dedupeEvents(k.events, k.completed, (e) => k.inWindow.has(e.id));
      const ours = collapseSameMinute(
        k.events.map((e) => ({ ...e, foodItemId: e.meal?.foodItemId ?? null })),
        { isInWindow: (e) => k.inWindow.has(e.id), isPreferred: (e) => k.completed.has(e.id) },
      );
      const a = JSON.stringify({
        clusters: theirs.events.map((s) => [s.id, s.dupCount, s.memberEventIds]),
        dropped: [...theirs.droppedEventIds].sort(),
      });
      const b = JSON.stringify({
        clusters: ours.clusters.map((c) => [c.representative.id, c.members.length, c.memberEventIds]),
        dropped: [...ours.droppedEventIds].sort(),
      });
      if (a !== b && mismatches.length < 3) mismatches.push(`case ${i}\n  report: ${a}\n  shared: ${b}`);
    });
    expect(mismatches).toEqual([]);
  });

  // The corpus is only a proof if it reaches every clause of the rule. Each count below is
  // a clause a mutation could break, and the floor says the corpus met it many times over.
  it('the corpus is not vacuous: every clause of the rule is exercised', () => {
    let merged = 0;
    let atExactlySixty = 0;
    let windowFirstMattered = 0;
    let preferenceMattered = 0;
    let unparseable = 0;
    let neverGrouped = 0;
    for (const k of corpus) {
      const ours = collapseSameMinute(
        k.events.map((e) => ({ ...e, foodItemId: e.meal?.foodItemId ?? null })),
        { isInWindow: (e) => k.inWindow.has(e.id), isPreferred: (e) => k.completed.has(e.id) },
      );
      for (const c of ours.clusters) {
        if (c.members.length < 2) continue;
        merged++;
        const ms = c.members.map((m) => Date.parse(m.occurredAt));
        if (ms[ms.length - 1] - ms[0] === SAME_MINUTE_WINDOW_MS) atExactlySixty++;
        const earliest = c.members[0];
        if (!k.inWindow.has(earliest.id) && k.inWindow.has(c.representative.id)) windowFirstMattered++;
        // Among the members the window-first clause leaves standing, the earliest lost:
        // only the preference clause can have decided that.
        const inWindow = c.members.filter((m) => k.inWindow.has(m.id));
        const pool = inWindow.length > 0 ? inWindow : c.members;
        if (pool[0].id !== c.representative.id) preferenceMattered++;
      }
      unparseable += k.events.filter((e) => Number.isNaN(Date.parse(e.occurredAt))).length;
      neverGrouped += k.events.filter((e) => ['medication', 'weight_check', 'other'].includes(e.type)).length;
    }
    expect(merged).toBeGreaterThan(500);
    expect(atExactlySixty).toBeGreaterThan(20);
    expect(windowFirstMattered).toBeGreaterThan(20);
    expect(preferenceMattered).toBeGreaterThan(20);
    expect(unparseable).toBeGreaterThan(50);
    expect(neverGrouped).toBeGreaterThan(500);
  });
});
