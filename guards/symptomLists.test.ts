// The symptom-list DISCOVERY guard (CUL-676 PR-3a · taxonomy spec §13a · 2026-08-27 review).
//
// WHY THIS FILE EXISTS. The §13a membership walk (`constants/eventTypes.membership.test.ts`)
// is an enumeration: one row per KNOWN list, each with an explicit per-leaf decision. Its
// failure mode is the list nobody enumerated — the 2026-08-27 product-team review found
// three symptom-key lists outside the walk in thirty minutes (`lib/ask.ts` ×2,
// `lib/dietTrialFacts.ts`), and this guard's own first run found two more no review had
// named (`generate-report/render.ts`'s label switch, `analyze-stool`'s concurrent-context
// set). Enumeration alone cannot hold the line through waves W3–W5, where each new leaf
// multiplies the cost of a silent partial membership: a type that tints on Home while
// being invisible to the widget, uncountable by Ask, unfilterable in History.
//
// WHAT IT DOES. A comment-stripped source scan (the `guards/completionCard.test.ts`
// shape): any cluster of ≥3 DISTINCT symptom-key literals — quoted ('vomit') or as
// object keys (vomit:) — within a 300-char span is a "symptom list site". Every file
// containing one must be REGISTERED here, and registration is only honest if the file is
// also in (or deliberately absent from) the membership walk. So a new list can be
// written, but not silently: this guard fails the build until the author either adds the
// walk row + registry entry or names an inline exemption.
//
// WHAT IT DOES NOT CLAIM. Syntactic, so it proves a file DECLARES symptom keys — not
// that its membership is correct (the walk's job) or complete (review's). A list built
// dynamically (spread from another list, keys from a query) has no literals to catch;
// the walk's set-equality reads still cover those it knows about.
//
// ESCAPE HATCH: an inline `// symptom-list-ok: <reason>` anywhere in the file
// suppresses it. Reason mandatory — an exemption is a named decision, never a hole.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'constants', 'lib', 'store', 'hooks', 'widgets', 'supabase/functions'];

/** The full symptom-leaf key set, W1 included. A new wave's leaf joins HERE the PR its
 *  enum value ships, so the guard starts discovering that leaf's lists the same day. */
const SYMPTOM_KEYS = [
  'vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'lethargy', 'cough', 'sneeze',
] as const;

/** ≥3 distinct keys within one span = a list, not a mention. Two-key sites exist (the
 *  incident-category maps) but are family maps, not symptom membership — three distinct
 *  leaves is the floor at which a literal cluster can only be a membership/label list. */
const MIN_DISTINCT_KEYS = 3;
const CLUSTER_GAP_CHARS = 300;

/**
 * Every file KNOWN to declare a symptom-key list, with what its list is. Client rows
 * mirror the §13a membership walk; server rows are pinned there by source-text scan.
 * Adding a file here without a membership-walk row is the half-registration this guard
 * exists to prevent — the walk is where the per-leaf decision lives.
 */
const REGISTERED: Record<string, string> = {
  'constants/eventTypes.ts': 'EVENT_TYPES + SYMPTOM_TYPES — the two root predicates',
  'components/log/EventTypePicker.tsx': 'CATEGORY_TINT (§6 pairing) + the grid derivation',
  'components/history/TypeScopeControl.tsx': 'TYPE_FILTER_KEYS — History’s type filter',
  'lib/analytics.ts': 'SYMPTOM_EVENT_TYPES — Patterns/calendar/trial-deltas/widget',
  'lib/trendSummary.ts': 'TREND_SYMPTOM_TYPES — the Trend surface',
  'lib/daySummary.ts': 'SYMPTOM_CHIP_ORDER + SYMPTOM_NOUN — the Day Summary',
  'lib/widgetSnapshot.ts': 'WIDGET_SYMPTOM_LABELS — the widget symptom tile',
  'lib/metricDetail.ts': 'SYMPTOM_OCCURRENCE_LABELS — the calendar sentence form',
  'lib/signal.ts': 'SignalSymptomType — the Signal payload union',
  'lib/signalCopy.ts': 'SYMPTOM_LABEL (+ symptomWord fallback) — Signal owner copy',
  'lib/ask.ts': 'SYMPTOM_METRICS + HISTORY_SYMPTOM_TYPES — Ask tap-through (G5)',
  'lib/patternsTiming.ts': 'CORRELATION_SYMPTOM_TYPES client mirror — loggedDays denominator (3b-coupled)',
  'lib/dietTrialFacts.ts': 'TRIAL_RESPONSE_LOGGED_DAY_TYPES — trial logged-day denominator (3b-coupled, PM brief open)',
  'supabase/functions/generate-signal/detection.ts': 'CORRELATION_SYMPTOM_TYPES — the engine fetch + lanes (per-lane map = 3b)',
  'supabase/functions/generate-signal/phrasing.ts': 'server SYMPTOM_LABEL — engine owner copy (cough lands with 3b)',
  'supabase/functions/generate-report/report.ts': 'REPORT_SYMPTOM_TYPES — the report frequency section (3b co-work)',
  'supabase/functions/generate-report/render.ts':
    'symptomLabel switch — report display labels (guard-discovered 2026-08-27; safe humanizing default; proper cough/sneeze labels are 3b report co-work)',
  'supabase/functions/ask/tools.ts': 'ASK_SYMPTOM_TYPES — Ask server counts (G5; edits with 3b)',
  'supabase/functions/analyze-stool/index.ts':
    'concurrent-context event set (guard-discovered 2026-08-27; per-incident context contract, not W1 membership — a cough row here is its own future per-leaf call)',
};

const EXEMPTION = /\/\/\s*symptom-list-ok:\s*\S+/;

/** Comments out, code in — the completionCard guard’s lesson, both directions: prose
 *  about a list must not register as one, and a list must not hide in a comment.
 *  Offsets are preserved (same-length replacement) so cluster spans stay honest. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$|\.d\.ts$/.test(ent.name)) {
      out.push(path.relative(ROOT, full));
    }
  }
  return out;
}

// Matches a key as a string member in ANY quote style ('cough' / "cough" / `cough`,
// same closing quote — the codebase is single-quoted by convention, but no lint rule
// enforces that, so the guard must not rest on it) or as an unquoted Record key
// (cough:). Group order: [1]=quote, [2]=quoted key, [3]=key-form key.
const KEY_PATTERN = new RegExp(
  `(['"\`])(${SYMPTOM_KEYS.join('|')})\\1|\\b(${SYMPTOM_KEYS.join('|')})\\s*:`,
  'g',
);

/** The distinct-key sets of every ≥MIN_DISTINCT_KEYS literal cluster in the source. */
export function findListSites(rawSource: string): string[][] {
  const src = stripComments(rawSource);
  const hits: { key: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  KEY_PATTERN.lastIndex = 0;
  while ((m = KEY_PATTERN.exec(src)) !== null) {
    hits.push({ key: (m[2] ?? m[3]) as string, at: m.index });
  }
  const clusters: { key: string; at: number }[][] = [];
  let current: { key: string; at: number }[] = [];
  for (const h of hits) {
    if (current.length > 0 && h.at - current[current.length - 1].at > CLUSTER_GAP_CHARS) {
      clusters.push(current);
      current = [];
    }
    current.push(h);
  }
  if (current.length > 0) clusters.push(current);
  return clusters
    .map((c) => [...new Set(c.map((h) => h.key))])
    .filter((keys) => keys.length >= MIN_DISTINCT_KEYS);
}

describe('symptom-list discovery guard', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort();

  it('every file declaring a symptom-key list is registered (or carries a named exemption)', () => {
    const unregistered: string[] = [];
    for (const rel of files) {
      if (rel in REGISTERED) continue;
      const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (EXEMPTION.test(raw)) continue;
      const sites = findListSites(raw);
      if (sites.length > 0) {
        unregistered.push(`${rel} — keys: ${sites.map((s) => s.join(',')).join(' | ')}`);
      }
    }
    // A non-empty array here means a NEW symptom-key list exists that the §13a
    // membership walk has never decided. Fix: add a row to
    // constants/eventTypes.membership.test.ts with an explicit per-leaf decision and
    // register the file above — or, for a genuine non-list (rare), an inline
    // `// symptom-list-ok: <reason>`.
    expect(unregistered).toEqual([]);
  });

  it('every registered file still declares a list — a moved list must move its registration', () => {
    for (const rel of Object.keys(REGISTERED)) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full)).toBe(true);
      expect(findListSites(fs.readFileSync(full, 'utf8')).length).toBeGreaterThan(0);
    }
  });

  // The CUL-613 rule, made durable: a guard that has only ever been green has not been
  // tested. The detector is exercised against a synthetic unregistered list (must catch)
  // and against the shapes that must NOT count (prose, two-key family maps).
  it('red-check: the detector catches an unregistered list literal', () => {
    const synthetic = `export const NEW_LIST = ['vomit', 'cough', 'lethargy'] as const;`;
    expect(findListSites(synthetic)).toEqual([['vomit', 'cough', 'lethargy']]);
  });

  it('red-check: a Record-key list is caught too (the SYMPTOM_LABEL shape)', () => {
    const synthetic = `const LABELS = { vomit: 'Vomiting', cough: 'Coughing', sneeze: 'Sneezing' };`;
    expect(findListSites(synthetic)).toHaveLength(1);
  });

  it('red-check: double-quoted and template-literal members are caught (no lint rule pins the quote style)', () => {
    expect(findListSites(`const A = ["vomit", "cough", "lethargy"];`)).toHaveLength(1);
    expect(findListSites('const B = [`vomit`, `cough`, `sneeze`];')).toHaveLength(1);
    // Mismatched quotes are not a member — "cough' is prose, not a key.
    expect(findListSites(`const s = "vomit' + 'cough' plus "sneeze`)).toEqual([]);
  });

  it('prose about keys and two-key family maps do not count', () => {
    expect(findListSites(`// vomit, diarrhea and cough are symptom keys`)).toEqual([]);
    expect(findListSites(`const INCIDENT = { vomit: 'vomiting', diarrhea: 'stool' };`)).toEqual([]);
    expect(findListSites(`const copy = 'A cough after meals is worth logging';`)).toEqual([]);
  });
});
