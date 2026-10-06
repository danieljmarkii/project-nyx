// Reads a /dispatch plan page (a Linear project description) into rows, order rules,
// critical paths and build notes (CUL-1615). Pure: the raw description comes in as a
// string, exactly as `get_project` returns it, link tags and all.
//
// WHY RAW. Linear stores a reference as `<issue …>CUL-NNN</issue>` or
// `<pull-request …>title</pull-request>`. The inner text is what a reader sees, so every
// parse here runs on the plain text, but a `✓ <pull-request>` in a PR cell keeps the
// title as shipped evidence (its href is a Linear review link, never a GitHub number),
// and anchors for page writes must stay raw. The Board the old prose wrote broke on
// exactly this (`| 12 | </pull-request> |`, 2026-10-05): a regex that split a tag in two.
//
// STATED BLIND SPOTS (C-38):
//   - A run-order table is one whose header is exactly `PR | Issue(s) | What it is | After |
//     Lane` (a trailing `Status` column is tolerated). Any other table is not read.
//   - A build note is the text after a bold `**PR-NN:**` (or `**PR-NN to PR-MM:**`) up to
//     the next such marker or the end of its line. A note that continues on a later line
//     with no marker of its own is cut at the line end.
//   - "Never at the same time" is read only from bullets under a heading with that name.

export type RowId = string; // '12', '14b', '03 + 04', as the page writes it (minus marks)

export type AfterItem =
  | { kind: 'pr'; row: RowId; text: string }
  | { kind: 'issue-merged'; issue: string; text: string } // `CUL-NNN merged (…)`
  | { kind: 'release'; text: string }
  | { kind: 'ga'; text: string }
  | { kind: 'ruling'; text: string; key: string }
  | { kind: 'pm'; text: string; key: string }
  | { kind: 'partial'; text: string }
  | { kind: 'group'; text: string }
  | { kind: 'satisfied'; text: string } // `PMD-4 ✓ (ruled 9/28)`, `ruled (a) 2026-10-04`
  | { kind: 'unknown'; text: string };

export type PageRow = {
  id: RowId; // '' for a row with no PR number (`—`, `PM`, `parked`)
  cell: string; // the PR cell, plain
  rawLine: string;
  wave: string;
  auto: boolean;
  bundle: boolean;
  shippedTitle?: string; // `✓ <pull-request>title</pull-request>`
  shippedNumber?: number; // `✓ #<n>`
  unreadable?: string; // why the PR cell could not be read
  issues: string[]; // the row's own issue(s), never a parent
  parents: string[];
  what: string;
  after: AfterItem[];
  afterText: string;
  lane: string;
  note: string; // the build note, plain ('' when none)
  hotspots: string[];
  mergeGate?: string;
  gaGate?: string;
  migration: boolean;
};

export type OrderRule =
  | { kind: 'chain'; rows: RowId[]; text: string } // strictly in order
  | { kind: 'one-at-a-time'; rows: RowId[]; text: string }
  | { kind: 'allowed'; rows: RowId[]; text: string };

export type CriticalPath = {
  label: string;
  text: string; // the line after its label, plain
  steps: RowId[]; // in rank order; a labelled sub-chain is its own path, right after
};

export type Page = {
  rows: PageRow[];
  order: OrderRule[];
  paths: CriticalPath[];
  pathLines: { label: string; text: string }[]; // each critical-path line, whole, for the Board
  boardRaw?: { from: string; to: string }; // anchors of `## Board` .. next `## `
  hasBoard: boolean;
  alias?: string;
};

const TAG = /<(issue|pull-request)\b[^>]*>([\s\S]*?)<\/\1>/g;
export const stripTags = (s: string) => s.replace(TAG, (_m, _k, inner: string) => inner);

const ROW_ID = /\d{2}[a-z]?/;
const PR_TOKEN = /\bPR-(\d{2}[a-z]?)\b/g;

// Linear escapes Markdown punctuation in stored text (`analyze-\\*`); a PR title does not.
export const unescapeMd = (s: string) => s.replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1');

export const normRow = (id: string) => id.trim().toLowerCase();

function cells(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith('|')) return [];
  // A pipe inside a link tag never splits a cell, so blank the tags' inner pipes first.
  return t
    .slice(1, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

function parsePrCell(rawCell: string): Pick<PageRow, 'id' | 'auto' | 'bundle' | 'shippedTitle' | 'shippedNumber' | 'unreadable'> {
  const tagTitle = /<pull-request\b[^>]*>([\s\S]*?)<\/pull-request>/.exec(rawCell)?.[1];
  const plain = stripTags(rawCell).trim();
  const base = { auto: false, bundle: false };
  if (/^(—|-|PM|parked|)$/i.test(plain) || plain.startsWith('**')) return { ...base, id: '' };
  const m = new RegExp(`^(${ROW_ID.source}(?: \\+ ${ROW_ID.source})?)((?: ⧉)?)((?: auto)?)(?: ✓(?: #(\\d+))?(.*))?$`).exec(plain);
  if (!m) return { ...base, id: '', unreadable: `PR cell unreadable: "${plain}"` };
  const out: ReturnType<typeof parsePrCell> = { id: normRow(m[1]), auto: m[3] === ' auto', bundle: m[2] === ' ⧉' };
  if (m[4]) out.shippedNumber = Number(m[4]);
  else if (plain.includes('✓')) {
    if (tagTitle) out.shippedTitle = unescapeMd(stripTags(tagTitle).trim());
    else if (m[5]?.trim()) out.shippedTitle = m[5].trim();
    else out.unreadable = `PR cell has ✓ with no evidence: "${plain}"`;
  }
  return out;
}

function parseIssues(cell: string): { issues: string[]; parents: string[] } {
  const parents = [...cell.matchAll(/\(of (CUL-\d+)\)/g)].map((m) => m[1]);
  // `CUL-1133 (+ CUL-819, CUL-531)` and `CUL-1217 (CUL-1568)`: a parenthetical that is
  // not `(of …)` annotates the row and is not its issue.
  const own = cell.replace(/\([^)]*\)/g, ' ');
  return { issues: [...own.matchAll(/CUL-\d+/g)].map((m) => m[0]), parents };
}

const RELEASE = /rides the first build after|before the [\w. ]*cut\b|App Review/i;
const GA = /before GA\b|goes live|go-live|live only after/i;

export function classifyAfter(item: string): AfterItem {
  const text = item.trim();
  const pr = /^PR-(\d{2}[a-z]?)( ✓)?(?: \(.*\))?$/.exec(text);
  if (pr) return { kind: 'pr', row: normRow(pr[1]), text };
  if (/✓/.test(text) || /\bruled \([a-z]\) \d{4}-\d{2}-\d{2}/i.test(text)) return { kind: 'satisfied', text };
  const merged = /^(CUL-\d+) merged\b/.exec(text);
  if (merged) return { kind: 'issue-merged', issue: merged[1], text };
  if (RELEASE.test(text)) return { kind: 'release', text };
  if (GA.test(text)) return { kind: 'ga', text };
  if (/'s |\bpt \d+ live\b|\(.*\bcan be\b.*\)/.test(text)) return { kind: 'partial', text };
  if (/^Lane [A-Z]\b|^EN-\d+$|^W\d+ to W\d+/.test(text)) return { kind: 'group', text };
  const key = /\b(PMD-\d+|D\d+|K\d+|E-\d+|CUL-\d+)\b/.exec(text)?.[1];
  if (/\*\*|\byour\b|\byou\b/.test(text) || (key?.startsWith('CUL-') && !/ruled|ruling/.test(text)))
    return { kind: 'pm', text, key: key ?? text };
  if (/\bruled?\b|\bruling\b|\bPMD-\d+|\bD\d+\b|\bsheet\b|\bS1\b|\binterim rule\b|\bnumber\b/.test(text))
    return { kind: 'ruling', text, key: key ?? text };
  return { kind: 'unknown', text };
}

function parseAfter(cell: string): AfterItem[] {
  const t = cell.trim();
  if (t === '' || /^—/.test(t)) return [];
  // Split on top-level `,` and ` · ` only: `PR-11a's corpus format (null scenarios can be
  // written now)` stays one item, and so does `EN-8, EN-9, EN-10` read as one group below.
  const items: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || t.startsWith(' · ', i))) {
      items.push(cur);
      cur = '';
      if (ch !== ',') i += 2;
      continue;
    }
    cur += ch;
  }
  items.push(cur);
  const parsed = items.map((s) => s.trim()).filter(Boolean).map(classifyAfter);
  // `EN-8, EN-9, EN-10` names a group of work, not a PR: one hold, not three.
  if (parsed.length > 1 && parsed.every((p) => p.kind === 'group')) return [{ kind: 'group', text: t }];
  return parsed;
}

// Build notes: `**PR-NN:**` or `**PR-NN to PR-MM:**` markers, plain text.
function buildNotes(plain: string, order: RowId[]): Map<RowId, string> {
  const notes = new Map<RowId, string>();
  const marker = /\*\*PR-(\d{2}[a-z]?)(?: to PR-(\d{2}[a-z]?))?:\*\*/g;
  for (const line of plain.split('\n')) {
    const hits = [...line.matchAll(marker)];
    hits.forEach((h, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].index! : line.length;
      const text = line.slice(h.index! + h[0].length, end).trim();
      const from = normRow(h[1]);
      const targets = h[2]
        ? order.slice(order.indexOf(from), order.indexOf(normRow(h[2])) + 1)
        : [from];
      for (const t of targets) notes.set(t, [notes.get(t), text].filter(Boolean).join(' '));
    });
  }
  return notes;
}

// The files a row's note names as shared. Hotspot: lines name paths in backticks or a
// phrase ("the mock page"); the always-shared files are recognised anywhere in the note.
const ALWAYS_SHARED = [/\bCLAUDE\.md\b/, /\bSTATUS\.md\b/, /generate-signal\/pipeline\.ts/, /\bpipeline\.ts\b/];
export function hotspotsOf(note: string): string[] {
  const out = new Set<string>();
  const line = /Hotspot:\s*([^]*?)(?:\.(?:\s|$)|$)/.exec(note)?.[1];
  if (line) {
    const ticks = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const t of ticks) out.add(canonFile(t));
    if (!ticks.length) out.add(line.replace(/\(.*?\)/g, '').trim());
    else {
      const phrase = line.replace(/`[^`]+`/g, '').replace(/\(.*?\)/g, '').replace(/[,;]|\band\b/g, ' ').trim();
      if (/^the [a-z' ]+$/i.test(phrase)) out.add(phrase);
    }
  }
  for (const re of ALWAYS_SHARED) {
    const m = re.exec(note);
    if (m) out.add(canonFile(m[0]));
  }
  return [...out];
}

export function canonFile(name: string): string {
  const n = name.trim().replace(/^\.\//, '');
  if (n === 'pipeline.ts' || n === 'generate-signal/pipeline.ts') return 'supabase/functions/generate-signal/pipeline.ts';
  return n;
}

function parseOrder(plain: string): OrderRule[] {
  const sec = /^#{2,3} Never at the same time\s*$([\s\S]*?)(?=^#{2,3} )/m.exec(plain + '\n## ')?.[1] ?? '';
  const rules: OrderRule[] = [];
  for (const bullet of sec.split('\n').filter((l) => /^\s*[*-] /.test(l))) {
    const text = bullet.replace(/^\s*[*-] /, '').trim();
    if (/Allowed, and named/i.test(text)) {
      rules.push({ kind: 'allowed', rows: tokens(text), text });
      continue;
    }
    // `A → B → C`, `A then B`, `Lane C (A → B), then C, D, one at a time`.
    const segments = text.split(/,?\s+then\s+/);
    const chainOrder: RowId[] = [];
    for (const seg of segments) {
      const toks = tokens(seg, true);
      if (!toks.length) continue;
      if (/one at a time/i.test(seg) && !/→/.test(seg)) rules.push({ kind: 'one-at-a-time', rows: toks, text });
      chainOrder.push(...toks);
    }
    if (segments.length > 1 || /→/.test(text)) rules.push({ kind: 'chain', rows: chainOrder, text });
  }
  return rules;
}

// `PR-14 → 14b → 14c` names 14b without its prefix: after an arrow a bare id counts.
function tokens(text: string, bareAfterArrow = false): RowId[] {
  const re = bareAfterArrow ? /(?:\bPR-|→\s*)(\d{2}[a-z]?)\b/g : PR_TOKEN;
  return [...text.matchAll(re)].map((m) => normRow(m[1]));
}

function parsePaths(plain: string): CriticalPath[] {
  const paths: CriticalPath[] = [];
  for (const line of plain.split('\n')) {
    const m = /^\*\*(Critical path[^:]*):\*\*\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    // A labelled sub-chain (`Weight: PR-18a → …`, `; PR-14d → …`) is its own path.
    const parts = m[2].split(/\.\s+(?=[A-Z][\w ]*:)|;\s+/);
    parts.forEach((part, i) => {
      const main = part.replace(/\([^)]*\)/g, ' ');
      const beside = [...part.matchAll(/\(([^)]*)\)/g)].map((x) => x[1]).join(' ');
      const steps = [...tokens(main), ...tokens(beside).filter((t) => !tokens(main).includes(t))];
      // `, with PR-31 → PR-34 beside it` is outside parentheses on some pages: tokens()
      // already reads it in order after the main chain.
      if (steps.length) paths.push({ label: i === 0 ? m[1] : `${m[1]} (${i + 1})`, text: part.trim(), steps });
    });
  }
  return paths;
}

export function parsePage(raw: string): Page {
  const rawLines = raw.split('\n');
  // The Board is dispatch's own output: its table, critical-path reprint and wording are
  // never read back as plan (they would rank and gate rows on a copy of themselves).
  const plain = stripTags(withoutBoard(rawLines).join('\n'));
  const rows: PageRow[] = [];
  let inTable = false;
  let wave = '';
  for (const rawLine of withoutBoard(rawLines)) {
    const c = cells(rawLine).map((x) => x);
    const p = c.map((x) => stripTags(x).trim());
    if (p.length >= 5 && p[0] === 'PR' && /^Issue/.test(p[1]) && p[2] === 'What it is' && p[3] === 'After' && p[4] === 'Lane') {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!rawLine.trim().startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|\s*-/.test(rawLine.trim())) continue;
    if (/^\*\*.*\*\*$/.test(p[0])) {
      wave = p[0].replace(/\*\*/g, '');
      continue;
    }
    const pr = parsePrCell(c[0]);
    const { issues, parents } = parseIssues(p[1] ?? '');
    rows.push({
      ...pr,
      cell: p[0],
      rawLine,
      wave,
      issues,
      parents,
      what: p[2] ?? '',
      after: parseAfter(p[3] ?? ''),
      afterText: p[3] ?? '',
      lane: p[4] ?? '',
      note: '',
      hotspots: [],
      migration: false,
    });
  }
  const notes = buildNotes(plain, rows.map((r) => r.id).filter(Boolean));
  for (const r of rows) {
    const ids = r.id.split(' + ').map(normRow);
    r.note = ids.map((i) => notes.get(i)).filter(Boolean).join(' ');
    r.hotspots = hotspotsOf(r.note);
    r.mergeGate = /Merge gate:\s*(.*?)(?:\.(?=\s|$)|$)/.exec(r.note)?.[1]?.trim();
    r.gaGate = /GA gate:\s*(.*?)(?:\.(?=\s|$)|$)/.exec(r.note)?.[1]?.trim();
    r.migration = /\bmigration\b/i.test(r.what) || /supabase\/migrations\//.test(r.note) || /^Migration\b|\bMigration;|\bMigration,/.test(r.note);
  }
  const boardStart = rawLines.find((l) => /^## Board\s*$/.test(l));
  let boardRaw: Page['boardRaw'];
  if (boardStart) {
    const i = rawLines.indexOf(boardStart);
    const next = rawLines.slice(i + 1).find((l) => /^## /.test(l));
    if (next) boardRaw = { from: boardStart, to: next };
  }
  return {
    rows,
    order: parseOrder(plain),
    paths: parsePaths(plain),
    pathLines: plain
      .split('\n')
      .map((l) => /^\*\*(Critical path[^:]*):\*\*\s*(.*)$/.exec(l.trim()))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => ({ label: x[1], text: x[2].trim() })),
    boardRaw,
    hasBoard: !!boardStart,
    alias: /^Alias:\s*(.+)$/m.exec(plain)?.[1]?.trim(),
  };
}

function withoutBoard(lines: string[]): string[] {
  const i = lines.findIndex((l) => /^## Board\s*$/.test(l));
  if (i < 0) return lines;
  const j = lines.findIndex((l, k) => k > i && /^## /.test(l));
  return [...lines.slice(0, i), ...(j < 0 ? [] : lines.slice(j))];
}

export function slugOf(alias: string): string {
  return alias.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Step 0: the alias is the page's `Alias:` line, else the name up to `:`, ` — ` or ` · `.
export function aliasOf(name: string, page?: Page): string {
  return page?.alias ?? name.split(/:| — | · /)[0].trim();
}
