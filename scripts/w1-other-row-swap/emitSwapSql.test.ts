// CUL-677 / W1-PR-4 — the emitted swap SQL's safety properties, pinned in CI.
//
// These are the five properties named in emitSwapSql.ts's header, plus the shape
// rules the 2026-08-27 T&S review added to CUL-677. They are asserted rather than
// reviewed because the emitter's output is what actually runs against a live health
// record, and a review only ever sees one generation of it.
//
// RED-CHECKED (the CUL-613 rule — a guard that has only ever been green has not been
// tested). Each `refuses` case below was confirmed to FAIL when its guard clause was
// removed from validate(); and the scope-predicate assertion was confirmed against a
// hand-edited emitter that dropped the `pet_id IN (...)` from the UPDATE. The live
// counterpart ran too: the emitted dry run was executed against production inside a
// transaction that rolled back (other 34→1, cough 0→22, sneeze 0→11, totals equal),
// and a QA-mirror row spliced into the id list was REFUSED by the scope predicate —
// which is the whole point, since that row's note text is identical to the owner's.

import { emitRollbackSql, emitSwapSql, type ReviewedList } from './emitSwapSql';

const OWNER = 'owner@example.com';
const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const C = 'cccccccc-3333-4333-8333-cccccccccccc';

const list = (over: Partial<ReviewedList> = {}): ReviewedList => ({
  reviewer: { email: OWNER },
  counts: { candidates: 3, cough: 1, sneeze: 1, hold: 1 },
  swap: [
    { id: A, to: 'cough' },
    { id: B, to: 'sneeze' },
  ],
  hold: [{ id: C, reason: 'names both leaves; an UPDATE cannot split a row' }],
  ...over,
});

const OPTS = { dryRun: false, generatedOn: '2026-08-28' };
const emit = (over?: Partial<ReviewedList>) => emitSwapSql(list(over), OPTS);

/** The SQL with every comment line removed — so prose ABOUT a rule can never satisfy
 *  a check FOR it, the both-directions discipline from guards/completionCard.ts. */
const stripComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

/** Every statement that reads or writes the `events` TABLE.
 *
 *  Deliberately keyed on the access keyword rather than a bare /\bevents\b/: the
 *  prelude's trigger check names `'public.events'::regclass`, which is a catalog
 *  lookup and not a row read, and a matcher that cannot tell those apart would
 *  demand a pet-ownership predicate on pg_trigger. Its first run did exactly that. */
const eventStatements = (sql: string): string[] =>
  stripComments(sql)
    .split(';')
    .filter((s) => /(FROM|UPDATE|JOIN|INTO)\s+events\b/.test(s));

describe('emitSwapSql — owner scope (property 1)', () => {
  const SCOPE = `pet_id IN (SELECT id FROM pets WHERE user_id = (SELECT id FROM auth.users WHERE email = '${OWNER}'))`;

  it('scopes EVERY statement that touches events to the reviewing owner', () => {
    // The T&S review's first requirement: the read AND the update both carry the
    // predicate. HR-28 proved the service-role path sees every account, and the QA
    // mirror holds `other` rows with the same cough/sneeze notes on a pet also named
    // "Nyx" — so an unscoped statement is not a theoretical hole, it has a live
    // target whose rows a per-row review cannot distinguish.
    const statements = eventStatements(emit());
    expect(statements.length).toBeGreaterThanOrEqual(4); // prelude read, 2 updates, verify, counts
    for (const s of statements) expect(s.replace(/\s+/g, ' ')).toContain(SCOPE.replace(/\s+/g, ' '));
  });

  it('never emits a bare UPDATE events without the scope predicate', () => {
    for (const sql of [emit(), emitRollbackSql(list(), OPTS)]) {
      const updates = stripComments(sql).split(';').filter((s) => /UPDATE\s+events/.test(s));
      expect(updates.length).toBeGreaterThan(0);
      for (const u of updates) expect(u).toContain('pet_id IN (SELECT id FROM pets WHERE user_id');
    }
  });

  it('refuses an email that would not survive as a SQL literal', () => {
    expect(() => emit({ reviewer: { email: "x'; DROP TABLE events; --@e.com" } })).toThrow(
      /not a safe SQL literal/,
    );
  });
});

describe('emitSwapSql — the prelude fails closed (property 2)', () => {
  it('embeds the reviewed id count and refuses a mismatch at run time', () => {
    const sql = emit();
    expect(sql).toContain('<> 3 THEN');
    expect(sql).toMatch(/reviewed ids embedded, expected 3/);
  });

  it('requires every reviewed id to still be an un-deleted `other` row', () => {
    const sql = emit();
    expect(sql).toContain("e.event_type = 'other'");
    expect(sql).toContain('e.deleted_at IS NULL');
    expect(sql).toMatch(/Re-run candidates\.sql and re-review the delta/);
  });

  it('validates the id list against the reviewer’s own counts', () => {
    expect(() => emit({ counts: { candidates: 3, cough: 2, sneeze: 1, hold: 1 } })).toThrow(/cough count/);
    expect(() => emit({ counts: { candidates: 9, cough: 1, sneeze: 1, hold: 1 } })).toThrow(/candidates/);
  });

  it('refuses a duplicate id across swap and hold', () => {
    expect(() =>
      emit({ hold: [{ id: A, reason: 'also held' }], counts: { candidates: 3, cough: 1, sneeze: 1, hold: 1 } }),
    ).toThrow(/duplicate id/);
  });

  it('refuses a non-uuid id, a non-W1 target leaf, and an unreasoned hold', () => {
    expect(() => emit({ swap: [{ id: 'not-a-uuid', to: 'cough' }, { id: B, to: 'sneeze' }] })).toThrow(/uuid/);
    expect(() =>
      emit({ swap: [{ id: A, to: 'vomit' as 'cough' }, { id: B, to: 'sneeze' }] }),
    ).toThrow(/not a W1 leaf/);
    expect(() => emit({ hold: [{ id: C, reason: '  ' }] })).toThrow(/no reason/);
  });
});

describe('emitSwapSql — the updated_at bump is verified, not written (property 3)', () => {
  it('asserts the trigger is present and enabled, and replication is origin', () => {
    // HR-5b: hydration is watermark-incremental on updated_at, so the trigger bump IS
    // the propagation. Suppress it and every OTHER device on the account keeps showing
    // `other` forever with no error anywhere — the silent half of this whole mechanism.
    const sql = emit();
    expect(sql).toContain("tgname  = 'trg_events_updated_at'");
    expect(sql).toContain("tgenabled = 'O'");
    expect(sql).toContain("current_setting('session_replication_role') <> 'origin'");
  });

  it('never writes updated_at by hand', () => {
    // Writing it would paper over a disabled trigger instead of catching it, and would
    // widen the SET clause past the one column this script may touch.
    expect(emit()).not.toMatch(/SET[^;]*updated_at/);
    expect(emitRollbackSql(list(), OPTS)).not.toMatch(/SET[^;]*updated_at/);
  });
});

describe('emitSwapSql — the SET clause is one column (property 4)', () => {
  it('sets event_type and nothing else, on both the swap and the rollback', () => {
    for (const sql of [emit(), emitRollbackSql(list(), OPTS)]) {
      const sets = stripComments(sql).match(/SET\s+[^\n]*/g) ?? [];
      expect(sets.length).toBeGreaterThan(0);
      for (const s of sets) {
        expect(s).toMatch(/^SET event_type = '(cough|sneeze|other)'$/);
        // The provenance that justified the swap, and the record's own timing claims.
        for (const col of ['notes', 'occurred_at', 'severity', 'deleted_at']) {
          expect(s).not.toContain(col);
        }
      }
    }
  });

  it('leaves the held row out of every UPDATE', () => {
    const sql = emit();
    const updates = stripComments(sql)
      .split(';')
      .filter((s) => /UPDATE\s+events/.test(s))
      .join('\n');
    expect(updates).not.toContain(C);
    // …but still names it in the prelude, so a row nobody decided cannot slip through
    // as "not a candidate".
    expect(sql).toContain(C);
  });
});

describe('emitSwapSql — the total is invariant (property 5)', () => {
  it('checks the row total inside the transaction, before COMMIT', () => {
    const sql = emit();
    const body = sql.slice(0, sql.lastIndexOf('COMMIT;'));
    expect(body).toMatch(/row total moved % -> %, a swap must only re-key/);
    expect(body).toMatch(/swapped ids are still typed other/);
  });

  it('wraps everything in one transaction, and a dry run ends in ROLLBACK', () => {
    expect(emit()).toContain('BEGIN;');
    expect(emit().trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(emitSwapSql(list(), { ...OPTS, dryRun: true }).trimEnd().endsWith('ROLLBACK;')).toBe(true);
  });
});

describe('emitSwapSql — the artifact carries no note text', () => {
  it('cannot leak a note, because it is never given one', () => {
    // Structural, not a filter: ReviewedList has no field for note text, so the T&S
    // requirement ("ids and counts only, never note text") holds by construction
    // rather than by an emitter remembering to strip something.
    const sql = emit();
    expect(sql).not.toMatch(/\bnotes\b/);
    const reviewed = list() as unknown as Record<string, unknown>;
    expect(Object.keys(reviewed)).toEqual(['reviewer', 'counts', 'swap', 'hold']);
  });
});

describe('the committed reviewed-ids.json', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const committed = require('./reviewed-ids.json') as ReviewedList & Record<string, unknown>;

  it('emits without validation errors', () => {
    expect(() => emitSwapSql(committed, OPTS)).not.toThrow();
  });

  it('carries no note text — only ids, targets, counts and decisions', () => {
    // The hold `reason` is prose ABOUT the decision, deliberately structural ("names
    // both target leaves") rather than a quotation of the row.
    for (const row of [...committed.swap, ...committed.hold]) {
      expect(Object.keys(row).sort()).not.toContain('notes');
    }
    expect(JSON.stringify(committed)).not.toMatch(/"note[s]?"\s*:/);
  });

  it('decides every candidate — a blank is an unfinished decision, not a default', () => {
    expect(committed.swap.length + committed.hold.length).toBe(committed.counts.candidates);
  });
});
