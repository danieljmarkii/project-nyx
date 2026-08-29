// The completion-card routing guard (CUL-613 · `docs/nyx-app-polish-requirements.md` §5).
//
// WHY THIS FILE EXISTS. Two of the app's log paths carried, in a comment, the rule
// this file now enforces:
//
//   "every meal-entry path must route through showMeal — if a non-picker meal flow
//    is ever added (e.g. a manual quick-add), it must fire showMeal too, or the
//    intake capture surface vanishes for that path."   — app/log.tsx, components/log/FAB.tsx
//
// Both comments were true, both were prominent, and `app/food-capture.tsx` violated
// the rule anyway for months (CUL-368): it wrote a real meal and then played its own
// hand-rolled ✓ over the word "Logged", so a meal logged from capture silently lost
// the WSAVA intake row and "Change time". `app/medication-capture.tsx` had the same
// hole on the dose side — a first dose written `adherence: 'given'` with no chips to
// downgrade it, which is the affirmative that clinical-guardrails Pattern 2 exists to
// keep reachable-but-never-automatic.
//
// A comment cannot fail a build. This can. It is a source scan in the shape of
// `guards/haptics.test.ts` and `guards/ownerFacingCopy.test.ts`: any file that CALLS a
// commit helper must also reference the completion card that speaks for it.
//
// WHAT IT DOES NOT CLAIM. This is a syntactic scan, so it proves a file mentions the
// store handle — not that the handle fires on every branch, with the right payload, or
// at all at runtime. That is review's job. What it removes is the whole-path omission:
// a NEW log path cannot be written without either wiring a card or naming its exemption
// out loud, which is the failure mode that actually shipped.
//
// ESCAPE HATCH: an inline `// completion-card-ok: <reason>` anywhere in the file
// suppresses it. The reason is mandatory, so an exemption is a named decision rather
// than a silent hole — the `NOT_WIPED_ON_SIGN_OUT` discipline.

import * as fs from 'fs';
import * as path from 'path';

import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components'];

/**
 * The commit helpers, each paired with the store handle that must speak for what it
 * wrote. Keyed on the helper because the helper is the thing a new log path calls —
 * the point of entry a future author cannot avoid.
 *
 * These two are deliberately the whole list. They are the single write paths for the
 * two record types whose completion card carries a FOLLOW-UP QUESTION the record
 * cannot answer on its own — intake for a meal (`IntakeChipRow`), adherence + vehicle
 * for a dose (`AdherenceChipRow`) — so skipping the card does not just cost warmth, it
 * costs data that is only capturable at peak recall. Symptom and weight commits go
 * through `showNamed`, whose card asks nothing; a path that skipped it would lose a
 * beat, not a column.
 */
const RULES = [
  {
    helper: 'insertMeal',
    handle: 'showMeal',
    why: 'a meal without its card loses the WSAVA intake row + "Change time" (CUL-368)',
  },
  {
    helper: 'insertMedicationDose',
    handle: 'showMedication',
    why: 'a dose without its card can only ever say the affirmative "given" (B-156 G1)',
  },
] as const;

/**
 * Files that write a record and deliberately do NOT play a named card. Each is a
 * ruled decision, not an oversight, and each states which register it uses instead —
 * so the exemption reads as the argument it is.
 */
const EXEMPT: Record<string, string> = {
  // R2, not R1: the MedStrip's one-tap confirm is a commit INSIDE a surface that is
  // already describing the course, so it answers in place rather than covering Home
  // with a card about the row the owner is looking at (§5 R2). Its sentence + mark +
  // haptic are CUL-614's.
  'components/home/MedStrip.tsx':
    'R2 in-place beat by design (§5); the sentence/mark/haptic upgrade is CUL-614',
};

/** The helper's own module never counts as a call site. */
const DEFINITIONS = ['lib/meals.ts', 'lib/medicationDose.ts'];

const EXEMPTION = /\/\/\s*completion-card-ok:\s*\S+/;

/**
 * Comments out, code in. Both halves of this scan need it, and the first run without
 * it proved why in both directions:
 *
 *   • FALSE POSITIVE. `app/(tabs)/foods.tsx` was flagged as an unwired meal writer on
 *     the strength of the prose "skips insertMeal (the capture screen already branches
 *     on that)" — a sentence ABOUT the rule, matched as a call to it.
 *   • FALSE NEGATIVE, the costlier direction. `app/log.tsx` and `components/log/FAB.tsx`
 *     both carry a comment containing the word `showMeal` — the very warning this guard
 *     was built to replace. Matching raw source would let a future path satisfy the rule
 *     by pasting that comment along with the code, which is exactly how the comment
 *     failed in the first place.
 *
 * Deliberately a lexical strip, not a parse: block comments (so JSX `{/* … *\/}` goes
 * too), then line comments. It will also blank the tail of a string containing `//`,
 * which cannot produce a false result here — nothing this scans for lives inside a URL.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

// `root` is threaded through the walk rather than read from the module constant, so
// this guard's detector fixtures can live in a temp tree instead of inside `app/`,
// where a PARALLEL guard's scan would pick them up (CUL-712). Required, not defaulted:
// a default silently re-points a forgetful self-test at the real working tree.
function walk(dir: string, root: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, root, out);
    } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

function sourceFiles(root: string): string[] {
  return SCAN_DIRS.flatMap((d) => walk(path.join(root, d), root))
    .filter((rel) => !DEFINITIONS.includes(rel))
    .sort();
}

/** Files that call `helper(` — the call form, so an import or a comment alone is not a hit. */
/**
 * Does this file actually reach for the store handle?
 *
 * WORD-BOUNDED, and the boundary is the whole point — a substring test SHIPPED WITH A
 * HOLE ON THE EXACT BUG THIS GUARD EXISTS FOR. Pre-fix `app/food-capture.tsx` declared
 * `const [showMealTimePicker, setShowMealTimePicker] = useState(false)` for its
 * meal-time override, so `src.includes('showMeal')` was satisfied by a date picker
 * while the completion card was nowhere in the file. The guard passed on CUL-368.
 * Found by running this file against the pre-fix tree rather than by reading it.
 *
 * `\bshowMeal\b` matches the real wiring in every shape it takes here — `s.showMeal`,
 * `{ showMeal }`, `showMeal(` — and rejects `showMealTimePicker` and `showMealMoment`
 * alike. The local alias is fine to reject: every call site assigns it FROM the bounded
 * form, so the bounded form is always present in a genuinely wired file.
 */
function wiresHandle(src: string, handle: string): boolean {
  return new RegExp(`\\b${handle}\\b`).test(stripComments(src));
}

function callSites(helper: string, root: string): string[] {
  const call = new RegExp(`\\b${helper}\\s*\\(`);
  return sourceFiles(root).filter((rel) =>
    call.test(stripComments(fs.readFileSync(path.join(root, rel), 'utf8'))),
  );
}

describe('§5 — every commit path routes through its completion card', () => {
  it.each(RULES)('finds real $helper call sites to check', ({ helper }) => {
    // If a rename ever makes the scan match nothing, the guard would pass by checking
    // an empty set. Fail instead — the same reason haptics.test.ts pins its floor.
    expect(callSites(helper, ROOT).length).toBeGreaterThan(0);
  });

  it.each(RULES)('every $helper call site fires $handle', ({ helper, handle, why }) => {
    // The remedy rides in the finding string rather than an assertion message: jest's
    // expect takes no message argument, and a bare list of paths does not tell the
    // next author what the build wants from them.
    const findings = callSites(helper, ROOT)
      .filter((rel) => {
        if (EXEMPT[rel]) return false;
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        // The exemption is itself a comment, so it reads the ORIGINAL source; the
        // handle has to be real code, so it reads the stripped source.
        if (EXEMPTION.test(src)) return false;
        return !wiresHandle(src, handle);
      })
      .map((rel) => `${rel} — ${why}; wire ${handle}, or add // completion-card-ok: <reason>`);
    expect(findings).toEqual([]);
  });

  it('every hand-listed exemption still exists and still writes a record', () => {
    // An exemption for a file that has been renamed or no longer writes anything is
    // dead weight that silently widens the hole it was granted for.
    const stale = Object.keys(EXEMPT).filter((rel) => {
      if (!fs.existsSync(path.join(ROOT, rel))) return true;
      const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      return !RULES.some((r) => new RegExp(`\\b${r.helper}\\s*\\(`).test(src));
    });
    expect(stale).toEqual([]);
  });
});

describe('the detector itself', () => {
  // The fixture lives OUTSIDE the repo (CUL-712). It used to be written to
  // `app/__completion_card_guard_fixture__.tsx` — inside the tree `geistRollout`
  // scans — so a parallel worker either read it mid-delete (ENOENT) or reported this
  // deliberately non-compliant file as a real violation.
  //
  // It keeps its `app/` SHAPE inside that root, so the walk → strip → match path
  // under test is the same one the live scan runs.
  const REL = 'app/CompletionCardFixture.tsx';
  let root = '';
  const write = (src: string) => writeFixture(root, REL, src);
  const read = () => fs.readFileSync(path.join(root, REL), 'utf8');

  beforeEach(() => {
    root = createFixtureRoot('completion-card', SCAN_DIRS);
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  it('FLAGS a file that writes a meal and never shows the card', () => {
    write(`const r = await insertMeal({ petId, foodId });\n`);
    expect(callSites('insertMeal', root)).toContain(REL);
    expect(read().includes('showMeal')).toBe(false);
  });

  it('CLEARS the same file once it fires the card', () => {
    write(`const r = await insertMeal({ petId, foodId });\nshowMeal({ eventId: r.eventId });\n`);
    expect(wiresHandle(read(), 'showMeal')).toBe(true);
  });

  it('IGNORES a mention of the helper inside a comment', () => {
    // The `app/(tabs)/foods.tsx` false positive from this guard's first run.
    write(`{/* skips insertMeal (the capture screen branches) */}\n`);
    expect(callSites('insertMeal', root)).not.toContain(REL);
  });

  it('does NOT accept a commented-out handle as wiring', () => {
    // The costlier direction: a real write whose only `showMeal` is the warning
    // COMMENT this guard replaced. Satisfying the rule by pasting prose is precisely
    // how the rule failed before.
    write(`// every meal-entry path must route through showMeal\nconst r = await insertMeal({ petId });\n`);
    const src = read();
    expect(src.includes('showMeal')).toBe(true);
    expect(wiresHandle(src, 'showMeal')).toBe(false);
  });

  it('does NOT accept an unrelated identifier that merely CONTAINS the handle', () => {
    // The hole this guard shipped with until it was run against the pre-fix tree:
    // food-capture's own `showMealTimePicker` satisfied a substring test, so the
    // meal path went unflagged on the very defect the guard was written for.
    const src = `const [showMealTimePicker, setShowMealTimePicker] = useState(false);`;
    expect(src.includes('showMeal')).toBe(true);
    expect(wiresHandle(src, 'showMeal')).toBe(false);
  });

  it('ACCEPTS the wiring in the shapes the app actually writes it', () => {
    expect(wiresHandle('const m = useMomentStore((s) => s.showMeal);', 'showMeal')).toBe(true);
    expect(wiresHandle('const { showMeal } = useMomentStore();', 'showMeal')).toBe(true);
    expect(wiresHandle('showMeal({ eventId });', 'showMeal')).toBe(true);
  });

  it('CLEARS a file carrying the exemption comment', () => {
    write(`// completion-card-ok: R2 in-place beat\nconst r = await insertMeal({ petId, foodId });\n`);
    expect(EXEMPTION.test(read())).toBe(true);
  });
});
