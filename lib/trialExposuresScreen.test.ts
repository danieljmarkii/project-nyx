// B-616 PR 4 — the acceptance suite for "Outside the trial diet" (§2.6).
//
// The facts are built by `computeTrialFacts` from real inputs rather than
// hand-assembled, deliberately: the screen's whole contract is that it renders the
// predicate's answers, so a fixture that invents a `TrialFacts` could pass while
// the seam between the two was broken. Every assertion below is against the model
// `app/trial-exposures.tsx` actually draws.
import {
  buildTrialExposuresScreen,
  blindSpots,
  trialExposuresEmptyLine,
  EXPOSURE_REASON_TITLE,
  TRIAL_EXPOSURES_FOOTER,
  TRIAL_EXPOSURES_UNREADABLE,
  TRIAL_EXPOSURES_GROUP_FEEDINGS,
  TRIAL_EXPOSURES_GROUP_ORAL,
  noTrialExposuresLine,
  type TrialExposuresScreenModel,
} from './trialExposuresScreen';
import {
  buildTrialContext,
  classifyFeeding,
  computeTrialFacts,
  explainVerdict,
  oralRouteCopy,
  type AllowedFood,
  type TrialArrangement,
  type TrialDose,
  type TrialFacts,
  type TrialFeeding,
  type TrialSpec,
} from './dietTrial';

// ── Fixtures — Rex, a dog, on a 56-day duck elimination trial ───────────────

const TRIAL: TrialSpec = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 56,
  species: 'dog',
};

/** Local noon, never midnight, so no assertion depends on the runner's zone
 *  straddling a day boundary. */
function at(day: string, hour = 12): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

const DRY_DUCK: AllowedFood = {
  foodItemId: 'dry-duck',
  foodKey: 'royal caninduck dry',
  label: 'Royal Canin Duck Dry',
  role: 'primary_diet',
  allowedFrom: '2026-07-01',
  allowedUntil: null,
  primaryProtein: 'duck',
  proteins: ['duck'],
};

function feeding(over: Partial<TrialFeeding> & Pick<TrialFeeding, 'eventId'>): TrialFeeding {
  return {
    occurredAt: at('2026-07-10'),
    foodItemId: null,
    foodKey: null,
    label: null,
    foodType: 'meal',
    proteins: [],
    ...over,
  };
}

/** The trial diet itself — a permitted feeding, which must never reach the list. */
const ON_DIET = feeding({
  eventId: 'on-diet',
  occurredAt: at('2026-07-05'),
  foodItemId: 'dry-duck',
  foodKey: 'royal caninduck dry',
  label: 'Royal Canin Duck Dry',
  proteins: ['duck'],
});

/** Rung 3 — the modal case: off the list, ingredients unread. */
const BISCUIT = feeding({
  eventId: 'biscuit',
  occurredAt: at('2026-07-14', 18),
  foodItemId: 'milkbone',
  foodKey: 'milk-boneoriginal',
  label: 'Milk-Bone Original',
  foodType: 'treat',
});

/** Rung 2 — off the list AND naming a protein the trial diet does not. */
const SALMON = feeding({
  eventId: 'salmon',
  occurredAt: at('2026-07-20', 7),
  foodItemId: 'pro-plan',
  foodKey: 'purinapro plan salmon',
  label: 'Purina Pro Plan Salmon',
  proteins: ['salmon'],
});

const CHEWABLE: TrialDose = {
  eventId: 'heartgard',
  occurredAt: at('2026-07-21', 9),
  drugLabel: 'Heartgard Plus',
  form: 'chewable',
  pairedEventId: null,
  adherence: 'given',
  vehicleFoodItemId: null,
  vehicleFoodKey: null,
};

const NOW = new Date(2026, 6, 25, 12).getTime(); // 25 July 2026, local noon

function facts(over: {
  feedings?: TrialFeeding[];
  doses?: TrialDose[];
  arrangements?: TrialArrangement[];
  trial?: TrialSpec;
  nowMs?: number;
} = {}): TrialFacts {
  return computeTrialFacts({
    trial: over.trial ?? TRIAL,
    allowedFoods: [DRY_DUCK],
    feedings: over.feedings ?? [ON_DIET, BISCUIT, SALMON],
    doses: over.doses ?? [],
    arrangements: over.arrangements ?? [],
    nowMs: over.nowMs ?? NOW,
  });
}

function build(over?: Parameters<typeof facts>[0]): TrialExposuresScreenModel {
  const model = buildTrialExposuresScreen('Rex', facts(over));
  if (model === null) throw new Error('expected a model');
  return model;
}

/** Every owner-facing string the screen can render, for the sweeps below. */
function allStrings(model: TrialExposuresScreenModel): string[] {
  return [
    model.title,
    model.subtitle,
    model.empty,
    model.footer,
    ...model.notes,
    ...model.groups.flatMap((g) => [
      g.title,
      ...g.rows.flatMap((r) => [r.label, r.meta, r.reason?.title ?? null, r.reason?.body ?? null]),
    ]),
  ].filter((s): s is string => s !== null);
}

// ── B-475 — every flag is tappable to its reason, and the reason is the module's ──

describe('the reasons come from explainVerdict, never from here', () => {
  it('renders rung 3 verbatim', () => {
    const row = build().groups[0].rows.find((r) => r.label === 'Milk-Bone Original');
    const expected = explainVerdict(
      classifyFeeding(buildTrialContext(TRIAL, [DRY_DUCK]), BISCUIT),
      'Milk-Bone Original',
    );
    expect(row?.reason).toEqual(expected);
    expect(row?.reason?.title).toBe('Not recognised as trial food');
  });

  it('renders rung 2 verbatim, naming the protein it found', () => {
    const row = build().groups[0].rows.find((r) => r.label === 'Purina Pro Plan Salmon');
    const expected = explainVerdict(
      classifyFeeding(buildTrialContext(TRIAL, [DRY_DUCK]), SALMON),
      'Purina Pro Plan Salmon',
    );
    expect(row?.reason).toEqual(expected);
    expect(row?.reason?.body).toContain('salmon');
    // The rung is on the row too, so the three kinds of exposure are visibly
    // different things rather than one undifferentiated count.
    expect(row?.meta).toContain('salmon');
  });

  it('renders the oral route through oralRouteCopy, never a feeding reason', () => {
    const model = build({ doses: [CHEWABLE] });
    const oral = model.groups.find((g) => g.title === TRIAL_EXPOSURES_GROUP_ORAL);
    expect(oral?.rows).toHaveLength(1);
    expect(oral?.rows[0].reason).toEqual(
      oralRouteCopy({
        eventId: 'heartgard',
        occurredAt: CHEWABLE.occurredAt,
        drugLabel: 'Heartgard Plus',
        trigger: 'chewable',
      }),
    );
    // §6.8 — the safety-critical half. It may never read as permission to skip.
    expect(oral?.rows[0].reason?.body).toContain('exactly as prescribed');
  });

  it('gives every row a reason to open', () => {
    const model = build({ doses: [CHEWABLE] });
    const rows = model.groups.flatMap((g) => g.rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.reason !== null)).toBe(true);
  });
});

// ── What reaches the list, and in what order ────────────────────────────────

describe('the list', () => {
  it('lists only off-diet feedings — the trial diet never appears', () => {
    const labels = build().groups.flatMap((g) => g.rows.map((r) => r.label));
    expect(labels).toEqual(['Purina Pro Plan Salmon', 'Milk-Bone Original']);
  });

  it('is newest first — the exposure an owner can still act on leads', () => {
    const rows = build().groups[0].rows;
    expect(rows[0].label).toBe('Purina Pro Plan Salmon');
    expect(rows[0].meta).toContain('Jul 20');
    expect(rows[1].meta).toContain('Jul 14');
  });

  it('drops the group header when feedings are the only group', () => {
    expect(build().groups.map((g) => g.title)).toEqual([null]);
  });

  // …but the oral-route group NEVER drops its own. A prescribed dose sitting bare
  // under the words "Outside the trial diet" reads as the app calling a dose the
  // owner was told to give a transgression.
  it('keeps the oral-route header even when doses are the only group', () => {
    const model = build({ feedings: [ON_DIET], doses: [CHEWABLE] });
    expect(model.groups.map((g) => g.title)).toEqual([TRIAL_EXPOSURES_GROUP_ORAL]);
  });

  it('names both groups once a dose is in the record', () => {
    expect(build({ doses: [CHEWABLE] }).groups.map((g) => g.title)).toEqual([
      TRIAL_EXPOSURES_GROUP_FEEDINGS,
      TRIAL_EXPOSURES_GROUP_ORAL,
    ]);
  });

  // A DOSE IS NOT A FEEDING. Folding it into the feedings ratio is what makes
  // `offDiet > totalFeedings` reachable, and the screen must not re-create that
  // arithmetic visually either.
  it('keeps the dose out of the feedings count', () => {
    expect(build({ doses: [CHEWABLE] }).subtitle).toBe(build().subtitle);
  });
});

// ── The evidence bound — `exposureRange`, never `range` ────────────────────

describe('the window it reports over is the EVIDENCE window', () => {
  // B-422: on an overrun trial the COVERAGE range is clipped back to the target
  // end. Using that as an evidence bound deletes a real logged exposure from the
  // one screen that itemises them — the mistake that shipped three times in
  // `generate-report`, pre-empted here.
  const OVERRUN: TrialSpec = { ...TRIAL, targetDurationDays: 28 }; // target ends Jul 28
  const LATE = feeding({
    eventId: 'late',
    occurredAt: at('2026-08-10', 19),
    foodItemId: 'milkbone',
    foodKey: 'milk-boneoriginal',
    label: 'Milk-Bone Original',
    foodType: 'treat',
  });
  const AUG_15 = new Date(2026, 7, 15, 12).getTime();

  it('lists an exposure logged past the coverage tail clip', () => {
    const model = build({ trial: OVERRUN, feedings: [ON_DIET, LATE], nowMs: AUG_15 });
    expect(model.groups[0].rows.map((r) => r.meta)).toEqual([
      expect.stringContaining('Aug 10'),
    ]);
  });

  it('names the evidence window, not the clipped coverage window', () => {
    const f = facts({ trial: OVERRUN, feedings: [ON_DIET, LATE], nowMs: AUG_15 });
    // The clip is real — this is the trap being avoided, asserted rather than
    // assumed.
    expect(f.range?.endDayIndex).toBeLessThan(f.exposureRange!.endDayIndex);
    expect(buildTrialExposuresScreen('Rex', f)?.subtitle).toContain('Aug 15');
  });
});

// ── G2 and the floor ───────────────────────────────────────────────────────

describe('G2 — no negative claim, at any coverage, in any state', () => {
  const FORBIDDEN = [
    // G2 — the negative claim about the world, deleted from the product.
    /\bno off-diet\b/i,
    /\bnothing (off|outside|else)\b/i,
    /\ball\b[^.]*\bmatched\b/i,
    /\bclean\b/i,
    /\bstayed on\b/i,
    /\bperfect\b/i,
    // The `clinical-guardrails` reassurance vocabulary (Pattern 1/8). This screen
    // is not an AI read, but the asymmetry is the same one and the skill's rule is
    // that it lives in an ASSERTION rather than a comment: absence of a logged
    // exposure is not evidence the trial is going well, so no string here may say
    // the pet or the record is fine.
    /\b(fine|okay|ok|healthy|great|nothing to worry)\b/i,
    // §6.9 — nothing here scores the owner, in either direction.
    /\bwell done\b/i,
    /\bgood job\b/i,
    /\byou (didn|did not|slipped|failed)/i,
    // §6.7 — record and continue. No copy may imply the trial is void.
    /\b(ruined|spoil|invalid|start over|restart|void)/i,
    // nyx-voice: no exclamation marks anywhere in the app.
    /!/,
  ];

  const BOWL: TrialArrangement = {
    foodItemId: 'graze',
    foodKey: 'friskiescrunch',
    label: 'Friskies Crunch',
    startedAt: '2026-07-02',
    endedAt: null,
  };
  const ANON = feeding({ eventId: 'anon', occurredAt: at('2026-07-11') });

  // EVERY reachable state of this screen, because Pattern 8's rule is that the
  // sweep covers every string the module can emit — not the three it emits on the
  // happy path.
  const scenarios: [string, TrialExposuresScreenModel][] = [
    ['a record with exposures', build({ doses: [CHEWABLE] })],
    ['a record with none', build({ feedings: [ON_DIET] })],
    ['a record with nothing logged at all', build({ feedings: [] })],
    ['a free-fed bowl off the list', build({ arrangements: [BOWL] })],
    ['feedings that named no food', build({ feedings: [ON_DIET, BISCUIT, ANON] })],
    [
      'every disclosure at once',
      build({ feedings: [ON_DIET, BISCUIT, SALMON, ANON], doses: [CHEWABLE], arrangements: [BOWL] }),
    ],
  ];

  it.each(scenarios)('%s says nothing negative about the world', (_name, model) => {
    for (const s of allStrings(model)) {
      for (const pattern of FORBIDDEN) expect(s).not.toMatch(pattern);
    }
  });

  // The strings no scenario above can reach, swept by the same rules — including
  // the read-failure line, which is the one place a degradation could quietly
  // become "couldn't read it, so there's probably nothing to see".
  it('holds on the strings rendered outside a model', () => {
    for (const s of [
      noTrialExposuresLine('Rex'),
      trialExposuresEmptyLine('Rex'),
      TRIAL_EXPOSURES_UNREADABLE,
      EXPOSURE_REASON_TITLE,
    ]) {
      for (const pattern of FORBIDDEN) expect(s).not.toMatch(pattern);
    }
  });

  // PR 3's rule, inherited: "0 of 68 logged feedings" is a claim about the record
  // dressed as a statistic. The empty screen says what the list is FOR instead.
  it('never prints a count of zero', () => {
    const model = build({ feedings: [ON_DIET] });
    expect(model.subtitle).toBeNull();
    expect(model.groups).toEqual([]);
    expect(model.empty).toBe(trialExposuresEmptyLine('Rex'));
    // Pattern 1 — the pet is the subject, by name.
    expect(model.empty).toContain('Rex’s trial diet');
    expect(allStrings(model).join(' ')).not.toMatch(/\b0\b/);
  });

  it('keeps the floor and the record-and-continue line on every rendered state', () => {
    for (const [, model] of scenarios) {
      expect(model.footer).toBe(TRIAL_EXPOSURES_FOOTER);
      expect(model.footer).toContain('not a total');
      expect(model.footer).toContain('Keep going with the trial diet');
    }
  });

  it('states the count as a fraction of the logged record', () => {
    expect(build().subtitle).toBe('2 of 3 logged feedings · Jul 1 – Jul 25');
  });
});

// ── The blind spots that make "not a total" a description ──────────────────

describe('blind spots', () => {
  it('names a free-fed bowl of something off the list', () => {
    const bowl: TrialArrangement = {
      foodItemId: 'graze',
      foodKey: 'friskiescrunch',
      label: 'Friskies Crunch',
      startedAt: '2026-07-02',
      endedAt: null,
    };
    const notes = blindSpots(facts({ arrangements: [bowl] }));
    expect(notes[0]).toContain('Friskies Crunch');
    expect(notes[0]).toContain('isn’t on the list');
    // NEVER an all-clear about it, and never a count it cannot support.
    expect(notes[0]).not.toMatch(/\d/);
  });

  it('discloses feedings that named no food, on neither side of the count', () => {
    const anonymous = feeding({ eventId: 'anon', occurredAt: at('2026-07-11') });
    const model = build({ feedings: [ON_DIET, BISCUIT, anonymous] });
    expect(model.notes).toEqual([
      '1 logged feeding named no food, so it isn’t counted on either side above.',
    ]);
    // It is disclosed, not absorbed: the ratio still describes the feedings the
    // predicate could classify.
    expect(model.subtitle).toContain('1 of 2 logged feedings');
  });

  it('pluralises without inventing a second sentence', () => {
    const anon = (id: string) => feeding({ eventId: id, occurredAt: at('2026-07-11') });
    const model = build({ feedings: [ON_DIET, BISCUIT, anon('a'), anon('b')] });
    expect(model.notes[0]).toBe(
      '2 logged feedings named no food, so they aren’t counted on either side above.',
    );
  });
});

// ── The states that are not a list ─────────────────────────────────────────

describe('an unreadable record is never an empty one', () => {
  it('returns null when the facts could not be read', () => {
    expect(buildTrialExposuresScreen('Rex', null)).toBeNull();
  });

  it('returns null when the module could not establish a range', () => {
    const degenerate = computeTrialFacts({
      trial: { ...TRIAL, startedAt: 'not-a-date' },
      allowedFoods: [DRY_DUCK],
      feedings: [BISCUIT],
      doses: [],
      arrangements: [],
      nowMs: NOW,
    });
    expect(degenerate.range).toBeNull();
    expect(buildTrialExposuresScreen('Rex', degenerate)).toBeNull();
  });

  it('says where the record went when the trial has ended', () => {
    const line = noTrialExposuresLine('Rex');
    expect(line).toContain('Rex');
    expect(line).not.toMatch(/\bclean\b|\bno off-diet\b/i);
  });
});

// ── The question must not contradict its own answer ────────────────────────

describe('the reason sheet’s title', () => {
  // The round-4 mock reads "Why this is on the list". B-616 then gave "the list"
  // a second meaning (the ALLOWED set — "On the trial list"), and the sheet's own
  // answer is `explainVerdict`'s "…isn't on the trial's list", so the locked title
  // now reads as a contradiction of its own body. The answer carries clinical
  // rulings and does not move; the question is this module's chrome and does.
  it('does not promise to explain why something is “on the list”', () => {
    expect(EXPOSURE_REASON_TITLE).not.toMatch(/on the list/i);
    expect(EXPOSURE_REASON_TITLE).toBe('Why Culprit recorded this');
  });
});
