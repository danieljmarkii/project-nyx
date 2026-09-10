// The look's note may not reach a server surface that is not the vet report.
//
// CUL-868 (Noticed N-2) · docs/nyx-daily-look-requirements.md T-22, §9 rule 1, §5.5.
//
// WHY THIS FILE EXISTS. `looks.notes` is the one column in this feature that holds
// the owner's own sentences about her animal, and the spec's rule for it is narrow:
// it is quoted on the entry, on its History row, and in the vet report's Appendix G —
// and it is "never counted, never summarised, never read by the engine, Ask or a
// model, never in a log line or `ai_usage`". Everything on that never-list lives in
// `supabase/functions/`.
//
// The fourth adversarial pass found the cheap implementation — putting the note on
// `events.notes` — hands the text straight to Ask's D2 retrieval, whose recall fetch
// selects `notes` for the pet with NO type filter. Migration 064 closed that at rest
// (`events_check_in_notes_null`) and `insertLook` never writes it. This guard closes
// the OTHER direction: a future Edge Function reading the note off the child.
//
// KEYED ON THE COLUMN, NOT THE TABLE, and that is deliberate. `generate-report`
// legitimately names the table (its page-1 line and its graph count looks), and Ask
// may one day legitimately learn that looks EXIST without learning what they say
// (Q-4). So the thing pinned is the pairing: a select that names `looks` and `notes`
// together.
//
// WHAT IT DOES NOT CLAIM. Syntactic. It proves no server source ASKS for the column;
// it cannot prove a `select('*')` somewhere does not sweep it up, which is why
// `hydrateLooks` spells its column list and why the review's own rule is that Ask's
// fetches are explicit column lists. Review's job, not a scan's.
//
// `guards/ownerFacingCopy.test.ts` cannot see any of this: it is a display-sink
// scanner over the app directories, keyed on error-named fields, and it never reads
// `supabase/functions` at all. Hence a new guard rather than a new rule in that one.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase/functions');

/** The one place a look's note may be selected server-side: the vet report's
 *  Appendix G (N-6, CUL-875). Everything else is zero. */
const ALLOWED_PREFIX = 'supabase/functions/generate-report/';

/**
 * Blank every comment in ONE left-to-right pass, preserving offsets and newlines.
 *
 * A CHAIN of `.replace()` calls is the wrong tool here and the codebase has the scar
 * to prove it (C-18): independent passes each read delimiters the other owns, so a
 * `//` inside a string literal eats the rest of the line and an apostrophe inside a
 * "…" string pairs with the next stray quote — each silently swallowing a real
 * violation. This walks the source once, tracking whether it is in code, a comment or
 * a string, which is the only way to get both right at the same time.
 *
 * Same-length replacement so every offset and line number the caller reports stays
 * honest.
 */
export function blankComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** How far apart `looks` and `notes` may sit and still be one request. Wide enough
 *  for a multi-line select list, narrow enough that two unrelated statements do not
 *  pair up. A false positive here costs a comment; a false negative costs the rule.
 *
 *  MEASURED IN BOTH DIRECTIONS, and that is not a detail. The first version of this
 *  scan only looked FORWARD from each `looks`, on the assumption that supabase-js
 *  names the table before the column (`.from('looks').select('… notes …')`). Raw SQL
 *  is the other way round — `SELECT l.notes FROM looks l` — so the whole raw-SQL and
 *  RPC shape was invisible to a guard whose header claimed it proved no server source
 *  asks for the column. Caught by `code-reviewer`, which ran the detector on that
 *  string and got `[]`. The claim now matches the code. */
const PAIR_WINDOW = 240;

export interface LookNotesHit {
  line: number;
  excerpt: string;
}

/** Every offset at which a word-bounded token occurs, comments already blanked. */
function offsetsOf(src: string, word: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`\\b${word}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m.index);
  return out;
}

/**
 * Every place this source asks for a look's note.
 *
 * The rule is a PAIRING — the table and the column named within one request —
 * and it is checked symmetrically, because the request is written both ways round:
 *
 *   • supabase-js names the table first: `.from('looks').select('id, notes')`,
 *     `.select('*, looks!inner(notes)')`, `looks.notes`.
 *   • raw SQL and RPC name the column first: `SELECT l.notes FROM looks l`.
 *
 * One hit per `looks` occurrence that has a `notes` within the window on either
 * side, reported at the earlier of the two so the excerpt shows the request rather
 * than its tail.
 */
export function findLookNotesSelects(rawSource: string): LookNotesHit[] {
  const src = blankComments(rawSource);
  const lineOf = (index: number) => src.slice(0, index).split('\n').length;

  const looksAt = offsetsOf(src, 'looks');
  const notesAt = offsetsOf(src, 'notes');
  if (looksAt.length === 0 || notesAt.length === 0) return [];

  const hits: LookNotesHit[] = [];
  for (const at of looksAt) {
    const near = notesAt.filter((n) => Math.abs(n - at) <= PAIR_WINDOW);
    if (near.length === 0) continue;
    const start = Math.min(at, ...near);
    hits.push({
      line: lineOf(start),
      excerpt: src.slice(start, start + 120).replace(/\s+/g, ' ').trim(),
    });
  }
  return hits;
}

function serverSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') continue;
        walk(full);
      } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
        out.push(path.relative(ROOT, full));
      }
    }
  };
  walk(FUNCTIONS_DIR);
  return out.sort();
}

describe('T-22 — a look’s note reaches no Edge Function but the vet report', () => {
  const files = serverSources();

  it('the scan actually has server sources to read', () => {
    // A guard over an empty set is green forever. Same floor as haptics.test.ts.
    expect(files.length).toBeGreaterThan(10);
  });

  it('no Edge Function outside generate-report selects notes from looks', () => {
    const findings: string[] = [];
    for (const rel of files) {
      if (rel.startsWith(ALLOWED_PREFIX)) continue;
      for (const hit of findLookNotesSelects(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
        findings.push(
          `${rel}:${hit.line} — a look's note may only be read by generate-report's Appendix G `
          + `(spec T-22 / §9 rule 1). If this function needs to know looks EXIST, select the `
          + `columns it needs and leave notes out. Found: ${hit.excerpt}`,
        );
      }
    }
    expect(findings).toEqual([]);
  });

  it('generate-report asks for it at most once — one Appendix G, not a scattering', () => {
    const hits = files
      .filter((rel) => rel.startsWith(ALLOWED_PREFIX))
      .flatMap((rel) =>
        findLookNotesSelects(fs.readFileSync(path.join(ROOT, rel), 'utf8')).map((h) => `${rel}:${h.line}`),
      );
    // ZERO today (N-6 / CUL-875 lands the first), one after it. Never more: the note
    // has exactly one home on the report, and a second read is a second decision.
    expect(hits.length).toBeLessThanOrEqual(1);
  });
});

describe('the detector itself', () => {
  // CUL-613: a guard that has only ever been green has not been tested. These probes
  // are the shapes a real violation takes.
  it('catches a qualified column', () => {
    expect(findLookNotesSelects(`const q = supabase.from('looks').select('id, notes')`)).toHaveLength(1);
  });

  it('catches an embed', () => {
    expect(findLookNotesSelects("const q = sb.from('events').select('id, looks!inner(notes)')")).toHaveLength(1);
  });

  it('catches a multi-line select list', () => {
    const probe = `
      const { data } = await supabase
        .from('looks')
        .select(\`
          id,
          local_day,
          notes
        \`)
    `;
    expect(findLookNotesSelects(probe)).toHaveLength(1);
  });

  it('does NOT flag a select over looks that leaves the note out', () => {
    expect(findLookNotesSelects(`sb.from('looks').select('id, local_day, words, outcome')`)).toEqual([]);
  });

  // The regression the first version of this detector had: `notes` BEFORE `looks`.
  // Found by code-reviewer running the algorithm on exactly this string and getting
  // an empty array, on a guard whose header claimed the opposite.
  it('catches raw SQL that names the column BEFORE the table', () => {
    const probe = `const sql = 'SELECT l.notes FROM looks l JOIN events e ON e.id = l.event_id';`;
    expect(findLookNotesSelects(probe)).toHaveLength(1);
  });

  it('catches an RPC body that reads the column first', () => {
    const probe = [
      'const { data } = await supabase.rpc(\'appendix_g\', {',
      "  q: 'select notes, local_day from public.looks where pet_id = $1',",
      '});',
    ].join('\n');
    expect(findLookNotesSelects(probe)).toHaveLength(1);
  });

  it('does NOT flag a note from another table', () => {
    expect(findLookNotesSelects(`sb.from('vet_visits').select('id, notes')`)).toEqual([]);
  });

  // The comment blanker's own hazards, both of which a chain of .replace()s gets
  // wrong — and getting them wrong means SWALLOWING a real violation, not reporting
  // a false one.
  it('a violation is still found when a comment mentioning looks precedes it', () => {
    const probe = `
      // looks and notes are discussed here in prose
      sb.from('looks').select('id, notes')
    `;
    const hits = findLookNotesSelects(probe);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3); // the offsets survive the blanking
  });

  it('an apostrophe inside a double-quoted string does not swallow the next line', () => {
    const probe = [
      'const msg = "the owner\'s note";',
      "sb.from('looks').select('id, notes')",
    ].join('\n');
    expect(findLookNotesSelects(probe)).toHaveLength(1);
  });

  it('a // inside a string does not blank the rest of the line', () => {
    const probe = `const url = 'https://example.test'; sb.from('looks').select('notes')`;
    expect(findLookNotesSelects(probe)).toHaveLength(1);
  });

  it('a real comment IS blanked — prose about looks and notes is not a violation', () => {
    expect(findLookNotesSelects(`// select notes from looks one day, maybe`)).toEqual([]);
    expect(findLookNotesSelects(`/* looks.notes is the column */`)).toEqual([]);
  });
});
