// B-448 — the standing inventory of every client path that hardcodes an
// occurred_at_confidence.
//
// B-448 asked a one-time question ("can a defaulted or inferred occurred_at ever
// be written as witnessed?"). A one-time answer rots: the leak it found was
// added long after B-010 shipped, by a screen whose author was thinking about
// notes and photos, not about time. So the answer is kept honest here — this
// scans the app source for writes that assert a confidence literal and fails if
// the set of files doing so changes. A new write path is a build failure until
// someone writes down WHY its rows are witnessed.
//
// Why the bar is this high for one enum column: 'witnessed' is the strongest
// claim the record can make about when something happened, and the vet report
// prints it as `seen` beside estimates and ranges. A wrongly-witnessed row is
// therefore not a cosmetic error — it is the most trustworthy-looking row on a
// page a vet scans in 60 seconds, on an event nobody actually saw. Migration
// 012 exists because ~65% of adverse incidents are discovered rather than
// witnessed, and its header is explicit that confidence must NOT be inferred
// (a photo of discovered vomit is EXIF-stamped at discovery, not occurrence).
//
// This is the detectionSoftDelete.test.ts / hydration.test.ts pattern: derive the
// real set from the source, compare against a list with reasons attached.
//
// What counts as a write here: an events INSERT that names the column, an object
// literal setting `occurred_at_confidence`, or the `confidence: { value }` unit
// updateEvent takes. In-memory store mirrors (prependEvent) are included on
// purpose — they decide what Today renders before the row is re-read, so a wrong
// one shows a `seen` the database does not have.

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib', 'store', 'hooks'];

// file -> why every row it writes is genuinely witnessed. Adding an entry is a
// deliberate act; the reason is the point of the entry.
const ALLOWED: Record<string, string> = {
  'lib/meals.ts':
    'insertMeal — a meal is witnessed by construction: the owner puts the bowl down. ' +
    'occurred_at comes from the caller (now, the picker, or a food-photo EXIF stamp the ' +
    'confirm screen SHOWS and lets them change), never from an inference the owner cannot see.',
  'lib/medicationDose.ts':
    'insertMedicationDose — you do not discover that you gave a pill. Administration is an ' +
    'act the owner performs, so the B-010 found/window path never applies.',
  'lib/weight.ts':
    'insertWeightCheck — you read the scale. occurred_at is now, or a time the owner set ' +
    'themselves via the back-dating escape hatch.',
  'lib/captureInbox.ts':
    'Widget/App-Intent ingest. occurred_at is the TAP time carried in the capture record, ' +
    'not the drain time — the owner pressed the button at the moment they fed the pet.',
  'lib/widgetCapture.ts':
    'The same tap, written straight to PostgREST. Column-for-column identical to the queued ' +
    'row on purpose, so the two paths converge; that includes this confidence.',
  'app/log.tsx':
    'The quick-log flow. Symptom events take their confidence from the Saw-it/Found-it ' +
    'control the owner touches (buildTimeFields), never from a literal; the literals here are ' +
    'the meal branch, which routes through insertMeal, and its prependEvent mirror.',
  'app/food-capture.tsx':
    'Photo capture that also logs the meal. prependEvent mirroring the row insertMeal just ' +
    'wrote, at the EXIF-seeded time the owner saw and could change on the confirm screen.',
  'app/medication-capture.tsx':
    'Label capture that also logs the first dose. prependEvent mirroring the row ' +
    'insertMedicationDose just wrote, at now.',
  'components/log/FAB.tsx':
    'One-tap meal from the FAB. prependEvent mirroring the row insertMeal just wrote, at now.',
  'components/ui/MealCompletionCard.tsx':
    'Time-picker correction on the meal just logged. The row is already witnessed; restating ' +
    'it keeps the claim explicit and cannot change it.',
  'components/ui/MedicationCompletionCard.tsx':
    'Time-picker correction on the dose just logged — the same no-op restatement as the ' +
    'meal card, on a row insertMedicationDose already wrote as witnessed.',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Every confidence LITERAL this file asserts on a write path.
 *
 * Literals only, and that limit is load-bearing to state honestly: B-448's own
 * bug was `occurred_at_confidence: tf.confidence` — a *variable* — so this scan
 * would not have caught it. The `adversarial-reviewer` proved that by
 * reinstating the pre-fix line byte for byte and watching this suite stay
 * green, under a header that claimed it kept B-448's answer honest.
 *
 * Widening it to match variables was tried and reverted: a regex cannot
 * distinguish an assertion from a read-through (`row.occurred_at_confidence`
 * mapped into a store object), a sync pass-through, or a type declaration, so
 * the widened version flagged `history.tsx`, `sync.ts` and `db.ts`'s own
 * interfaces. Allowlisting those to quiet it would have meant allowlisting
 * `edit-event.tsx` too — i.e. exempting the one file the guard exists for.
 *
 * So this covers exactly one question — "who hardcodes a confidence?" — and the
 * variable-shaped case is covered structurally in the block below instead.
 */
function assertedConfidences(src: string): Set<string> {
  const found = new Set<string>();
  // `occurred_at_confidence: 'witnessed'` — object literals (store rows, REST payloads).
  for (const m of src.matchAll(/occurred_at_confidence\s*:\s*'(\w+)'/g)) found.add(m[1]);
  // `confidence: { value: 'witnessed' … }` — the updateEvent unit.
  for (const m of src.matchAll(/confidence\s*:\s*\{\s*value\s*:\s*'(\w+)'/g)) found.add(m[1]);
  // A literal inside an events INSERT that names the column.
  for (const m of src.matchAll(/`[^`]*INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+events\b[^`]*`/gi)) {
    if (!/occurred_at_confidence/.test(m[0])) continue;
    for (const q of m[0].matchAll(/'(witnessed|estimated|window)'/g)) found.add(q[1]);
  }
  return found;
}

function scan(): Map<string, Set<string>> {
  const hits = new Map<string, Set<string>>();
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const found = assertedConfidences(readFileSync(file, 'utf8'));
      if (found.size > 0) hits.set(relative(ROOT, file).split('\\').join('/'), found);
    }
  }
  return hits;
}

describe('occurred_at_confidence write paths (B-448)', () => {
  const hits = scan();

  it('finds no write path outside the reviewed inventory', () => {
    const unlisted = [...hits.keys()].filter((f) => !(f in ALLOWED)).sort();
    // If this fails you added a path that hardcodes a time-confidence. Confirm the
    // events it writes are genuinely witnessed — occurred_at must come from the
    // owner's own action or an affordance they can see and change, never from a
    // default, a clock the owner never saw, or a value inferred from metadata —
    // then add the file to ALLOWED with that reasoning. Do not add it to quiet
    // the test.
    expect(unlisted).toEqual([]);
  });

  it('keeps no stale entries — every allowlisted file still writes one', () => {
    // The other direction: an entry left behind after its write moved elsewhere is
    // a reason nobody is checking anymore.
    const stale = Object.keys(ALLOWED).filter((f) => !hits.has(f)).sort();
    expect(stale).toEqual([]);
  });

  it('states, for every allowlisted path, where occurred_at comes from', () => {
    // The reason is the whole value of the list — an entry with none is an
    // exemption nobody justified. Each must name the source of the timestamp,
    // because that is the question: witnessed is only honest when the time came
    // from the owner's own action or something they could see and correct.
    for (const reason of Object.values(ALLOWED)) {
      expect(reason.trim()).not.toBe('');
    }
  });

  it('never hardcodes estimated or window — those are always owner-asserted', () => {
    // A found-it classification is a claim only the owner can make, so it can only
    // ever reach the DB through the Saw-it/Found-it affordance (a variable, never a
    // literal). A hardcoded one would mean some surface decided on its own that an
    // event was discovered rather than seen.
    const hardcoded = [...hits.entries()]
      .filter(([, found]) => found.has('estimated') || found.has('window'))
      .map(([file]) => file)
      .sort();
    expect(hardcoded).toEqual([]);
  });

  it('leaves the edit path out entirely — an edit restates nothing it was not told', () => {
    // The B-448 leak itself. app/edit-event.tsx wrote its form's seeded default on
    // every save, promoting legacy NULL rows to 'witnessed' while the owner was
    // editing a note. It now writes a confidence only through
    // confidenceUpdateForEdit, gated on the owner touching a confidence control —
    // so it must never reappear as a hardcoded write path.
    expect(hits.has('app/edit-event.tsx')).toBe(false);
  });
});

// The structural half — what the literal scan above provably cannot see.
//
// These assert the SHAPE of the one file the bug lived in, the way
// detectionSoftDelete.test.ts asserts every detection query still carries its
// `.is('deleted_at', null)`. They are deliberately coupled to the source: that
// coupling is the mechanism. The `adversarial-reviewer` reinstated the B-448
// write in two different shapes and every other suite stayed green; these are
// the assertions that go red.
describe('app/edit-event.tsx — the save may only write an ASSERTED confidence (B-448)', () => {
  const src = readFileSync(join(ROOT, 'app/edit-event.tsx'), 'utf8');
  // The single updateEvent call, from the identifier to the closing `});`.
  const updateCall = /await updateEvent\([\s\S]*?\n {6}\}\);/.exec(src)?.[0] ?? '';

  it('has exactly one updateEvent call, and this suite found it', () => {
    // If the file grows a second write, the assertions below stop covering it —
    // fail here rather than pass vacuously against the first one.
    expect(src.match(/await updateEvent\(/g)).toHaveLength(1);
    expect(updateCall).not.toBe('');
  });

  it('passes confidence only through the gated spread, never as a bare key', () => {
    // Kills the reviewer's M1 (`confidence: { value: tf.confidence, … }`) and
    // M-orig (the byte-for-byte pre-fix `occurred_at_confidence: tf.confidence,
    // occurred_at_earliest: …, occurred_at_latest: …`). Both reintroduce a key
    // the save always writes; the whole fix is that the key is CONDITIONAL.
    expect(updateCall).toContain('...(confidence ? { confidence } : {})');
    expect(updateCall).not.toMatch(/^\s*confidence\s*:/m);
    expect(updateCall).not.toMatch(/occurred_at_confidence\s*:/);
    expect(updateCall).not.toMatch(/occurred_at_(earliest|latest)\s*:/);
  });

  it('derives that confidence from confidenceUpdateForEdit and the touched gate', () => {
    // The value passed must come from the pure, tested resolver — not be
    // rebuilt inline, which is how it would drift back.
    expect(src).toMatch(/const confidence = confidenceUpdateForEdit\(\{/);
    expect(src).toMatch(/ownerAsserted:\s*confidenceTouched\.current/);
  });

  it('still arms the touched gate from the confidence-bearing controls', () => {
    // Kills M2 (deleting the assignment from a handler). Five controls make a
    // claim about how well the time is known: the Saw-it/Found-it toggle, the
    // found sub-mode, the estimated point, and each window edge. The point-in-
    // time picker is deliberately NOT among them — correcting when something
    // happened is not a claim about how well the time is known.
    expect(src.match(/confidenceTouched\.current = true/g)).toHaveLength(5);
  });

  it('routes both mode changes through the tested no-op rule', () => {
    // The adversarial counterexamples: a re-tap of the already-selected segment
    // used to seed, reset and assert. lib/eventTimeEdit owns that rule now, and
    // an early return on `noOp` is what makes it bite.
    expect(src).toMatch(/resolveTimeModeChange\(timeMode, m,/);
    expect(src).toMatch(/resolveFoundModeChange\(foundMode, m,/);
    expect(src.match(/if \(t\.noOp\) return;/g)).toHaveLength(2);
  });
});
