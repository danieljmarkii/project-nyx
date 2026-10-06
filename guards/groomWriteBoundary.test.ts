// The backlog groomer's write boundary is pinned, row by row (CUL-1617).
//
// WHY A GUARD. `.claude/skills/backlog-groomer/SKILL.md` § What an unattended pass may
// WRITE is the whole licence an unattended grooming run has to edit Linear fields:
// anything absent from its table is a report line. That table is prose, and the retro's
// law L2 is that a rule enforced by prose fires approximately never. Two ways it fails
// silently, and this file reds on both:
//
//   1. A row moves from the report half to the writable half (or a new writable row
//      appears) without anyone deciding it. The writable set is pinned EXACTLY, so a
//      new write is a deliberate edit to `WRITABLE` below, in a reviewed PR.
//   2. A row disappears from the report half, which silently widens the licence of the
//      step it bounded (the table is the licence, and "absent" means "report", but a
//      step's prose can read as an instruction once its row is gone). The report set is
//      pinned EXACTLY too.
//
// CUL-1617 added exactly one writable row, step 16's `blocks` relation add, and three
// report rows (step 16's prose / closed-target / label-only cases, and step 17). The
// assertions below prove the new write is allowed AND that nothing else changed.
//
// WHAT IT PARSES. The first markdown table after the `## What an unattended pass may
// WRITE` heading: three cells per row (step · unattended · artifact). A row is WRITABLE
// when its unattended cell does not open with `**report**`. Rows are keyed by their
// step cell, verbatim, so renaming a step's row is also a reviewed edit here.
//
// STATED BLIND SPOTS (C-38, an undocumented one reads as coverage):
//   - It reads the table, not the steps. A step whose prose instructs a write the table
//     does not list is caught by the skill's own rule ("the table wins"), not by this
//     file.
//   - It pins the row's step cell and its half, not the wording of the write. Narrowing
//     or widening a writable row's unattended cell is visible in review, not here,
//     except for the `blocks` row, whose two load-bearing words are asserted below.
//
// MUTATION PROOF (run against the real SKILL.md before commit, each red, then restored):
//   ✗ killed — step 16's `blocks` row deleted (3 red)
//   ✗ killed — step 10's `**report**` changed to `set \`duplicateOf\`` (2 red)
//   ✗ killed — step 17's row deleted (2 red)
//   ✗ killed — `append-only` removed from the `blocks` row (1 red)
//   ✗ killed — the section heading renamed, so no table is found (4 red)
//
// A writable row is not always a FIELD edit: step 12's team call and default posted
// write a comment only, and their artifact cell opens with `—`. That is why the guard
// pins halves by step, not by artifact shape.

import * as fs from 'fs';
import * as path from 'path';

const SKILL = path.resolve(__dirname, '..', '.claude', 'skills', 'backlog-groomer', 'SKILL.md');
const HEADING = '## What an unattended pass may WRITE';

/** Split one markdown table row into trimmed cells, ignoring pipes inside backticks. */
function cellsOf(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (const ch of line.trim().replace(/^\|/, '').replace(/\|$/, '')) {
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

interface BoundaryRow {
  step: string;
  unattended: string;
  artifact: string;
}

function boundaryRows(source: string): BoundaryRow[] {
  const start = source.indexOf(HEADING);
  if (start < 0) return [];
  const afterHeading = source.slice(start + HEADING.length);
  const nextSection = afterHeading.search(/\n## /);
  const section = nextSection < 0 ? afterHeading : afterHeading.slice(0, nextSection);
  const lines = section.split('\n');
  const first = lines.findIndex((l) => l.trim().startsWith('|'));
  if (first < 0) return [];
  const rows: BoundaryRow[] = [];
  // Skip the header row and its `|---|` separator.
  for (let i = first + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const [step, unattended, artifact] = cellsOf(lines[i]);
    rows.push({ step, unattended, artifact: artifact ?? '' });
  }
  return rows;
}

const isReport = (row: BoundaryRow): boolean => /^\*\*report\*\*/i.test(row.unattended);

// The licence. Editing this list IS the decision; a PR that does so says why.
const WRITABLE = [
  '1 · merged work',
  '2 · open PRs',
  '4 · abandoned claim',
  '6 · dead-label **strip**',
  "12 · *Not the PM's*, moot",
  '12 · team call',
  '12 · default posted',
  '12 · default applied after its window',
  '13 · `Propose close` **add**, from 13a / 13b / 13c only, reason `obsolete` or `stale`',
  '14 · cancel after the window',
  '16 · gates are relations, `blocks` **add**',
];

const REPORT = [
  '3 · deploy runs + holds',
  '4 · never claimed · blocked on the PM',
  '5 · narrowed against the tree',
  '6 · `Quick Win` **add**',
  '7 · closed but unfinished',
  '8 · priority',
  '9 · contract',
  '10 · dedup',
  '11 · what\'s relevant now',
  '12 · lane sort, docket, device sitting, clinical docket, 21-day proposals',
  "12 · *Not the PM's*, no PM step left",
  '13 · `superseded by` · `won\'t do`',
  '13 · project moves, `relatedTo` for *Dies at*',
  '14 · engaged proposals',
  '15 · board count',
  '16 · prose target, closed target, `GA gate` with nothing named',
  '17 · orphaned follow-ups',
];

describe('backlog-groomer write boundary (CUL-1617)', () => {
  const rows = boundaryRows(fs.readFileSync(SKILL, 'utf8'));

  it('finds the table (non-vacuity floor)', () => {
    expect(rows.length).toBe(WRITABLE.length + REPORT.length);
    for (const row of rows) expect(row.unattended.length).toBeGreaterThan(0);
  });

  it('pins the writable half exactly', () => {
    expect(rows.filter((r) => !isReport(r)).map((r) => r.step)).toEqual(WRITABLE);
  });

  it('pins the report half exactly', () => {
    expect(rows.filter(isReport).map((r) => r.step)).toEqual(REPORT);
  });

  it("step 16's relation write is append-only and determined by an identifier the issue wrote", () => {
    const row = rows.find((r) => r.step === '16 · gates are relations, `blocks` **add**');
    expect(row).toBeDefined();
    expect(row?.unattended).toMatch(/append-only/);
    expect(row?.unattended).toMatch(/never `removeBlocks`/);
    expect(row?.artifact).toMatch(/`CUL-NNN`/);
    expect(row?.artifact).toMatch(/\*\*Blocks:\*\*/);
  });

  it('cellsOf keeps a backticked pipe inside its cell', () => {
    expect(cellsOf('| a `x|y` | b | c |')).toEqual(['a `x|y`', 'b', 'c']);
  });
});
