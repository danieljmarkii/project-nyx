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

function scan(relPath: string, marker: string, terminator: string) {
  const block = declBlock(relPath, marker, terminator);
  return { cough: /'cough'/.test(block), sneeze: /'sneeze'/.test(block) };
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
    governs: 'the engine fetch AND all five lanes, until §9’s per-lane map exists',
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
    cough: { now: false, decision: 'YES — lands in PR-3a (client mirrors ship first, HR-2)' },
    sneeze: { now: false, decision: 'YES — lands in PR-3a' },
  },
  {
    list: 'SYMPTOM_EVENT_TYPES (lib/analytics.ts)',
    governs: 'Patterns grid · frequency calendar · diet-trial outcome deltas · widget symptom tile — the widest single miss',
    read: inSet(SYMPTOM_EVENT_TYPES),
    cough: { now: false, decision: 'YES — lands in PR-3a' },
    sneeze: { now: false, decision: 'YES — lands in PR-3a' },
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
      const order = scan('lib/daySummary.ts', 'const SYMPTOM_CHIP_ORDER', '];');
      const noun = scan('lib/daySummary.ts', 'const SYMPTOM_NOUN', '};');
      return { cough: order.cough || noun.cough, sneeze: order.sneeze || noun.sneeze };
    },
    cough: {
      now: false,
      decision: 'YES — lands in PR-3a. INTERIM IS SAFE, verified below: symptomNoun falls back to '
        + 'the lowercased EVENT_TYPES label ("cough"), so a beta cough still counts and reads sanely.',
    },
    sneeze: { now: false, decision: 'YES — lands in PR-3a (same safe fallback meanwhile)' },
  },
  {
    list: 'WIDGET_SYMPTOM_LABELS (lib/widgetSnapshot.ts)',
    governs: 'the home-screen widget’s symptom tile labels',
    read: () => scan('lib/widgetSnapshot.ts', 'const WIDGET_SYMPTOM_LABELS', '};'),
    cough: { now: false, decision: 'YES — lands in PR-3a (with SYMPTOM_EVENT_TYPES, which scopes the widget query)' },
    sneeze: { now: false, decision: 'YES — lands in PR-3a' },
  },
  {
    list: 'TYPE_FILTER_KEYS (components/history/TypeScopeControl.tsx)',
    governs: 'History’s type filter — the quietest miss: rows visible but unfilterable',
    read: () => scan('components/history/TypeScopeControl.tsx', 'const TYPE_FILTER_KEYS', '];'),
    cough: { now: false, decision: 'YES — lands in PR-3a' },
    sneeze: { now: false, decision: 'YES — lands in PR-3a' },
  },
  {
    list: 'SignalSymptomType + SYMPTOM_LABEL (lib/signal.ts / lib/signalCopy.ts)',
    governs: 'the Signal client mirrors — the cross-pet safety banner + what-to-tell-the-vet copy (§8b)',
    read: () => {
      const union = scan('lib/signal.ts', 'export type SignalSymptomType', ';');
      const label = scan('lib/signalCopy.ts', 'const SYMPTOM_LABEL', '};');
      return { cough: union.cough || label.cough, sneeze: union.sneeze || label.sneeze };
    },
    cough: {
      now: false,
      decision: 'YES — lands in PR-3a, BEFORE the engine (HR-2): ship 3b first and a cough '
        + 'chronicity finding renders on the safety banner as literal "recurring undefined". '
        + 'The Signal surface is not gated by event_types_v2 at all.',
    },
    sneeze: { now: false, decision: 'YES — lands in PR-3a (the mirrors carry every W1 leaf so a later config flip needs no client cut)' },
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

  it('the walk covers all ten §13a lists (+ the signal mirrors) — a list added later must join the table', () => {
    expect(WALK).toHaveLength(11);
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
