// B-556 — the cross-consumer regression test for `diet_trial_foods.role`.
//
// THE DEFECT THIS PINS. Three surfaces read one column and two of them narrowed
// an unrecognised value one way (`permitted_other`) while the third narrowed it
// the other (`primary_diet`), each with a written rationale. That is not a style
// difference: `primary_diet` rows DEFINE `sanctionedProteinsOn`'s comparator, so
// the two answers disagreed about what the trial diet IS — the log-time
// contaminant flag and the trial card could contradict each other on the same
// row, and the direction the odd one out chose is the one that hides a real
// contaminant (see `narrowTrialFoodRole`'s docstring for the worked example).
//
// So this file tests two different things, and both are the point:
//   1. the PROPERTY the narrower must have (below), and
//   2. that no consumer defines its own narrower again (the drift guard at the
//      bottom) — because a fourth copy is how this recurs, and a unit test of
//      the shared function cannot see one.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  buildTrialContext,
  narrowTrialFoodRole,
  sanctionedProteinsOn,
  type AllowedFood,
  type TrialFoodRole,
} from './dietTrial';

const KNOWN: readonly TrialFoodRole[] = [
  'primary_diet',
  'permitted_treat',
  'permitted_other',
  'supplement',
];

/** Values a real deployment can produce, not fuzz for its own sake: a role added
 *  to the PG enum by a newer build (the live forward-compat path — the local
 *  mirror stores `role TEXT NOT NULL` with no CHECK), plus the shapes a bad
 *  write or a truncated sync leaves behind. */
const UNKNOWN = [
  'permitted_chew',
  'primary_diet_secondary',
  'PRIMARY_DIET',
  'primary diet',
  ' primary_diet',
  'primary_diet ',
  '',
  'null',
  'undefined',
  '0',
];

describe('narrowTrialFoodRole', () => {
  it('round-trips every role the schema defines', () => {
    for (const role of KNOWN) expect(narrowTrialFoodRole(role)).toBe(role);
  });

  it('falls to permitted_other — never primary_diet — for anything else', () => {
    for (const raw of UNKNOWN) {
      expect(narrowTrialFoodRole(raw)).toBe('permitted_other');
      expect(narrowTrialFoodRole(raw)).not.toBe('primary_diet');
    }
  });

  it('is convergent: f(f(x)) === f(x) over every input', () => {
    // The house rule for canonicalizers (CLAUDE.md, B-414 D3a). Cheap here, and
    // it is what makes it safe for a consumer to narrow a value that another
    // consumer already narrowed — which `loadTrialProteinContext` does, twice.
    for (const raw of [...KNOWN, ...UNKNOWN]) {
      const once = narrowTrialFoodRole(raw);
      expect(narrowTrialFoodRole(once)).toBe(once);
    }
  });

  it('never widens the sanctioned comparator — the §5.5 D-A property', () => {
    // The property the whole ruling exists for, executed rather than asserted.
    // A duck trial plus a chicken-chew row whose role this build cannot read: if
    // the unknown role landed on `primary_diet`, CHICKEN would enter the sanctioned
    // set and every chicken contaminant in the library would classify clean for
    // the rest of the trial.
    const duck: AllowedFood = {
      foodItemId: 'trial-diet',
      foodKey: 'zignature|duck',
      label: 'Zignature Duck',
      role: 'primary_diet',
      allowedFrom: '2020-01-01',
      allowedUntil: null,
      primaryProtein: 'duck',
      proteins: ['duck'],
    };

    for (const raw of UNKNOWN) {
      const unreadable: AllowedFood = {
        foodItemId: 'mystery-row',
        foodKey: 'brand|chicken chew',
        label: 'Chicken chew',
        role: narrowTrialFoodRole(raw),
        allowedFrom: '2020-01-01',
        allowedUntil: null,
        primaryProtein: 'chicken',
        proteins: ['chicken'],
      };
      const ctx = buildTrialContext({ id: 't1', startedAt: '2020-01-01' }, [duck, unreadable]);
      // Day indices are absolute (days since epoch), not trial-relative — so the
      // day to ask about is the trial's own start, never 0.
      const sanctioned = sanctionedProteinsOn(ctx, ctx.startDayIndex!);
      expect(sanctioned.has('chicken')).toBe(false);
      expect(sanctioned.has('duck')).toBe(true);
    }
  });
});

describe('B-556 drift guard — one narrower, not four', () => {
  // A source scan, in the shape `hydration.test.ts` and `detectionSoftDelete.
  // test.ts` already use: the invariant is about the SHAPE OF THE REPO, and no
  // amount of testing the shared function can see a private copy in a consumer.
  //
  // `generate-report/trial.ts` is deliberately in scope even though jest never
  // runs that directory — the file imports `lib/dietTrial.ts` across the runtime
  // boundary, and it is one of the two consumers that got this right on its own.
  // Reading it here is what stops the Deno half drifting back unobserved.
  const CONSUMERS = [
    'lib/trialContaminant.ts',
    'lib/dietTrialFacts.ts',
    'supabase/functions/generate-report/trial.ts',
  ];

  const root = join(__dirname, '..');
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

  it.each(CONSUMERS)('%s narrows role only via the shared function', (rel) => {
    const src = read(rel);
    expect(src).toContain('narrowTrialFoodRole');

    // A local narrower is a `function <name>(...): TrialFoodRole`. The shared one
    // is imported, never declared, so any declaration returning the type in a
    // consumer is a second answer to the question by definition.
    const declarations = [...src.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*:\s*TrialFoodRole\b/g)];
    expect(declarations.map((m) => m[1])).toEqual([]);
  });

  it('no consumer re-lists the role set (the other way a second answer appears)', () => {
    // `narrowRole`/`normaliseRole` were both backed by a local copy of the four
    // enum members. The list itself is the tell — a consumer that needs to know
    // the members is a consumer about to make its own decision about them.
    for (const rel of CONSUMERS) {
      const src = read(rel);
      const hasLocalRoleSet =
        /['"]primary_diet['"]\s*,\s*\n?\s*['"]permitted_treat['"]/.test(src);
      expect({ rel, hasLocalRoleSet }).toEqual({ rel, hasLocalRoleSet: false });
    }
  });

  it('no file anywhere declares a second narrower', () => {
    // Scanned rather than listed, because a hand-maintained CONSUMERS list cannot
    // see the file that has not been written yet — and B-616 is about to add a
    // library surface that reads the allowed set.
    //
    // ONE DELIBERATE EXEMPTION: `lib/dietTrialSetup.permittedRoleForFood` also
    // returns a `TrialFoodRole`, and it is NOT a narrower — it maps a food's
    // `food_type` to a role at WRITE time (treat → `permitted_treat`, else
    // `permitted_other`). It never reads `diet_trial_foods.role`, so it cannot
    // disagree with anything about a stored row. Named here so the exemption is a
    // decision rather than a hole.
    const EXEMPT = new Set(['permittedRoleForFood', 'narrowTrialFoodRole']);

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (['node_modules', '.git', '.expo', 'ios', 'android'].includes(entry.name)) continue;
          walk(rel);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          for (const m of readFileSync(join(root, rel), 'utf8')
            .matchAll(/function\s+(\w+)\s*\([^)]*\)\s*:\s*TrialFoodRole\b/g)) {
            if (!EXEMPT.has(m[1])) offenders.push(`${rel}:${m[1]}`);
          }
        }
      }
    };
    for (const top of ['lib', 'components', 'app', 'store', 'hooks', 'supabase']) walk(top);

    expect(offenders).toEqual([]);
  });
});
