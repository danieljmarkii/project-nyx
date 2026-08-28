// lib/analytics (SYMPTOM_EVENT_TYPES) transitively reaches lib/supabase, whose
// fail-fast env check would kill the suite at import — stubbed, as every consumer
// of that chain stubs it (the daySummary.test shape).
jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES, EVENT_FAMILIES, expandedPickerGroups,
} from './eventTypes';
import { CATEGORY_TINT } from '../components/log/EventTypePicker';
import { TREND_SYMPTOM_TYPES } from '../lib/trendSummary';
import { SYMPTOM_EVENT_TYPES } from '../lib/analytics';
import { eventTintCategory, describeDayEvent } from '../lib/dayEvents';
import type { TimelineRow } from '../lib/db';
import { theme } from './theme';

// ── The HR-6 membership walk for W1 (cough + sneeze) — CUL-675 ───────────────
//
// "Membership is ~ten lists, and the failure mode is not a crash — it is SILENT
// PARTIAL MEMBERSHIP" (taxonomy spec §13a, checklist item 3). Left undecided, a
// cough would tint on Home while being invisible to the widget, unfilterable in
// History, uncountable by Ask, and un-nouned on the Day Summary. Nothing errors;
// the record is just quietly thinner on each surface it missed.
//
// So this file IS the walk table: one row per list, an EXPLICIT decision per leaf
// — a blank is an unfinished decision, not a default — plus the set-equality
// assertion that the CURRENT code matches the decided state AT THIS POINT IN THE
// W1 CHAIN. Lists that join in a later PR are asserted still-absent here, so that
// PR must flip the row deliberately, as a visible diff (the pin-update
// discipline). The chain: PR-2 (this) → PR-3a (client mirrors, App Store cadence
// — HR-2's release-order asymmetry) → PR-3b (engine per-lane build + report,
// §9/§10.5) → PR-4 (the §11 swap).
//
// Server-side lists are read as SOURCE TEXT (the guards/* precedent): those
// modules are Deno-only, and importing them would drag the Edge runtime into
// jest. A text pin on the declaration block is exact enough for membership.

type WalkState = {
  /** Is the leaf in the list RIGHT NOW (after this PR)? */
  now: boolean;
  /** The decided end-state + which PR lands it — the explicit yes/no of the table. */
  decision: string;
};

interface WalkRow {
  list: string;
  governs: string;
  read: () => { cough: boolean; sneeze: boolean };
  cough: WalkState;
  sneeze: WalkState;
}

const ROOT = join(__dirname, '..');

/** The declaration block of a list in a module this test must not import —
 *  from its marker to the given terminator. Throws loudly if the marker moved,
 *  so a rename can't silently turn every absence-assertion vacuous. */
function declBlock(relPath: string, marker: string, terminator: string): string {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`${relPath}: marker not found: ${marker}`);
  const end = src.indexOf(terminator, start);
  if (end === -1) throw new Error(`${relPath}: terminator "${terminator}" not found after ${marker}`);
  return src.slice(start, end + terminator.length);
}

/** Comments out, code in (the completionCard-guard lesson, re-learned here on 3b-s1:
 *  the LANE_SYMPTOM_TYPES cell DOCSTRINGS say "cough: NEVER (§9)" — prose about the
 *  membership, matched by the Record-key regex as the membership). Same-length
 *  replacement so marker/terminator offsets stay honest. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

function scan(relPath: string, marker: string, terminator: string) {
  const block = stripComments(declBlock(relPath, marker, terminator));
  // A leaf lives in a list as a quoted member ('cough') OR as a Record key (cough:) —
  // the label maps use the key form, and missing it read three joined rows as absent.
  const has = (key: string) => new RegExp(`'${key}'|\\b${key}\\s*:`).test(block);
  return { cough: has('cough'), sneeze: has('sneeze') };
}

const inSet = (set: ReadonlySet<string> | readonly string[]) => () => {
  const has = (k: string) => (Array.isArray(set) ? set.includes(k) : (set as ReadonlySet<string>).has(k));
  return { cough: has('cough'), sneeze: has('sneeze') };
};

// The walk. Row order mirrors the spec's §13a table (#1–#10 + the signal mirrors).
const WALK: WalkRow[] = [
  {
    list: 'SYMPTOM_TYPES (constants/eventTypes.ts)',
    governs: 'row-surface tint + the soft commit haptic (§8a de-symptomization)',
    read: inSet(SYMPTOM_TYPES),
    cough: { now: true, decision: 'YES — joins in THIS PR (§6 pairing rule)' },
    sneeze: { now: true, decision: 'YES — joins in THIS PR (§6 pairing rule)' },
  },
  {
    list: 'CORRELATION_SYMPTOM_TYPES (generate-signal/detection.ts)',
    governs: 'the engine FETCH union + (by construction, R3) the logged-day denominators — the lanes now read LANE_SYMPTOM_TYPES (3b-s1, #731)',
    read: () => scan('supabase/functions/generate-signal/detection.ts',
      'export const CORRELATION_SYMPTOM_TYPES', '] as const'),
    cough: {
      now: false,
      decision: 'YES for ⑦ only — lands in PR-3b AFTER the per-lane map + per-type floor exist '
        + '(§9: ① NEVER — no attribution window, post-tussive adjacency disclosed; ⑤ NEVER — '
        + 'its template would time a respiratory sign against a feeding; ⑥/③/④ no at W1). '
        + 'Adding it to this one-list-drives-five-lanes shape today would emit the food↔cough '
        + 'card §9 forbids by name — which is exactly why this row must stay red until 3b.',
    },
    sneeze: { now: false, decision: 'NO at W1 — data-only (§9); joins by explicit config when density warrants' },
  },
  {
    list: 'REPORT_SYMPTOM_TYPES (generate-report/report.ts)',
    governs: 'what the vet report’s frequency section renders',
    read: () => scan('supabase/functions/generate-report/report.ts',
      'export const REPORT_SYMPTOM_TYPES', '] as const'),
    cough: {
      now: false,
      decision: 'YES — lands in PR-3b, in the SAME PR as the lane change (§10.5: a lane-membership '
        + 'change is report work; the report must never print a chronicity safety flag about a sign '
        + 'its own frequency table never counts). Rides the held CUL-19 redeploy for prod visibility.',
    },
    sneeze: { now: false, decision: 'YES — lands in PR-3b (§10.2: shipped symptom leaves join the frequency section)' },
  },
  {
    list: 'TREND_SYMPTOM_TYPES (lib/trendSummary.ts)',
    governs: 'the Trend surface',
    read: inSet(TREND_SYMPTOM_TYPES),
    cough: { now: true, decision: 'YES — landed in PR-3a (client mirrors ship first, HR-2)' },
    sneeze: { now: true, decision: 'YES — landed in PR-3a' },
  },
  {
    list: 'SYMPTOM_EVENT_TYPES (lib/analytics.ts)',
    governs: 'Patterns grid · frequency calendar · diet-trial outcome deltas · widget symptom tile — the widest single miss',
    read: inSet(SYMPTOM_EVENT_TYPES),
    cough: {
      now: true,
      decision: 'YES — landed in PR-3a (per-type surfaces only; the pooled logged-day denominators '
        + 'are their own row below). NOTE the transitive consumer the discovery guard cannot see '
        + '(it imports, declares no literals): dietTrialOutcomeFacts → the trial COMPLETION sheet '
        + 'now renders a per-type cough line — pinned in dietTrialOutcomeFacts.test.ts + '
        + 'dietTrialCompletion.test.ts, inheriting that surface’s record-form/untracked-never-zero '
        + 'discipline unchanged.',
    },
    sneeze: { now: true, decision: 'YES — landed in PR-3a (same consumers, same pins)' },
  },
  {
    list: 'ASK_SYMPTOM_TYPES (supabase/functions/ask/tools.ts)',
    governs: 'Ask’s G5 Timeline-parity — Ask must count the rows the owner can see',
    read: () => scan('supabase/functions/ask/tools.ts', 'export const ASK_SYMPTOM_TYPES', '] as const'),
    cough: {
      now: false,
      decision: 'YES — server list, edited with PR-3b’s server work (it mirrors SYMPTOM_EVENT_TYPES '
        + 'by its own doc). Deploy rides the held CUL-557 ask-redeploy chain, never its own.',
    },
    sneeze: { now: false, decision: 'YES — same landing as cough' },
  },
  {
    list: 'CORRELATION_SYMPTOM_TYPES client mirror (lib/patternsTiming.ts)',
    governs: 'the trial panel’s loggedDays denominator — deliberately redeclared; drifts silently if only the server moves',
    read: () => scan('lib/patternsTiming.ts', 'export const CORRELATION_SYMPTOM_TYPES', '] as const'),
    cough: {
      now: false,
      decision: 'DECIDED AT PR-3b, WITH the engine edit — the mirror must match whatever set '
        + 'loggedDaysIn reads once the per-lane map exists (it may become a per-lane subset, not '
        + 'the fetch union). Whichever way 3b lands, this row flips in the SAME PR or the '
        + 'denominators drift — that drift is the reason this row exists.',
    },
    sneeze: { now: false, decision: 'NO at W1 — follows the engine (sneeze is data-only)' },
  },
  {
    list: 'SYMPTOM_NOUN + SYMPTOM_CHIP_ORDER (lib/daySummary.ts)',
    governs: 'the Day Summary’s lead sentence + count chips',
    read: () => {
      // Both halves must carry the leaf (AND) now that the row is joined — losing either
      // half alone would be exactly the silent partial membership this table exists for.
      const order = scan('lib/daySummary.ts', 'const SYMPTOM_CHIP_ORDER', '];');
      const noun = scan('lib/daySummary.ts', 'const SYMPTOM_NOUN', '};');
      return { cough: order.cough && noun.cough, sneeze: order.sneeze && noun.sneeze };
    },
    cough: { now: true, decision: 'YES — landed in PR-3a (real noun + chip slot after the GI pair, family order)' },
    sneeze: { now: true, decision: 'YES — landed in PR-3a' },
  },
  {
    list: 'WIDGET_SYMPTOM_LABELS (lib/widgetSnapshot.ts)',
    governs: 'the home-screen widget’s symptom tile labels',
    read: () => scan('lib/widgetSnapshot.ts', 'const WIDGET_SYMPTOM_LABELS', '};'),
    cough: { now: true, decision: 'YES — landed in PR-3a (with SYMPTOM_EVENT_TYPES, which scopes the widget query)' },
    sneeze: { now: true, decision: 'YES — landed in PR-3a' },
  },
  {
    list: 'TYPE_FILTER_KEYS (components/history/TypeScopeControl.tsx)',
    governs: 'History’s type filter — the quietest miss: rows visible but unfilterable',
    read: () => scan('components/history/TypeScopeControl.tsx', 'const TYPE_FILTER_KEYS', '];'),
    cough: { now: true, decision: 'YES — landed in PR-3a (un-gated on purpose — §12: reads are never flag-gated)' },
    sneeze: { now: true, decision: 'YES — landed in PR-3a' },
  },
  {
    list: 'SignalSymptomType + SYMPTOM_LABEL (lib/signal.ts / lib/signalCopy.ts)',
    governs: 'the Signal client mirrors — the cross-pet safety banner + what-to-tell-the-vet copy (§8b)',
    read: () => {
      const union = scan('lib/signal.ts', 'export type SignalSymptomType', ';');
      const label = scan('lib/signalCopy.ts', 'const SYMPTOM_LABEL', '};');
      return { cough: union.cough && label.cough, sneeze: union.sneeze && label.sneeze };
    },
    cough: {
      now: true,
      decision: 'YES — landed in PR-3a, BEFORE the engine (HR-2). Plus the runtime fallback '
        + '(symptomWord) so an out-of-union payload type can never render "recurring undefined" '
        + '— pinned in lib/signalCopy.symptomWord.test.ts.',
    },
    sneeze: { now: true, decision: 'YES — landed in PR-3a (the mirrors carry every W1 leaf so a later config flip needs no client cut)' },
  },
  // ── Rows 12–15: lists the 2026-08-27 product-team review discovered OUTSIDE the §13a
  // ten (+ signal mirrors) — the reason the discovery guard (guards/symptomLists.test.ts)
  // now exists. Registered here so each has an explicit decision, not a default.
  {
    list: 'SYMPTOM_METRICS + HISTORY_SYMPTOM_TYPES (lib/ask.ts)',
    governs: 'Ask’s provenance tap-through (G5 audit) — un-listed, a cough count silently loses its "Open in History" audit link',
    read: () => {
      const metrics = scan('lib/ask.ts', 'const SYMPTOM_METRICS', ');');
      const history = scan('lib/ask.ts', 'const HISTORY_SYMPTOM_TYPES', ');');
      return { cough: metrics.cough && history.cough, sneeze: metrics.sneeze && history.sneeze };
    },
    cough: { now: true, decision: 'YES — landed in PR-3a (review finding; Patterns detail + History filter both exist as of this PR)' },
    sneeze: { now: true, decision: 'YES — landed in PR-3a' },
  },
  {
    list: 'SYMPTOM_OCCURRENCE_LABELS (lib/metricDetail.ts)',
    governs: 'the frequency calendar’s sentence form ("Coughing on 5 days") — display-only, safe fallback to symptomLabel',
    read: () => scan('lib/metricDetail.ts', 'const SYMPTOM_OCCURRENCE_LABELS', '};'),
    cough: { now: true, decision: 'YES — landed in PR-3a (found by the discovery-guard sweep; fallback was safe but terse)' },
    sneeze: { now: true, decision: 'YES — landed in PR-3a' },
  },
  {
    list: 'TRIAL_RESPONSE_LOGGED_DAY_TYPES (lib/dietTrialFacts.ts)',
    governs: 'the trial_response logged-day DENOMINATOR (client parity of the engine’s loggedDaysIn) — a pooled density set, NOT a per-type surface',
    read: () => scan('lib/dietTrialFacts.ts', 'const TRIAL_RESPONSE_LOGGED_DAY_TYPES', '] as const'),
    cough: {
      now: false,
      decision: 'RULED (b) — PM, 2026-08-28 ("activity is activity — logging a cough is logging"): '
        + 'cough COUNTS as a logged day. Flips at 3b IN THE SAME PR as the engine’s denominator '
        + 'edit, with a before/after fixture + a client==server parity fixture — never here alone, '
        + 'or client and server drift. The adversarial dissent (trial-lane drift toward '
        + 'reassurance) is recorded on CUL-676; the C5/§7 density disclosures are the honesty '
        + 'instrument for it.',
    },
    sneeze: { now: false, decision: 'Follows the same ruling at 3b (a sneeze log is logging too); data-only for every per-type lane' },
  },
  // ── Rows 16–18: the engine-side lists 3b session 1 created or flipped (#731).
  // Registered here because the discovery guard is FILE-keyed — a second list added
  // to an already-registered file is invisible to it (the adversarial pass caught
  // phrasing's SYMPTOM_LABEL flipping with no row), so the walk is the only place
  // these carry an explicit per-leaf decision.
  {
    list: 'SYMPTOM_TYPE_UNIVERSE (generate-signal/detection.ts)',
    governs: 'what the engine can NAME (types + label map), deliberately ahead of the fetch — never consumed by a lane',
    read: () => scan('supabase/functions/generate-signal/detection.ts',
      'export const SYMPTOM_TYPE_UNIVERSE', '] as const'),
    cough: { now: true, decision: 'YES — landed in 3b session 1 (#731): typed and nameable so fixtures and labels exist before any lane may speak' },
    sneeze: { now: true, decision: 'YES — same landing' },
  },
  {
    list: 'LANE_SYMPTOM_TYPES per-lane cells (generate-signal/detection.ts)',
    governs: 'which fetched types each lane consumes — ① / ③④ / ⑦ / L4 / the diagnostics floor (the §9 ruled cells)',
    read: () => scan('supabase/functions/generate-signal/detection.ts',
      'export const LANE_SYMPTOM_TYPES', '} as const'),
    cough: {
      now: false,
      decision: 'JOINS the chronicity cell ONLY, in 3b session 2 (⑦-only, the ruled row; R1 L4-no + R2 floor-exclude '
        + 'are structural NEVER-cells with paired fixtures in laneMembership.test.ts). This row flips when the cell '
        + 'gains its first cough literal.',
    },
    sneeze: { now: false, decision: 'NO cell at W1 — data-only (§9)' },
  },
  {
    list: 'server SYMPTOM_LABEL (generate-signal/phrasing.ts)',
    governs: 'the engine’s owner-facing symptom words — AND summary.ts’s month-summary naming gate keys on `in SYMPTOM_LABEL` (adversarial 2026-08-28)',
    read: () => scan('supabase/functions/generate-signal/phrasing.ts',
      'export const SYMPTOM_LABEL', '}'),
    cough: {
      now: true,
      decision: 'YES — landed in 3b session 1 (#731), compile-forced by the universe; matches the client mirror. '
        + 'UNREACHABLE through any lane today. The known consequence to rule at session 2: once the FETCH carries '
        + 'cough, the month summary names it through this map with no lane cell — summary membership is session 2’s '
        + 'explicit decision, never an inheritance.',
    },
    sneeze: { now: true, decision: 'YES — same landing, same session-2 rule' },
  },
  {
    list: 'signalWatching gap row (lib/signalWatching.ts)',
    governs: 'the sub-floor "watching" register — vomit-anchored BY DESIGN (v1 scoped to the dominant symptom)',
    read: () => scan('lib/signalWatching.ts', 'export const WATCHING_GAP_SYMPTOM_LABEL', ';'),
    cough: {
      now: false,
      decision: 'OPEN — W1-greenlight rider (review): either cough gets a watching row (per-surface '
        + 'membership decision, composes with CUL-80) or spec §9:150’s "sub-floor watching covers '
        + 'the first weeks" sentence is corrected and the day summary + Trend are the honest '
        + 'first-weeks floor. Not decidable in a build session.',
    },
    sneeze: { now: false, decision: 'NO — same rider; sneeze is data-only at W1 regardless' },
  },
];

describe('W1 membership walk (HR-6) — every list decided, current state == decided state at PR-2', () => {
  it.each(WALK.map((row) => [row.list, row] as const))('%s', (_name, row) => {
    const actual = row.read();
    expect({ cough: actual.cough, sneeze: actual.sneeze }).toEqual({
      cough: row.cough.now,
      sneeze: row.sneeze.now,
    });
    // The decision strings above are the table's yes/no column — they exist so a
    // later PR flipping `now` has the intent in the diff, not in a lost comment.
    expect(row.cough.decision.length).toBeGreaterThan(0);
    expect(row.sneeze.decision.length).toBeGreaterThan(0);
  });

  it('the walk covers the ten §13a lists + the signal mirrors + the review-discovered lists + the 3b-s1 engine lists — a list added later must join the table', () => {
    // 11 original rows + SYMPTOM_METRICS/HISTORY (ask) + SYMPTOM_OCCURRENCE_LABELS +
    // TRIAL_RESPONSE_LOGGED_DAY_TYPES + the signalWatching gap row (2026-08-27 review)
    // + SYMPTOM_TYPE_UNIVERSE + LANE_SYMPTOM_TYPES + server SYMPTOM_LABEL (3b-s1, #731 —
    // the adversarial pass caught the label map flipping with no row; the discovery
    // guard is file-keyed and cannot see a second list in a registered file).
    expect(WALK).toHaveLength(18);
  });
});

describe('§6 pairing rule — CATEGORY_TINT and SYMPTOM_TYPES move together', () => {
  it('rose tiles == SYMPTOM_TYPES ∪ {stool_normal}, exactly (stool_normal is the one documented divergence)', () => {
    const roseKeys = (Object.keys(CATEGORY_TINT) as EventTypeKey[])
      .filter((k) => CATEGORY_TINT[k].bg === theme.colorEventSymptomLight)
      .sort();
    const expected = [...SYMPTOM_TYPES, 'stool_normal'].sort();
    expect(roseKeys).toEqual(expected);
  });

  it('every EVENT_TYPES key has a tint (compile-enforced, restated for the walk)', () => {
    (Object.keys(EVENT_TYPES) as EventTypeKey[]).forEach((k) => {
      expect(CATEGORY_TINT[k]).toBeDefined();
    });
  });
});

describe('the §7 detail-contract rows — the per-leaf capture/detail contract, pinned', () => {
  it('cough: witnessed-by-construction, no photo, Breathing family, all species, v2-gated tile', () => {
    expect(EVENT_TYPES.cough).toMatchObject({
      label: 'Cough',
      family: 'respiratory',
      species: 'all',
      hasPhoto: false,          // no photo zone at capture; no empty Add-photo hero on detail
      confidenceModel: 'witnessed', // D10 — no Saw it / Found it; a window claim is unwritable
      hasFood: false,
      hasSeverity: false,
      v2Only: true,             // the TILE is gated; the vocabulary is not (§12 FL-1)
    });
  });

  it('sneeze: same contract as cough', () => {
    expect(EVENT_TYPES.sneeze).toMatchObject({
      label: 'Sneeze',
      family: 'respiratory',
      species: 'all',
      hasPhoto: false,
      confidenceModel: 'witnessed',
      hasFood: false,
      hasSeverity: false,
      v2Only: true,
    });
  });

  it('exactly the W1 pair is v2-gated — pre-W1 leaves are untouched by the flag', () => {
    const gated = (Object.keys(EVENT_TYPES) as EventTypeKey[]).filter((k) => EVENT_TYPES[k].v2Only);
    expect(gated.sort()).toEqual(['cough', 'sneeze']);
  });

  it('both are symptoms (tint + calm-not-celebrate beat + soft commit haptic all derive from this)', () => {
    expect(SYMPTOM_TYPES.has('cough')).toBe(true);
    expect(SYMPTOM_TYPES.has('sneeze')).toBe(true);
  });
});

describe('the expanded grid derivation — the confirmed round-3 W1 frame is the design authority', () => {
  const W1_FRAME = [
    { label: 'Digestion', keys: ['vomit', 'stool_normal'] },
    { label: 'Breathing', keys: ['cough', 'sneeze'] },
    { label: 'Skin & coat', keys: ['itch'] },
    { label: 'Energy & behavior', keys: ['lethargy'] },
    { label: 'Measurements', keys: ['weight_check'] },
    { label: 'Food & care', keys: ['meal', 'medication'] },
    { label: 'More', keys: ['other'] },
  ];

  it('renders ten tiles in seven groups, exactly as drawn (cat)', () => {
    expect(expandedPickerGroups('cat', EVENT_TYPES)).toEqual(W1_FRAME);
  });

  it('the dog grid at W1 is the same frame — no W1 leaf is species-conditional', () => {
    expect(expandedPickerGroups('dog', EVENT_TYPES)).toEqual(W1_FRAME);
  });

  it('a species outside dog/cat renders the all-species set (§3) — identical at W1', () => {
    expect(expandedPickerGroups('other', EVENT_TYPES)).toEqual(W1_FRAME);
    expect(expandedPickerGroups(null, EVENT_TYPES)).toEqual(W1_FRAME);
  });

  it('diarrhea is never a tile — it is the split Stool tile’s Loose segment', () => {
    const allKeys = expandedPickerGroups('cat', EVENT_TYPES).flatMap((g) => g.keys);
    expect(allKeys).not.toContain('diarrhea');
  });

  it('family order comes from EVENT_FAMILIES — symptoms lead, Other closes the grid alone', () => {
    const labels = EVENT_FAMILIES.map((f) => f.label);
    expect(labels[0]).toBe('Digestion');
    expect(labels[1]).toBe('Breathing');
    expect(labels[labels.length - 1]).toBe('More');
  });

  // The species MECHANISM, tested against hypothetical entries — every real W1
  // leaf is 'all', so the real map cannot exercise the filter (and a production
  // signature is not widened for the test; the entries param is the derivation's
  // real input, defaulted at the call sites).
  const HYPOTHETICAL = {
    cough: { family: 'respiratory', species: 'all' },
    urine_outside_box: { family: 'measurements', species: 'cat' },
    scooting: { family: 'skinCoat', species: 'dog' },
  } as const;

  it('a dog never sees a cat-only leaf, and vice versa', () => {
    const dog = expandedPickerGroups('dog', HYPOTHETICAL).flatMap((g) => g.keys);
    const cat = expandedPickerGroups('cat', HYPOTHETICAL).flatMap((g) => g.keys);
    expect(dog).toEqual(['cough', 'scooting']);
    expect(cat).toEqual(['cough', 'urine_outside_box']);
  });

  it('an unknown species renders only the all-species set', () => {
    expect(expandedPickerGroups('other', HYPOTHETICAL).flatMap((g) => g.keys)).toEqual(['cough']);
  });

  it('a family with no visible leaves renders no header (no empty groups)', () => {
    const labels = expandedPickerGroups('other', HYPOTHETICAL).map((g) => g.label);
    expect(labels).toEqual(['Breathing']);
  });
});

describe('§8 degradation contract — what a build that does NOT know a leaf renders', () => {
  // On THIS build cough/sneeze are fully known (rose, labeled). The contract
  // below is about the OTHER side of ungated reads: a FUTURE wave’s leaf
  // reaching this build (or, symmetrically, a cough row reaching a pre-W1
  // build). HR-9 verified the label sinks are safe app-wide; these assertions
  // keep the two real targets pinned.
  it('a known new symptom categorizes as symptom (rose) on the recap/day spine', () => {
    expect(eventTintCategory('cough')).toBe('symptom');
    expect(eventTintCategory('sneeze')).toBe('symptom');
  });

  it('an unknown future symptom de-symptomizes to neutral — the documented §8a cost, not a crash', () => {
    // W2’s leaf, unknown to this build: renders neutral-not-rose and drops out
    // of the symptom lane. Accepted BY DESIGN (reads are never flag-gated) — it
    // is why the §11 swap gates on every device carrying the audited build, and
    // why PR-3a ships client mirrors before the engine learns cough.
    expect(eventTintCategory('labored_breathing')).toBe('other');
  });

  it('an unknown type’s day row degrades to the generic noun, never a crash', () => {
    const row = {
      id: 'x1',
      pet_id: 'p1',
      event_type: 'labored_breathing',
      occurred_at: '2026-08-27T10:00:00.000Z',
      occurred_at_confidence: 'witnessed',
      occurred_at_earliest: null,
      occurred_at_latest: null,
      severity: null,
      notes: null,
      source: 'manual',
      deleted_at: null,
    } as unknown as TimelineRow;
    const display = describeDayEvent(row);
    expect(display.title).toBe('Event');
    expect(display.category).toBe('other');
  });
});
