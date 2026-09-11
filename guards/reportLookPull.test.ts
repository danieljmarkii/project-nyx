// Two string literals in `generate-report` are the whole of two privacy rules, and
// nothing red-flags either one if it is deleted. This file is what red-flags them.
//
// CUL-875 (Noticed N-6) · docs/nyx-daily-look-requirements.md §9 rules 2 and 4.
// Both findings are the `rls-privacy-reviewer`'s, from the pass on this PR.
//
// ── WHY A SOURCE SCAN AND NOT A BEHAVIOURAL TEST ─────────────────────────────
// Because the thing at risk is not behaviour that any fixture exercises.
//
//   1. THE SOFT-DELETE EMBED. `looks` has no soft-delete of its own: after an Undo the
//      child row and the sentence the owner typed survive at rest, and the report reads
//      them through `events(occurred_at, deleted_at)` and drops the ones whose parent is
//      gone. Delete `deleted_at` from that select string and every undone note starts
//      printing on a document made for a clinic — with the whole suite green, because
//      every fixture in the tree hand-builds a `LookRow` that already carries the field.
//      The reviewer's measured words: "the entire privacy guard for an undone note is a
//      string literal", and "this is the single line between 'the owner took her note
//      back' and 'her note is on a document at the clinic'".
//
//   2. THE MINT THAT DOES NOT EXIST YET. §9 rule 4's operative clause is "the share
//      link's mint never uploads the owner-audience PDF". PR 6 has not been written, so
//      there is no code to test — and that is exactly when the rule gets lost. This is
//      `guards/completionCard.test.ts`'s `firstCallerLands` shape (C-32): register the
//      routing rule the PR its helper SHIPS, with the empty set made an assertion, so the
//      FIRST caller reds the guard and has to meet the rule before it can be green again.
//
// `guards/lookNotes.test.ts` cannot see either: it matches a `looks`/`notes` proximity
// pair, not an embed's column list and not a call's argument shape.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'supabase/functions/generate-report');

/** Source with comments blanked line-preservingly, so a sentence ABOUT a rule is never
 *  mistaken for the rule (C-18: a guard's own prose is not its evidence). */
function code(rel: string): string {
  return blankComments(fs.readFileSync(path.join(REPORT_DIR, rel), 'utf8'));
}

/**
 * Source with the `ReportAudience` type DECLARATION removed.
 *
 * The union's own arms are written `{ kind: 'owner' … }` and `{ kind: 'shared_link' }`,
 * which is textually identical to constructing one. Counting call sites without dropping
 * the declaration counts the definition as a use — so the scan below would report the type
 * itself as PR 6's first mint, and the assertion would be satisfied by deleting the type.
 */
function codeWithoutAudienceType(rel: string): string {
  const src = code(rel);
  const at = src.indexOf('export type ReportAudience');
  if (at === -1) return src;
  // The declaration ends at the first blank line after it — every type in this tree is
  // separated from what follows by one.
  const end = src.indexOf('\n\n', at);
  return src.slice(0, at) + (end === -1 ? '' : src.slice(end));
}

/** Every `.from('<table>')` chain in a source, as the text from `.from(` to the end of
 *  the statement — enough to hold the select list and the filters. */
function fromChain(src: string, table: string): string | null {
  const at = src.indexOf(`.from('${table}')`);
  if (at === -1) return null;
  // The chain ends at the first line that closes it — a comma at depth 0 or a bare `,\n`
  // in the Promise.all array. The window is wider than any chain in this file (blanked
  // comments keep their LINES, so a documented select spans more characters than it
  // reads) and narrow enough that the next query cannot be swept in.
  return src.slice(at, at + 2400);
}

describe('§9 rule 2 — the look pull reads soft-delete off the PARENT', () => {
  const src = code('index.ts');

  it('the scan found the looks query at all', () => {
    // A guard over a query it cannot find is green forever. The rename that would defeat
    // this test should fail it loudly instead.
    expect(fromChain(src, 'looks')).not.toBeNull();
  });

  it("embeds `events` and names `deleted_at` — the only guard an undone note has", () => {
    const chain = fromChain(src, 'looks')!;
    expect(chain).toMatch(/events\s*\(\s*[^)]*deleted_at/);
  });

  it('reads the STORED local_day rather than deriving a day from the instant (T-19)', () => {
    // The device and this function bucket days on two different clocks. Selecting the
    // column is what makes Home's answered-day count and the report's the same number.
    expect(fromChain(src, 'looks')!).toMatch(/\blocal_day\b/);
  });

  it('is pet-scoped, and its ordering and cap are constants, not request values', () => {
    const chain = fromChain(src, 'looks')!;
    expect(chain).toMatch(/\.eq\('pet_id',\s*petId\)/);
    expect(chain).toMatch(/\.order\('local_day',\s*\{\s*ascending:\s*false/);
    expect(chain).toMatch(/\.limit\(LOOK_PULL_CAP\)/);
  });

  // The detector, proven — C-18: a guard that has only ever been green has not been
  // tested. These are the exact shapes the defect takes.
  it('the embed check FAILS on a select that drops deleted_at', () => {
    const probe = `const q = sb.from('looks').select('event_id, local_day, notes, events(occurred_at)').eq('pet_id', petId)`;
    expect(fromChain(probe, 'looks')!).not.toMatch(/events\s*\(\s*[^)]*deleted_at/);
  });

  it('the embed check PASSES on a select that keeps it', () => {
    const probe = `const q = sb.from('looks').select('event_id, events(occurred_at, deleted_at)').eq('pet_id', petId)`;
    expect(fromChain(probe, 'looks')!).toMatch(/events\s*\(\s*[^)]*deleted_at/);
  });
});

describe('§9 rule 4 — an unauthenticated render cannot inherit the owner’s notes', () => {
  const src = code('index.ts');

  it('`generateReportForPet` takes the audience with NO default', () => {
    // A default on this parameter is the break the reviewer proved end to end: a
    // seven-argument call type-checked under --strict, took the owner arm by omission,
    // and printed the owner's private sentence into the artifact. Required is what makes
    // `tsc` force PR 6's mint to decide.
    expect(src).toMatch(/audience:\s*ReportAudience\s*,/);
    expect(src).not.toMatch(/audience:\s*ReportAudience\s*=/);
  });

  it('the audience sits AHEAD of the optional parameters, so it cannot become one', () => {
    const sig = /export async function generateReportForPet\(([\s\S]*?)\n\): Promise</.exec(src);
    expect(sig).not.toBeNull();
    const params = sig![1];
    const audienceAt = params.indexOf('audience: ReportAudience');
    const firstDefault = params.indexOf('= null');
    expect(audienceAt).toBeGreaterThan(-1);
    expect(firstDefault).toBeGreaterThan(-1);
    expect(audienceAt).toBeLessThan(firstDefault);
  });

  // ── The rule registered before its first caller (C-32) ────────────────────
  //
  // §9 rule 4's operative clause is that the share link's mint NEVER uploads the
  // owner-audience render. PR 6 does not exist, so the honest thing to pin is that
  // nothing constructs a share-link render yet — and that the first thing which does will
  // fail this test and have to come back here and state how it meets the rule.
  //
  // When PR 6 lands, this test is not deleted. It is rewritten to assert that the mint
  // path reaches `assembleReport` with `{ kind: 'shared_link' }` and that the owner-facing
  // handler's HTML is never what gets uploaded.
  it('PR 6 registration: exactly ZERO share-link renders exist today', () => {
    const files = fs
      .readdirSync(REPORT_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const sites = files.flatMap((f) => {
      const lines = codeWithoutAudienceType(f).split('\n');
      return lines
        .map((line, i) => (/kind:\s*'shared_link'/.test(line) ? `${f}:${i + 1}` : null))
        .filter((v): v is string => v !== null);
    });
    expect(sites).toEqual([]);
  });

  it('the type stripper really removes the declaration, not the call sites', () => {
    // A stripper that silently removed everything would make both assertions vacuous.
    const stripped = codeWithoutAudienceType('noticed.ts');
    expect(stripped).not.toMatch(/\|\s*\{\s*kind:\s*'shared_link'\s*\}/);
    expect(stripped).toMatch(/lookNotesIncluded/);
    expect(codeWithoutAudienceType('index.ts')).toMatch(/kind:\s*'owner'/);
  });

  it('the owner arm is constructed in exactly one place — the authenticated handler', () => {
    const files = fs
      .readdirSync(REPORT_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const sites = files.flatMap((f) =>
      [...codeWithoutAudienceType(f).matchAll(/kind:\s*'owner'/g)].map(() => f),
    );
    // One: `index.ts`'s HTTP handler. A second would mean a second decision about who is
    // reading, which is the thing this whole shape exists to keep singular.
    expect(sites).toEqual(['index.ts']);
  });
});

describe('the note is bounded where it ENTERS, not only where it prints', () => {
  const src = code('index.ts');

  it('mapLookRows runs the note through a bound', () => {
    // `looks.notes` has no length bound at rest. The render's cap bounds the OUTPUT; this
    // bounds what the isolate holds (measured: 900 rows x ~200 KB is ~360 MB of UTF-16
    // against Edge's 256 MB, for ~1.3 MB of rendered HTML).
    expect(src).toMatch(/notes:\s*boundNote\(/);
    expect(src).not.toMatch(/notes:\s*typeof r\.notes === 'string' \? r\.notes : null/);
  });

  it('the bound leaves the render’s disclosure reachable', () => {
    // One character of headroom over NOTICED_NOTE_CAP, or a note at exactly the cap would
    // print with no "[shortened for this report]" and the truncation would be silent —
    // which is the one thing the N-1 review's rule 4 forbids.
    const bound = /const LOOK_NOTE_PULL_BOUND = (\d+)/.exec(src);
    const cap = /const NOTICED_NOTE_CAP = (\d+)/.exec(code('render.ts'));
    expect(bound).not.toBeNull();
    expect(cap).not.toBeNull();
    expect(Number(bound![1])).toBeGreaterThan(Number(cap![1]));
  });
});
