// CUL-677 / W1-PR-4 — §11 step 4: predict ⑦'s outcome on SWAP DAY.
//
//   deno run --allow-read scripts/w1-other-row-swap/predictChronicity.deno.ts \
//     [--after] [--now=2026-09-15T12:00:00Z]
//
//   (default)  pre-swap:  re-keys the reviewed ids IN MEMORY and predicts.
//   --after    post-swap: reads the export as-is and verifies the prediction held.
//
// WHY THIS EXISTS, AND WHY IT IS NOT A CALCULATOR
// ──────────────────────────────────────────────
// §11 step 4 requires the four floors computed "on the day the swap runs, against
// the rows as they then are", with the outcome recorded IN ADVANCE — because ⑦'s
// floors are CLOCKS, not facts. `spanDays`, `activeWeeks` and especially
// `daysSinceLastEpisode` are all evaluated at run time against a 56-day window. If
// W1 lands months from now and the cat has recovered, "⑦ does not fire, for
// recency" is the CORRECT and PREDICTED outcome — a recovering cat is not a defect
// to debug, and the point of writing the prediction down first is that nobody
// spends a session debugging a working engine.
//
// So this script never re-implements a floor. It imports the shipped
// `detectChronicity` and `chronicityFloorsFor` and asks THEM — the diet-trial §5.3
// one-predicate rule applied to a tool. A second implementation living in scripts/
// would be a third definition of chronicity, and the first time it drifted it would
// disagree with the engine while looking authoritative.
//
// The non-fire DIAGNOSIS is the interesting part. `detectChronicity` returns `[]`
// and says nothing about why, and `computeChronicityStats` is (rightly) not
// exported. Rather than exporting it — which would re-fingerprint a held Edge
// Function for a tooling script — the diagnosis RE-RUNS THE REAL DETECTOR with its
// floors relaxed to nothing. The finding that comes back carries the true
// `episodeCount` / `spanDays` / `activeWeeks` / `daysSinceLastEpisode`, straight
// from the engine, and those are then compared against the resolved real floors.
// Every number printed below was computed by detection.ts, not by this file.
//
// The one thing the relaxed run cannot see through is `loggingEligible`, which is
// not a floor and not overridable. If even the relaxed run is silent, the script
// says so in as many words instead of guessing.

import {
  CORRELATION_SYMPTOM_TYPES,
  DEFAULT_CONFIG,
  chronicityFloorsFor,
  detectChronicity,
  type DetectionConfig,
  type DetectionInput,
  type MealEvent,
  type Species,
  type SymptomEvent,
  type SymptomType,
} from '../../supabase/functions/generate-signal/detection.ts';

interface RawSymptomRow {
  id: string;
  type: string;
  occurredAt: string;
  occurredAtConfidence: string | null;
  severity: number | null;
}
interface PredictInput {
  pet: { name: string; species: Species; dietTrialActive: boolean };
  symptomRows: RawSymptomRow[];
  mealRows: { id: string; occurredAt: string }[];
}
interface ReviewedList {
  swap: { id: string; to: string }[];
  hold: { id: string; reason: string }[];
}

const here = new URL('.', import.meta.url).pathname;
const read = async <T,>(f: string): Promise<T> => JSON.parse(await Deno.readTextFile(`${here}${f}`)) as T;

const input = await read<PredictInput>('predict-input.json');
const reviewed = await read<ReviewedList>('reviewed-ids.json');

const after = Deno.args.includes('--after');
const nowArg = Deno.args.find((a: string) => a.startsWith('--now='))?.slice('--now='.length);
const now = nowArg ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(now))) throw new Error(`--now is not a parseable instant: ${now}`);

// The export must carry the module's own fetch union. A wave that widens
// CORRELATION_SYMPTOM_TYPES without widening predict-export.sql would otherwise
// quietly predict over a thinner record than the engine reads.
{
  const exported = new Set(input.symptomRows.map((r) => r.type));
  const missing = [...CORRELATION_SYMPTOM_TYPES].filter(
    (t) => !exported.has(t) && !(after && t === 'cough'),
  );
  if (missing.length > 0) {
    console.error(
      `note: the export contains no rows of type(s) ${missing.join(', ')}. That is fine if the\n` +
        `record genuinely holds none — but if predict-export.sql's IN(...) list has fallen behind\n` +
        `CORRELATION_SYMPTOM_TYPES, this prediction is over a thinner record than the engine reads.`,
    );
  }
}

// Re-key in memory, exactly as the swap will on the server: type only, timestamps
// untouched. `other` rows the reviewed list does not name are DROPPED, because
// `other` is not in the engine's fetch union and never reaches it.
const swapTo = new Map(reviewed.swap.map((r) => [r.id, r.to as SymptomType]));
const symptomEvents: SymptomEvent[] = input.symptomRows
  .map((r) => {
    const retyped = after ? undefined : swapTo.get(r.id);
    const type = (retyped ?? r.type) as SymptomType;
    return { ...r, type };
  })
  .filter((r) => (CORRELATION_SYMPTOM_TYPES as readonly string[]).includes(r.type))
  .map((r) => ({
    id: r.id,
    type: r.type,
    occurredAt: r.occurredAt,
    severity: r.severity,
    occurredAtConfidence: r.occurredAtConfidence as SymptomEvent['occurredAtConfidence'],
  }));

// Chronicity reads meals ONLY as "was the app used on this day" evidence for the
// §4.3 logging-eligibility guard — it never looks at what was fed. So the food
// fields are honestly null rather than fabricated: this input is for ⑦ alone, and a
// made-up protein here would be a fact the record does not hold.
const mealEvents: MealEvent[] = input.mealRows.map((m) => ({
  id: m.id,
  occurredAt: m.occurredAt,
  foodItemId: null,
  primaryProtein: null,
  intakeRating: null,
  foodType: 'meal',
}));

const detectionInput: DetectionInput = { pet: input.pet, symptomEvents, mealEvents, now };

// Floors relaxed to nothing, so the real detector reports the real stats for a
// course that does not clear them. perType is dropped too — otherwise cough's own
// overrides would survive the relaxation and the diagnosis would be partial.
const RELAXED: DetectionConfig = {
  ...DEFAULT_CONFIG,
  chronicity: {
    ...DEFAULT_CONFIG.chronicity,
    minSpanDays: 0,
    minEpisodes: 1,
    minActiveWeeks: 0,
    ongoingRecencyDays: Number.MAX_SAFE_INTEGER,
    perType: undefined,
  },
};

const fired = detectChronicity(detectionInput, DEFAULT_CONFIG);
const observed = detectChronicity(detectionInput, RELAXED);

const line = (s = '') => console.log(s);
line(`⑦ chronicity prediction — ${input.pet.name} (${input.pet.species})`);
line(`  mode:   ${after ? 'POST-SWAP verification (export read as-is)' : 'PRE-SWAP prediction (reviewed ids re-keyed in memory)'}`);
line(`  now:    ${now}${nowArg ? '  (--now override)' : ''}`);
line(`  input:  ${symptomEvents.length} symptom events, ${mealEvents.length} meals`);
if (!after) line(`  swap:   ${reviewed.swap.length} rows re-keyed, ${reviewed.hold.length} held as 'other'`);
line();

if (observed.length === 0) {
  line('  No chronicity stat at all, even with every floor relaxed. Either the lane sees no');
  line("  in-window onsets of any enrolled type, or the logging-eligibility guard rejected the");
  line('  span (half of it is dark — a manufactured span, not a sustained course). Neither is a');
  line('  floor, so neither can be diagnosed here: check the export and the §4.3 guard.');
}

for (const stat of observed) {
  const floors = chronicityFloorsFor(stat.symptomType, input.pet.species, DEFAULT_CONFIG.chronicity);
  const hit = fired.find((f) => f.symptomType === stat.symptomType);
  const check = (name: string, value: number, floor: number, cmp: '>=' | '<=') => {
    const pass = cmp === '>=' ? value >= floor : value <= floor;
    line(`    ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${String(value).padStart(6)}  ${cmp} ${floor}`);
  };
  line(`  ${stat.symptomType}: ${hit ? `FIRES — tier '${hit.tier}'` : 'does NOT fire'}`);
  check('spanDays', stat.spanDays, floors.minSpanDays, '>=');
  check('episodeCount', stat.episodeCount, floors.minEpisodes, '>=');
  check('activeWeeks', stat.activeWeeks, floors.minActiveWeeks, '>=');
  check('daysSinceLastEpisode', stat.daysSinceLastEpisode, floors.ongoingRecencyDays, '<=');
  line(`          symptomDays        ${String(stat.symptomDays).padStart(6)}   (density detail, not a floor)`);
  line(`          firstOnset         ${stat.firstOnsetIso}`);
  if (!hit) {
    line(`          → A FAIL above is the reason. If it is recency, that is an ACCEPTABLE and`);
    line(`            PREDICTED outcome (§11 step 4) — the course has quieted. Record it; do not`);
    line(`            "fix" it, and never lower a floor to make a new stream feel alive (§9).`);
  }
  line();
}

line(`  ⑦ findings from the shipped detector: ${fired.length}`);
if (fired.length > 0) {
  line('  Consequences to expect on Home, both designed (§9 / HR-26):');
  line('   • a chronic course blanks this pet\'s ③ reflection layer, for unrelated signs too;');
  line('   • every chronic course gets its own card (R4 "both stated") — more cards, not fewer.');
}

// The §9 cough↔vomit adjacency mark (`coughVomitAdjacent`) is attached in the
// COMPOSITION layer, not by detectChronicity — it is a fact about the composed
// finding set. This script calls the detector alone, so it can see the PRECONDITION
// but never the mark itself. Say that, rather than letting an unset field read as
// "the rule will not fire": a silent absence here is the same shape of mistake the
// rule exists to prevent.
const chronicTypes = new Set(fired.map((f) => f.symptomType));
if (chronicTypes.has('cough') && chronicTypes.has('vomit')) {
  line();
  line('  §9 ADJACENCY PRECONDITION MET — cough AND vomit are both chronic in this window.');
  line('  The composition layer will mark the leading card, and the card + report flag will');
  line('  say the two counts may describe the same moments and ask for both to be raised');
  line('  together. Expected, not a bug: post-tussive gagging and the "hairball posture"');
  line('  cross-contaminate these two records in BOTH directions. Verify on the rendered');
  line('  surface after the deploy — this script sees the detector, never the composition.');
}
