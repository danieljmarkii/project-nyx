import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// ─────────────────────────────────────────────────────────────────────────────
// The columns a client may not move on `event_ai_analysis`, read from the LAST
// definition of `freeze_event_ai_analysis_stamps()` across the migration replay
// (Engines v3 PR-25, CUL-1133; rls-privacy-reviewer L4 on 079).
//
// lib/functionHardening.test.ts proves the function's POSTURE (INVOKER, pinned,
// no client EXECUTE) and would stay green if a later CREATE OR REPLACE copied
// 075's body forward and dropped 079's `tier` line, or if the trigger were
// dropped. Either would let a client rewrite a call-now read to `logged` on its
// own row, and readers' max(tier, recommendation) would still show a quieter
// call than the server gave. This reads what the body FREEZES and that the
// trigger still calls it.
//
// SERVER_OWNED is a decision, not a derivation: each entry is a column the
// server decides on (075's stamps, 079's tier). Adding a server-owned column to
// the table means adding it here and to the body. Each entry is checked against
// the migrations' ADD COLUMNs, so a stale name reds too.
//
// WHAT IT CANNOT SEE: the live database (a dashboard edit), and a writer that
// reaches the row as a role the body exempts (the deny-list shape 075 chose).
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const FN = 'freeze_event_ai_analysis_stamps';
const TRIGGER = 'trg_event_ai_analysis_stamps_frozen';

const SERVER_OWNED = [
  'photo_set_key', // 075
  'model_id', // 075
  'prompt_hash', // 075
  'rule_version', // 075
  'engine_flags', // 075
  'tier', // 079, CUL-1133
] as const;

interface Replay {
  lastBody: string | null;
  lastBodyFile: string | null;
  triggerLive: boolean;
  addedColumns: Set<string>;
}

function replay(): Replay {
  const out: Replay = { lastBody: null, lastBodyFile: null, triggerLive: false, addedColumns: new Set() };
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const createFn = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi',
  );
  const createTrg = new RegExp(`CREATE\\s+TRIGGER\\s+${TRIGGER}\\b[\\s\\S]*?EXECUTE\\s+FUNCTION\\s+(?:public\\.)?(\\w+)`, 'gi');
  const dropTrg = new RegExp(`DROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${TRIGGER}\\b`, 'gi');

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));

    // Statement order within a file matters for the trigger; collect positions.
    const events: { at: number; apply: () => void }[] = [];
    for (const m of sql.matchAll(createFn)) {
      events.push({ at: m.index ?? 0, apply: () => { out.lastBody = m[1]; out.lastBodyFile = file; } });
    }
    for (const m of sql.matchAll(createTrg)) {
      events.push({ at: m.index ?? 0, apply: () => { out.triggerLive = m[1].toLowerCase() === FN; } });
    }
    for (const m of sql.matchAll(dropTrg)) {
      events.push({ at: m.index ?? 0, apply: () => { out.triggerLive = false; } });
    }
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());

    // ADD COLUMN names inside an ALTER TABLE on event_ai_analysis.
    for (const alter of sql.matchAll(/ALTER\s+TABLE\s+(?:public\.)?event_ai_analysis\b([\s\S]*?);/gi)) {
      for (const col of alter[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
        out.addedColumns.add(col[1].toLowerCase());
      }
    }
  }
  return out;
}

const live = replay();

describe('event_ai_analysis: the server-owned columns stay frozen for clients', () => {
  it('finds the freeze function and the migration that last defined it', () => {
    expect(live.lastBody).not.toBeNull();
    expect(live.lastBodyFile).toMatch(/^\d{3}_.*\.sql$/);
  });

  it('the freeze trigger exists at the end of the replay and calls the function', () => {
    expect(live.triggerLive).toBe(true);
  });

  it('every server-owned column is a real column on the table', () => {
    for (const col of SERVER_OWNED) expect(live.addedColumns).toContain(col);
  });

  it.each(SERVER_OWNED)('the last freeze body refuses a client change to %s', (col) => {
    const body = live.lastBody ?? '';
    expect(body).toMatch(new RegExp(`NEW\\.${col}\\s+IS\\s+DISTINCT\\s+FROM\\s+OLD\\.${col}\\b`, 'i'));
  });

  it('the body still judges by client role and raises the privilege error', () => {
    const body = live.lastBody ?? '';
    expect(body).toMatch(/current_user\s+IN\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)/i);
    expect(body).toMatch(/ERRCODE\s*=\s*'42501'/);
  });
});
